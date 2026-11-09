CREATE OR REPLACE FUNCTION public.prevent_direct_application_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF current_setting('app.allow_application_update', true) = 'true'
     OR session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF (OLD.is_unlocked IS DISTINCT FROM NEW.is_unlocked) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Direct updates to applications are prohibited. Use update_application_status RPC.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_direct_application_update ON public.applications;
CREATE TRIGGER trg_prevent_direct_application_update
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_application_update();

UPDATE public.profiles
SET credits = 500
WHERE role = 'recruiter' AND (credits IS NULL OR credits < 500);

ALTER TABLE public.profiles
ALTER COLUMN credits SET DEFAULT 500;

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
  v_job record;
  v_profile record;
  v_application_id uuid;
  v_final_name text;
  v_final_phone text;
  v_caller_email text;
  v_recruiter_id uuid;
  v_recruiter_credits integer;
  v_new_recruiter_credits integer;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to apply.';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  IF v_profile.role IS DISTINCT FROM 'candidate' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only candidates can apply to jobs.';
  END IF;

  SELECT j.id, j.company_id, j.posted_by, j.status, j.title, c.verification_status, c.created_by AS company_creator
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

  v_recruiter_id := COALESCE(v_job.posted_by, v_job.company_creator);

  IF v_recruiter_id IS NULL THEN
    SELECT user_id INTO v_recruiter_id
    FROM public.company_members
    WHERE company_id = v_job.company_id
    LIMIT 1;
  END IF;

  IF v_recruiter_id IS NOT NULL THEN
    SELECT credits INTO v_recruiter_credits
    FROM public.profiles
    WHERE id = v_recruiter_id
    FOR UPDATE;

    IF v_recruiter_credits IS NULL THEN
      v_recruiter_credits := 500;
      UPDATE public.profiles SET credits = 500 WHERE id = v_recruiter_id;
    END IF;

    IF v_recruiter_credits < 5 THEN
      RAISE EXCEPTION 'This job is not accepting applications right now due to recruiter low balance.';
    END IF;

    v_new_recruiter_credits := v_recruiter_credits - 5;

    UPDATE public.profiles
    SET credits = v_new_recruiter_credits, updated_at = now()
    WHERE id = v_recruiter_id;

    INSERT INTO public.credit_transactions (
      user_id,
      amount,
      transaction_type,
      description
    ) VALUES (
      v_recruiter_id,
      -5,
      'candidate_application_received',
      'Application received for position: ' || COALESCE(v_job.title, 'Job')
    );
  END IF;

  v_final_name := COALESCE(NULLIF(trim(p_full_name), ''), v_profile.full_name, 'Candidate');
  v_final_phone := COALESCE(NULLIF(trim(p_phone), ''), v_profile.phone, '');
  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  PERFORM set_config('app.allow_application_update', 'true', true);

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

  INSERT INTO public.application_status_history (
    application_id, from_status, to_status, changed_by, note, created_at
  ) VALUES (
    v_application_id, NULL, 'applied', v_caller_id, 'Application submitted by candidate', now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'application_id', v_application_id,
    'candidate_charge', 0
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
    v_recruiter_credits := 500;
    UPDATE public.profiles SET credits = 500 WHERE id = v_caller_id;
  END IF;

  IF v_recruiter_credits < 10 AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Insufficient credits. 10 points required to unlock resume.';
  END IF;

  v_new_credits := GREATEST(0, v_recruiter_credits - 10);

  UPDATE public.profiles
  SET credits = v_new_credits, updated_at = now()
  WHERE id = v_caller_id;

  PERFORM set_config('app.allow_application_update', 'true', true);

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
