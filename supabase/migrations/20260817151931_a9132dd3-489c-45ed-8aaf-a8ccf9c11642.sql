DROP POLICY IF EXISTS "Signed-in users can edit pacing weeks" ON public.pacing_weeks;
CREATE POLICY "Teachers can edit pacing weeks"
ON public.pacing_weeks FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'teacher'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'teacher'::app_role));