CREATE TABLE public.pacing_weeks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_number integer NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  focus text NOT NULL,
  stage text,
  milestones text NOT NULL DEFAULT '',
  deliverables text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pacing_weeks TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pacing_weeks TO authenticated;
GRANT ALL ON public.pacing_weeks TO service_role;

ALTER TABLE public.pacing_weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read pacing weeks"
ON public.pacing_weeks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Teachers can add pacing weeks"
ON public.pacing_weeks FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'teacher'));

CREATE POLICY "Teachers can edit pacing weeks"
ON public.pacing_weeks FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'teacher'))
WITH CHECK (public.has_role(auth.uid(), 'teacher'));

CREATE POLICY "Teachers can delete pacing weeks"
ON public.pacing_weeks FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'teacher'));

CREATE TRIGGER update_pacing_weeks_updated_at BEFORE UPDATE ON public.pacing_weeks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pacing_weeks (week_number, start_date, end_date, focus, stage, milestones, deliverables) VALUES
(1, '2026-08-10', '2026-08-14', 'Client Kickoff — meet your client, form your team, and set working norms.', 'kickoff', 'Team formed with roles agreed
Client meeting held and notes captured
Project brief restated in the team''s own words', 'Client notes entry in the Design Notebook
Team agreement (norms, roles, meeting times)'),
(2, '2026-08-17', '2026-08-21', 'Understand the Problem — interview stakeholders and define the real need.', 'understand', 'Stakeholder interviews completed
Problem statement drafted and agreed by the team
Desirability rubric reviewed before interviews', 'Interview notes in the notebook
Problem statement entry'),
(3, '2026-08-24', '2026-08-28', 'Research — benchmark existing solutions and set design requirements.', 'research', 'Existing solutions compared (at least 3)
Requirements list written and ranked by the team', 'Research summary entry
Ranked requirements list'),
(4, '2026-08-31', '2026-09-04', 'Brainstorm — generate a wide range of possible concepts.', 'brainstorm', 'Individual sketch round completed
Team idea board built
3–6 candidate concepts selected for scoring', 'Concept sketches in the notebook or Evidence Vault'),
(5, '2026-09-07', '2026-09-11', 'Select a Concept — decision matrix and client check-in. Short week: Labor Day Monday.', 'select', 'Decision matrix completed as a team
Winning concept confirmed with the client', 'Completed decision matrix
Chosen-concept entry with rationale'),
(6, '2026-09-14', '2026-09-18', 'CAD & Prototype — model the concept, then build the first version.', 'prototype', 'CAD model of the chosen concept completed
Fabrication and supply requests submitted early
First prototype build underway', 'CAD log entries
Prototype photos in the Evidence Vault'),
(7, '2026-09-21', '2026-09-25', 'Test & Iterate — run your testing plan and fix what fails.', 'test', 'Testing plan executed and data recorded
At least one design iteration made from test results', 'Completed testing sheet
Iteration notes with before/after evidence'),
(8, '2026-09-28', '2026-10-02', 'Final Presentations & Reflection — present to your client and close out the project.', 'present', 'Final presentation delivered to client and class
Individual reflection written', 'Presentation delivered (planner in the library)
Reflection entries in the notebook');