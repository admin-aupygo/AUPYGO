-- ============================================================
-- AUPYGO — Tables Events + RLS (étape 2)
-- À coller dans Supabase → SQL Editor → Run
-- Idempotent : peut être relancé sans casser l’existant
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table events (sorties utilisateurs + officiels AUPYGO)
-- ------------------------------------------------------------
create table if not exists public.events (
  id                    uuid primary key default gen_random_uuid(),
  creator_id            uuid not null references auth.users(id) on delete cascade,
  title                 text not null,
  type                  text not null default 'other',
  emoji                 text default '🎉',
  description           text,
  address               text not null,
  event_date            timestamptz not null,
  max_participants      int not null default 8,
  visibility            text not null default 'public'
                        check (visibility in ('public', 'friends', 'admin', 'admin_only')),
  is_paid               boolean not null default false,
  price                 numeric(10,2) not null default 0,
  is_special_aupygo     boolean not null default false,
  reservation_confirmed boolean not null default false,
  created_at            timestamptz not null default now()
);

-- Colonnes manquantes si la table existait déjà (ancienne version)
alter table public.events
  add column if not exists is_paid               boolean not null default false,
  add column if not exists price                 numeric(10,2) not null default 0,
  add column if not exists is_special_aupygo     boolean not null default false,
  add column if not exists reservation_confirmed boolean not null default false;

-- Index utiles
create index if not exists events_date_idx       on public.events (event_date);
create index if not exists events_creator_idx    on public.events (creator_id);
create index if not exists events_visibility_idx on public.events (visibility);

-- ------------------------------------------------------------
-- 2. Table event_participants
-- ------------------------------------------------------------
create table if not exists public.event_participants (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_parts_user_idx on public.event_participants (user_id);

-- ------------------------------------------------------------
-- 3. Table event_invitations (sorties « entre amis »)
-- ------------------------------------------------------------
create table if not exists public.event_invitations (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  from_id    uuid not null references auth.users(id) on delete cascade,
  to_id      uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (event_id, to_id)
);

create index if not exists event_invites_to_idx on public.event_invitations (to_id);

-- ------------------------------------------------------------
-- 4. RLS — activation
-- ------------------------------------------------------------
alter table public.events              enable row level security;
alter table public.event_participants  enable row level security;
alter table public.event_invitations   enable row level security;

-- Drop anciennes policies pour repartir propre
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('events', 'event_participants', 'event_invitations')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. Policies EVENTS
-- ------------------------------------------------------------
create policy "events_select_authenticated"
  on public.events for select to authenticated using (true);

create policy "events_insert_own"
  on public.events for insert to authenticated with check (auth.uid() = creator_id);

create policy "events_update_own"
  on public.events for update to authenticated
  using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

create policy "events_delete_own"
  on public.events for delete to authenticated using (auth.uid() = creator_id);

-- ------------------------------------------------------------
-- 6. Policies EVENT_PARTICIPANTS
-- ------------------------------------------------------------
create policy "parts_select_authenticated"
  on public.event_participants for select to authenticated using (true);

create policy "parts_insert_own"
  on public.event_participants for insert to authenticated with check (auth.uid() = user_id);

create policy "parts_delete_own"
  on public.event_participants for delete to authenticated using (auth.uid() = user_id);

create policy "parts_delete_by_creator"
  on public.event_participants for delete to authenticated
  using (exists (
    select 1 from public.events e where e.id = event_id and e.creator_id = auth.uid()
  ));

-- ------------------------------------------------------------
-- 7. Policies EVENT_INVITATIONS
-- ------------------------------------------------------------
create policy "invites_select_involved"
  on public.event_invitations for select to authenticated
  using (auth.uid() = from_id or auth.uid() = to_id);

create policy "invites_insert_own"
  on public.event_invitations for insert to authenticated with check (auth.uid() = from_id);

create policy "invites_update_recipient"
  on public.event_invitations for update to authenticated
  using (auth.uid() = to_id) with check (auth.uid() = to_id);

create policy "invites_delete_involved"
  on public.event_invitations for delete to authenticated
  using (auth.uid() = from_id or auth.uid() = to_id);

-- ------------------------------------------------------------
-- 8. Grants
-- ------------------------------------------------------------
grant select, insert, update, delete on public.events             to authenticated;
grant select, insert, delete         on public.event_participants to authenticated;
grant select, insert, update, delete on public.event_invitations  to authenticated;

-- ============================================================
-- Vérification :
-- select tablename, policyname from pg_policies
--   where tablename in ('events','event_participants','event_invitations');
-- ============================================================
