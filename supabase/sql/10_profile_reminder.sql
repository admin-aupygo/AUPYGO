-- ============================================================
-- AUPYGO — Rappel profil incomplet (J+5 / 2 jours avant les 7 jours)
-- À exécuter dans Supabase → SQL Editor → Run
-- ============================================================

alter table public.profiles
  add column if not exists profile_reminder_sent_at timestamptz,
  add column if not exists preferred_language text default 'fr';

create index if not exists profiles_reminder_pending_idx
  on public.profiles (created_at)
  where profile_reminder_sent_at is null;

comment on column public.profiles.profile_reminder_sent_at is
  'Date d''envoi du mail de rappel "complète ton profil" (J+5). NULL = pas encore envoyé.';

comment on column public.profiles.preferred_language is
  'Langue préférée pour les e-mails auto (fr|en|es). Défaut fr.';
