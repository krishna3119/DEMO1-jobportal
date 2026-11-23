ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS active_plan text DEFAULT 'none';

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS job_posts_limit integer DEFAULT 0;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS job_posts_used integer DEFAULT 0;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cv_unlocks_limit integer DEFAULT 0;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cv_unlocks_remaining integer DEFAULT 0;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cities_limit integer DEFAULT 0;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS allowed_cities text[] DEFAULT '{}'::text[];

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz DEFAULT NULL;

UPDATE public.profiles
SET active_plan = 'none'
WHERE active_plan IS NULL;

UPDATE public.profiles
SET job_posts_limit = 0
WHERE job_posts_limit IS NULL;

UPDATE public.profiles
SET job_posts_used = 0
WHERE job_posts_used IS NULL;

UPDATE public.profiles
SET cv_unlocks_limit = 0
WHERE cv_unlocks_limit IS NULL;

UPDATE public.profiles
SET cv_unlocks_remaining = 0
WHERE cv_unlocks_remaining IS NULL;

UPDATE public.profiles
SET cities_limit = 0
WHERE cities_limit IS NULL;

UPDATE public.profiles
SET allowed_cities = '{}'::text[]
WHERE allowed_cities IS NULL;

CREATE TABLE IF NOT EXISTS public.subscription_packages (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_inr integer NOT NULL,
  job_posts_limit integer NOT NULL,
  cv_unlocks_limit integer NOT NULL,
  validity_days integer NOT NULL,
  cities_limit integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active subscription packages" ON public.subscription_packages;
CREATE POLICY "Anyone can view active subscription packages"
  ON public.subscription_packages
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.is_admin());

INSERT INTO public.subscription_packages (id, name, price_inr, job_posts_limit, cv_unlocks_limit, validity_days, cities_limit, is_active, sort_order)
VALUES
  ('monthly', 'Monthly Package', 2499, 3, 300, 30, 1, true, 1),
  ('quarterly', '3-Month Package', 7499, 5, 1000, 90, 1, true, 2),
  ('half_yearly', '6-Month Package', 19999, 7, 2000, 365, 1, true, 3),
  ('yearly', 'Yearly Package', 100000, 20, 50000, 365, 5, true, 4)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    price_inr = EXCLUDED.price_inr,
    job_posts_limit = EXCLUDED.job_posts_limit,
    cv_unlocks_limit = EXCLUDED.cv_unlocks_limit,
    validity_days = EXCLUDED.validity_days,
    cities_limit = EXCLUDED.cities_limit,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order;

DELETE FROM public.credit_packs;
INSERT INTO public.credit_packs (name, credits, price_inr, active, sort)
VALUES
  ('Monthly Package (300 CVs, 3 Jobs, 1 City)', 300, 2499, true, 1),
  ('3-Month Package (1,000 CVs, 5 Jobs, 1 City)', 1000, 7499, true, 2),
  ('6-Month Package (2,000 CVs, 7 Jobs, 1 City)', 2000, 19999, true, 3),
  ('Yearly Package (50,000 CVs, 20 Jobs, 5 Cities)', 50000, 100000, true, 4);

DROP TRIGGER IF EXISTS trg_check_job_insert_credits ON public.jobs;
DROP FUNCTION IF EXISTS public.check_job_insert_credits();

CREATE OR REPLACE FUNCTION public.check_job_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status NOT IN ('open', 'closed', 'paused') THEN
      RAISE EXCEPTION 'Invalid job status: %', NEW.status;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_job_subscription_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_recruiter_id uuid;
  v_profile record;
  v_city text;
  v_city_found boolean := false;
  v_existing_city text;
  v_new_allowed_cities text[];
