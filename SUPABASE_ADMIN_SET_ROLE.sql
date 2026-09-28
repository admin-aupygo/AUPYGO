-- ============================================================
-- AUPYGO — Changement de grade Staff par l'Amiral (RPC)
-- Supabase → SQL Editor → Run (une seule fois)
-- ============================================================

-- 1) Enum : s'assurer que les grades existent
do $$
begin
  if exists (select 1 from pg_type where typname = 'app_role') then
    if not exists (
      select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'app_role' and e.enumlabel = 'major_staff'
    ) then alter type public.app_role add value 'major_staff'; end if;
    if not exists (
      select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'app_role' and e.enumlabel = 'sergent_staff'
    ) then alter type public.app_role add value 'sergent_staff'; end if;
    if not exists (
      select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'app_role' and e.enumlabel = 'major_moderateur'
    ) then alter type public.app_role add value 'major_moderateur'; end if;
    if not exists (
      select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'app_role' and e.enumlabel = 'sergent_moderateur'
    ) then alter type public.app_role add value 'sergent_moderateur'; end if;
    if not exists (
      select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'app_role' and e.enumlabel = 'amiral'
    ) then alter type public.app_role add value 'amiral'; end if;
  end if;
exception when others then
  raise notice 'enum skip: %', SQLERRM;
end $$;

-- 2) Migrer host → sergent_staff (legacy)
alter table public.profiles disable trigger trg_profiles_guard_staff;

update public.profiles
set role = 'sergent_staff',
    is_admin = false,
    staff_branch = coalesce(staff_branch, 'evenementiel'),
    subscription = 'PREMIUM'
where lower(role::text) = 'host';

update public.profiles
set role = 'sergent_moderateur',
    is_admin = false,
    staff_branch = coalesce(staff_branch, 'moderation'),
    subscription = 'PREMIUM'
where lower(role::text) = 'moderator';

alter table public.profiles enable trigger trg_profiles_guard_staff;

-- 3) Fonction RPC : seul l'Amiral peut changer un grade Staff
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
  result_row public.profiles%rowtype;
  allowed text[] := array[
    'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur'
  ];
begin
  if actor is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- Vérifier Amiral (lecture directe, pas de dépendance fragile)
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
    when lower(p.role::text) in ('host') then 'sergent_staff'
    when lower(p.role::text) in ('moderator') then 'sergent_moderateur'
    else lower(p.role::text)
  end into old_role
  from public.profiles p
  where p.id = target_id;

  if old_role is null then
    raise exception 'NOT_FOUND: membre introuvable' using errcode = 'P0002';
  end if;

  if old_role = 'amiral' then
    raise exception 'FORBIDDEN: Amiral non modifiable' using errcode = '42501';
  end if;

  if old_role = 'user' then
    raise exception 'FORBIDDEN: un user ne peut pas devenir Staff' using errcode = '42501';
  end if;

  if nr in ('major_staff', 'sergent_staff') then
    branch := 'evenementiel';
  else
    branch := 'moderation';
  end if;

  -- Contourne le trigger le temps de l'écriture (déjà validé Amiral ci-dessus)
  alter table public.profiles disable trigger trg_profiles_guard_staff;

  begin
    update public.profiles
    set role = nr,
        is_admin = false,
        staff_branch = branch,
        subscription = 'PREMIUM'
    where id = target_id
    returning * into result_row;

    alter table public.profiles enable trigger trg_profiles_guard_staff;
  exception when others then
    alter table public.profiles enable trigger trg_profiles_guard_staff;
    raise;
  end;

  if result_row.id is null then
    raise exception 'UPDATE_FAILED' using errcode = 'P0001';
  end if;

  return json_build_object(
    'id', result_row.id,
    'display_name', result_row.display_name,
    'role', result_row.role::text,
    'is_admin', result_row.is_admin,
    'staff_branch', result_row.staff_branch,
    'subscription', result_row.subscription
  );
end;
$$;

revoke all on function public.admin_set_staff_role(uuid, text) from public;
grant execute on function public.admin_set_staff_role(uuid, text) to authenticated;

-- 4) Contrôle
select id, display_name, role, is_admin, staff_branch
from public.profiles
order by is_admin desc, display_name;
