-- ============================================================
-- AUPYGO — RLS Staff / Profiles (sécurité stricte)
-- À coller dans Supabase → SQL Editor → Run
--
-- Compatible si profiles.role est :
--   • enum public.app_role  (cas actuel qui a planté)
--   • ou text
--
-- Principes :
-- 1. Jamais d'email / domaine dans les policies
-- 2. Source de vérité : profiles.role (+ is_admin)
-- 3. Seul l'Amiral modifie role / is_admin / staff_*
-- 4. Amiral unique et non transférable
-- ============================================================

-- ------------------------------------------------------------
-- 0. Colonnes Staff (idempotent)
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin      boolean not null default false,
  add column if not exists staff_branch  text,
  add column if not exists staff_country text,
  add column if not exists staff_city    text;

-- role existe déjà (enum app_role ou text) — ne pas le recréer en text

-- ------------------------------------------------------------
-- 0b. Étendre l'enum app_role si c'est le type de profiles.role
--     (PostgreSQL : ADD VALUE ne peut pas tourner dans un bloc
--      avec d'autres commandes en transaction stricte — on utilise
--      des ALTER TYPE séparés, hors DO, avec IF NOT EXISTS PG 15+)
-- ------------------------------------------------------------

-- Ajoute les valeurs manquantes à l'enum (ignore si déjà présentes)
do $$
declare
  col_type text;
  enum_name text;
  needed text[] := array[
    'user',
    'amiral',
    'major_staff',
    'sergent_staff',
    'major_moderateur',
    'sergent_moderateur',
    'admin_general',
    'host',
    'moderator'
    -- volontairement PAS 'admin' (souvent absent de l'enum → erreur 22P02)
  ];
  v text;
begin
  select t.typname
    into col_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_type t on t.oid = a.atttypid
  where n.nspname = 'public'
    and c.relname = 'profiles'
    and a.attname = 'role'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  if col_type is null then
    -- Colonne role absente : créer en text
    alter table public.profiles
      add column if not exists role text not null default 'user';
    return;
  end if;

  if col_type = 'app_role' or exists (
    select 1 from pg_type where typname = col_type and typtype = 'e'
  ) then
    enum_name := col_type;
    foreach v in array needed loop
      if not exists (
        select 1
        from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        where t.typname = enum_name
          and e.enumlabel = v
      ) then
        execute format('alter type public.%I add value %L', enum_name, v);
      end if;
    end loop;
  end if;
  -- Si text : rien à faire (pas de CHECK qui référence des labels enum invalides)
end $$;

-- Pas de CONSTRAINT CHECK sur un enum : les labels invalides (ex. 'admin')
-- provoquent ERROR 22P02. Les valeurs autorisées sont gérées par le trigger.

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_is_admin_idx on public.profiles (is_admin);

-- ------------------------------------------------------------
-- 1. Helpers SECURITY DEFINER (évite la récursion RLS)
--    Basés UNIQUEMENT sur profiles.role / is_admin — pas d'email
-- ------------------------------------------------------------
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when lower(p.role::text) in ('amiral', 'admin_general', 'admin') or p.is_admin is true
          then 'amiral'
        when lower(p.role::text) in ('major_staff') then 'major_staff'
        when lower(p.role::text) in ('sergent_staff', 'host') then 'sergent_staff'
        when lower(p.role::text) in ('major_moderateur') then 'major_moderateur'
        when lower(p.role::text) in ('sergent_moderateur', 'moderator') then 'sergent_moderateur'
        else 'user'
      end
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    'user'
  );
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

create or replace function public.is_staff_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_profile_role() in (
    'amiral',
    'major_staff',
    'sergent_staff',
    'major_moderateur',
    'sergent_moderateur'
  );
$$;

create or replace function public.normalize_staff_role(raw text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(raw, 'user'))
    when 'admin_general' then 'amiral'
    when 'admin' then 'amiral'
    when 'host' then 'sergent_staff'
    when 'moderator' then 'sergent_moderateur'
    else lower(coalesce(raw, 'user'))
  end;
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.is_amiral() from public;
revoke all on function public.is_staff_member() from public;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_amiral() to authenticated;
grant execute on function public.is_staff_member() to authenticated;

-- ------------------------------------------------------------
-- 2. Trigger : verrouille role / is_admin / staff_* côté écriture
-- ------------------------------------------------------------
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
  staff_ranks text[] := array[
    'major_staff',
    'sergent_staff',
    'major_moderateur',
    'sergent_moderateur'
  ];
begin
  old_role := public.normalize_staff_role(old.role::text);
  if old.is_admin is true then
    old_role := 'amiral';
  end if;

  new_role := public.normalize_staff_role(new.role::text);
  if new.is_admin is true then
    new_role := 'amiral';
  end if;

  -- Champs sensibles inchangés → OK
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

  -- Amiral unique : pas de transfert
  if new_role = 'amiral' and old.id is distinct from auth.uid() then
    raise exception 'FORBIDDEN: le rôle Amiral est unique et non transférable'
      using errcode = '42501';
  end if;

  -- Anti lock-out
  if old_role = 'amiral' and new_role is distinct from 'amiral' and old.id = auth.uid() then
    raise exception 'FORBIDDEN: l''Amiral ne peut pas se rétrograder via l''API'
      using errcode = '42501';
  end if;

  if new_role not in ('user', 'amiral') and new_role <> all (staff_ranks) then
    raise exception 'FORBIDDEN: rôle invalide %', new_role
      using errcode = '23514';
  end if;

  -- Cohérence is_admin + affectation typée (enum ou text)
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

create or replace function public.profiles_guard_staff_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
begin
  r := public.normalize_staff_role(new.role::text);
  if new.is_admin is true then
    r := 'amiral';
  end if;

  -- Inscription / non-Amiral → forcer user
  if auth.uid() is null or not public.is_amiral() then
    new.role := 'user';
    new.is_admin := false;
    new.staff_branch := null;
    new.staff_country := null;
    new.staff_city := null;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_staff_insert on public.profiles;
create trigger trg_profiles_guard_staff_insert
  before insert on public.profiles
  for each row
  execute function public.profiles_guard_staff_insert();

-- ------------------------------------------------------------
-- 3. RLS profiles
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;
end $$;

create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own_non_staff"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_update_staff_by_amiral"
  on public.profiles
  for update
  to authenticated
  using (public.is_amiral())
  with check (public.is_amiral());

grant select, insert, update on public.profiles to authenticated;

-- ------------------------------------------------------------
-- 4. Bootstrap Amiral (UNE SEULE FOIS)
--    Remplace l'UUID, exécute, puis commente ce bloc.
-- ------------------------------------------------------------
-- update public.profiles
-- set role = 'amiral',
--     is_admin = true,
--     staff_branch = 'evenementiel',
--     subscription = 'PREMIUM'
-- where id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

-- ============================================================
-- Vérifications
-- ============================================================
-- select enumlabel from pg_enum e
--   join pg_type t on t.oid = e.enumtypid
--  where t.typname = 'app_role' order by enumsortorder;
-- select public.is_amiral(), public.current_profile_role();
-- select policyname, cmd from pg_policies where tablename = 'profiles';
-- ============================================================
