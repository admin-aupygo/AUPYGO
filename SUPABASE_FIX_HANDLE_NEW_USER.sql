-- =============================================================================
-- AUPYGO — Fix « Database error creating new user »
-- Deux triggers existent sur auth.users :
--   on_auth_user_created         → handle_new_user()
--   trg_aupygo_auth_user_created → aupygo_on_auth_user_created()
-- L'un des deux (souvent le 2e) plante → Auth refuse createUser.
-- Exécuter TOUT ce script dans SQL Editor → Run
-- =============================================================================

-- 0) Diagnostic (optionnel)
select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'auth.users'::regclass
  and not tgisinternal;

-- 1) handle_new_user : profil minimal, jamais d'échec Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    role,
    is_admin,
    subscription
  ) values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'Utilisateur'
    ),
    'user',
    false,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'subscription'), ''), 'FREE')
  )
  on conflict (id) do nothing;

  return new;
exception
  when others then
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- 2) aupygo_on_auth_user_created : même logique sûre (ne doit plus planter)
create or replace function public.aupygo_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Si le profil existe déjà (handle_new_user avant), on ne touche à rien de critique
  insert into public.profiles (
    id,
    display_name,
    role,
    is_admin,
    subscription
  ) values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'Utilisateur'
    ),
    'user',
    false,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'subscription'), ''), 'FREE')
  )
  on conflict (id) do update set
    display_name = coalesce(public.profiles.display_name, excluded.display_name);

  return new;
exception
  when others then
    raise warning 'aupygo_on_auth_user_created failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- 3) Triggers : on les garde tous les deux, mais les deux sont désormais non-bloquants
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

drop trigger if exists trg_aupygo_auth_user_created on auth.users;
create trigger trg_aupygo_auth_user_created
  after insert on auth.users
  for each row
  execute function public.aupygo_on_auth_user_created();

-- 4) Colonnes minimales
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
  ) then
    alter table public.profiles add column role text default 'user';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_admin'
  ) then
    alter table public.profiles add column is_admin boolean default false;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name'
  ) then
    alter table public.profiles add column display_name text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'subscription'
  ) then
    alter table public.profiles add column subscription text default 'FREE';
  end if;
end $$;

notify pgrst, 'reload schema';
