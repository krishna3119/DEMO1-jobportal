ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_profile_completed boolean DEFAULT false;

UPDATE public.profiles
SET is_profile_completed = true
WHERE role IS NOT NULL;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users and admins can view profiles" ON public.profiles;

CREATE POLICY "Users and admins can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.prevent_profile_role_or_email_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.role IS NOT NULL AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('app.allow_role_change', true) IS DISTINCT FROM 'true' 
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Role cannot be modified directly via client update';
    END IF;
  END IF;

  IF OLD.email IS NOT NULL AND NEW.email IS DISTINCT FROM OLD.email THEN
    IF session_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Email cannot be modified directly via profile update';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
