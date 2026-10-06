-- ============================================================================
-- AUPYGO — Events : visibilité cohérente + fin de la fuite des participants
-- Corrige :
--  * events_select_public_or_involved : bug "ei.event_id = ei.id" (jamais vrai)
--    -> un invité ne voyait pas l'événement privé auquel il est invité
--  * ep_select_all_auth (using true) : tout connecté voyait les participants
--    de TOUS les événements, y compris privés
--  * ep_insert_self : on pouvait s'inscrire à un événement qu'on ne peut pas voir
-- Une fonction SECURITY DEFINER évite la récursion entre les policies
-- events <-> event_participants. Script idempotent.
-- ============================================================================

create or replace function public.is_event_visible(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event
      and (
        e.visibility = 'public'
        or e.creator_id = auth.uid()
        or exists (select 1 from public.event_participants ep
                   where ep.event_id = e.id and ep.user_id = auth.uid())
        or exists (select 1 from public.event_invitations ei
                   where ei.event_id = e.id
                     and ei.to_id = auth.uid()
                     and ei.status in ('pending','accepted'))
        or coalesce(public.is_staff_member(), false)
      )
  );
$$;

revoke all on function public.is_event_visible(uuid) from public, anon;
grant execute on function public.is_event_visible(uuid) to authenticated;

-- events : lecture
drop policy if exists events_select_public_or_involved on public.events;
drop policy if exists events_select_visible on public.events;
create policy events_select_visible
  on public.events for select to authenticated
  using (public.is_event_visible(id));

-- event_participants : lecture limitée aux événements visibles (ou à soi-même)
drop policy if exists ep_select_all_auth on public.event_participants;
drop policy if exists ep_select_visible on public.event_participants;
create policy ep_select_visible
  on public.event_participants for select to authenticated
  using (user_id = auth.uid() or public.is_event_visible(event_id));

-- event_participants : on ne s'inscrit que soi-même, à un événement visible
drop policy if exists ep_insert_self on public.event_participants;
create policy ep_insert_self
  on public.event_participants for insert to authenticated
  with check (user_id = auth.uid() and public.is_event_visible(event_id));
