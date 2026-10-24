-- ============================================================
-- AUPYGO — Codes promo (tables + RPC)
-- Supabase → SQL Editor → Run TOUT le fichier d'un coup
-- Corrige le 404 : POST /rest/v1/rpc/redeem_promo_code
--
-- RPC attendues par le front :
--   redeem_promo_code(p_code text)
--   admin_create_promo_code(p_code, p_plan, p_max_uses, p_valid_days, p_note)
--   admin_set_subscription(p_user_id, p_plan)
--   expire_my_promo_if_needed()
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
create table if not exists public.promo_codes (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  plan          text not null check (upper(plan) in ('STANDARD', 'PREMIUM')),
  max_uses      int null,
  used_count    int not null default 0,
  valid_until   timestamptz null,
  active        boolean not null default true,
  note          text null,
  benefit_days  int null,          -- durée de l'avantage après redeem (null = permanent)
  created_at    timestamptz not null default now(),
  created_by    uuid null references public.profiles(id) on delete set null
);

-- code unique (insensible à la casse)
create unique index if not exists promo_codes_code_upper_uidx
  on public.promo_codes (upper(trim(code)));

create index if not exists promo_codes_active_idx
  on public.promo_codes (active, valid_until);

create table if not exists public.promo_redemptions (
  id            uuid primary key default gen_random_uuid(),
  code_id       uuid not null references public.promo_codes(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  plan          text not null,
  previous_plan text null,
  redeemed_at   timestamptz not null default now(),
  ends_at       timestamptz null,  -- fin de l'avantage (null = permanent)
  unique (code_id, user_id)
);

create index if not exists promo_redemptions_user_idx
  on public.promo_redemptions (user_id);

create index if not exists promo_redemptions_ends_at_idx
  on public.promo_redemptions (ends_at)
  where ends_at is not null;

-- Colonnes profil pour l'expiration promo
alter table public.profiles
  add column if not exists promo_ends_at timestamptz null,
  add column if not exists promo_previous_plan text null,
  add column if not exists promo_code_id uuid null;

-- ------------------------------------------------------------
-- 2. RLS
-- ------------------------------------------------------------
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename in ('promo_codes', 'promo_redemptions')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname,
      (select tablename from pg_policies p2 where p2.policyname = pol.policyname limit 1));
  end loop;
exception when others then
  raise notice 'drop policies: %', SQLERRM;
end $$;

-- promo_codes : lecture pour authentifiés (liste admin via is_amiral côté app),
-- écriture uniquement via RPC security definer
drop policy if exists promo_codes_select on public.promo_codes;
create policy promo_codes_select
  on public.promo_codes for select to authenticated
  using (true);

drop policy if exists promo_redemptions_select on public.promo_redemptions;
create policy promo_redemptions_select
  on public.promo_redemptions for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_amiral()
  );

grant select on public.promo_codes to authenticated;
grant select on public.promo_redemptions to authenticated;

