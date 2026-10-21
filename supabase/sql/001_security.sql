-- Docxy — segurança do banco no Supabase.
-- Rodar DEPOIS da migração inicial do Prisma:  npm run db:security
-- É idempotente: pode ser executado novamente sem efeitos colaterais.
--
-- Modelo de acesso
--   A aplicação acessa o banco somente pelo servidor (Prisma), onde cada
--   operação passa pelas verificações de permissão em src/lib/auth.
--   Por isso todas as tabelas públicas ficam com RLS ativo e SEM políticas
--   para os papéis `anon` e `authenticated`: a API REST do Supabase não
--   expõe nenhuma linha, mesmo que a chave pública vaze.

-- 1. RLS em todas as tabelas do Docxy (default deny) ─────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'users','organizations','organization_members','invitations',
    'workspaces','workspace_members','folders','documents','document_versions',
    'document_permissions','document_shares','pins','recent_items',
    'comparisons','comparison_changes','extractors','extraction_results',
    'ai_conversations','ai_messages','comments','notifications','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
-- Observação: o Prisma conecta como `postgres`, dono das tabelas; o dono não é
-- afetado pelo RLS (não usamos FORCE), então o servidor continua funcionando.

-- 2. Auditoria somente-inserção ───────────────────────────────────────────
create or replace function public.audit_logs_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs é somente inserção';
end $$;

drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

-- 3. Espelhar auth.users em public.users ──────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name, avatar_url, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    now(),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_user();

-- 4. Storage privado para documentos ──────────────────────────────────────
-- Arquivos só são lidos por URLs assinadas e temporárias geradas no servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  104857600, -- 100 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Nenhuma política para anon/authenticated no bucket: apenas o servidor
-- (service role) grava e assina URLs.
