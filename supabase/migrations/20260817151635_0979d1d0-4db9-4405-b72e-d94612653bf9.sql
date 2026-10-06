DROP POLICY IF EXISTS "Teachers can edit pacing weeks" ON public.pacing_weeks;
CREATE POLICY "Signed-in users can edit pacing weeks"
ON public.pacing_weeks FOR UPDATE TO authenticated
USING (true) WITH CHECK (true);