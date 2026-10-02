-- =============================================================================
-- AUPYGO — Suppression définitive d'un agent Staff (Amiral uniquement)
-- + code de sécurité à usage unique (hashé), expiré 15 min
-- Exécuter dans Supabase → SQL Editor → Run
-- =============================================================================

create table if not exists public.staff_delete_challenges (
  id            uuid primary key default gen_random_uuid(),
  target_id     uuid not null references auth.users(id) on delete cascade,
  requested_by  uuid not null references auth.users(id) on delete cascade,
  code_hash     text not null,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists staff_delete_challenges_target_idx
  on public.staff_delete_challenges (target_id, expires_at);

alter table public.staff_delete_challenges enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'staff_delete_challenges'
  loop
    execute format('drop policy if exists %I on public.staff_delete_challenges', r.policyname);
  end loop;
end $$;

revoke all on public.staff_delete_challenges from anon, authenticated, public;
grant all on public.staff_delete_challenges to service_role;

create or replace function public.is_deletable_staff_agent(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_id
      and coalesce(p.is_admin, false) is not true
      and lower(coalesce(p.role::text, 'user')) in (
        'major_staff', 'sergent_staff',
        'major_moderateur', 'sergent_moderateur',
        'host', 'moderator'
      )
  );
$$;

revoke all on function public.is_deletable_staff_agent(uuid) from public;
grant execute on function public.is_deletable_staff_agent(uuid) to authenticated, service_role;

create or replace function public.admin_create_staff_delete_challenge(
  p_target_id uuid,
  p_code_hash text,
  p_ttl_seconds int default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  exp timestamptz;
  cid uuid;
begin
  if actor is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_amiral() then
    raise exception 'FORBIDDEN: réservé à l''Amiral' using errcode = '42501';
  end if;
  if p_target_id is null or p_target_id = actor then
    raise exception 'FORBIDDEN: cible invalide' using errcode = '42501';
  end if;
  if not public.is_deletable_staff_agent(p_target_id) then
    raise exception 'FORBIDDEN: seul un agent Staff/Modérateur (non Amiral) peut être supprimé' using errcode = '42501';
  end if;
  if p_code_hash is null or length(p_code_hash) < 32 then
    raise exception 'INVALID_CODE_HASH' using errcode = '22023';
  end if;
  update public.staff_delete_challenges set used_at = now()
  where target_id = p_target_id and used_at is null;
  exp := now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 900), 60));
  insert into public.staff_delete_challenges (target_id, requested_by, code_hash, expires_at)
  values (p_target_id, actor, p_code_hash, exp) returning id into cid;
  return jsonb_build_object('ok', true, 'challenge_id', cid, 'expires_at', exp);
end;
$$;

revoke all on function public.admin_create_staff_delete_challenge(uuid, text, int) from public;
grant execute on function public.admin_create_staff_delete_challenge(uuid, text, int) to authenticated, service_role;

create or replace function public.admin_confirm_staff_delete(
  p_target_id uuid,
  p_challenge_id uuid,
  p_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  ch public.staff_delete_challenges%rowtype;
begin
  if actor is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if not public.is_amiral() then raise exception 'FORBIDDEN: réservé à l''Amiral' using errcode = '42501'; end if;
  if p_target_id is null or p_target_id = actor then raise exception 'FORBIDDEN: cible invalide' using errcode = '42501'; end if;
  if not public.is_deletable_staff_agent(p_target_id) then raise exception 'FORBIDDEN: cible non éligible' using errcode = '42501'; end if;

  select * into ch from public.staff_delete_challenges
  where id = p_challenge_id and target_id = p_target_id and requested_by = actor for update;

  if not found then raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002'; end if;
  if ch.used_at is not null then raise exception 'CHALLENGE_ALREADY_USED' using errcode = '22023'; end if;
  if ch.expires_at < now() then raise exception 'CHALLENGE_EXPIRED' using errcode = '22023'; end if;
  if ch.code_hash is distinct from p_code_hash then raise exception 'INVALID_CODE' using errcode = '42501'; end if;

  update public.staff_delete_challenges set used_at = now() where id = ch.id;

  delete from public.messages where sender_id = p_target_id;
  delete from public.conversation_members where user_id = p_target_id;
  delete from public.conversations c where c.created_by = p_target_id
    and not exists (select 1 from public.conversation_members cm where cm.conversation_id = c.id);
  delete from public.friendships where from_id = p_target_id or to_id = p_target_id;
  delete from public.friend_requests where sender_id = p_target_id or receiver_id = p_target_id;
  delete from public.event_participants where user_id = p_target_id;
  delete from public.event_invitations where from_id = p_target_id or to_id = p_target_id;
  delete from public.group_invitations where invited_user_id = p_target_id;
  delete from public.chat_group_members where user_id = p_target_id;
  delete from public.staff_delete_challenges where target_id = p_target_id;
  delete from public.profiles where id = p_target_id;

  begin
    delete from auth.users where id = p_target_id;
  exception when insufficient_privilege then
    return jsonb_build_object('ok', true, 'profile_deleted', true, 'auth_deleted', false, 'target_id', p_target_id, 'note', 'AUTH_DELETE_NEEDS_EDGE');
  end;

  return jsonb_build_object('ok', true, 'profile_deleted', true, 'auth_deleted', true, 'target_id', p_target_id);
end;
$$;

revoke all on function public.admin_confirm_staff_delete(uuid, uuid, text) from public;
grant execute on function public.admin_confirm_staff_delete(uuid, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
