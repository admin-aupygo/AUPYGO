-- ============================================================
-- AUPYGO — Modifier / désactiver un code promo (Amiral)
-- Supabase → SQL Editor → Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_promo_code(
  p_id uuid,
  p_plan text DEFAULT NULL,
  p_max_uses int DEFAULT NULL,
  p_valid_days int DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_benefit_days int DEFAULT NULL,
  p_active boolean DEFAULT NULL,
  p_clear_max_uses boolean DEFAULT false,
  p_clear_valid_until boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  row_c public.promo_codes%rowtype;
  v_plan text;
  v_until timestamptz;
BEGIN
  IF actor IS NULL OR NOT public.is_amiral() THEN
    RAISE EXCEPTION 'FORBIDDEN: réservé à l''Amiral' USING errcode = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'ID_REQUIRED';
  END IF;

  SELECT * INTO row_c FROM public.promo_codes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF p_plan IS NOT NULL THEN
    v_plan := upper(trim(p_plan));
    IF v_plan NOT IN ('STANDARD', 'PREMIUM', 'FREE') THEN
      RAISE EXCEPTION 'Plan invalide';
    END IF;
  ELSE
    v_plan := row_c.plan;
  END IF;

  IF p_clear_valid_until THEN
    v_until := NULL;
  ELSIF p_valid_days IS NOT NULL AND p_valid_days > 0 THEN
    v_until := now() + (p_valid_days || ' days')::interval;
  ELSE
    v_until := row_c.valid_until;
  END IF;

  UPDATE public.promo_codes SET
    plan = v_plan,
    max_uses = CASE
      WHEN p_clear_max_uses THEN NULL
      WHEN p_max_uses IS NOT NULL AND p_max_uses > 0 THEN p_max_uses
      ELSE max_uses
    END,
    valid_until = v_until,
    note = CASE WHEN p_note IS NOT NULL THEN nullif(trim(p_note), '') ELSE note END,
    benefit_days = CASE
      WHEN p_benefit_days IS NOT NULL AND p_benefit_days > 0 THEN p_benefit_days
      ELSE benefit_days
    END,
    active = CASE WHEN p_active IS NOT NULL THEN p_active ELSE active END
  WHERE id = p_id
  RETURNING * INTO row_c;

  RETURN json_build_object(
    'ok', true,
    'id', row_c.id,
    'code', row_c.code,
    'plan', row_c.plan,
    'max_uses', row_c.max_uses,
    'used_count', row_c.used_count,
    'valid_until', row_c.valid_until,
    'benefit_days', row_c.benefit_days,
    'active', row_c.active,
    'note', row_c.note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_promo_code(uuid, text, int, int, text, int, boolean, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update_promo_code(uuid, text, int, int, text, int, boolean, boolean, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
