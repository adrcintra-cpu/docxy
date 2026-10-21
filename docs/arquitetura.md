# Arquitetura

## Visão geral

```
Navegador ──► Next.js (middleware) ──► Server Components / Server Actions ──► Prisma ──► Postgres (Supabase)
                     │                              │
                     └── Supabase Auth (sessão) ◄───┘── Supabase Storage (bucket privado, URLs assinadas)
                                                    └── Provedor de LLM (Fases 4+, chave só no servidor)
```

- **Um único serviço Next.js** concentra interface e backend (Server Actions e Route Handlers). Módulos de domínio vivem em `src/lib/<módulo>` e podem ser extraídos para um serviço separado sem mudar a interface.
- **Processamento pesado** (extração de texto, OCR, comparação, IA) é assíncrono: desde a Fase 2 o upload grava a versão com `stage = QUEUED`, e a partir da Fase 3 um worker avança os estágios (`EXTRACTING_TEXT → OCR → INDEXING → DONE`). O estado aparece na interface.

## Autenticação

| Fluxo | Implementação |
| --- | --- |
| E-mail e senha | `signInWithPassword` (server action) → cookies de sessão |
| Mostrar/ocultar senha | `PasswordInput` |
| Manter conectado | cookie `docxy_remember`; desmarcado, os cookies de sessão perdem `maxAge` e expiram ao fechar o navegador |
| Recuperação de senha | `requestPasswordReset` → e-mail → `/auth/callback` ou `/auth/confirm` → `/redefinir-senha` → `updatePassword` |
| Social | `signInWithProvider` (Microsoft/Azure, Google, Apple) → `/auth/callback`; só aparecem os provedores em `NEXT_PUBLIC_AUTH_PROVIDERS` |
| Logout | `signOut` |
| Proteção de rotas | `src/middleware.ts` renova a sessão e redireciona; páginas chamam `requireUser()` de novo (defesa em profundidade) |

Mensagens de erro não revelam se um e-mail existe. Redirecionamentos `next` aceitam apenas caminhos internos.

## Papéis e permissões

Papéis (`Role`): `ADMIN`, `OWNER`, `EDITOR`, `WRITER` (colaborador com escrita), `VIEWER`. A matriz está em `src/lib/auth/permissions.ts`:

| Ação | Viewer | Writer | Editor | Owner | Admin |
| --- | :-: | :-: | :-: | :-: | :-: |
| Ler / baixar / perguntar à IA | ✓ | ✓ | ✓ | ✓ | ✓ |
| Enviar arquivo, criar pasta, comparar, extrair, comentar | | ✓ | ✓ | ✓ | ✓ |
| Editar, excluir, compartilhar, revisar diferenças | | | ✓ | ✓ | ✓ |
| Convidar, criar/gerir workspaces, gerir extratores | | | | ✓ | ✓ |
| Gerir organização, membros e auditoria | | | | | ✓ |

O papel efetivo sobre um item é o **maior** entre: papel na organização, papel no workspace e permissão explícita no documento/pasta (`highestRole`). Toda Server Action começa com `requirePermission(action)`, que registra `permission.denied` na auditoria quando nega.

## Isolamento entre organizações

- Toda tabela de conteúdo tem `organization_id`; consultas sempre filtram pela organização ativa (`getActiveMembership`).
- A organização ativa vem do cookie `docxy_org`, mas só é aceita se o usuário for membro ativo dela.
- RLS ativo em todas as tabelas, sem políticas para `anon`/`authenticated`: a API REST pública do Supabase não lê nem grava nada. O servidor acessa como dono das tabelas.

## Banco de dados

`prisma/schema.prisma` cobre as entidades do brief — Users, Organizations, Workspaces, WorkspaceMembers, Folders, Documents, DocumentVersions, DocumentPermissions, DocumentShares, Comparisons, ComparisonChanges, Extractors, ExtractionResults, AIConversations, AIMessages, Comments, Notifications, AuditLogs — mais OrganizationMembers, Invitations, Pins e RecentItems.

