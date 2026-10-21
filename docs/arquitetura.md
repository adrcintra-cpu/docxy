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
| `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`, `AI_TIMEOUT_MS` | servidor (opcional) | provedor de IA (`none`, `anthropic`, `openai`/compatível) |

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

## Leitura e comparação (Fase 3)

### Leitura de texto

Depois do upload, `processVersion` (`src/lib/processing/run.ts`) roda em segundo plano (`after()` do Next) e avança `QUEUED → EXTRACTING_TEXT → OCR → INDEXING → DONE`:

- **PDF:** PDF.js (build legacy, no Node) extrai cada fragmento com posição; `layout.ts` monta palavras, linhas e parágrafos com caixas normalizadas (0–1).
- **DOCX:** `word/document.xml` lido com JSZip (parágrafos, quebras, tabulações; revisões excluídas são ignoradas). Sem coordenadas: o visualizador mostra o texto refluído em páginas de ~450 palavras.
- **OCR:** páginas sem texto passam pelo Tesseract quando `OCR_ENABLED=true` (pacotes opcionais `tesseract.js` e `@napi-rs/canvas`). Sem OCR, a versão fica marcada como "sem texto extraível".
- O texto vai para `version_pages` (palavras + texto corrido, usado também na pesquisa por conteúdo). `/api/jobs/process` (cron, `CRON_SECRET`) reprocessa a fila e destrava leituras paradas.

### Motor de comparação (`src/lib/compare`)

Determinístico e versionado (`ENGINE_VERSION`), sem IA:

1. **Normalização controlada** — Unicode, aspas/travessões tipográficos, ligaduras e espaços invisíveis; números, datas, pontuação e maiúsculas preservados.
2. **Segmentação** — páginas → parágrafos → palavras; hifenização no fim da linha é desfeita.
3. **Alinhamento** — diff de Myers sobre parágrafos; parágrafos parecidos (Dice ≥ 0,45) são emparelhados em ordem.
4. **Diferenças** — diff de Myers sobre palavras dentro de cada par.
5. **Movidos** — parágrafo removido num lugar e inserido idêntico em outro vira `MOVED`, não remoção + inserção.
6. **Classificação** — valores (`MONEY_CHANGED`), datas, números (inclusive por extenso), nomes/entidades, cláusulas, parágrafo reescrito (> 50%), formatação (só caixa/acentos/pontuação).
7. **Coordenadas** — retângulos por linha a partir das caixas das palavras, gravados com a alteração.
8. **Métricas** — `percentual = (inseridas + removidas + substituídas) ÷ (iguais + inseridas + removidas + substituídas) × 100`; movidos e formatação contam como iguais.

Os testes (`npm test`) cobrem o diff, a classificação e uma comparação de PDFs reais (`tests/fixtures`).

### Telas

- `/documentos/:id/ver` — visualizador (PDF.js com camada de destaques; DOCX em texto), páginas, zoom, ajustar à largura/página, pesquisa, tela cheia, download e troca de versão.
- `/comparar/:id` — original × revisado com rolagem sincronizada pelas alterações, mapa de diferenças, lista de mudanças (filtros, revisada/ignorada, comentários, anterior/próxima), métricas e exportação em CSV (`/api/comparacoes/:id/relatorio`).

## Inteligência documental (Fase 4)

Princípio: **nada é afirmado sem evidência.** Todo valor, resposta ou tópico de resumo aponta para um trecho real (versão, página, texto e retângulos), clicável para localizar no visualizador.

### Corpus

`src/lib/extract/corpus.ts` transforma as páginas lidas (`version_pages`) em tokens com página, parágrafo, caixa e índice do motor de comparação. Extração, busca e resumos trabalham sobre ele; `locateQuote` confere se um trecho citado existe de fato no documento.

### Extração (`src/lib/extract`)

1. **Modelos** (`templates.ts`): Contratos, Apólices, Documentos jurídicos, Financeiros e Propostas comerciais. Cada organização recebe cópias editáveis em `extractors` na primeira vez; administradores/owners criam e editam modelos em `/extratores` (campos com nome, tipo e rótulos que antecedem o valor).
2. **Regras** (`rules.ts`, `docxy-extract/1.0.0`): acha o rótulo, lê o valor conforme o tipo (valor monetário e moeda, data, período, percentual, parte, código, texto, listas de valores/percentuais/obrigações) e guarda a evidência. Confiança vem da distância entre rótulo e valor, do separador (":") e de quão genérico é o rótulo.
3. **IA verificada** (`ai.ts`), só se autorizada: preenche apenas campos vazios e precisa devolver o trecho literal; o trecho é procurado no texto e precisa conter o valor, senão a resposta é descartada.
4. **Correção manual**: `correctField` grava o novo valor (ou "Não identificado"), quem corrigiu e o valor original. Tudo vai para `extraction_results` com a versão das regras e o modelo usado.

### Dashboard de comparação

`getComparisonDashboard` garante a extração das duas versões com o mesmo extrator e `compareExtractions` classifica cada campo (igual, alterado, só no original/revisado, não identificado), calcula variação percentual de valores e diferença em dias de datas, e marca divergências relevantes. Barras horizontais (valores) e rosca (percentuais) usam só valores extraídos.

### Assistente (`src/lib/assist`)

- **Busca**: BM25 sobre trechos de até 80 palavras, com radicais simples e sinônimos do domínio (valor ↔ prêmio, prazo ↔ vigência…).
- **Sem IA**: perguntas sobre alterações, valores, cláusulas e obrigações novas são respondidas com os dados do motor de comparação; as demais com os trechos mais relevantes, citados literalmente. Sem trecho relevante, a resposta diz que não encontrou.
- **Com IA**: a IA recebe só fontes numeradas (trechos `S#` e alterações `C#`), o documento é tratado como dado (não instrução) e a resposta precisa citar fontes. Citações inexistentes são removidas; resposta sem citação válida vira "não encontrei evidência".
- **Histórico** em `ai_conversations`/`ai_messages`, por usuário e por documento ou comparação; o acesso é conferido de novo a cada abertura. Limite de 20 perguntas por minuto por usuário. A auditoria registra o uso, nunca o texto da pergunta.

### Resumos

Executivo, alterações, contratual, riscos e financeiro são montados a partir de fatos com evidência (campos extraídos, alterações, trechos com termos de risco). Com IA, ela só reescreve esses fatos e cada tópico precisa citar os fatos que usou. Copiar e exportar em Markdown. Resumos de alterações e de riscos trazem o aviso de que não substituem a avaliação jurídica ou profissional.

### Política de IA (`src/lib/ai`)

O texto só sai do servidor quando há (1) provedor configurado (`AI_PROVIDER`, chave só no backend), (2) autorização da organização (`organizations.ai_enabled`, só administradores, auditado) e (3) nenhum documento confidencial (`documents.ai_blocked`). Falhas do provedor nunca quebram a tela: a resposta volta por regras, com aviso.

### Telas e menu

- Visualizador e comparação: ferramentas **Dados estruturados (JSON)**, **Extrator**, **Assistente** e **Dashboard** no painel direito; barra "Ver conversa · pergunta · Resumo" abaixo dos documentos.
- `/extratores` (menu Extrator): modelos de extração e configurações de IA.
- `/salvos` (menu Salvar): comparações, extrações e conversas guardadas.
- Detalhe do documento: chave "Confidencial — não enviar à IA".

## Próximas fases

5. Notificações completas, histórico/auditoria na interface, responsividade e endurecimento de segurança.
