DROP POLICY "Students manage own entries, teachers read all" ON public.entries;
CREATE POLICY "Read own, team, or teacher" ON public.entries
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  OR public.has_role(auth.uid(), 'teacher')
);