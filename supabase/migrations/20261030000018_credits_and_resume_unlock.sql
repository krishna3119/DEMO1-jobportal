ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS credits integer DEFAULT 50;

UPDATE public.profiles
SET credits = 50
WHERE credits IS NULL;

ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS is_unlocked boolean DEFAULT false;

ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS resume_url text;

ALTER TABLE public.applications
ALTER COLUMN resume_path DROP NOT NULL;

ALTER TABLE public.applications
ALTER COLUMN full_name DROP NOT NULL;

ALTER TABLE public.applications
ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE public.applications
ALTER COLUMN email DROP NOT NULL;

UPDATE public.applications
SET is_unlocked = false
WHERE is_unlocked IS NULL;

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  transaction_type text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own credit transactions" ON public.credit_transactions;
CREATE POLICY "Users can view own credit transactions"
  ON public.credit_transactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP FUNCTION IF EXISTS public.apply_to_job(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.apply_to_job(uuid, text);

CREATE OR REPLACE FUNCTION public.apply_to_job(
  p_job_id uuid,
  p_resume_url text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_cover_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  v_caller_id uuid;
  v_candidate_credits integer;
  v_new_credits integer;
  v_job record;
  v_profile record;
  v_application_id uuid;
  v_final_name text;
  v_final_phone text;
  v_caller_email text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to apply.';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_caller_id
  FOR UPDATE;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  IF v_profile.role IS DISTINCT FROM 'candidate' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only candidates can apply to jobs.';
  END IF;

  v_candidate_credits := COALESCE(v_profile.credits, 50);

  IF v_candidate_credits < 5 THEN
    RAISE EXCEPTION 'Insufficient credits. You need at least 5 points to apply.';
  END IF;

  SELECT j.id, j.company_id, j.status, j.title, c.verification_status
  INTO v_job
  FROM public.jobs j
  LEFT JOIN public.companies c ON j.company_id = c.id
  WHERE j.id = p_job_id;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  IF v_job.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'This job is not accepting applications right now.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.applications
    WHERE job_id = p_job_id AND candidate_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'You have already applied for this position.';
  END IF;

  v_final_name := COALESCE(NULLIF(trim(p_full_name), ''), v_profile.full_name, 'Candidate');
  v_final_phone := COALESCE(NULLIF(trim(p_phone), ''), v_profile.phone, '');
  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  v_new_credits := v_candidate_credits - 5;

  UPDATE public.profiles
  SET credits = v_new_credits, updated_at = now()
  WHERE id = v_caller_id;

  INSERT INTO public.applications (
    job_id,
    company_id,
    candidate_id,
    full_name,
    email,
    phone,
    cover_note,
    resume_path,
    resume_url,
    status,
    is_unlocked,
    credits_charged
  ) VALUES (
    p_job_id,
    v_job.company_id,
    v_caller_id,
    v_final_name,
    COALESCE(v_caller_email, ''),
    v_final_phone,
    p_cover_note,
    COALESCE(p_resume_url, ''),
    COALESCE(p_resume_url, ''),
    'applied',
    false,
    5
  )
  RETURNING id INTO v_application_id;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    description
  ) VALUES (
    v_caller_id,
    -5,
    'job_application',
    'Applied to position: ' || COALESCE(v_job.title, 'Job')
  );

  RETURN jsonb_build_object(
    'success', true,
    'application_id', v_application_id,
    'remaining_credits', v_new_credits
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_to_job(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_to_job(uuid, text, text, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.unlock_candidate_resume(uuid);

CREATE OR REPLACE FUNCTION public.unlock_candidate_resume(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  v_caller_id uuid;
  v_app record;
  v_recruiter_credits integer;
  v_new_credits integer;
  v_resume text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT id, job_id, company_id, resume_path, resume_url, is_unlocked
  INTO v_app
  FROM public.applications
  WHERE id = p_application_id;

  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'Application not found.';
  END IF;

  v_resume := COALESCE(v_app.resume_url, v_app.resume_path);

  IF v_app.is_unlocked IS TRUE THEN
    SELECT credits INTO v_recruiter_credits
    FROM public.profiles
    WHERE id = v_caller_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_unlocked', true,
      'resume_url', v_resume,
      'remaining_credits', COALESCE(v_recruiter_credits, 0)
    );
  END IF;

  SELECT credits INTO v_recruiter_credits
  FROM public.profiles
  WHERE id = v_caller_id
  FOR UPDATE;

  IF v_recruiter_credits IS NULL THEN
    v_recruiter_credits := 50;
    UPDATE public.profiles SET credits = 50 WHERE id = v_caller_id;
  END IF;

  IF v_recruiter_credits < 10 THEN
    RAISE EXCEPTION 'Insufficient credits. 10 points required to unlock resume.';
  END IF;

  v_new_credits := v_recruiter_credits - 10;

  UPDATE public.profiles
  SET credits = v_new_credits, updated_at = now()
  WHERE id = v_caller_id;

  UPDATE public.applications
  SET is_unlocked = true
  WHERE id = p_application_id;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    description
  ) VALUES (
    v_caller_id,
    -10,
    'resume_unlock',
    'Resume unlocked for application ' || p_application_id::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_unlocked', false,
    'resume_url', v_resume,
    'remaining_credits', v_new_credits
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_candidate_resume(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_candidate_resume(uuid) TO authenticated;
