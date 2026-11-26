DROP TRIGGER IF EXISTS trg_check_job_status_transition ON public.jobs;

CREATE OR REPLACE FUNCTION public.check_job_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_recruiter_id uuid;
  v_profile record;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status NOT IN ('open', 'closed', 'paused') THEN
      RAISE EXCEPTION 'Invalid job status: %', NEW.status;
    END IF;

    IF NEW.status = 'open' AND NOT public.is_admin() THEN
      v_recruiter_id := COALESCE(NEW.posted_by, auth.uid());
      IF v_recruiter_id IS NOT NULL THEN
        SELECT * INTO v_profile
        FROM public.profiles
        WHERE id = v_recruiter_id;

        IF v_profile.id IS NOT NULL AND v_profile.role = 'recruiter' THEN
          IF v_profile.active_plan IS NULL 
             OR v_profile.active_plan = 'none' 
             OR v_profile.plan_expires_at IS NULL 
             OR v_profile.plan_expires_at <= now() THEN
            RAISE EXCEPTION 'Cannot reopen job. Active subscription required. Your plan has expired or no plan is active. Please renew your package.';
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_job_status_transition
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.check_job_status_transition();

CREATE OR REPLACE FUNCTION public.toggle_job_status(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid;
  v_job record;
  v_profile record;
  v_new_status text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job opening not found.';
  END IF;

  IF v_job.posted_by != v_caller_id AND NOT public.is_company_member(v_job.company_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized to manage this job listing.';
  END IF;

  IF v_job.status = 'open' THEN
    v_new_status := 'closed';
  ELSE
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_profile.role != 'admin' THEN
      IF v_profile.active_plan IS NULL 
         OR v_profile.active_plan = 'none' 
         OR v_profile.plan_expires_at IS NULL 
         OR v_profile.plan_expires_at <= now() THEN
        RAISE EXCEPTION 'Cannot reopen job. Active subscription required. Your plan has expired or no plan is active. Please renew your package.';
      END IF;
    END IF;

    v_new_status := 'open';
  END IF;

  UPDATE public.jobs
  SET status = v_new_status,
      updated_at = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_job_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_job_status(uuid) TO authenticated;
