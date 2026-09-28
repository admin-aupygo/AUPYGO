-- ============================================================
-- AUPYGO — RPC admin_set_staff_role (cast enum app_role)
-- Supabase → SQL Editor → Run
-- ============================================================

create or replace function public.admin_set_staff_role(
  target_id uuid,
  new_role text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  old_role text;
  nr text;
  branch text;
  result_row record;
  allowed text[] := array[
    'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur'
  ];
begin
  if actor is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select case
    when p.is_admin is true then 'amiral'
    when lower(p.role::text) in ('amiral', 'admin_general', 'admin') then 'amiral'
    else lower(p.role::text)
  end into actor_role
  from public.profiles p
  where p.id = actor;

  if actor_role is distinct from 'amiral' then
    raise exception 'FORBIDDEN: réservé à l''Amiral (role=%)', coalesce(actor_role, 'null')
      using errcode = '42501';
  end if;

  if target_id is null or target_id = actor then
    raise exception 'FORBIDDEN: cible invalide' using errcode = '42501';
  end if;

  nr := lower(trim(new_role));
  if nr is null or nr <> all (allowed) then
    raise exception 'FORBIDDEN: grade invalide %', new_role using errcode = '23514';
  end if;

  select case
    when p.is_admin is true then 'amiral'
    when lower(p.role::text) in ('amiral', 'admin_general', 'admin') then 'amiral'
    when lower(p.role::text) = 'host' then 'sergent_staff'
    when lower(p.role::text) = 'moderator' then 'sergent_moderateur'
    else lower(p.role::text)
  end into old_role
  from public.profiles p
  where p.id = target_id;

  if old_role is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if old_role = 'amiral' then
    raise exception 'FORBIDDEN: Amiral non modifiable' using errcode = '42501';
  end if;
  if old_role = 'user' then
    raise exception 'FORBIDDEN: user ne devient pas Staff' using errcode = '42501';
  end if;

  if nr in ('major_staff', 'sergent_staff') then
    branch := 'evenementiel';
  else
    branch := 'moderation';
  end if;

  perform set_config('aupygo.bypass_staff_guard', '1', true);

  -- Cast explicite text → app_role (colonne enum)
  update public.profiles
  set role = nr::public.app_role,
      is_admin = false,
      staff_branch = branch,
      subscription = 'PREMIUM'
  where id = target_id
  returning id, display_name, role::text, is_admin, staff_branch, subscription
  into result_row;

  if result_row.id is null then
    raise exception 'UPDATE_FAILED' using errcode = 'P0001';
  end if;

  return json_build_object(
    'id', result_row.id,
    'display_name', result_row.display_name,
    'role', result_row.role,
    'is_admin', result_row.is_admin,
    'staff_branch', result_row.staff_branch,
    'subscription', result_row.subscription
  );
end;
$$;

revoke all on function public.admin_set_staff_role(uuid, text) from public;
grant execute on function public.admin_set_staff_role(uuid, text) to authenticated;

notify pgrst, 'reload schema';
