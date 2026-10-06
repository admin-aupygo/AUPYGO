-- ============================================================================
-- AUPYGO — Messagerie : limites par forfait, limite de mots, modération
-- (remplace la version "15 messages/jour" du script 01 : STANDARD = 10 / jour)
--
--   FREE      10 messages au TOTAL        25 mots max / message
--   STANDARD  10 messages par JOUR        1000 mots max (plafond technique)
--   PREMIUM   illimité                    1000 mots max (plafond technique)
--
-- Tout est appliqué CÔTÉ SERVEUR (trigger BEFORE INSERT sur messages) :
-- le contournement via l'API ou un client modifié est impossible.
-- Comptes staff (role <> 'user' ou is_admin) : ni quota, ni masquage.
-- Le "reset à minuit" n'a pas besoin de cron : le compteur du jour est calculé
-- à partir de la date des messages (minuit, fuseau Europe/Zurich).
-- Idempotent : peut être relancé sans danger.
-- ============================================================================

-- 1) Limites par forfait (modifiables par l'Amiral, sans toucher au code) ------
create table if not exists public.plan_limits (
  plan           text primary key check (plan in ('FREE','STANDARD','PREMIUM')),
  total_messages int,            -- plafond sur toute la vie du compte (NULL = aucun)
  daily_messages int,            -- plafond par jour (NULL = aucun)
  max_words      int not null    -- mots max par message
);

insert into public.plan_limits (plan, total_messages, daily_messages, max_words) values
  ('FREE',     10,   null, 25),
  ('STANDARD', null, 10,   1000),
  ('PREMIUM',  null, null, 1000)
on conflict (plan) do nothing;

alter table public.plan_limits enable row level security;
grant select on public.plan_limits to authenticated;
grant insert, update on public.plan_limits to authenticated;

drop policy if exists plan_limits_select on public.plan_limits;
create policy plan_limits_select on public.plan_limits
  for select to authenticated using (true);

drop policy if exists plan_limits_update_amiral on public.plan_limits;
create policy plan_limits_update_amiral on public.plan_limits
  for update to authenticated
  using (coalesce(public.is_amiral(), false)) with check (coalesce(public.is_amiral(), false));

drop policy if exists plan_limits_insert_amiral on public.plan_limits;
create policy plan_limits_insert_amiral on public.plan_limits
  for insert to authenticated
  with check (coalesce(public.is_amiral(), false));

-- 2) Filtre de modération (mêmes règles que js/message-rules.js) ---------------
create or replace function public.aupygo_mask_sensitive(p_text text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  c_mask constant text := '[Donnée masquée pour votre sécurité]';
  c_kw   constant text := '(?:instagram|insta|ig|whats\s?app|whatsapp|snapchat|snap|telegram|tg|facebook|fb|tik\s?tok|tiktok)';
  c_num  constant text := '(?:z[ée]ro|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|septante|huitante|octante|nonante|cent|cents|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|one|two|three|four|five|seven|eight|nine)';
  v_txt  text := coalesce(p_text, '');
  m      text;
begin
  -- a) e-mails classiques
  v_txt := regexp_replace(v_txt,
    '[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+', c_mask, 'g');

  -- b) e-mails déguisés : "nom AT gmail DOT com", "nom [at] yahoo [dot] fr", "nom(at)gmail(dot)com"
  v_txt := regexp_replace(v_txt,
    '[A-Za-z0-9._%+\-]+\s*(?:\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\}|\mat\M|@)\s*[A-Za-z0-9\-]+\s*(?:(?:\(\s*dot\s*\)|\[\s*dot\s*\]|\{\s*dot\s*\}|\mdot\M|\mpoint\M)\s*[A-Za-z0-9\-]+\s*)+',
    c_mask, 'gi');

  -- c) numéros écrits en lettres : au moins 5 mots-nombres à la suite
  v_txt := regexp_replace(v_txt,
    '(?:\m' || c_num || '\M[\s\-.,]*){5,}', c_mask, 'gi');

  -- d) numéros en chiffres (espaces, points, tirets, slashes, parenthèses, +41, +33…) : >= 9 chiffres
  --    les dates du type 12/10/2026 ne comptent pas
  for m in
    select (regexp_matches(v_txt, '(?:\+|00)?\(?\d[\d\s.\-/()]{6,}\d', 'g'))[1]
  loop
    if length(regexp_replace(
         regexp_replace(m, '\d{1,2}[./\-]\d{1,2}[./\-](?:19|20)\d{2}', '', 'g'),
         '\D', '', 'g')) >= 9 then
      v_txt := replace(v_txt, m, c_mask);
    end if;
  end loop;

  -- e) mots-clés réseaux / messageries suivis d'un identifiant
  v_txt := regexp_replace(v_txt,
    '\m' || c_kw || '\M(?:\s*(?::|=)\s*@?[A-Za-z0-9_.]{2,}|\s*@[A-Za-z0-9_.]{2,}|\s+(?:c''est|c’est|cest|est|is)\s+@?[A-Za-z0-9_.]{2,}|\s+@?(?=[A-Za-z0-9_.]*[0-9_.])[A-Za-z0-9_.]{3,})',
    c_mask, 'gi');

  -- f) pseudos précédés de @
  v_txt := regexp_replace(v_txt, '(^|[\s(\[])@[A-Za-z0-9_.]{2,}', '\1' || c_mask, 'g');

  return v_txt;