BEGIN
  v_recruiter_id := COALESCE(NEW.posted_by, auth.uid());
  
  IF v_recruiter_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_recruiter_id
  FOR UPDATE;

  IF v_profile.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_profile.role = 'admin' OR session_user IN ('postgres', 'supabase_admin') THEN
    NEW.status := 'open';
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF v_profile.plan_expires_at IS NULL OR v_profile.plan_expires_at <= now() THEN
    RAISE EXCEPTION 'Active subscription required to post jobs. Your plan has expired or no plan is active.';
  END IF;

  IF COALESCE(v_profile.job_posts_used, 0) >= COALESCE(v_profile.job_posts_limit, 0) THEN
    RAISE EXCEPTION 'Job posting limit reached for your active plan (% of % used). Please upgrade your package to post more jobs.',
      COALESCE(v_profile.job_posts_used, 0), COALESCE(v_profile.job_posts_limit, 0);
  END IF;

  v_city := trim(COALESCE(NEW.location, ''));
  IF length(v_city) = 0 THEN
    v_city := 'Remote';
  END IF;

  v_new_allowed_cities := COALESCE(v_profile.allowed_cities, ARRAY[]::text[]);

  FOREACH v_existing_city IN ARRAY v_new_allowed_cities LOOP
    IF lower(trim(v_existing_city)) = lower(v_city) THEN
      v_city_found := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_city_found THEN
    IF COALESCE(cardinality(v_new_allowed_cities), 0) >= COALESCE(v_profile.cities_limit, 0) THEN
      RAISE EXCEPTION 'City limit reached for your active plan (% city/cities allowed: %). Upgrade your package to post jobs in additional cities.',
        COALESCE(v_profile.cities_limit, 0), array_to_string(v_new_allowed_cities, ', ');
    END IF;
    v_new_allowed_cities := array_append(v_new_allowed_cities, v_city);
  END IF;

  UPDATE public.profiles
  SET job_posts_used = COALESCE(job_posts_used, 0) + 1,
      allowed_cities = v_new_allowed_cities,
      updated_at = now()
  WHERE id = v_recruiter_id;

  NEW.status := 'open';
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_job_subscription_limits ON public.jobs;
CREATE TRIGGER trg_check_job_subscription_limits
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.check_job_subscription_limits();

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

  SELECT j.id, j.company_id, j.posted_by, j.status, j.title, c.verification_status
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
    0
  )
  RETURNING id INTO v_application_id;

  INSERT INTO public.application_status_history (
    application_id, from_status, to_status, changed_by, note, created_at
  ) VALUES (
    v_application_id, NULL, 'applied', v_caller_id, 'Application submitted by candidate (Free)', now()
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
  v_profile record;
  v_new_remaining integer;
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
    SELECT cv_unlocks_remaining INTO v_new_remaining
    FROM public.profiles
    WHERE id = v_caller_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_unlocked', true,
      'resume_url', v_resume,
      'remaining_cvs', COALESCE(v_new_remaining, 0),
      'remaining_credits', COALESCE(v_new_remaining, 0)
    );
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_caller_id
  FOR UPDATE;

  IF NOT public.is_admin() THEN
    IF v_profile.plan_expires_at IS NULL OR v_profile.plan_expires_at <= now() THEN
      RAISE EXCEPTION 'Active subscription required to unlock candidate CVs. Please purchase or renew a subscription package.';
    END IF;

    IF COALESCE(v_profile.cv_unlocks_remaining, 0) < 1 THEN
      RAISE EXCEPTION 'No CV unlocks remaining in your pooled quota. Please upgrade or renew your package.';
    END IF;

    v_new_remaining := GREATEST(0, COALESCE(v_profile.cv_unlocks_remaining, 0) - 1);

    UPDATE public.profiles
    SET cv_unlocks_remaining = v_new_remaining,
        updated_at = now()
    WHERE id = v_caller_id;
  ELSE
    v_new_remaining := COALESCE(v_profile.cv_unlocks_remaining, 9999);
  END IF;

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
    -1,
    'cv_unlock',
    'CV unlocked for application ' || p_application_id::text || ' (1 pooled CV deducted)'
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_unlocked', false,
    'resume_url', v_resume,
    'remaining_cvs', v_new_remaining,
    'remaining_credits', v_new_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_candidate_resume(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_candidate_resume(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_subscription_plan(
  p_plan_key text,
  p_payment_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid;
  v_posts_limit integer;
  v_cvs_limit integer;
  v_cities_limit integer;
  v_validity_days integer;
  v_plan_title text;
  v_expires_at timestamptz;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF lower(trim(p_plan_key)) = 'monthly' THEN
    v_posts_limit := 3;
    v_cvs_limit := 300;
    v_cities_limit := 1;
    v_validity_days := 30;
    v_plan_title := 'Monthly Package';
  ELSIF lower(trim(p_plan_key)) = 'quarterly' THEN
    v_posts_limit := 5;
    v_cvs_limit := 1000;
    v_cities_limit := 1;
    v_validity_days := 90;
    v_plan_title := '3-Month Package';
  ELSIF lower(trim(p_plan_key)) = 'half_yearly' THEN
    v_posts_limit := 7;
    v_cvs_limit := 2000;
    v_cities_limit := 1;
    v_validity_days := 365;
    v_plan_title := '6-Month Package';
  ELSIF lower(trim(p_plan_key)) = 'yearly' THEN
    v_posts_limit := 20;
    v_cvs_limit := 50000;
    v_cities_limit := 5;
    v_validity_days := 365;
    v_plan_title := 'Yearly Package';
  ELSE
    RAISE EXCEPTION 'Invalid subscription package selected: %', p_plan_key;
  END IF;

  v_expires_at := now() + (v_validity_days || ' days')::interval;

  UPDATE public.profiles
  SET active_plan = lower(trim(p_plan_key)),
      job_posts_limit = v_posts_limit,
      job_posts_used = 0,
      cv_unlocks_limit = v_cvs_limit,
      cv_unlocks_remaining = v_cvs_limit,
      cities_limit = v_cities_limit,
      allowed_cities = ARRAY[]::text[],
      plan_expires_at = v_expires_at,
      updated_at = now()
  WHERE id = v_caller_id;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    description
  ) VALUES (
    v_caller_id,
    v_cvs_limit,
    'subscription_activated',
    'Subscribed to ' || v_plan_title || ' (Ref: ' || COALESCE(NULLIF(trim(p_payment_reference), ''), 'DIRECT_ACTIVATION') || ')'
  );

  RETURN jsonb_build_object(
    'success', true,
    'active_plan', lower(trim(p_plan_key)),
    'job_posts_limit', v_posts_limit,
    'job_posts_used', 0,
    'cv_unlocks_limit', v_cvs_limit,
    'cv_unlocks_remaining', v_cvs_limit,
    'cities_limit', v_cities_limit,
    'allowed_cities', ARRAY[]::text[],
    'plan_expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_subscription_plan(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_subscription_plan(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_user_subscription(
  p_user_id uuid,
  p_plan_key text,
  p_days_valid integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_posts_limit integer;
  v_cvs_limit integer;
  v_cities_limit integer;
  v_validity_days integer;
  v_plan_title text;
  v_expires_at timestamptz;
BEGIN
  IF NOT public.is_admin() AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Admin privileges required.';
  END IF;

  IF lower(trim(p_plan_key)) = 'monthly' THEN
    v_posts_limit := 3;
    v_cvs_limit := 300;
    v_cities_limit := 1;
    v_validity_days := COALESCE(p_days_valid, 30);
    v_plan_title := 'Monthly Package';
  ELSIF lower(trim(p_plan_key)) = 'quarterly' THEN
    v_posts_limit := 5;
    v_cvs_limit := 1000;
    v_cities_limit := 1;
    v_validity_days := COALESCE(p_days_valid, 90);
    v_plan_title := '3-Month Package';
  ELSIF lower(trim(p_plan_key)) = 'half_yearly' THEN
    v_posts_limit := 7;
    v_cvs_limit := 2000;
    v_cities_limit := 1;
    v_validity_days := COALESCE(p_days_valid, 365);
    v_plan_title := '6-Month Package';
  ELSIF lower(trim(p_plan_key)) = 'yearly' THEN
    v_posts_limit := 20;
    v_cvs_limit := 50000;
    v_cities_limit := 5;
    v_validity_days := COALESCE(p_days_valid, 365);
    v_plan_title := 'Yearly Package';
  ELSIF lower(trim(p_plan_key)) = 'none' THEN
    UPDATE public.profiles
    SET active_plan = 'none',
        job_posts_limit = 0,
        job_posts_used = 0,
        cv_unlocks_limit = 0,
        cv_unlocks_remaining = 0,
        cities_limit = 0,
        allowed_cities = ARRAY[]::text[],
        plan_expires_at = NULL,
        updated_at = now()
    WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'active_plan', 'none');
  ELSE
    RAISE EXCEPTION 'Invalid plan key: %', p_plan_key;
  END IF;

  v_expires_at := now() + (v_validity_days || ' days')::interval;

  UPDATE public.profiles
  SET active_plan = lower(trim(p_plan_key)),
      job_posts_limit = v_posts_limit,
      job_posts_used = 0,
      cv_unlocks_limit = v_cvs_limit,
      cv_unlocks_remaining = v_cvs_limit,
      cities_limit = v_cities_limit,
      allowed_cities = ARRAY[]::text[],
      plan_expires_at = v_expires_at,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    description
  ) VALUES (
    p_user_id,
    v_cvs_limit,
    'admin_subscription_grant',
    'Admin granted ' || v_plan_title || ' subscription'
  );

  RETURN jsonb_build_object(
    'success', true,
    'active_plan', lower(trim(p_plan_key)),
    'plan_expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_subscription(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_subscription(uuid, text, integer) TO authenticated;

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
  v_pack_name text;
  v_plan_key text := 'monthly';
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

  IF v_recruiter_id IS NULL THEN
    v_recruiter_id := v_req.requested_by;
  END IF;

  IF p_approve IS TRUE THEN
    SELECT name INTO v_pack_name
    FROM public.credit_packs
    WHERE id = v_req.pack_id;

    IF v_req.credits >= 50000 OR v_pack_name ILIKE '%Yearly%' THEN
      v_plan_key := 'yearly';
    ELSIF v_req.credits >= 2000 OR v_pack_name ILIKE '%6-Month%' OR v_pack_name ILIKE '%Enterprise%' THEN
      v_plan_key := 'half_yearly';
    ELSIF v_req.credits >= 1000 OR v_pack_name ILIKE '%3-Month%' OR v_pack_name ILIKE '%Growth%' THEN
      v_plan_key := 'quarterly';
    ELSE
      v_plan_key := 'monthly';
    END IF;

    IF v_recruiter_id IS NOT NULL THEN
      PERFORM public.admin_set_user_subscription(v_recruiter_id, v_plan_key);
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
