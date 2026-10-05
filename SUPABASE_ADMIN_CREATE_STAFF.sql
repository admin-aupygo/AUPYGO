-- =============================================================================
-- AUPYGO — Création agent Staff (provision profil)
-- À exécuter dans Supabase → SQL Editor → Run
-- Corrige l'erreur « Profil non créé » quand le trigger bloque les écritures role
-- =============================================================================

-- 1) Fonction de provision (SECURITY DEFINER) — appelée uniquement par l'Edge (service_role)
create or replace function public.admin_provision_staff_profile(
  p_id uuid,
  p_display_name text,
  p_role text,
  p_staff_country text default null,
  p_staff_city text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch text;
begin
  if p_id is null then
    raise exception 'INVALID_ID' using errcode = '22023';
  end if;
  if p_display_name is null or length(trim(p_display_name)) < 2 then
    raise exception 'INVALID_DISPLAY_NAME' using errcode = '22023';
  end if;
  if lower(p_role) not in (
    'major_staff', 'sergent_staff',
    'major_moderateur', 'sergent_moderateur'
  ) then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;

  v_branch := case
    when lower(p_role) like '%moderateur%' then 'moderation'
    else 'evenementiel'
  end;

  insert into public.profiles as p (
    id,
    display_name,
    role,
    is_admin,
    staff_branch,
    staff_country,
    staff_city,
    subscription
  ) values (
    p_id,
    trim(p_display_name),
    lower(p_role),
    false,
    v_branch,
    nullif(trim(coalesce(p_staff_country, '')), ''),
    nullif(trim(coalesce(p_staff_city, '')), ''),
    'PREMIUM'
  )
  on conflict (id) do update set
    display_name  = excluded.display_name,
    role          = excluded.role,
    is_admin      = false,
    staff_branch  = excluded.staff_branch,
    staff_country = excluded.staff_country,
    staff_city    = excluded.staff_city,
    subscription  = 'PREMIUM';

  return jsonb_build_object('ok', true, 'id', p_id, 'role', lower(p_role));
end;
$$;

revoke all on function public.admin_provision_staff_profile(uuid, text, text, text, text) from public;
grant execute on function public.admin_provision_staff_profile(uuid, text, text, text, text) to service_role;

-- 2) Assouplir le trigger de protection des rôles pour autoriser service_role
--    (sans ça, auth.uid() est null côté Edge → is_amiral() = false → INSERT refusé)
do $$
declare
  r record;
  def text;
begin
  for r in
    select t.tgname, p.proname, pg_get_functiondef(p.oid) as fdef
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and not t.tgisinternal
  loop
    def := r.fdef;
    -- Si la fonction mentionne is_amiral / role / is_admin, on la réécrit de façon sûre
    if def ilike '%is_amiral%' or def ilike '%is_admin%' or def ilike '%staff_branch%' then
      execute format($f$
        create or replace function public.%I()
        returns trigger
        language plpgsql
        security definer
        set search_path = public
        as $fn$
        begin
          -- Edge Functions / service_role : autorisé
          if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
            return new;
          end if;

          -- Pas de session : refuser les changements sensibles
          if auth.uid() is null then
            if tg_op = 'INSERT' then
              -- insert public (signup) : forcer role user
              new.role := coalesce(nullif(new.role, ''), 'user');
              if lower(coalesce(new.role, 'user')) <> 'user' or coalesce(new.is_admin, false) then
                new.role := 'user';
                new.is_admin := false;
                new.staff_branch := null;
                new.staff_country := null;
                new.staff_city := null;
              end if;
              return new;
            end if;
            raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
          end if;

          -- Amiral : peut tout sauf s''auto-rétrograder / créer un 2e Amiral
          if public.is_amiral() then
            if tg_op = 'UPDATE' and old.role = 'amiral' and new.role is distinct from 'amiral' and new.id = auth.uid() then
              raise exception 'FORBIDDEN: l''Amiral ne peut pas se rétrograder' using errcode = '42501';
            end if;
            if new.role = 'amiral' and new.id is distinct from auth.uid() then
              if exists (select 1 from public.profiles where role = 'amiral' and id is distinct from new.id) then
                raise exception 'FORBIDDEN: Amiral unique' using errcode = '42501';
              end if;
            end if;
            return new;
          end if;

          -- Non-Amiral : interdire toute modification des champs staff / role / is_admin
          if tg_op = 'UPDATE' then
            if new.role is distinct from old.role
               or coalesce(new.is_admin, false) is distinct from coalesce(old.is_admin, false)
               or new.staff_branch is distinct from old.staff_branch
               or new.staff_country is distinct from old.staff_country
               or new.staff_city is distinct from old.staff_city then
              raise exception 'FORBIDDEN: réservé à l''Amiral' using errcode = '42501';
            end if;
          end if;

          if tg_op = 'INSERT' then
            new.role := 'user';
            new.is_admin := false;
            new.staff_branch := null;
            new.staff_country := null;
            new.staff_city := null;
          end if;

          return new;
        end;
        $fn$;
      $f$, r.proname);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
