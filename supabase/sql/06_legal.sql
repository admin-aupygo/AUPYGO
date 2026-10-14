-- ============================================================
-- AUPYGO — Preuves juridiques : acceptations (CGU/CGV) + rétractations
-- Supabase → SQL Editor → Run (idempotent)
-- ============================================================

-- 1) Acceptations (preuve de consentement, conservée 5 ans — voir Politique de confidentialité)
create table if not exists public.legal_consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,                  -- pas de FK volontaire : la preuve survit à la suppression du compte
  doc         text not null,                  -- cgu | confidentialite | charte-communaute | cgv | immediate_execution
  version     text not null,                  -- ex. '1.0'
  context     text,                           -- signup_checkbox | login_gate | checkout standard_monthly …
  user_agent  text,
  accepted_at timestamptz not null default now()
);

create index if not exists legal_consents_user_idx on public.legal_consents (user_id, doc, version);

alter table public.legal_consents enable row level security;

drop policy if exists legal_consents_insert_own on public.legal_consents;
create policy legal_consents_insert_own on public.legal_consents
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists legal_consents_select_own on public.legal_consents;
create policy legal_consents_select_own on public.legal_consents
  for select to authenticated
  using (user_id = auth.uid());

-- Aucune policy update/delete : l'utilisateur ne peut ni modifier ni effacer sa preuve.
revoke all on public.legal_consents from anon;
grant select, insert on public.legal_consents to authenticated;

-- 2) Demandes de rétractation (fonction de rétractation en ligne)
create table if not exists public.withdrawal_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  email       text not null,
  offer       text not null,
  order_date  date,
  message     text,
  status      text not null default 'received',   -- received | acknowledged | refunded | rejected
  created_at  timestamptz not null default now()
);

create index if not exists withdrawal_requests_user_idx on public.withdrawal_requests (user_id, created_at desc);

alter table public.withdrawal_requests enable row level security;

drop policy if exists withdrawal_insert_own on public.withdrawal_requests;
create policy withdrawal_insert_own on public.withdrawal_requests
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists withdrawal_select_own on public.withdrawal_requests;
create policy withdrawal_select_own on public.withdrawal_requests
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.withdrawal_requests from anon;
grant select, insert on public.withdrawal_requests to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Pour te prévenir par e-mail à chaque rétractation (obligation d'accuser réception) :
-- Supabase → Database → Webhooks → Create : table withdrawal_requests, événement INSERT,
-- vers un service d'e-mail (Zapier / Make / n8n / Edge Function + Resend).
-- Consulter les demandes : Table Editor → withdrawal_requests.
-- ------------------------------------------------------------
