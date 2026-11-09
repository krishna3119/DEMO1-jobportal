UPDATE public.profiles
SET credits = 500
WHERE role = 'recruiter' AND (credits IS NULL OR credits < 500);

ALTER TABLE public.profiles
ALTER COLUMN credits SET DEFAULT 500;

DELETE FROM public.credit_packs;

INSERT INTO public.credit_packs (name, credits, price_inr, active, sort)
VALUES
  ('Standard Pack', 500, 5000, true, 1),
  ('Growth Pack', 1000, 10000, true, 2),
  ('Enterprise Pack', 2500, 25000, true, 3);

CREATE OR REPLACE FUNCTION public.admin_resolve_credit_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_req public.credit_requests%ROWTYPE;
  v_recruiter_id uuid;
  v_current_credits integer;
BEGIN
  IF NOT public.is_admin() AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Admin privileges required to resolve credit requests.';
  END IF;

  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Approval decision (p_approve) cannot be null.';
  END IF;

  SELECT * INTO v_req
  FROM public.credit_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Credit request not found.';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Credit request has already been resolved.';
  END IF;

  SELECT created_by INTO v_recruiter_id
  FROM public.companies
  WHERE id = v_req.company_id;

  IF p_approve IS TRUE THEN
    IF v_recruiter_id IS NOT NULL THEN
      SELECT credits INTO v_current_credits
      FROM public.profiles
      WHERE id = v_recruiter_id
      FOR UPDATE;

      UPDATE public.profiles
      SET credits = COALESCE(v_current_credits, 500) + v_req.credits,
          updated_at = now()
      WHERE id = v_recruiter_id;

      INSERT INTO public.credit_transactions (
        user_id,
        amount,
        transaction_type,
        description
      ) VALUES (
        v_recruiter_id,
        v_req.credits,
        'credit_recharge',
        'Credit recharge of ' || v_req.credits || ' points approved by admin'
      );
    END IF;

    UPDATE public.credit_requests
    SET status = 'approved',
        admin_note = p_note,
        resolved_at = now()
    WHERE id = p_request_id;
  ELSE
    UPDATE public.credit_requests
    SET status = 'rejected',
        admin_note = p_note,
        resolved_at = now()
    WHERE id = p_request_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_credit_request(uuid, boolean, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.admin_resolve_credit_request(uuid, boolean, text) TO authenticated;
