# Docxy

Plataforma SaaS para gerenciar, ler, comparar e extrair informações de documentos — contratos, apólices, documentos jurídicos e financeiros.

> **Estado atual: Fase 4 — Inteligência documental.** Além da fundação, dos documentos e da leitura/comparação, já funcionam a extração de dados com extratores configuráveis, o dashboard de comparação, o assistente com respostas citando página e trecho, e os resumos (executivo, alterações, contratual, riscos e financeiro). Tudo funciona sem IA, por regras determinísticas; com um provedor configurado e autorizado pela organização, a IA complementa — sempre presa a trechos verificados do documento. Plano completo em [`docs/brief.md`](docs/brief.md).

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
npm test                         # testes do motor de comparação e da leitura de PDF/DOCX
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
    compare/           motor de comparação determinístico
    extract/           corpus (texto com coordenadas), regras de extração, modelos, IA verificada, comparação de campos
    assist/            busca de trechos (BM25), respostas com citação, resumos
    ai/                provedor de IA configurável (server-only) e política de envio
  middleware.ts        renovação de sessão e proteção de rotas
prisma/schema.prisma   modelo de dados (22 tabelas)
supabase/sql/          segurança no banco (RLS, triggers, storage)
docs/                  brief, arquitetura, design system e telas de referência
```

## Segurança (resumo)

- Sessão validada no servidor a cada requisição (`auth.getUser()`), cookies `httpOnly`.
- Permissões verificadas no servidor por `requirePermission(action)`; a interface só esconde controles.
- Isolamento por organização: toda consulta filtra por `organization_id`; RLS bloqueia acesso direto pela API pública do Supabase.
- Chaves secretas (`SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`) só em módulos `server-only`.
- IA desligada por padrão: texto só vai ao provedor com provedor configurado **e** autorização da organização, e nunca para documentos marcados como confidenciais. Toda resposta da IA é conferida contra o texto real antes de ser mostrada.
- Auditoria somente-inserção, com IP anonimizado e sem conteúdo de documentos.
- Histórico documental sem exclusão em cascata; pastas e documentos usam exclusão lógica.

Detalhes em [`docs/arquitetura.md`](docs/arquitetura.md).
