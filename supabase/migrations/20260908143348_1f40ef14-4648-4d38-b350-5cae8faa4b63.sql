CREATE TABLE public.mission_rubric_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.stage_missions(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  points integer NOT NULL DEFAULT 4,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_rubric_criteria TO authenticated;
GRANT ALL ON public.mission_rubric_criteria TO service_role;
ALTER TABLE public.mission_rubric_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read mission criteria" ON public.mission_rubric_criteria FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers manage mission criteria" ON public.mission_rubric_criteria FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'teacher')) WITH CHECK (public.has_role(auth.uid(), 'teacher'));
CREATE TRIGGER update_mission_rubric_criteria_updated_at BEFORE UPDATE ON public.mission_rubric_criteria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_mission_rubric_criteria_mission ON public.mission_rubric_criteria(mission_id);

CREATE TABLE public.mission_exemplars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL UNIQUE REFERENCES public.stage_missions(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_exemplars TO authenticated;
GRANT ALL ON public.mission_exemplars TO service_role;
ALTER TABLE public.mission_exemplars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers manage mission exemplars" ON public.mission_exemplars FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'teacher')) WITH CHECK (public.has_role(auth.uid(), 'teacher'));
CREATE TRIGGER update_mission_exemplars_updated_at BEFORE UPDATE ON public.mission_exemplars FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.mission_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.stage_missions(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_points integer NOT NULL DEFAULT 0,
  possible_points integer NOT NULL DEFAULT 0,
  feedback text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, team_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_grades TO authenticated;
GRANT ALL ON public.mission_grades TO service_role;
ALTER TABLE public.mission_grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers manage mission grades" ON public.mission_grades FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'teacher')) WITH CHECK (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Team members read their mission grades" ON public.mission_grades FOR SELECT TO authenticated USING (public.is_team_member(team_id, auth.uid()));
CREATE TRIGGER update_mission_grades_updated_at BEFORE UPDATE ON public.mission_grades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_mission_grades_team ON public.mission_grades(team_id);