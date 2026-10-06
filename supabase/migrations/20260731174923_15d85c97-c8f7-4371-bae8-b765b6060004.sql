DROP POLICY IF EXISTS "Students create own entries" ON public.entries;
CREATE POLICY "Students create own entries" ON public.entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (team_id IS NULL OR public.is_team_member(team_id, auth.uid())));

DROP POLICY IF EXISTS "Students update own entries" ON public.entries;
CREATE POLICY "Students update own entries" ON public.entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND (team_id IS NULL OR public.is_team_member(team_id, auth.uid())));

DROP POLICY IF EXISTS "Students add own evidence" ON public.evidence;
CREATE POLICY "Students add own evidence" ON public.evidence
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (team_id IS NULL OR public.is_team_member(team_id, auth.uid())));

DROP POLICY IF EXISTS "Owners update evidence" ON public.evidence;
CREATE POLICY "Owners update evidence" ON public.evidence
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND (team_id IS NULL OR public.is_team_member(team_id, auth.uid())));

DROP POLICY IF EXISTS "Students create requests" ON public.requests;
CREATE POLICY "Students create requests" ON public.requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (team_id IS NULL OR public.is_team_member(team_id, auth.uid())));

DROP POLICY IF EXISTS "Students edit pending own requests, teachers update status" ON public.requests;
CREATE POLICY "Students edit pending own requests, teachers update status" ON public.requests
  FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) AND (status = 'pending'::text)) OR public.has_role(auth.uid(), 'teacher'::app_role))
  WITH CHECK ((((user_id = auth.uid()) AND (status = 'pending'::text)) AND (team_id IS NULL OR public.is_team_member(team_id, auth.uid()))) OR public.has_role(auth.uid(), 'teacher'::app_role));