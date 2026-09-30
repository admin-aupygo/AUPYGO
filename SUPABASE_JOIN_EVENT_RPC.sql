-- ============================================================================
-- AUPYGO — FIX 403 inscription événements
-- Coller TOUT dans Supabase → SQL Editor → RUN
-- ============================================================================

grant usage on schema public to authenticated, anon;
grant select on table public.events to authenticated;
grant select, insert, delete on table public.event_participants to authenticated;

alter table public.event_participants enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'event_participants'
  loop
    execute format('drop policy if exists %I on public.event_participants', r.policyname);
  end loop;
end $$;

create policy "ep_select_all_auth"
  on public.event_participants for select
  to authenticated
  using (true);

create policy "ep_insert_self"
  on public.event_participants for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "ep_delete_self"
  on public.event_participants for delete
  to authenticated
  using (user_id = auth.uid());

-- OBLIGATOIRE avant recreate (évite ERROR 42P13)
drop function if exists public.join_event(uuid);
drop function if exists public.join_event(text);

create function public.join_event(p_event_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  already boolean;
begin
  if uid is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not exists (select 1 from public.events where id = p_event_id) then
    return json_build_object('ok', false, 'error', 'event_not_found');
  end if;

  select exists(
    select 1 from public.event_participants
    where event_id = p_event_id and user_id = uid
  ) into already;

  if already then
    return json_build_object('ok', true, 'already', true);
  end if;

  insert into public.event_participants (event_id, user_id)
  values (p_event_id, uid);

  return json_build_object('ok', true, 'already', false);
exception
  when unique_violation then
    return json_build_object('ok', true, 'already', true);
  when others then
    return json_build_object('ok', false, 'error', SQLERRM);
end;
$$;

revoke all on function public.join_event(uuid) from public;
grant execute on function public.join_event(uuid) to authenticated;

update public.events
set is_paid = true
where coalesce(price, 0) > 0 and coalesce(is_paid, false) is not true;

update public.events e
set visibility = 'public', is_special_aupygo = true
where e.creator_id in (
  select id from public.profiles p
  where p.is_admin is true
     or lower(coalesce(p.role::text,'')) in (
       'amiral','admin_general','admin','major_staff','sergent_staff',
       'major_moderateur','sergent_moderateur','host','moderator'
     )
);

notify pgrst, 'reload schema';
