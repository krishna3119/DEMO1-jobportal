ALTER TABLE public.credit_ledger
  DROP CONSTRAINT IF EXISTS credit_ledger_type_check;

ALTER TABLE public.credit_ledger
  ADD CONSTRAINT credit_ledger_type_check
  CHECK (type IN ('admin_topup', 'application_charge', 'adjustment', 'purchase'));

DROP INDEX IF EXISTS public.idx_credit_ledger_unique_topup_ref;
DROP INDEX IF EXISTS public.idx_credit_ledger_unique_reference;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_unique_reference
  ON public.credit_ledger (reference)
  WHERE type IN ('admin_topup', 'purchase') AND reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pack_id uuid REFERENCES public.credit_packs(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  credits integer NOT NULL CHECK (credits > 0),
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  currency text NOT NULL DEFAULT 'INR',
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text UNIQUE,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members and admins can view payment orders" ON public.payment_orders;
CREATE POLICY "Company members and admins can view payment orders"
  ON public.payment_orders
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_company_member(company_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.created_by = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_payment_orders_company_id ON public.payment_orders (company_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON public.payment_orders (status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_razorpay_order_id ON public.payment_orders (razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_razorpay_payment_id ON public.payment_orders (razorpay_payment_id);

INSERT INTO public.platform_settings (key, value, description)
VALUES ('manual_payments_enabled', 'false', 'Enable or disable manual UPI/QR payment request workflow')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public._add_credits(
  p_company_id uuid,
  p_amount integer,
  p_reference text,
  p_note text,
  p_type text,
  p_actor uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
  v_app_cost integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero.';
  END IF;

  IF p_reference IS NULL OR length(trim(p_reference)) = 0 THEN
    RAISE EXCEPTION 'Payment reference ID is required.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found.';
  END IF;

  SELECT balance INTO v_balance
  FROM public.company_credits
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.company_credits (company_id, balance)
    VALUES (p_company_id, 0)
    RETURNING balance INTO v_balance;
  END IF;

  v_new_balance := v_balance + p_amount;

  UPDATE public.company_credits
  SET balance = v_new_balance, updated_at = now()
  WHERE company_id = p_company_id;

  INSERT INTO public.credit_ledger (
    company_id, type, amount, balance_after, reference, note, created_by
  ) VALUES (
    p_company_id, p_type, p_amount, v_new_balance, trim(p_reference), p_note, p_actor
  );

  SELECT COALESCE(value::integer, 10) INTO v_app_cost
  FROM public.platform_settings
  WHERE key = 'application_cost';
  IF v_app_cost IS NULL THEN v_app_cost := 10; END IF;

  IF v_new_balance >= v_app_cost THEN
    PERFORM set_config('app.system_setting_status', 'true', true);

    UPDATE public.jobs
    SET status = 'open', updated_at = now()
    WHERE company_id = p_company_id AND status = 'paused';
  END IF;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public._add_credits(uuid, integer, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_credits(
  p_company_id uuid,
  p_amount integer,
  p_reference text,
  p_note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Admin privileges required to allocate company credits.';
  END IF;

  RETURN public._add_credits(
    p_company_id,
    p_amount,
    p_reference,
    p_note,
    'admin_topup',
    auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_credits(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(uuid, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_credits(
  p_company_id uuid,
  p_amount integer,
  p_reference text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.admin_add_credits(p_company_id, p_amount, p_reference, NULL::text);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_credits(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_payment_order(
  p_company_id uuid,
  p_pack_id uuid
)
RETURNS TABLE (
  order_id uuid,
  amount_paise integer,
  credits integer,
  pack_name text,
  company_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid;
  v_company_status text;
  v_company_name text;
  v_pack_name text;
  v_credits integer;
  v_price_inr integer;
  v_active boolean;
  v_order_id uuid;
  v_amount_paise integer;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT name, verification_status INTO v_company_name, v_company_status
  FROM public.companies
  WHERE id = p_company_id;

  IF v_company_status IS NULL THEN
    RAISE EXCEPTION 'Company not found.';
  END IF;

  IF v_company_status <> 'approved' THEN
    RAISE EXCEPTION 'Company must be approved to buy credits.';
  END IF;

  IF NOT (
    public.is_company_member(p_company_id)
    OR EXISTS (
      SELECT 1 FROM public.companies
      WHERE id = p_company_id AND created_by = v_caller_id
    )
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'Only authorized company recruiters or administrators can create payment orders.';
  END IF;

  SELECT name, credits, price_inr, active
  INTO v_pack_name, v_credits, v_price_inr, v_active
  FROM public.credit_packs
  WHERE id = p_pack_id;

  IF v_pack_name IS NULL OR NOT v_active THEN
    RAISE EXCEPTION 'Selected credit pack is not active or does not exist.';
  END IF;

  v_amount_paise := v_price_inr * 100;

  INSERT INTO public.payment_orders (
    company_id, pack_id, created_by, credits, amount_paise, currency, status
  ) VALUES (
    p_company_id, p_pack_id, v_caller_id, v_credits, v_amount_paise, 'INR', 'created'
  )
  RETURNING id INTO v_order_id;

  RETURN QUERY
  SELECT v_order_id, v_amount_paise, v_credits, v_pack_name, v_company_name;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_payment_order(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_payment_order(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_razorpay_order(
  p_order_id uuid,
  p_razorpay_order_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Permission denied: service_role privileges required.';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required.';
  END IF;

  IF p_razorpay_order_id IS NULL OR length(trim(p_razorpay_order_id)) = 0 THEN
    RAISE EXCEPTION 'Razorpay order ID is required.';
  END IF;

  UPDATE public.payment_orders
  SET razorpay_order_id = trim(p_razorpay_order_id)
  WHERE id = p_order_id AND status = 'created';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment order not found or not in created status.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_razorpay_order(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_razorpay_order(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.credit_paid_order(
  p_razorpay_order_id text,
  p_payment_id text,
  p_amount_paise integer,
  p_currency text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_order record;
  v_balance integer;
  v_new_balance integer;
BEGIN
  IF auth.role() <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Permission denied: service_role privileges required.';
  END IF;

  IF p_razorpay_order_id IS NULL OR length(trim(p_razorpay_order_id)) = 0 THEN
    RAISE EXCEPTION 'Razorpay order ID is required.';
  END IF;

  IF p_payment_id IS NULL OR length(trim(p_payment_id)) = 0 THEN
    RAISE EXCEPTION 'Razorpay payment ID is required.';
  END IF;

  SELECT id, company_id, pack_id, created_by, credits, amount_paise, currency, status, razorpay_payment_id
  INTO v_order
  FROM public.payment_orders
  WHERE razorpay_order_id = trim(p_razorpay_order_id)
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Payment order not found for Razorpay order ID %', p_razorpay_order_id;
  END IF;

  IF v_order.status = 'paid' THEN
    SELECT COALESCE(balance, 0) INTO v_balance
    FROM public.company_credits
    WHERE company_id = v_order.company_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  IF v_order.amount_paise <> p_amount_paise THEN
    RAISE EXCEPTION 'Payment amount mismatch: expected % paise, got % paise.', v_order.amount_paise, p_amount_paise;
  END IF;

  IF upper(trim(v_order.currency)) <> upper(trim(p_currency)) THEN
    RAISE EXCEPTION 'Payment currency mismatch: expected %, got %.', v_order.currency, p_currency;
  END IF;

  UPDATE public.payment_orders
  SET status = 'paid',
      razorpay_payment_id = trim(p_payment_id),
      paid_at = now()
  WHERE id = v_order.id;

  v_new_balance := public._add_credits(
    v_order.company_id,
    v_order.credits,
    trim(p_payment_id),
    'Razorpay payment ' || trim(p_payment_id),
    'purchase',
    NULL::uuid
  );

  IF v_order.created_by IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, type, title, message, link
    ) VALUES (
      v_order.created_by,
      'general',
      'Payment Successful',
      format('%s credits added to your account. Payment ID: %s', v_order.credits, trim(p_payment_id)),
      '/dashboard/credits'
    );
  END IF;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_paid_order(text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_paid_order(text, text, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_payment_failed(
  p_razorpay_order_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Permission denied: service_role privileges required.';
  END IF;

  IF p_razorpay_order_id IS NULL OR length(trim(p_razorpay_order_id)) = 0 THEN
    RAISE EXCEPTION 'Razorpay order ID is required.';
  END IF;

  UPDATE public.payment_orders
  SET status = 'failed'
  WHERE razorpay_order_id = trim(p_razorpay_order_id)
    AND status = 'created';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_payment_failed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_payment_failed(text) TO service_role;
