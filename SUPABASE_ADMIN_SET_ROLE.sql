-- ============================================================
-- AUPYGO — Changement de grade Staff par l'Amiral (RPC)
-- Supabase → SQL Editor → Run
-- ============================================================

-- 0) Colonnes
alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists staff_branch text,
  add column if not exists staff_country text,
  add column if not exists staff_city text;

-- 1) Enum grades
do $$
begin
  if exists (select 1 from pg_type where typname = 'app_role') then
    if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'app_role' and e.enumlabel = 'major_staff') then
      alter type public.app_role add value 'major_staff';
    end if;
    if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'app_role' and e.enumlabel = 'sergent_staff') then
      alter type public.app_role add value 'sergent_staff';
    end if;
    if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'app_role' and e.enumlabel = 'major_moderateur') then
      alter type public.app_role add value 'major_moderateur';
    end if;
    if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'app_role' and e.enumlabel = 'sergent_moderateur') then
      alter type public.app_role add value 'sergent_moderateur';
    end if;
    if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'app_role' and e.enumlabel = 'amiral') then
      alter type public.app_role add value 'amiral';
    end if;
  end if;
exception when others then
  raise notice 'enum: %', SQLERRM;
end $$;

-- 2) Migrer host / moderator → grades officiels (hors trigger)
do $$
begin
  alter table public.profiles disable trigger trg_profiles_guard_staff;
exception when undefined_object then
  null;
end $$;

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

do $$
begin
  alter table public.profiles enable trigger trg_profiles_guard_staff;
exception when undefined_object then
  null;
end $$;

-- 3) Trigger : autoriser bypass uniquement si flag de session (posé par la RPC Amiral)
create or replace function public.profiles_guard_staff_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_amiral boolean;
  old_role text;
  new_role text;
  staff_ranks text[] := array['major_staff','sergent_staff','major_moderateur','sergent_moderateur'];
  bypass text;
begin
  -- Bypass sécurisé : uniquement si la RPC Amiral a posé le flag (set_config local)
  begin
    bypass := current_setting('aupygo.bypass_staff_guard', true);
  exception when others then
    bypass := null;
  end;

  if bypass = '1' then
    new_role := lower(coalesce(new.role::text, 'user'));
    if new_role = 'amiral' then
      new.is_admin := true;
    else
      new.is_admin := false;
    end if;
    if new_role in ('major_staff', 'sergent_staff') then
      new.staff_branch := 'evenementiel';
    elsif new_role in ('major_moderateur', 'sergent_moderateur') then
      new.staff_branch := 'moderation';
    end if;
    return new;
  end if;

  old_role := lower(coalesce(old.role::text, 'user'));
  if old.is_admin is true or old_role in ('admin_general', 'admin') then old_role := 'amiral'; end if;
  if old_role = 'host' then old_role := 'sergent_staff'; end if;
  if old_role = 'moderator' then old_role := 'sergent_moderateur'; end if;

  new_role := lower(coalesce(new.role::text, 'user'));
  if new.is_admin is true or new_role in ('admin_general', 'admin') then new_role := 'amiral'; end if;
  if new_role = 'host' then new_role := 'sergent_staff'; end if;
  if new_role = 'moderator' then new_role := 'sergent_moderateur'; end if;

  if old_role is not distinct from new_role
     and old.is_admin is not distinct from new.is_admin
     and old.staff_branch is not distinct from new.staff_branch
     and old.staff_country is not distinct from new.staff_country
     and old.staff_city is not distinct from new.staff_city
  then
    return new;
  end if;

  actor_is_amiral := public.is_amiral();
  if not actor_is_amiral then
    raise exception 'FORBIDDEN: role/is_admin/staff_* réservés à l''Amiral'
      using errcode = '42501';
  end if;

  if new_role = 'amiral' and old.id is distinct from auth.uid() then
    raise exception 'FORBIDDEN: le rôle Amiral est unique et non transférable'
      using errcode = '42501';
  end if;

  if old_role = 'amiral' and new_role is distinct from 'amiral' and old.id = auth.uid() then
    raise exception 'FORBIDDEN: l''Amiral ne peut pas se rétrograder via l''API'
      using errcode = '42501';
  end if;

  if new_role not in ('user', 'amiral') and new_role <> all (staff_ranks) then
    raise exception 'FORBIDDEN: rôle invalide %', new_role using errcode = '23514';
  end if;

  if new_role = 'amiral' then
    new.is_admin := true;
    new.role := 'amiral';
  else
    new.is_admin := false;
    new.role := new_role;
  end if;

  if new_role in ('major_staff', 'sergent_staff') then
    new.staff_branch := 'evenementiel';
  elsif new_role in ('major_moderateur', 'sergent_moderateur') then
    new.staff_branch := 'moderation';
  elsif new_role = 'user' then
    new.staff_branch := null;
    new.staff_country := null;
    new.staff_city := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_staff on public.profiles;
create trigger trg_profiles_guard_staff
  before update on public.profiles
  for each row
  execute function public.profiles_guard_staff_columns();

-- 4) RPC appelée par l'app (Amiral uniquement)
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

  -- Flag local : le trigger laisse passer (déjà validé Amiral)
  perform set_config('aupygo.bypass_staff_guard', '1', true);

  update public.profiles
  set role = nr,
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

-- 5) Contrôle
select id, display_name, role, is_admin, staff_branch
from public.profiles
order by is_admin desc, display_name;
