CREATE TABLE public.stage_guides (
  id uuid not null default gen_random_uuid() primary key,
  stage text not null unique,
  title text not null,
  instructions text not null default '',
  sort_order integer not null default 0,
  updated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now()
);
GRANT SELECT, UPDATE ON public.stage_guides TO authenticated;
GRANT ALL ON public.stage_guides TO service_role;
ALTER TABLE public.stage_guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users view stage guides" ON public.stage_guides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers update stage guides" ON public.stage_guides FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role)) WITH CHECK (has_role(auth.uid(), 'teacher'::app_role));

CREATE TABLE public.stage_missions (
  id uuid not null default gen_random_uuid() primary key,
  stage text not null,
  title text not null,
  prompt text not null default '',
  sort_order integer not null default 0,
  updated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_missions TO authenticated;
GRANT ALL ON public.stage_missions TO service_role;
ALTER TABLE public.stage_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users view stage missions" ON public.stage_missions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers manage stage missions" ON public.stage_missions FOR ALL TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role)) WITH CHECK (has_role(auth.uid(), 'teacher'::app_role));

ALTER TABLE public.entries ADD COLUMN mission_id uuid REFERENCES public.stage_missions(id) ON DELETE SET NULL;

INSERT INTO public.stage_guides (stage, title, instructions, sort_order) VALUES
('kickoff', 'Client Kickoff', 'Meet your client and capture the need in their own words. Agree as a team on what success looks like before you design anything — every later decision gets checked against what you record here.', 1),
('understand', 'Understand the Problem', 'Dig into the problem until you can explain it to someone outside your team. Identify who is affected, what they need, and the constraints you must design within.', 2),
('research', 'Research', 'Gather evidence before you generate ideas. Look for existing solutions, credible sources, and stakeholder perspectives. Log everything useful — you will cite it later.', 3),
('brainstorm', 'Brainstorm', 'Go for quantity, not perfection. Sketch every idea, even wild ones — judgment comes later. Build on each other''s thinking and push past the obvious.', 4),
('select', 'Select a Concept', 'Compare your strongest ideas against the success criteria from kickoff. Use evidence, not opinions, to choose one concept to carry forward.', 5),
('prototype', 'Prototype', 'Build to learn, not to impress. A prototype exists to answer a question about your design. Document what you build, what you changed, and why.', 6),
('test', 'Test', 'Measure your prototype against the success criteria. Record raw data honestly — unexpected results are the most valuable kind.', 7),
('iterate', 'Iterate', 'Use your test results to decide what to change. Each iteration should fix a specific, documented problem. Engineers iterate — that''s the job.', 8),
('present', 'Present', 'Tell the story of your design to your client: the problem, your evidence, your solution, and your results. Anticipate questions and answer them with data.', 9),
('reflect', 'Reflect', 'Look back at the whole project. Honest reflection on what worked, what failed, and what you learned is what turns a project into growth.', 10);

INSERT INTO public.stage_missions (stage, title, prompt, sort_order) VALUES
('kickoff', 'Client Need Statement', 'In the client''s own words: who is the client, what do they need, and why does it matter to them?', 1),
('kickoff', 'Constraints & Success Criteria', 'List every constraint (budget, time, materials, safety) and 3–5 measurable criteria that will define a successful solution.', 2),
('kickoff', 'Team Agreement', 'Record your team roles, meeting norms, and how you will make decisions when you disagree.', 3),
('understand', 'Problem Statement', 'Write a "How might we…" statement that frames the problem without jumping to a solution.', 1),
('understand', 'Stakeholder Map', 'Who is affected by this problem? List the stakeholders and what each one needs from a solution.', 2),
('understand', 'Current Solutions Scan', 'What solutions already exist? Document at least two and explain where each one falls short.', 3),
('research', 'Source Log', 'Log at least three credible sources (articles, data, experts) with a one-line takeaway from each.', 1),
('research', 'Interview Notes', 'Interview a stakeholder or expert and record the questions you asked and the most surprising answers.', 2),
('research', 'Key Findings', 'Summarize the findings that most changed your team''s thinking about the problem.', 3),
('brainstorm', 'Idea Wall', 'Sketch or describe at least 10 distinct ideas. Quantity over quality — no filtering yet.', 1),
('brainstorm', 'Idea Stretch', 'Take your two most ordinary ideas and push each one further (combine, reverse, scale). Record the results.', 2),
('brainstorm', 'Top Three', 'Pick your three strongest ideas and give one sentence of evidence for each.', 3),
('select', 'Decision Matrix', 'Score your top concepts against the success criteria from kickoff. Include the matrix and the scores.', 1),
('select', 'Chosen Concept', 'Name the concept you are carrying forward and justify the choice with evidence from your matrix and research.', 2),
('select', 'Concept Sketch', 'Post a labeled sketch or CAD screenshot of the chosen concept with key dimensions or features called out.', 3),
('prototype', 'Build Plan', 'Before building: list materials, tools, and steps. What question is this prototype meant to answer?', 1),
('prototype', 'Prototype Log v1', 'Document your first build — photos or links, what worked during the build, and what you changed on the fly.', 2),
('prototype', 'Plan vs. Reality', 'What differed between your build plan and what actually happened? What will you change in the next version?', 3),
('test', 'Testing Plan', 'Define what you will measure, how you will measure it, and how many trials you will run.', 1),
('test', 'Raw Test Data', 'Record your raw results — numbers, observations, photos. Include failures.', 2),
('test', 'Results vs. Criteria', 'Compare your results against each success criterion from kickoff: met, partially met, or not met — with evidence.', 3),
('iterate', 'Failure Analysis', 'Pick the most important thing that did not work and explain why, using your test data.', 1),
('iterate', 'Design Changes', 'List the specific changes you made for the next iteration and the evidence behind each one.', 2),
('iterate', 'Re-Test Results', 'Test the improved version and record whether the changes actually fixed the problem.', 3),
('present', 'Presentation Storyboard', 'Outline your presentation: the problem, your evidence, the solution, and the results — in order.', 1),
('present', 'Delivery Reflection', 'After presenting: how did it go? What landed well with the client, and what did not?', 2),
('present', 'Q&A Log', 'Record the questions your client or audience asked and how your team answered each one.', 3),
('reflect', 'Individual Reflection', 'What did you personally learn — about engineering, about your client, about working on a team?', 1),
('reflect', 'Team Retrospective', 'As a team: what would you do differently if you started this project over today?', 2),
('reflect', 'Growth Evidence', 'Point to a specific moment or entry in this notebook where your thinking leveled up, and explain why it mattered.', 3);