-- ============================================================================
-- AUPYGO — RLS Events : lecture publique pour tous les authentifiés
-- À coller dans Supabase → SQL Editor → Run (UNE FOIS)
--
-- Objectif CDC point 1 :
--   Les événements visibility = 'public' (y compris payants staff / Amiral)
--   doivent être visibles par FREE, STANDARD et PREMIUM.
--   Le prix n'est PAS un critère de masquage.
-- ============================================================================

-- Helpers staff (no-op si déjà présents)
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

alter table public.events enable row level security;

-- Retirer les anciennes policies SELECT trop restrictives / ouvertes
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

-- SELECT : public pour tous les authentifiés +
--          créateur / participant / invité / staff
create policy "events_select_public_or_involved"
  on public.events
  for select
  to authenticated
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

grant select on public.events to authenticated;

-- Participants : lecture nécessaire pour badges / compteurs
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

grant select on public.event_participants to authenticated;

notify pgrst, 'reload schema';

-- Vérification :
-- select policyname, cmd from pg_policies where tablename = 'events';
