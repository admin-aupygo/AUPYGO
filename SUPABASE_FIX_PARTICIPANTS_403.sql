-- ============================================================================
-- AUPYGO — FIX 403 sur event_participants
-- Erreur console : POST .../event_participants → 403
-- Cause : RLS bloque l'INSERT pour les users FREE / non-staff
--
-- Coller TOUT ce script dans Supabase → SQL Editor → Run
-- ============================================================================

-- Table existe + grants
grant usage on schema public to authenticated;
grant select, insert, delete on table public.event_participants to authenticated;
grant select on table public.events to authenticated;

alter table public.event_participants enable row level security;
alter table public.events enable row level security;

-- Supprimer TOUTES les policies actuelles sur event_participants
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

-- SELECT : tout authentifié voit les inscriptions (compteurs places)
create policy "ep_select"
  on public.event_participants
  for select
  to authenticated
  using (true);

-- INSERT : un user s'inscrit UNIQUEMENT lui-même
create policy "ep_insert_own"
  on public.event_participants
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- DELETE : un user se désinscrit lui-même
create policy "ep_delete_own"
  on public.event_participants
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Réparer flags payants + AUPYGO staff (au cas où)
update public.events
set is_paid = true
where coalesce(price, 0) > 0
  and coalesce(is_paid, false) is not true;

update public.events e
set visibility = 'public',
    is_special_aupygo = true
where e.creator_id in (
  select p.id from public.profiles p
  where p.is_admin is true
     or lower(coalesce(p.role::text, '')) in (
       'amiral','admin_general','admin',
       'major_staff','sergent_staff',
       'major_moderateur','sergent_moderateur',
       'host','moderator'
     )
);

-- Events public lisibles (recréer SELECT events proprement)
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
  on public.events
  for select
  to authenticated
  using (
    visibility = 'public'
    or creator_id = auth.uid()
    or exists (
      select 1 from public.event_participants ep
      where ep.event_id = events.id and ep.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';

-- Vérifications (doit renvoyer des lignes, sans erreur) :
-- select policyname, cmd, roles from pg_policies where tablename = 'event_participants';
-- select id, title, is_paid, price, is_special_aupygo from events order by event_date desc limit 10;