Decisões:

- **Sem cascata destrutiva.** Versões, comparações, mudanças, extrações, comentários e auditoria usam `onDelete: Restrict`. Pastas, documentos, workspaces e organizações têm `deleted_at` (lixeira e restauração).
- **Versões imutáveis** com `sha256` (integridade e duplicados) e `storage_path` privado.
- **Comparações reprodutíveis:** `engine_version` faz parte da chave única; mudanças guardam o tipo determinístico e, separado, o rótulo opcional da IA (`ai_label`), além das coordenadas normalizadas para destaque no visualizador.
- **Extração sem invenção:** valores ausentes são `null` e aparecem como "Não identificado"; correções manuais ficam registradas.
- **Auditoria somente-inserção** (trigger bloqueia UPDATE/DELETE).

## Variáveis de ambiente

| Variável | Onde | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | cliente de sessão |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | Storage e convites (ignora RLS) |
| `DATABASE_URL`, `DIRECT_URL` | servidor | Prisma (pooler / migrações) |
| `NEXT_PUBLIC_SITE_URL` | público | URLs de retorno dos e-mails e OAuth |
| `NEXT_PUBLIC_AUTH_PROVIDERS` | público | provedores sociais exibidos |
| `AUDIT_IP_SALT` | servidor (opcional) | anonimização de IP |

## Documentos (Fase 2)

### Quem vê o quê

| Onde está o item | Quem acessa |
| --- | --- |
| Sem workspace ("Só eu") | quem criou, quem recebeu permissão ou compartilhamento, administradores |
| Em um workspace ativo | todos os membros, com o perfil que têm no workspace |
| Dentro de uma pasta | herda tudo o que vale para as pastas acima |

O papel efetivo é o maior entre essas fontes (`src/lib/access.ts`). Workspaces desativados ("Habilitar grupo?" desligado) param de dar acesso imediatamente. Itens de outra organização respondem como inexistentes (404), sem revelar que existem.

### Upload e versões

1. `prepareUpload` valida extensão (PDF/DOCX), tipo e tamanho (até 100 MB), calcula duplicados pelo SHA-256 e cria a versão com `stage = UPLOADING`.
2. O navegador envia o arquivo **direto** ao bucket privado por uma URL assinada de uso único, com barra de progresso.
3. `finalizeUpload` baixa o objeto no servidor e confere tamanho, SHA-256 e assinatura do arquivo (`%PDF-` ou ZIP com `word/document.xml`). Só então a versão é publicada (`stage = QUEUED`, aguardando a leitura de texto da Fase 3). Falhas apagam o objeto e marcam a versão como `FAILED`.
4. Arquivos são abertos ou baixados por `/api/versions/:id`, que verifica a permissão, registra a auditoria e redireciona para uma URL assinada de 60 s.

Nova versão de um documento segue o mesmo fluxo; versões anteriores nunca são apagadas. Uploads abandonados são descartados por `abortUpload`.

### Lixeira

Excluir envia a pasta (com subpastas e documentos) para a lixeira marcando `deleted_at` com o mesmo instante; restaurar devolve exatamente esse conjunto. Se a pasta-mãe continua na lixeira, o item volta para o início. Não há exclusão definitiva pela interface.

### Convites

Convites guardam apenas o hash SHA-256 de um token de 32 bytes e expiram em 7 dias. Para quem ainda não tem conta, o Supabase envia o e-mail de convite; para quem já tem, o link é mostrado para ser copiado (o Supabase não envia e-mails avulsos). O aceite (`/convite/:token`) exige que o e-mail da conta seja o convidado.

## Próximas fases

3. Visualizador e motor de comparação (pipeline determinístico), extração de texto/OCR, lista de mudanças e métricas.
4. Extração inteligente, dashboard de comparação, assistente e resumos.
5. Notificações completas, histórico/auditoria na interface, responsividade e endurecimento de segurança.
