-- Tighten user_roles insert so students can only self-assign the student role.
-- Teacher role grants remain possible through SECURITY DEFINER functions or service-role operations.
DROP POLICY IF EXISTS "Users assign their own role at onboarding" ON public.user_roles;

CREATE POLICY "Users can only assign themselves the student role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND role = 'student'
);

-- Ensure the security-definer role-linking functions remain executable as needed.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_roster_for_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_roster_on_enrollment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_roster_spot_for_user() TO authenticated;
