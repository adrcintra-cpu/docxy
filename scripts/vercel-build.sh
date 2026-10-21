#!/usr/bin/env bash
# Build na Vercel. Com o banco configurado, cria/atualiza as tabelas e aplica a segurança;
# sem ele (primeiro deploy, antes de ligar o Supabase), só compila.
set -euo pipefail
node scripts/copy-pdf-worker.mjs
npx prisma generate
if [ -n "${DATABASE_URL:-}" ] && [ -n "${DIRECT_URL:-}" ]; then
  npx prisma db push --skip-generate
  # A segurança (RLS, gatilhos, bucket) também pode ser aplicada direto no Supabase; não derruba o build.
  npx prisma db execute --schema prisma/schema.prisma --file supabase/sql/001_security.sql || echo "Aviso: 001_security.sql não aplicado por este usuário do banco; aplique pelo SQL Editor do Supabase."
else
  echo "DATABASE_URL/DIRECT_URL ausentes: pulando a criação das tabelas (configure o Supabase e faça novo deploy)."
  export DATABASE_URL="postgresql://build:build@localhost:5432/build" DIRECT_URL="postgresql://build:build@localhost:5432/build"
fi
npx next build
