-- ============================================================================
-- AUPYGO — FREE peut rejoindre les événements AUPYGO PAYANTS
-- À coller dans Supabase → SQL Editor → Run (UNE FOIS)
-- ============================================================================

-- 1) Helpers
create or replace function public.is_amiral()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.is_admin is true
           or lower(coalesce(p.role::text,'')) in ('amiral','admin_general','admin'))
  );
$$;

create or replace function public.is_staff_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.is_admin is true
           or lower(coalesce(p.role::text,'')) in (
             'amiral','admin_general','admin',
             'major_staff','sergent_staff',
             'major_moderateur','sergent_moderateur',
             'host','moderator'
           ))
  );
$$;

grant execute on function public.is_amiral() to authenticated;
grant execute on function public.is_staff_member() to authenticated;

-- 2) Réparer les données : prix > 0 → is_paid = true
update public.events
set is_paid = true
where coalesce(price, 0) > 0
  and coalesce(is_paid, false) is not true;

-- 3) Marquer les events créés par le staff comme AUPYGO + public
update public.events e
set
  visibility = 'public',
  is_special_aupygo = true
where e.creator_id in (
  select p.id from public.profiles p
  where p.is_admin is true
     or lower(coalesce(p.role::text,'')) in (
       'amiral','admin_general','admin',
       'major_staff','sergent_staff',
       'major_moderateur','sergent_moderateur',
       'host','moderator'
     )
);

-- 4) Trigger : seul Amiral peut créer du payant
create or replace function public.events_enforce_paid_amiral_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.price, 0) > 0 then
    new.is_paid := true;
  end if;
  if coalesce(new.is_paid, false) is not true then
    new.is_paid := false;
    new.price := 0;
    return new;
  end if;
  if not public.is_amiral() then
    raise exception 'Seul Amiral peut créer un événement payant'
      using errcode = '42501';
  end if;
  if coalesce(new.price, 0) <= 0 then
    raise exception 'Prix > 0 requis pour un événement payant'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_events_paid_amiral_only on public.events;
create trigger trg_events_paid_amiral_only
  before insert or update of is_paid, price on public.events
  for each row execute function public.events_enforce_paid_amiral_only();

-- 5) RLS events SELECT : public pour tous les authentifiés
alter table public.events enable row level security;

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

create policy "events_select_auth"
  on public.events for select to authenticated
  using (
    visibility = 'public'
    or creator_id = auth.uid()
    or exists (
      select 1 from public.event_participants ep
      where ep.event_id = id and ep.user_id = auth.uid()
    )
    or public.is_staff_member()
  );

-- 6) Participants : tout user authentifié peut s'inscrire lui-même
alter table public.event_participants enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'event_participants'
  loop
    execute format('drop policy if exists %I on public.event_participants', pol.policyname);
  end loop;
end $$;

create policy "parts_select_auth"
  on public.event_participants for select to authenticated using (true);

create policy "parts_insert_own"
  on public.event_participants for insert to authenticated
  with check (user_id = auth.uid());

create policy "parts_delete_own"
  on public.event_participants for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.event_participants to authenticated;
grant select on public.events to authenticated;

notify pgrst, 'reload schema';

-- Vérif rapide :
-- select id, title, is_paid, price, is_special_aupygo, visibility from events order by event_date desc limit 20;