end;
$$;

-- 3) Règles appliquées à chaque message : limite de mots + masquage --------------
create or replace function public.messages_apply_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub text; v_role text; v_admin boolean; v_staff boolean;
  v_limit int; v_words int;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  select upper(coalesce(subscription,'FREE')), coalesce(role,'user'), coalesce(is_admin,false)
    into v_sub, v_role, v_admin
  from public.profiles where id = new.sender_id;

  v_staff := (v_role <> 'user') or v_admin;

  v_words := coalesce(array_length(regexp_split_to_array(btrim(coalesce(new.content,'')), '\s+'), 1), 0);
  if btrim(coalesce(new.content,'')) = '' then v_words := 0; end if;

  if v_staff then
    v_limit := 1000;
  else
    select max_words into v_limit from public.plan_limits where plan = coalesce(v_sub,'FREE');
    v_limit := coalesce(v_limit, case when coalesce(v_sub,'FREE') = 'FREE' then 25 else 1000 end);
  end if;

  if v_words > v_limit then
    raise exception 'WORDS_LIMIT_EXCEEDED: % mots maximum par message (% saisis)', v_limit, v_words
      using errcode = 'P0001';
  end if;

  if not v_staff then
    new.content := public.aupygo_mask_sensitive(new.content);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_00_rules on public.messages;
create trigger trg_messages_00_rules
  before insert on public.messages
  for each row execute function public.messages_apply_rules();

-- 4) Quotas de messages (lit plan_limits) ------------------------------------
create or replace function public.messages_enforce_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub text; v_role text; v_admin boolean;
  v_total int; v_daily int; v_count int; v_start timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  select upper(coalesce(subscription,'FREE')), coalesce(role,'user'), coalesce(is_admin,false)
    into v_sub, v_role, v_admin
  from public.profiles where id = new.sender_id;

  if v_role <> 'user' or v_admin then
    return new;
  end if;

  select total_messages, daily_messages into v_total, v_daily
  from public.plan_limits where plan = coalesce(v_sub,'FREE');
  if not found then
    v_total := case when coalesce(v_sub,'FREE') = 'FREE' then 10 end;
    v_daily := case when v_sub = 'STANDARD' then 10 end;
  end if;

  if v_total is not null then
    select count(*) into v_count from public.messages where sender_id = new.sender_id;
    if v_count >= v_total then
      raise exception 'QUOTA_FREE_EXCEEDED: % messages gratuits utilisés', v_total using errcode = 'P0001';
    end if;
  end if;

  if v_daily is not null then
    v_start := date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
    select count(*) into v_count from public.messages
     where sender_id = new.sender_id and created_at >= v_start;
    if v_count >= v_daily then
      raise exception 'QUOTA_DAILY_EXCEEDED: % messages par jour (journalier)', v_daily using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messages_enforce_quota on public.messages;
create trigger trg_messages_enforce_quota
  before insert on public.messages
  for each row execute function public.messages_enforce_quota();

-- 5) Solde du compte, utilisé par le site pour les compteurs ------------------
create or replace function public.get_my_message_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub text; v_role text; v_admin boolean;
  v_total int; v_daily int; v_words int;
  v_used_total int; v_used_today int; v_start timestamptz; v_left int;
begin
  if v_uid is null then return null; end if;

  select upper(coalesce(subscription,'FREE')), coalesce(role,'user'), coalesce(is_admin,false)
    into v_sub, v_role, v_admin from public.profiles where id = v_uid;

  if v_role <> 'user' or v_admin then
    return jsonb_build_object('plan', coalesce(v_sub,'PREMIUM'), 'unlimited', true, 'staff', true, 'max_words', 1000);
  end if;

  select total_messages, daily_messages, max_words into v_total, v_daily, v_words
  from public.plan_limits where plan = coalesce(v_sub,'FREE');

  v_start := date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  select count(*), count(*) filter (where created_at >= v_start)
    into v_used_total, v_used_today from public.messages where sender_id = v_uid;

  if v_total is not null then v_left := greatest(0, v_total - v_used_total);
  elsif v_daily is not null then v_left := greatest(0, v_daily - v_used_today);
  end if;

  return jsonb_build_object(
    'plan', coalesce(v_sub,'FREE'),
    'unlimited', (v_total is null and v_daily is null),
    'staff', false,
    'max_total', v_total, 'max_daily', v_daily,
    'used_total', v_used_total, 'used_today', v_used_today,
    'left', v_left,
    'max_words', coalesce(v_words, case when coalesce(v_sub,'FREE') = 'FREE' then 25 else 1000 end)
  );
end;
$$;

revoke all on function public.get_my_message_quota() from public, anon;
grant execute on function public.get_my_message_quota() to authenticated;
