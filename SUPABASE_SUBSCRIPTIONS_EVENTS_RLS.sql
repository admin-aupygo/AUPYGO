-- ============================================================
-- AUPYGO — Sécurité Abonnements + Événements (RLS renforcée)
-- Supabase → SQL Editor → Run (idempotent)
--
-- Couvre les règles produit :
-- 1. Nouveau compte → subscription = FREE (forcé)
-- 2. Événements communautaires (public) : visibles authentifiés
-- 3. Événements privés (friends) : créateur + invités/participants
-- 4. Événements spéciaux AUPYGO (admin / is_special) : Staff + public après validation
-- 5. Garde côté écriture : un user ne peut pas s'auto-promouvoir en PREMIUM
--    sans passer par le flux prévu (selectPlan client + paiement à venir)
-- ============================================================

-- ------------------------------------------------------------
-- 0. Colonne subscription (défaut FREE)
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists subscription text not null default 'FREE';

-- Normaliser les valeurs existantes vides / null
update public.profiles
set subscription = 'FREE'
where subscription is null
   or trim(subscription) = ''
   or upper(subscription) not in ('FREE', 'STANDARD', 'PREMIUM');

-- Forcer majuscules cohérentes
update public.profiles
set subscription = upper(trim(subscription))
where subscription is distinct from upper(trim(subscription));

create index if not exists profiles_subscription_idx
  on public.profiles (subscription);

-- ------------------------------------------------------------
-- 1. Trigger INSERT : forcer FREE à l'inscription
--    (sauf si Amiral / bootstrap service_role)
-- ------------------------------------------------------------
create or replace function public.profiles_force_free_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role / pas de session → laisser passer (migrations)
  if auth.uid() is null then
    if new.subscription is null or trim(coalesce(new.subscription, '')) = '' then
      new.subscription := 'FREE';
    else
      new.subscription := upper(trim(new.subscription));
    end if;
    return new;
  end if;

  -- Utilisateur normal : toujours FREE à la création
  -- (l'Amiral peut déjà être PREMIUM via bootstrap)
  if not public.is_amiral() then
    new.subscription := 'FREE';
  else
    new.subscription := upper(trim(coalesce(new.subscription, 'FREE')));
    if new.subscription not in ('FREE', 'STANDARD', 'PREMIUM') then
      new.subscription := 'FREE';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_force_free_insert on public.profiles;
create trigger trg_profiles_force_free_insert
  before insert on public.profiles
  for each row
  execute function public.profiles_force_free_on_insert();

-- ------------------------------------------------------------
-- 2. Trigger UPDATE : empêcher auto-upgrade non contrôlé
--    (un user ne peut changer que vers FREE lui-même ;
--     STANDARD/PREMIUM via selectPlan client + paiement à venir
--     — pour l'instant on autorise l'écriture de son propre forfait
--     mais on normalise + on bloque les valeurs invalides)
-- ------------------------------------------------------------
create or replace function public.profiles_guard_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.subscription is not distinct from new.subscription then
    return new;
  end if;

  new.subscription := upper(trim(coalesce(new.subscription, 'FREE')));
  if new.subscription not in ('FREE', 'STANDARD', 'PREMIUM') then
    raise exception 'FORBIDDEN: subscription invalide %', new.subscription
      using errcode = '23514';
  end if;

  -- Seul le propriétaire (ou Amiral) peut modifier le forfait
  if auth.uid() is not null
     and auth.uid() is distinct from new.id
     and not public.is_amiral()
  then
    raise exception 'FORBIDDEN: subscription réservée au titulaire du compte'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_subscription on public.profiles;
create trigger trg_profiles_guard_subscription
  before update of subscription on public.profiles
  for each row
  execute function public.profiles_guard_subscription();

-- ------------------------------------------------------------
-- 3. RLS EVENTS renforcée (visibilité privée)
--    Remplace la policy trop permissive "using (true)"
-- ------------------------------------------------------------
alter table public.events enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'events'
  loop
    execute format('drop policy if exists %I on public.events', pol.policyname);
  end loop;
end $$;

-- SELECT :
--  • public / (admin publié) → tous les authentifiés
--  • friends → créateur OU participant OU invité accepté/pending
--  • admin / admin_only / is_special en attente → Staff uniquement
create policy "events_select_scoped"
  on public.events
  for select
  to authenticated
  using (
    -- Événements publics (communauté + spéciaux publiés)
    (
      visibility = 'public'
      and (
        coalesce(is_special_aupygo, false) = false
        or visibility = 'public'  -- déjà public après validation Amiral
      )
    )
    -- Ou créateur
    or creator_id = auth.uid()
    -- Ou participant
    or exists (
      select 1 from public.event_participants ep
      where ep.event_id = id and ep.user_id = auth.uid()
    )
    -- Ou invité (friends)
    or exists (
      select 1 from public.event_invitations ei
      where ei.event_id = id
        and ei.to_id = auth.uid()
        and ei.status in ('pending', 'accepted')
    )
    -- Staff voit tout (y compris admin / admin_only / en attente)
    or public.is_staff_member()
  );

-- INSERT : propriétaire uniquement
create policy "events_insert_own"
  on public.events
  for insert
  to authenticated
  with check (
    auth.uid() = creator_id
    -- Un user non-staff ne peut pas créer de special / admin
    and (
      public.is_staff_member()
      or (
        coalesce(is_special_aupygo, false) = false
        and visibility in ('public', 'friends')
      )
    )
  );

-- UPDATE / DELETE : créateur ou Amiral
create policy "events_update_own_or_amiral"
  on public.events
  for update
  to authenticated
  using (auth.uid() = creator_id or public.is_amiral())
  with check (auth.uid() = creator_id or public.is_amiral());

create policy "events_delete_own_or_amiral"
  on public.events
  for delete
  to authenticated
  using (auth.uid() = creator_id or public.is_amiral());

grant select, insert, update, delete on public.events to authenticated;

-- ------------------------------------------------------------
-- 4. EVENT_PARTICIPANTS / INVITATIONS (inchangé + grants)
-- ------------------------------------------------------------
alter table public.event_participants enable row level security;
alter table public.event_invitations  enable row level security;

-- Participants : lecture pour authentifiés (nécessaire pour badges)
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'event_participants'
  loop
    execute format('drop policy if exists %I on public.event_participants', pol.policyname);
  end loop;
end $$;

create policy "parts_select_authenticated"
  on public.event_participants for select to authenticated using (true);

create policy "parts_insert_own"
  on public.event_participants for insert to authenticated
  with check (auth.uid() = user_id);

create policy "parts_delete_own"
  on public.event_participants for delete to authenticated
  using (auth.uid() = user_id);

create policy "parts_delete_by_creator"
  on public.event_participants for delete to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_id and e.creator_id = auth.uid()
  ));

