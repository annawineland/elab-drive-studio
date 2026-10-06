-- 1. Roster table: one row per student email per mod
CREATE TABLE public.mod_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mod_id uuid NOT NULL REFERENCES public.mods(id) ON DELETE CASCADE,
  email text NOT NULL,
  student_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  added_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mod_id, email)
);

-- 2. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mod_enrollments TO authenticated;
GRANT ALL ON public.mod_enrollments TO service_role;

-- 3. RLS
ALTER TABLE public.mod_enrollments ENABLE ROW LEVEL SECURITY;

-- 4. Helper: is this user enrolled in this mod? (security definer avoids recursion)
CREATE OR REPLACE FUNCTION public.is_mod_member(_mod_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mod_enrollments
    WHERE mod_id = _mod_id AND student_id = _user_id
  )
$$;

-- 5. Policies
CREATE POLICY "Teachers manage mod enrollments" ON public.mod_enrollments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'teacher'));

CREATE POLICY "Students view their mod roster" ON public.mod_enrollments
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_mod_member(mod_id, auth.uid()));

-- 6. Link a confirmed user to any roster rows matching their email + grant student role
CREATE OR REPLACE FUNCTION public.link_roster_for_user(_user_id uuid, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.mod_enrollments
  SET student_id = _user_id
  WHERE student_id IS NULL AND email = lower(trim(_email));
  IF FOUND AND NOT public.has_role(_user_id, 'teacher') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'student')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- 7. When a roster email is added for someone already signed up (and confirmed), link them now
CREATE OR REPLACE FUNCTION public.link_roster_on_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  NEW.email := lower(trim(NEW.email));
  SELECT id INTO _uid FROM auth.users
  WHERE lower(email) = NEW.email AND email_confirmed_at IS NOT NULL
  LIMIT 1;
  IF _uid IS NOT NULL THEN
    NEW.student_id := _uid;
    IF NOT public.has_role(_uid, 'teacher') THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (_uid, 'student')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_link_roster_on_enrollment
  BEFORE INSERT ON public.mod_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.link_roster_on_enrollment();

-- 8. When a user is created with a confirmed email, or confirms it later, claim roster spots
CREATE OR REPLACE FUNCTION public.claim_roster_spot_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM public.link_roster_for_user(NEW.id, NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_claim_roster
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.claim_roster_spot_for_user();

CREATE TRIGGER on_auth_user_confirmed_claim_roster
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.claim_roster_spot_for_user();

-- 9. Keep updated_at fresh
CREATE TRIGGER update_mod_enrollments_updated_at
  BEFORE UPDATE ON public.mod_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();