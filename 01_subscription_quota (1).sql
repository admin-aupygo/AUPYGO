-- ============================================================================
-- ⚠️ La partie 3 (quotas de messages) de CE fichier est REMPLACÉE par 03_messaging_rules.sql
--    (STANDARD = 10/jour, plafonds lus dans plan_limits). Ne relance pas la partie 3 de ce fichier.
-- AUPYGO — Forfait protégé + quotas de messages côté serveur
-- (déjà exécuté le 06/10/2026 ; conservé ici pour le dépôt — idempotent)
-- ============================================================================

-- 1) Inscription : forfait toujours FREE, jamais lu depuis les métadonnées client
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, role, is_admin, subscription)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1),
      'Utilisateur'
    ),
    'user', false, 'FREE'
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end; $$;

-- 2) Garde sur profiles.subscription
create or replace function public.profiles_guard_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not coalesce(public.is_amiral(), false) then
      new.subscription := 'FREE';
    end if;
    return new;
  end if;

  if new.subscription is distinct from old.subscription then
    if auth.uid() is null or coalesce(public.is_amiral(), false) then
      return new;
    end if;
    if upper(coalesce(new.subscription, '')) = 'FREE' then
      new.subscription := 'FREE';
      return new;
    end if;
    raise exception 'FORBIDDEN: le forfait ne se modifie pas depuis le client'
      using errcode = '42501';
  end if;
  return new;
end; $$;

drop trigger if exists trg_profiles_guard_subscription on public.profiles;
create trigger trg_profiles_guard_subscription
  before insert or update of subscription on public.profiles
  for each row execute function public.profiles_guard_subscription();

-- 3) Quotas de messages : FREE = 10 au total, STANDARD = 15 / jour (UTC), PREMIUM et staff = illimité
create or replace function public.messages_enforce_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sub text; v_role text; v_admin boolean; v_count int;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  select upper(coalesce(subscription,'FREE')), coalesce(role,'user'), coalesce(is_admin,false)
    into v_sub, v_role, v_admin
  from public.profiles where id = new.sender_id;

  if v_role <> 'user' or v_admin or v_sub = 'PREMIUM' then
    return new;
  end if;

  if v_sub = 'STANDARD' then
    select count(*) into v_count from public.messages
     where sender_id = new.sender_id
       and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
    if v_count >= 15 then
      raise exception 'QUOTA_EXCEEDED: 15 messages par jour (STANDARD)' using errcode = 'P0001';
    end if;
  else
    select count(*) into v_count from public.messages where sender_id = new.sender_id;
    if v_count >= 10 then
      raise exception 'QUOTA_EXCEEDED: 10 messages au total (FREE)' using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_messages_enforce_quota on public.messages;
create trigger trg_messages_enforce_quota
  before insert on public.messages
  for each row execute function public.messages_enforce_quota();