grant select, insert, delete on public.event_participants to authenticated;

-- Invitations
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'event_invitations'
  loop
    execute format('drop policy if exists %I on public.event_invitations', pol.policyname);
  end loop;
end $$;

create policy "invites_select_involved"
  on public.event_invitations for select to authenticated
  using (auth.uid() = from_id or auth.uid() = to_id or public.is_staff_member());

create policy "invites_insert_own"
  on public.event_invitations for insert to authenticated
  with check (auth.uid() = from_id);

create policy "invites_update_recipient"
  on public.event_invitations for update to authenticated
  using (auth.uid() = to_id) with check (auth.uid() = to_id);

create policy "invites_delete_involved"
  on public.event_invitations for delete to authenticated
  using (auth.uid() = from_id or auth.uid() = to_id);

grant select, insert, update, delete on public.event_invitations to authenticated;

-- ------------------------------------------------------------
-- 5. Helper optionnel : plan courant (utile côté RPC futures)
-- ------------------------------------------------------------
create or replace function public.current_subscription()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select upper(trim(p.subscription))
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    'FREE'
  );
$$;

revoke all on function public.current_subscription() from public;
grant execute on function public.current_subscription() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- Vérifications recommandées
-- ============================================================
-- select column_name, column_default from information_schema.columns
--   where table_name = 'profiles' and column_name = 'subscription';
-- select policyname, cmd from pg_policies where tablename = 'events';
-- select public.current_subscription();
-- ============================================================
