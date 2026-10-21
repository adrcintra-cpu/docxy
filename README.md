# Docxy

Plataforma SaaS para gerenciar, ler, comparar e extrair informações de documentos — contratos, apólices, documentos jurídicos e financeiros.

> **Estado atual: Fase 2 — Documentos.** Além da fundação (design system, banco, autenticação), já funcionam pastas, upload com versionamento, pesquisa, fixados, recentes, compartilhamento, lixeira, workspaces e convites. As funções das próximas fases aparecem na interface marcadas como indisponíveis (nunca como botões que não fazem nada). Plano completo em [`docs/brief.md`](docs/brief.md).

## Stack

| Camada | Tecnologia |
| --- | --- |
| Interface | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Lucide |
| Autenticação | Supabase Auth (e-mail/senha, Microsoft, Google, Apple) via `@supabase/ssr` |
| Banco | PostgreSQL (Supabase) · Prisma ORM |
| Arquivos | Supabase Storage, bucket privado `documents` (URLs assinadas) |

## Rodando localmente

Pré-requisitos: Node 20+ e um projeto no [Supabase](https://supabase.com).

```bash
npm install
cp .env.example .env.local      # preencha com os dados do seu projeto Supabase
npx prisma migrate dev --name init   # cria as tabelas (rode de novo a cada atualização do schema)
npm run db:security              # RLS, trigger de usuários, auditoria imutável, bucket privado
npm run dev                      # http://localhost:3000
```

Prisma lê `.env`, não `.env.local`: copie `DATABASE_URL` e `DIRECT_URL` também para um `.env` (ambos estão no `.gitignore`).

### Primeiro acesso

1. No Supabase: **Authentication › Users › Add user** (ou habilite cadastro) e crie seu usuário.
2. Entre em `/login` uma vez (isso cria seu registro em `users`).
3. Crie a organização e torne-se administrador:
   ```bash
   SEED_ADMIN_EMAIL=voce@empresa.com SEED_ORG_NAME="Minha Empresa" npm run db:seed
   ```

### Login social (opcional)

Ative cada provedor em **Supabase › Authentication › Providers** (Microsoft = *Azure*), adicione `http://localhost:3000/auth/callback` (e a URL de produção) em **URL Configuration › Redirect URLs**, e liste os ativos em `NEXT_PUBLIC_AUTH_PROVIDERS=azure,google,apple`. Botões de provedores não configurados não aparecem.

### E-mail de recuperação de senha

O fluxo padrão (link com `code`) já funciona via `/auth/callback`. Para o modelo recomendado com `token_hash`, use no template *Reset Password* do Supabase:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha
```

## Estrutura

```
src/
  app/
    (auth)/            login, esqueci-senha, redefinir-senha
    (app)/             área autenticada (layout com cabeçalho e menu)
    auth/              server actions de autenticação, /auth/callback, /auth/confirm
    globals.css        tokens do design system (@theme do Tailwind)
  components/
    ui/                Button, Input, PasswordInput, Checkbox, SearchField, Card, StatusChip, Avatar, Toggle, IconButton
    layout/            AppHeader, Sidebar, NavDrawer
    auth/              AuthShell, LoginForm, ParticleSphere
    brand/             Logo (SVG oficial)
  lib/
    auth/              permissions.ts (matriz de papéis), session.ts (requireUser, requirePermission)
    supabase/          clientes server/middleware e cookies ("Manter conectado")
    audit.ts           trilha de auditoria
    db.ts              Prisma client
  middleware.ts        renovação de sessão e proteção de rotas
prisma/schema.prisma   modelo de dados (22 tabelas)
supabase/sql/          segurança no banco (RLS, triggers, storage)
docs/                  brief, arquitetura, design system e telas de referência
```

## Segurança (resumo)

- Sessão validada no servidor a cada requisição (`auth.getUser()`), cookies `httpOnly`.
- Permissões verificadas no servidor por `requirePermission(action)`; a interface só esconde controles.
- Isolamento por organização: toda consulta filtra por `organization_id`; RLS bloqueia acesso direto pela API pública do Supabase.
- Chaves secretas (`SUPABASE_SERVICE_ROLE_KEY`) só em módulos `server-only`.
- Auditoria somente-inserção, com IP anonimizado e sem conteúdo de documentos.
- Histórico documental sem exclusão em cascata; pastas e documentos usam exclusão lógica.

Detalhes em [`docs/arquitetura.md`](docs/arquitetura.md).
