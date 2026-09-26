-- ============================================================
-- AUPYGO — RLS Staff / Profiles (sécurité stricte)
-- À coller dans Supabase → SQL Editor → Run
--
-- Principes :
-- 1. Jamais d'email / domaine dans les policies
-- 2. Le rôle vient de public.profiles.role (source de vérité)
-- 3. Seul l'Amiral peut modifier role / is_admin / staff_*
-- 4. Amiral unique : personne d'autre ne peut recevoir role=amiral
-- 5. Users ne deviennent Staff que si l'Amiral l'écrit en DB
-- 6. Staff ne peut pas s'auto-promouvoir ni se rétrograder
-- ============================================================

-- ------------------------------------------------------------
-- 0. Colonnes Staff (idempotent)
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists role          text not null default 'user',
  add column if not exists is_admin      boolean not null default false,
  add column if not exists staff_branch  text,
  add column if not exists staff_country text,
  add column if not exists staff_city    text;

-- Contrainte de valeurs de rôle (officiels + legacy en lecture)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in (
        'user',
        'amiral',
        'major_staff',
        'sergent_staff',
        'major_moderateur',
        'sergent_moderateur',
        -- legacy (lecture / migration)
        'admin_general',
        'host',
        'moderator',
        'admin'
      ));
  end if;
end $$;

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
        when lower(p.role) in ('amiral', 'admin_general', 'admin') or p.is_admin is true
          then 'amiral'
        when lower(p.role) in ('major_staff') then 'major_staff'
        when lower(p.role) in ('sergent_staff', 'host') then 'sergent_staff'
        when lower(p.role) in ('major_moderateur') then 'major_moderateur'
        when lower(p.role) in ('sergent_moderateur', 'moderator') then 'sergent_moderateur'
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
--    Même si une policy UPDATE est trop large, ce trigger bloque.
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
  old_role := public.normalize_staff_role(old.role);
  if old.is_admin is true then
    old_role := 'amiral';
  end if;

  new_role := public.normalize_staff_role(new.role);
  if new.is_admin is true then
    new_role := 'amiral';
  end if;

  -- Champs sensibles inchangés → OK pour tout le monde (profil perso)
  if old_role is not distinct from new_role
     and old.is_admin is not distinct from new.is_admin
     and old.staff_branch is not distinct from new.staff_branch
     and old.staff_country is not distinct from new.staff_country
     and old.staff_city is not distinct from new.staff_city
  then
    return new;
  end if;

  -- Toute modification sensible exige Amiral
  actor_is_amiral := public.is_amiral();
  if not actor_is_amiral then
    raise exception 'FORBIDDEN: seuls les champs non-Staff sont modifiables (role/is_admin/staff_* réservés à l''Amiral)'
      using errcode = '42501';
  end if;

  -- Amiral unique : interdiction d'attribuer amiral à un autre compte
  if new_role = 'amiral' and old.id is distinct from auth.uid() then
    raise exception 'FORBIDDEN: le rôle Amiral est unique et non transférable'
      using errcode = '42501';
  end if;

  -- Interdiction de retirer l'Amiral à soi-même via l'API (évite lock-out)
  if old_role = 'amiral' and new_role is distinct from 'amiral' and old.id = auth.uid() then
    raise exception 'FORBIDDEN: l''Amiral ne peut pas se rétrograder via l''API'
      using errcode = '42501';
  end if;

  -- Amiral peut gérer les grades Staff uniquement (pas User ↔ Staff libre sans intention)
  -- Autorisé : Staff → autre grade Staff
  -- Autorisé : User → grade Staff (attribution exclusive Amiral)
  -- Autorisé : Staff → user (révocation exclusive Amiral)
  -- Interdit : tout le monde sauf Amiral (déjà bloqué plus haut)
  if new_role not in ('user', 'amiral') and new_role <> all (staff_ranks) then
    raise exception 'FORBIDDEN: rôle invalide %', new_role
      using errcode = '23514';
  end if;

  -- Cohérence is_admin
  if new_role = 'amiral' then
    new.is_admin := true;
    new.role := 'amiral';
  else
    new.is_admin := false;
    new.role := new_role;
  end if;

  -- Branche auto
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

-- Empêche INSERT avec role staff/amiral sauf service_role / Amiral déjà existant
create or replace function public.profiles_guard_staff_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
begin
  r := public.normalize_staff_role(new.role);
  if new.is_admin is true then
    r := 'amiral';
  end if;

  -- Inscription classique : forcer user
  if auth.uid() is null then
    new.role := 'user';
    new.is_admin := false;
    new.staff_branch := null;
    new.staff_country := null;
    new.staff_city := null;
    return new;
  end if;

  if r = 'user' and coalesce(new.is_admin, false) = false then
    new.role := 'user';
    new.is_admin := false;
    return new;
  end if;

  -- Seul Amiral (ou bootstrap service_role hors JWT) peut créer un profil Staff
  if not public.is_amiral() then
    new.role := 'user';
    new.is_admin := false;
    new.staff_branch := null;
    new.staff_country := null;
    new.staff_city := null;
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

-- Lecture : tout utilisateur authentifié (carte / communauté)
-- Les champs sensibles role/is_admin restent visibles au Staff pour l'UI Amiral ;
-- un user lambda qui les lit ne peut pas les modifier (trigger + policies).
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Insert : son propre profil uniquement (role forcé user par trigger)
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- Update profil perso (colonnes non-Staff)
-- Les colonnes Staff sont re-vérifiées par le trigger.
create policy "profiles_update_own_non_staff"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Update Staff réservé à l'Amiral (n'importe quelle ligne)
create policy "profiles_update_staff_by_amiral"
  on public.profiles
  for update
  to authenticated
  using (public.is_amiral())
  with check (public.is_amiral());

-- Pas de delete profil par les clients (optionnel : soft-delete côté app)
-- create policy "profiles_delete_own" ...

grant select, insert, update on public.profiles to authenticated;

-- ------------------------------------------------------------
-- 4. Bootstrap Amiral (UNE SEULE FOIS)
--    Remplace l'UUID ci-dessous par ton auth.users id, puis exécute.
--    Ensuite commente ou supprime ce bloc.
-- ------------------------------------------------------------
-- update public.profiles
-- set role = 'amiral',
--     is_admin = true,
--     staff_branch = 'evenementiel',
--     subscription = 'PREMIUM'
-- where id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

-- ============================================================
-- Vérifications utiles
-- ============================================================
-- select public.is_amiral(), public.current_profile_role();
-- select policyname, cmd from pg_policies where tablename = 'profiles';
-- select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass;
-- ============================================================
