CREATE TABLE public.team_pacing_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  focus text NOT NULL DEFAULT '',
  stage text,
  milestones text NOT NULL DEFAULT '',
  deliverables text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, week_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_pacing_weeks TO authenticated;
GRANT ALL ON public.team_pacing_weeks TO service_role;

ALTER TABLE public.team_pacing_weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members manage their team plan"
ON public.team_pacing_weeks FOR ALL TO authenticated
USING (public.is_team_member(team_id, auth.uid()))
WITH CHECK (public.is_team_member(team_id, auth.uid()));

CREATE POLICY "Teachers can view team plans"
ON public.team_pacing_weeks FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'teacher'::app_role));

CREATE TRIGGER update_team_pacing_weeks_updated_at
BEFORE UPDATE ON public.team_pacing_weeks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();