-- ------------------------------------------------------------
-- 3. admin_set_subscription (Amiral force un forfait)
-- ------------------------------------------------------------
create or replace function public.admin_set_subscription(
  p_user_id uuid,
  p_plan text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  plan text := upper(trim(coalesce(p_plan, '')));
  out_sub text;
begin
  if actor is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_amiral() then
    raise exception 'FORBIDDEN: réservé à l''Amiral';
  end if;
  if plan not in ('FREE', 'STANDARD', 'PREMIUM') then
    raise exception 'FORBIDDEN: plan invalide';
  end if;
  if p_user_id is null then
    raise exception 'FORBIDDEN: user invalide';
  end if;

  update public.profiles
  set subscription = plan,
      promo_ends_at = null,
      promo_previous_plan = null,
      promo_code_id = null
  where id = p_user_id
  returning subscription into out_sub;

  if out_sub is null then
    raise exception 'NOT_FOUND';
  end if;

  return json_build_object('ok', true, 'subscription', out_sub);
end;
$$;

revoke all on function public.admin_set_subscription(uuid, text) from public;
grant execute on function public.admin_set_subscription(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 4. admin_create_promo_code
-- ------------------------------------------------------------
create or replace function public.admin_create_promo_code(
  p_code text,
  p_plan text,
  p_max_uses int default null,
  p_valid_days int default null,
  p_note text default null,
  p_benefit_days int default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  c text := upper(trim(coalesce(p_code, '')));
  plan text := upper(trim(coalesce(p_plan, 'STANDARD')));
  vu timestamptz := null;
  new_id uuid;
begin
  if actor is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_amiral() then
    raise exception 'FORBIDDEN: réservé à l''Amiral';
  end if;
  if length(c) < 4 then
    raise exception 'CODE_TOO_SHORT';
  end if;
  if plan not in ('STANDARD', 'PREMIUM') then
    raise exception 'FORBIDDEN: plan invalide';
  end if;

  if p_valid_days is not null and p_valid_days > 0 then
    vu := now() + (p_valid_days || ' days')::interval;
  end if;

  insert into public.promo_codes (
    code, plan, max_uses, valid_until, active, note, benefit_days, created_by
  ) values (
    c, plan,
    case when p_max_uses is not null and p_max_uses > 0 then p_max_uses else null end,
    vu, true, nullif(trim(coalesce(p_note, '')), ''),
    case when p_benefit_days is not null and p_benefit_days > 0 then p_benefit_days else null end,
    actor
  )
  returning id into new_id;

  return json_build_object(
    'ok', true,
    'id', new_id,
    'code', c,
    'plan', plan,
    'valid_until', vu
  );
exception
  when unique_violation then
    raise exception 'CODE_ALREADY_EXISTS';
end;
$$;

revoke all on function public.admin_create_promo_code(text, text, int, int, text, int) from public;
grant execute on function public.admin_create_promo_code(text, text, int, int, text, int) to authenticated;

-- overload sans p_benefit_days (compat front actuel)
create or replace function public.admin_create_promo_code(
  p_code text,
  p_plan text,
  p_max_uses int default null,
  p_valid_days int default null,
  p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.admin_create_promo_code(p_code, p_plan, p_max_uses, p_valid_days, p_note, null);
end;
$$;

revoke all on function public.admin_create_promo_code(text, text, int, int, text) from public;
grant execute on function public.admin_create_promo_code(text, text, int, int, text) to authenticated;

-- ------------------------------------------------------------
-- 5. redeem_promo_code  ← corrige le 404
-- ------------------------------------------------------------
create or replace function public.redeem_promo_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c text := upper(trim(coalesce(p_code, '')));
  row_code public.promo_codes%rowtype;
  prev text;
  ends timestamptz := null;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if length(c) < 1 then
    raise exception 'CODE_INVALID';
  end if;

  select * into row_code
  from public.promo_codes
  where upper(trim(code)) = c
  for update;

  if not found then
    raise exception 'CODE_INVALID';
  end if;
  if row_code.active is not true then
    raise exception 'CODE_INVALID';
  end if;
  if row_code.valid_until is not null and row_code.valid_until < now() then
    raise exception 'CODE_EXPIRED';
  end if;
  if row_code.max_uses is not null and row_code.used_count >= row_code.max_uses then
    raise exception 'CODE_EXHAUSTED';
  end if;

  if exists (
    select 1 from public.promo_redemptions
    where code_id = row_code.id and user_id = uid
  ) then
    raise exception 'CODE_ALREADY_USED';
  end if;

  select upper(trim(coalesce(subscription, 'FREE'))) into prev
  from public.profiles where id = uid;

  if row_code.benefit_days is not null and row_code.benefit_days > 0 then
    ends := now() + (row_code.benefit_days || ' days')::interval;
  end if;

  insert into public.promo_redemptions (code_id, user_id, plan, previous_plan, ends_at)
  values (row_code.id, uid, row_code.plan, prev, ends);

  update public.promo_codes
  set used_count = used_count + 1
  where id = row_code.id;

  update public.profiles
  set subscription = upper(row_code.plan),
      promo_ends_at = ends,
      promo_previous_plan = prev,
      promo_code_id = row_code.id
  where id = uid;

  return json_build_object(
    'ok', true,
    'subscription', upper(row_code.plan),
    'previous', prev,
    'ends_at', ends
  );
end;
$$;

revoke all on function public.redeem_promo_code(text) from public;
grant execute on function public.redeem_promo_code(text) to authenticated;

-- ------------------------------------------------------------
-- 6. expire_my_promo_if_needed (appelé au login)
-- ------------------------------------------------------------
create or replace function public.expire_my_promo_if_needed()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ends timestamptz;
  prev text;
  cur text;
begin
  if uid is null then
    return json_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select promo_ends_at, promo_previous_plan, upper(trim(coalesce(subscription, 'FREE')))
    into ends, prev, cur
  from public.profiles
  where id = uid;

  if ends is null then
    return json_build_object('ok', true, 'expired', false, 'active_promo', false);
  end if;

  if ends > now() then
    return json_build_object(
      'ok', true,
      'expired', false,
      'active_promo', true,
      'ends_at', ends,
      'subscription', cur
    );
  end if;

  -- Expiré → restaurer le forfait d'avant
  update public.profiles
  set subscription = upper(trim(coalesce(prev, 'FREE'))),
      promo_ends_at = null,
      promo_previous_plan = null,
      promo_code_id = null
  where id = uid
  returning upper(trim(subscription)) into cur;

  return json_build_object(
    'ok', true,
    'expired', true,
    'subscription', cur
  );
end;
$$;

revoke all on function public.expire_my_promo_if_needed() from public;
grant execute on function public.expire_my_promo_if_needed() to authenticated;

-- ------------------------------------------------------------
-- 7. Optionnel : expire_promo_benefits (batch / cron)
-- ------------------------------------------------------------
create or replace function public.expire_promo_benefits()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  update public.profiles
  set subscription = upper(trim(coalesce(promo_previous_plan, 'FREE'))),
      promo_ends_at = null,
      promo_previous_plan = null,
      promo_code_id = null
  where promo_ends_at is not null
    and promo_ends_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_promo_benefits() from public;
grant execute on function public.expire_promo_benefits() to service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- Vérifications
-- ============================================================
-- select proname from pg_proc where proname in
--   ('redeem_promo_code','admin_create_promo_code','admin_set_subscription','expire_my_promo_if_needed');
-- select * from public.promo_codes limit 5;
-- ============================================================
