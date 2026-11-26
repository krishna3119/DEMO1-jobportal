CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recruiter_name text,
  recruiter_email text,
  plan_key text NOT NULL,
  plan_name text NOT NULL,
  base_amount numeric NOT NULL DEFAULT 0,
  gst_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'sample_gateway',
  transaction_id text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recruiters can view their own subscription payments" ON public.subscription_payments;
CREATE POLICY "Recruiters can view their own subscription payments"
  ON public.subscription_payments
  FOR SELECT
  TO authenticated
  USING (recruiter_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Authenticated recruiters can insert their subscription payment" ON public.subscription_payments;
CREATE POLICY "Authenticated recruiters can insert their subscription payment"
  ON public.subscription_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (recruiter_id = auth.uid() OR public.is_admin());

CREATE INDEX IF NOT EXISTS idx_subscription_payments_recruiter ON public.subscription_payments (recruiter_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_created_at ON public.subscription_payments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_txn ON public.subscription_payments (transaction_id);

GRANT SELECT, INSERT ON public.subscription_payments TO authenticated;
