-- ============================================================
-- AUPYGO — Modération (Major Modérateur + Amiral)
-- À exécuter dans Supabase → SQL Editor → Run
-- ============================================================

alter table public.profiles
  add column if not exists is_banned boolean not null default false,
  add column if not exists moderation_warnings integer not null default 0,
  add column if not exists moderation_last_reason text,
  add column if not exists moderation_last_at timestamptz;

create index if not exists profiles_is_banned_idx on public.profiles (is_banned);

create table if not exists public.moderation_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  target_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('warn', 'ban', 'unban')),
  reason text,
  checklist_version text,
  profile_incomplete boolean default false,
  brevo_profile_mail_ack boolean default true,
  meta jsonb default '{}'::jsonb
);

create index if not exists moderation_logs_target_idx on public.moderation_logs (target_id);
create index if not exists moderation_logs_actor_idx on public.moderation_logs (actor_id);
create index if not exists moderation_logs_created_idx on public.moderation_logs (created_at desc);

alter table public.moderation_logs enable row level security;

-- Lecture : Amiral + Major Modérateur uniquement
drop policy if exists moderation_logs_select_mods on public.moderation_logs;
create policy moderation_logs_select_mods
  on public.moderation_logs
  for select
  to authenticated
  using (
    public.is_amiral()
    or public.current_profile_role() = 'major_moderateur'
  );

-- Inserts via service_role (Edge Function) uniquement — pas de policy insert pour authenticated

grant select on public.moderation_logs to authenticated;

-- Commentaire documentation
comment on table public.moderation_logs is
  'Journal des actions de modération (warn/ban/unban). Accès lecture Major Modérateur + Amiral. Écriture Edge Function service_role.';
