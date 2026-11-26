ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_check_job_insert_verification ON public.jobs;
DROP FUNCTION IF EXISTS public.check_job_insert_verification();

DROP POLICY IF EXISTS "Public can view open jobs of approved companies" ON public.jobs;
DROP POLICY IF EXISTS "Public can view open jobs" ON public.jobs;
DROP POLICY IF EXISTS "Anyone can view open jobs" ON public.jobs;
DROP POLICY IF EXISTS "Recruiters and admins can view own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Public and candidates can view open jobs, recruiters can view own" ON public.jobs;

CREATE POLICY "Public and candidates can view open jobs, recruiters can view own"
  ON public.jobs
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'open'
    OR posted_by = auth.uid()
    OR public.is_company_member(company_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Recruiters can create jobs for own companies" ON public.jobs;
DROP POLICY IF EXISTS "Recruiters can insert jobs for own companies" ON public.jobs;

CREATE POLICY "Recruiters can create jobs for own companies"
  ON public.jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.is_recruiter() OR public.is_admin())
    AND (
      public.is_company_member(company_id)
      OR posted_by = auth.uid()
    )
    AND auth.uid() = posted_by
  );

DROP POLICY IF EXISTS "Recruiters can update jobs of own companies" ON public.jobs;

CREATE POLICY "Recruiters can update jobs of own companies"
  ON public.jobs
  FOR UPDATE
  TO authenticated
  USING (
    posted_by = auth.uid()
    OR public.is_company_member(company_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Public can view approved companies" ON public.companies;
DROP POLICY IF EXISTS "Companies readable by authenticated users" ON public.companies;
DROP POLICY IF EXISTS "Public can view all companies" ON public.companies;

CREATE POLICY "Public can view all companies"
  ON public.companies
  FOR SELECT
  TO anon, authenticated
  USING (true);

UPDATE public.jobs
SET status = 'open'
WHERE status IS NULL OR status = 'draft';

GRANT SELECT ON public.jobs TO anon, authenticated;
GRANT SELECT ON public.companies TO anon, authenticated;
