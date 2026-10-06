CREATE TABLE public.mission_completions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, team_id)
);

GRANT SELECT, INSERT, DELETE ON public.mission_completions TO authenticated;
GRANT ALL ON public.mission_completions TO service_role;

ALTER TABLE public.mission_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members view their team completions"
  ON public.mission_completions FOR SELECT TO authenticated
  USING (public.is_team_member(team_id, auth.uid()) OR public.has_role(auth.uid(), 'teacher'));

CREATE POLICY "Team members check off missions"
  ON public.mission_completions FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(team_id, auth.uid()) AND completed_by = auth.uid());

CREATE POLICY "Team members uncheck missions"
  ON public.mission_completions FOR DELETE TO authenticated
  USING (public.is_team_member(team_id, auth.uid()) OR public.has_role(auth.uid(), 'teacher'));