-- ============================================================
-- AUPYGO — RLS Messagerie (conversations / members / messages)
-- Supabase → SQL Editor → Run TOUT le fichier d'un coup
--
-- Corrige l'erreur 42501 / 403 :
--   "new row violates row-level security policy for table
--    conversation_members"
-- ============================================================

-- ------------------------------------------------------------
-- 0. DROP fonctions existantes (évite ERROR 42P13 nom de param)
-- ------------------------------------------------------------
drop function if exists public.is_conversation_member(uuid) cascade;
drop function if exists public.is_conversation_creator(uuid) cascade;

-- ------------------------------------------------------------
-- 1. Tables (si absentes)
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  type        text not null default 'dm',
  title       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  last_read_at    timestamptz,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references auth.users(id) on delete cascade,
  body             text not null,
  created_at       timestamptz not null default now()
);

alter table public.conversations
  add column if not exists type text,
  add column if not exists title text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now();

alter table public.conversation_members
  add column if not exists last_read_at timestamptz,
  add column if not exists joined_at timestamptz default now();

create index if not exists conv_members_user_idx
  on public.conversation_members (user_id);
create index if not exists conv_members_conv_idx
  on public.conversation_members (conversation_id);
create index if not exists messages_conv_idx
  on public.messages (conversation_id, created_at);

-- ------------------------------------------------------------
-- 2. Helpers (recréés propres)
-- ------------------------------------------------------------
create or replace function public.is_conversation_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = cid
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_conversation_creator(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = cid
      and c.created_by = auth.uid()
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public;
revoke all on function public.is_conversation_creator(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.is_conversation_creator(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. RLS CONVERSATIONS
-- ------------------------------------------------------------
alter table public.conversations enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'conversations'
  loop
    execute format('drop policy if exists %I on public.conversations', pol.policyname);
  end loop;
end $$;

create policy "conversations_select_member"
  on public.conversations for select to authenticated
  using (
    public.is_conversation_member(id)
    or created_by = auth.uid()
  );

create policy "conversations_insert_own"
  on public.conversations for insert to authenticated
  with check (created_by = auth.uid());

create policy "conversations_update_creator"
  on public.conversations for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "conversations_delete_creator"
  on public.conversations for delete to authenticated
  using (created_by = auth.uid());

grant select, insert, update, delete on public.conversations to authenticated;

-- ------------------------------------------------------------
-- 4. RLS CONVERSATION_MEMBERS  ← fix 403 / 42501
-- ------------------------------------------------------------
alter table public.conversation_members enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'conversation_members'
  loop
    execute format('drop policy if exists %I on public.conversation_members', pol.policyname);
  end loop;
end $$;

create policy "cm_select_same_conv"
  on public.conversation_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_conversation_member(conversation_id)
    or public.is_conversation_creator(conversation_id)
  );

-- INSERT : m'ajouter OU créateur ajoute les autres (moi + ami en DM)
create policy "cm_insert_self_or_creator"
  on public.conversation_members for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.is_conversation_creator(conversation_id)
  );

create policy "cm_update_own"
  on public.conversation_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "cm_delete_self_or_creator"
  on public.conversation_members for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_conversation_creator(conversation_id)
  );

grant select, insert, update, delete on public.conversation_members to authenticated;

-- ------------------------------------------------------------
-- 5. RLS MESSAGES
-- ------------------------------------------------------------
alter table public.messages enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'messages'
  loop
    execute format('drop policy if exists %I on public.messages', pol.policyname);
  end loop;
end $$;

create policy "messages_select_member"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "messages_insert_member"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

create policy "messages_delete_own_or_member"
  on public.messages for delete to authenticated
  using (
    sender_id = auth.uid()
    or public.is_conversation_member(conversation_id)
  );

grant select, insert, delete on public.messages to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- OK si aucune erreur. Puis reteste un DM dans l'app.
-- ============================================================
