-- ============================================================================
-- AUPYGO — Sécurité événements staff
-- À exécuter UNE FOIS dans Supabase → SQL Editor
--
-- Règles :
-- 1. Seul l'Amiral (is_admin = true OU role = 'amiral') peut créer / modifier
--    un événement avec is_paid = true et price > 0.
-- 2. Les events visibility = 'public' sont lisibles par tous les authentifiés.
-- 3. Insert events : créateur = auth.uid() ; is_paid bloqué si non-Amiral.
-- ============================================================================

-- Helper Amiral
create or replace function public.is_amiral()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.is_admin is true
        or lower(coalesce(p.role::text, '')) in ('amiral', 'admin_general', 'admin')
      )
  );
$$;

grant execute on function public.is_amiral() to authenticated;

-- Helper staff (lecture élargie)
create or replace function public.is_staff_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.is_admin is true
        or lower(coalesce(p.role::text, '')) in (
          'amiral', 'admin_general', 'admin',
          'major_staff', 'sergent_staff',
          'major_moderateur', 'sergent_moderateur',
          'host', 'moderator'
        )
      )
  );
$$;

grant execute on function public.is_staff_member() to authenticated;

-- Trigger : refuse is_paid / price si non-Amiral (INSERT + UPDATE)
create or replace function public.events_enforce_paid_amiral_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Normaliser : non-payant → price 0
  if coalesce(new.is_paid, false) is not true then
    new.is_paid := false;
    new.price := 0;
    return new;
  end if;

  -- is_paid = true → Amiral uniquement
  if not public.is_amiral() then
    raise exception 'SECURITY: seuls les comptes Amiral peuvent créer un événement payant'
      using errcode = '42501';
  end if;

  if coalesce(new.price, 0) <= 0 then
    raise exception 'Un événement payant doit avoir un prix > 0'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_events_paid_amiral_only on public.events;
create trigger trg_events_paid_amiral_only
  before insert or update of is_paid, price
  on public.events
  for each row
  execute function public.events_enforce_paid_amiral_only();

-- RLS events
alter table public.events enable row level security;

-- SELECT : public pour tous authentifiés + concernés + staff
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'events' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.events', pol.policyname);
  end loop;
end $$;

create policy "events_select_public_or_involved"
  on public.events for select to authenticated
  using (
    visibility = 'public'
    or creator_id = auth.uid()
    or exists (
      select 1 from public.event_participants ep
      where ep.event_id = id and ep.user_id = auth.uid()
    )
    or exists (
      select 1 from public.event_invitations ei
      where ei.event_id = id and ei.to_id = auth.uid()
        and ei.status in ('pending', 'accepted')
    )
    or public.is_staff_member()
  );

-- INSERT : créateur = soi ; is_paid contrôlé par trigger
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'events' and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.events', pol.policyname);
  end loop;
end $$;

create policy "events_insert_own"
  on public.events for insert to authenticated
  with check (
    creator_id = auth.uid()
    and (
      -- Non payant : tout user authentifié (FREE bloqué côté app si besoin)
      coalesce(is_paid, false) is not true
      -- Payant : Amiral uniquement (double filet avec trigger)
      or public.is_amiral()
    )
  );

-- UPDATE : créateur ou Amiral
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'events' and cmd = 'UPDATE'
  loop
    execute format('drop policy if exists %I on public.events', pol.policyname);
  end loop;
end $$;

create policy "events_update_own_or_amiral"
  on public.events for update to authenticated
  using (creator_id = auth.uid() or public.is_amiral())
  with check (creator_id = auth.uid() or public.is_amiral());

-- DELETE : créateur ou Amiral
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'events' and cmd = 'DELETE'
  loop
    execute format('drop policy if exists %I on public.events', pol.policyname);
  end loop;
end $$;

create policy "events_delete_own_or_amiral"
  on public.events for delete to authenticated
  using (creator_id = auth.uid() or public.is_amiral());

grant select, insert, update, delete on public.events to authenticated;

-- Participants : lecture pour tous authentifiés (compteurs)
alter table public.event_participants enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'event_participants' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.event_participants', pol.policyname);
  end loop;
end $$;

create policy "parts_select_authenticated"
  on public.event_participants for select to authenticated using (true);

-- Insert participant : soi-même uniquement
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'event_participants' and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.event_participants', pol.policyname);
  end loop;
end $$;

create policy "parts_insert_own"
  on public.event_participants for insert to authenticated
  with check (user_id = auth.uid());

grant select, insert on public.event_participants to authenticated;

notify pgrst, 'reload schema';

-- Vérifs :
-- select public.is_amiral();
-- select policyname, cmd from pg_policies where tablename = 'events';
