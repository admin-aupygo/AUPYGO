-- ============================================================
-- AUPYGO — Colonnes Stripe + expiration Pass 6 mois
-- Supabase → SQL Editor → Run (idempotent)
-- ============================================================

alter table public.profiles
  add column if not exists stripe_customer_id text;

alter table public.profiles
  add column if not exists stripe_subscription_id text;

alter table public.profiles
  add column if not exists subscription_expires_at timestamptz;

create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists profiles_subscription_expires_idx
  on public.profiles (subscription_expires_at)
  where subscription_expires_at is not null;

create or replace function public.expire_pass_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.profiles
  set
    subscription = 'FREE',
    subscription_expires_at = null,
    stripe_subscription_id = null
  where subscription_expires_at is not null
    and subscription_expires_at < now()
    and upper(subscription) in ('STANDARD', 'PREMIUM');

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_pass_subscriptions() from public;
grant execute on function public.expire_pass_subscriptions() to service_role;

notify pgrst, 'reload schema';
