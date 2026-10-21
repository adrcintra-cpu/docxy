# Publicar na Vercel

Tempo estimado: 15 minutos. Você precisa de uma conta no [Supabase](https://supabase.com) e na [Vercel](https://vercel.com) (plano gratuito serve).

## 1. Supabase (banco, login e arquivos)

1. **New project** → anote a senha do banco. Região sugerida: *South America (São Paulo)*.
2. **Project Settings › API**: copie `Project URL`, `anon public` e `service_role`.
3. **Project Settings › Database › Connection string › URI**:
   - *Transaction pooler* (porta **6543**) → `DATABASE_URL` — acrescente `?pgbouncer=true&connection_limit=1` no fim.
   - *Session pooler* ou *Direct* (porta **5432**) → `DIRECT_URL`.
   - Troque `[YOUR-PASSWORD]` pela senha do banco nos dois.
4. **Authentication › Users › Add user**: crie seu usuário (e-mail e senha, marque *Auto Confirm*).

As tabelas, a segurança (RLS), o gatilho de usuários e o bucket privado `documents` são criados automaticamente no primeiro deploy.

## 2. Vercel

1. **Add New › Project** → importe o repositório `adrcintra-cpu/docxy` (framework: Next.js, sem mudar nada).
2. Em **Environment Variables**, adicione:

| Variável | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` (secreta) |
| `DATABASE_URL` | pooler 6543 com `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | conexão 5432 |
| `CRON_SECRET` | qualquer texto longo e aleatório |
| `BOOTSTRAP_ADMIN_EMAIL` | seu e-mail (o mesmo do usuário criado no Supabase) |
| `BOOTSTRAP_ORG_NAME` | nome da sua empresa |

Opcionais: `NEXT_PUBLIC_SITE_URL` (se usar domínio próprio; sem ela vale o domínio `.vercel.app`), `NEXT_PUBLIC_AUTH_PROVIDERS`, `OCR_ENABLED`, `AI_PROVIDER`/`AI_MODEL`/`AI_API_KEY`.

3. **Deploy.** O build (`vercel-build`) gera o Prisma, cria/atualiza as tabelas, aplica `supabase/sql/001_security.sql` e compila o Next.js.

## 3. Depois do primeiro deploy

1. **Supabase › Authentication › URL Configuration**: em *Site URL* coloque `https://SEU-PROJETO.vercel.app` e, em *Redirect URLs*, `https://SEU-PROJETO.vercel.app/auth/callback` e `https://SEU-PROJETO.vercel.app/auth/confirm`.
2. Abra o site e entre com seu usuário: no primeiro login a organização é criada e você vira administrador.
3. Convide o time em **Workspaces** e envie os primeiros documentos.

## Observações

- **Cron:** o plano gratuito da Vercel só permite agendamento diário; `vercel.json` roda `/api/jobs/process` 1x por dia só para retomar leituras que travaram. A leitura normal começa logo após cada upload.
- **Tamanho de upload:** o arquivo vai direto do navegador para o Supabase Storage (URL assinada), então o limite de 4,5 MB das funções da Vercel não se aplica; o limite do Docxy é 100 MB.
- **Funções longas:** documentos muito grandes podem passar dos 60 s do plano gratuito na leitura; a leitura é retomada pelo cron.
- **Erro no build:** veja *Deployments › (deploy) › Build Logs*. Os erros mais comuns são `DATABASE_URL`/`DIRECT_URL` com a senha errada ou sem `?pgbouncer=true`.
