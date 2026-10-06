DROP POLICY "Students view own requests, teachers view all" ON public.requests;
CREATE POLICY "Students view own and team requests, teachers view all"
ON public.requests FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  OR public.has_role(auth.uid(), 'teacher')
);