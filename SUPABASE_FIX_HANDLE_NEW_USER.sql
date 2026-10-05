-- =============================================================================
-- AUPYGO — Fix « Database error creating new user »
-- Cause fréquente : trigger after insert on auth.users → public.profiles qui plante
-- Exécuter dans SQL Editor → Run
-- =============================================================================

-- 1) Voir l'état actuel (lecture seule)
select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'auth.users'::regclass
  and not tgisinternal;

-- 2) Fonction robuste : crée un profil minimal, ne fait jamais échouer Auth
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
      split_part(new.email, '@', 1),
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
    -- Ne bloque JAMAIS la création Auth ; log pour debug
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- 3) (Re)brancher le trigger sur auth.users
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 4) S'assurer que les colonnes minimales existent (no-op si déjà là)
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
