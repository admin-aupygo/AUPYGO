-- ============================================================
-- AUPYGO — RESET propre + RPC Amiral (changement de grade Staff)
-- Supabase → SQL Editor → Run TOUT le fichier d'un coup
-- ============================================================

-- ------------------------------------------------------------
-- 1. SUPPRIMER ce qui bloque (triggers / anciennes fonctions)
-- ------------------------------------------------------------
drop trigger if exists trg_profiles_guard_staff on public.profiles;
drop trigger if exists trg_profiles_guard_staff_insert on public.profiles;

drop function if exists public.profiles_guard_staff_columns() cascade;
drop function if exists public.profiles_guard_staff_insert() cascade;
drop function if exists public.admin_set_staff_role(uuid, text) cascade;

-- ------------------------------------------------------------
-- 2. Colonnes + enum
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists staff_branch text,
  add column if not exists staff_country text,
  add column if not exists staff_city text;

do $$
begin
  if exists (select 1 from pg_type where typname = 'app_role') then
    if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'app_role' and e.enumlabel = 'amiral') then
      alter type public.app_role add value 'amiral';
    end if;
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
  end if;
exception when others then
  raise notice 'enum: %', SQLERRM;
end $$;

-- ------------------------------------------------------------
-- 3. Helpers is_amiral (simples)
-- ------------------------------------------------------------
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when p.is_admin is true then 'amiral'
      when lower(p.role::text) in ('amiral', 'admin_general', 'admin') then 'amiral'
      when lower(p.role::text) in ('host') then 'sergent_staff'
      when lower(p.role::text) in ('moderator') then 'sergent_moderateur'
      else lower(p.role::text)
    end
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ), 'user');
$$;

create or replace function public.is_amiral()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_profile_role() = 'amiral';
$$;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_amiral() to authenticated;

-- ------------------------------------------------------------
-- 4. Migrer host → sergent_staff (une fois)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 5. RLS profiles (propre)
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;
end $$;

create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

-- Chacun met à jour SA ligne (hors role/is_admin : géré par la RPC)
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- L'Amiral peut mettre à jour n'importe quelle ligne
create policy "profiles_update_by_amiral"
  on public.profiles for update to authenticated
  using (public.is_amiral())
  with check (public.is_amiral());

grant select, insert, update on public.profiles to authenticated;

-- ------------------------------------------------------------
-- 6. RPC UNIQUE : Amiral change le grade Staff
--    SECURITY DEFINER = passe au-dessus de la RLS pour l'écriture
--    PAS de trigger qui rebloque
-- ------------------------------------------------------------
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
  actor_ok boolean := false;
  old_role text;
  nr text;
  branch text;
  out_id uuid;
  out_name text;
  out_role text;
  out_admin boolean;
  out_branch text;
  out_sub text;
begin
  if actor is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Amiral ?
  select (p.is_admin is true or lower(p.role::text) in ('amiral', 'admin_general', 'admin'))
    into actor_ok
  from public.profiles p
  where p.id = actor;

  if coalesce(actor_ok, false) is not true then
    raise exception 'FORBIDDEN: réservé à l''Amiral';
  end if;

  if target_id is null or target_id = actor then
    raise exception 'FORBIDDEN: cible invalide';
  end if;

  nr := lower(trim(new_role));
  if nr not in ('major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur') then
    raise exception 'FORBIDDEN: grade invalide %', new_role;
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
    raise exception 'NOT_FOUND';
  end if;
  if old_role = 'amiral' then
    raise exception 'FORBIDDEN: Amiral non modifiable';
  end if;
  if old_role = 'user' then
    raise exception 'FORBIDDEN: un user ne devient pas Staff';
  end if;

  branch := case
    when nr in ('major_staff', 'sergent_staff') then 'evenementiel'
    else 'moderation'
  end;

  update public.profiles
  set
    role = nr::public.app_role,
    is_admin = false,
    staff_branch = branch,
    subscription = 'PREMIUM'
  where id = target_id
  returning
    id,
    display_name,
    role::text,
    is_admin,
    staff_branch,
    subscription
  into out_id, out_name, out_role, out_admin, out_branch, out_sub;

  if out_id is null then
    raise exception 'UPDATE_FAILED';
  end if;

  return json_build_object(
    'id', out_id,
    'display_name', out_name,
    'role', out_role,
    'is_admin', out_admin,
    'staff_branch', out_branch,
    'subscription', out_sub
  );
end;
$$;

revoke all on function public.admin_set_staff_role(uuid, text) from public;
grant execute on function public.admin_set_staff_role(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 7. Contrôle
-- ------------------------------------------------------------
select id, display_name, role, is_admin, staff_branch
from public.profiles
order by is_admin desc, display_name;
