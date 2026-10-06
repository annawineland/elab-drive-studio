CREATE TABLE public.learning_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  stage TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_targets TO authenticated;
GRANT ALL ON public.learning_targets TO service_role;
ALTER TABLE public.learning_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view learning targets" ON public.learning_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers manage learning targets" ON public.learning_targets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'teacher')) WITH CHECK (public.has_role(auth.uid(), 'teacher'));

CREATE TABLE public.rubric_criteria (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id UUID NOT NULL REFERENCES public.learning_targets(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('advanced', 'proficient', 'developing')),
  criterion TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubric_criteria TO authenticated;
GRANT ALL ON public.rubric_criteria TO service_role;
ALTER TABLE public.rubric_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view rubric criteria" ON public.rubric_criteria FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers manage rubric criteria" ON public.rubric_criteria FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'teacher')) WITH CHECK (public.has_role(auth.uid(), 'teacher'));

CREATE TABLE public.rubric_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id UUID NOT NULL REFERENCES public.learning_targets(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id),
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES public.entries(id) ON DELETE SET NULL,
  level TEXT NOT NULL CHECK (level IN ('advanced', 'proficient', 'developing')),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rubric_scores_subject_check CHECK (student_id IS NOT NULL OR team_id IS NOT NULL)
);
CREATE UNIQUE INDEX rubric_scores_one_per_student ON public.rubric_scores (target_id, student_id) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX rubric_scores_one_per_team ON public.rubric_scores (target_id, team_id) WHERE team_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubric_scores TO authenticated;
GRANT ALL ON public.rubric_scores TO service_role;
ALTER TABLE public.rubric_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers, scored students, and teammates view scores" ON public.rubric_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'teacher') OR student_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "Teachers record scores" ON public.rubric_scores FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'teacher') AND teacher_id = auth.uid());
CREATE POLICY "Teachers update scores" ON public.rubric_scores FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'teacher')) WITH CHECK (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Teachers delete scores" ON public.rubric_scores FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'teacher'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_learning_targets_updated_at BEFORE UPDATE ON public.learning_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rubric_criteria_updated_at BEFORE UPDATE ON public.rubric_criteria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rubric_scores_updated_at BEFORE UPDATE ON public.rubric_scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.learning_targets (key, title, description, stage, sort_order) VALUES
  ('time-management', 'Time Management', 'Plans, prioritizes, and uses class time and sprint cycles effectively to keep the team''s project on schedule.', NULL, 1),
  ('desirability', 'Desirability', 'Demonstrates that the proposed solution is desirable — grounded in real user and stakeholder needs and validated with evidence.', 'understand', 2),
  ('prototyping', 'Prototyping', 'Builds purposeful prototypes — from rough models to functional builds — to answer design questions and improve the solution.', 'prototype', 3);

INSERT INTO public.rubric_criteria (target_id, level, criterion, sort_order) VALUES
  ((SELECT id FROM public.learning_targets WHERE key = 'time-management'), 'advanced', 'Plans work in sprints with clear goals, breaks tasks into actionable steps, and adjusts the plan proactively when the schedule slips.', 1),
  ((SELECT id FROM public.learning_targets WHERE key = 'time-management'), 'advanced', 'Anticipates bottlenecks — materials, fabrication queue, client availability — and builds buffer time into the team plan.', 2),
  ((SELECT id FROM public.learning_targets WHERE key = 'time-management'), 'advanced', 'Helps teammates stay on task and re-prioritizes the team workload without being prompted.', 3),
  ((SELECT id FROM public.learning_targets WHERE key = 'time-management'), 'proficient', 'Uses class time purposefully and completes assigned tasks by agreed deadlines with only occasional reminders.', 1),
  ((SELECT id FROM public.learning_targets WHERE key = 'time-management'), 'proficient', 'Contributes to sprint planning and keeps personal task status current on the team board.', 2),
  ((SELECT id FROM public.learning_targets WHERE key = 'time-management'), 'proficient', 'Meets major project milestones on time.', 3),
  ((SELECT id FROM public.learning_targets WHERE key = 'desirability'), 'advanced', 'Gathers direct evidence of user needs (interviews, observations, surveys) and cites it when defining the problem and justifying design decisions.', 1),
  ((SELECT id FROM public.learning_targets WHERE key = 'desirability'), 'advanced', 'Validates desirability by testing concepts or prototypes with real users or stakeholders and iterates based on their feedback.', 2),
  ((SELECT id FROM public.learning_targets WHERE key = 'desirability'), 'advanced', 'Clearly articulates who benefits, why they want it, and what would make them choose this solution over alternatives.', 3),
  ((SELECT id FROM public.learning_targets WHERE key = 'desirability'), 'proficient', 'Identifies the client or user and their needs from provided information or at least one stakeholder interaction.', 1),
  ((SELECT id FROM public.learning_targets WHERE key = 'desirability'), 'proficient', 'Explains how the chosen concept addresses the identified user needs.', 2),
  ((SELECT id FROM public.learning_targets WHERE key = 'desirability'), 'proficient', 'Incorporates at least one piece of user or client feedback into the design.', 3),
  ((SELECT id FROM public.learning_targets WHERE key = 'prototyping'), 'advanced', 'Builds multiple iterative prototypes, each designed to answer a specific question or test a specific risk.', 1),
  ((SELECT id FROM public.learning_targets WHERE key = 'prototyping'), 'advanced', 'Chooses appropriate fidelity and materials for the question being tested, and documents changes between iterations with testing evidence.', 2),
  ((SELECT id FROM public.learning_targets WHERE key = 'prototyping'), 'advanced', 'Uses prototypes to communicate ideas to clients or users and gathers actionable feedback from them.', 3),
  ((SELECT id FROM public.learning_targets WHERE key = 'prototyping'), 'proficient', 'Builds at least one prototype that represents the key features of the chosen concept.', 1),
  ((SELECT id FROM public.learning_targets WHERE key = 'prototyping'), 'proficient', 'Documents the prototype with photos or CAD and a prototype log entry describing what it is meant to test.', 2),
  ((SELECT id FROM public.learning_targets WHERE key = 'prototyping'), 'proficient', 'Makes at least one documented improvement based on testing or feedback.', 3);