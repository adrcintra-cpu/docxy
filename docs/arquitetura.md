# Arquitetura

## Visão geral

```
Navegador ──► Next.js (middleware) ──► Server Components / Server Actions ──► Prisma ──► Postgres (Supabase)
                     │                              │
                     └── Supabase Auth (sessão) ◄───┘── Supabase Storage (bucket privado, URLs assinadas)
                                                    └── Provedor de LLM (Fases 4+, chave só no servidor)
```

- **Um único serviço Next.js** concentra interface e backend (Server Actions e Route Handlers). Módulos de domínio vivem em `src/lib/<módulo>` e podem ser extraídos para um serviço separado sem mudar a interface.
- **Processamento pesado** (extração de texto, OCR, comparação, IA) será assíncrono a partir da Fase 2: o upload grava a versão com `stage = QUEUED` e um worker avança os estágios (`EXTRACTING_TEXT → OCR → INDEXING → DONE`). O estado aparece na interface.

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

## Próximas fases

2. Documentos: upload, pastas, versionamento, lista, pesquisa, fixados/recentes, workspaces e convites.
3. Visualizador e motor de comparação (pipeline determinístico), lista de mudanças e métricas.
4. Extração inteligente, dashboard de comparação, assistente e resumos.
5. Notificações, auditoria na interface, responsividade e endurecimento de segurança.
