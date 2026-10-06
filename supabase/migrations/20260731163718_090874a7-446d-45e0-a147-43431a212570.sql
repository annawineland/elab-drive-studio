CREATE TABLE public.resource_docs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  stage TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL DEFAULT '',
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_docs TO authenticated;
GRANT ALL ON public.resource_docs TO service_role;
ALTER TABLE public.resource_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read resource docs" ON public.resource_docs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers can create resource docs" ON public.resource_docs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Teachers can update resource docs" ON public.resource_docs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'teacher')) WITH CHECK (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Teachers can delete resource docs" ON public.resource_docs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'teacher'));
CREATE TRIGGER update_resource_docs_updated_at BEFORE UPDATE ON public.resource_docs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('engineering-notebook-guide', 'guide', $DOC$Engineering Notebook Guide$DOC$, $DOC$How to keep a professional engineering notebook — what to record, how to format entries, and how your notebook is graded.$DOC$, NULL, 10, $DOC$Your engineering notebook is the official record of your design work. Engineers in industry keep notebooks to document decisions, protect ideas, and communicate with their teams — yours does the same job, and it is the primary evidence your teacher uses to grade your process.

# Why the notebook matters

- It proves your thinking happened — not just your final product.
- It is your evidence for the rubrics: time management, desirability, and prototyping scores all point back to notebook entries.
- It lets teammates (and your teacher) understand decisions you made when they weren't in the room.
- It protects your ideas by dating them.

# What every entry needs

1. Date and title — what is this entry about?
2. Stage — which part of the design process are you in?
3. What you did — actions, decisions, and why you made them.
4. Evidence — sketches, photos, data tables, screenshots of CAD, or quotes from stakeholders.
5. What's next — open questions and your next step.

# Good notebook habits

- Write in real time, during work — not from memory days later.
- Never delete or cover up mistakes. Cross out, note what changed, and move on. Wrong turns are evidence of iteration.
- Sketch by hand and attach photos — a labeled sketch beats a paragraph.
- Record failures with the same care as successes.
- Credit teammates and cite outside sources.

! A rough entry written today beats a perfect entry written from memory next week.

# How your notebook is graded

Your teacher scores learning targets using your entries as evidence. When you respond to a stage mission, that entry is automatically linked to the mission — so working through missions in order builds your assessment record as you go. Check the Rubrics page to see exactly what Advanced and Proficient work looks like before you write.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('stakeholder-interview-guide', 'guide', $DOC$Stakeholder Interview Guide$DOC$, $DOC$How to plan, run, and document interviews with your client and other stakeholders so you capture real needs — in their words.$DOC$, 'understand', 20, $DOC$You cannot design a desirable solution for someone you don't understand. Stakeholder interviews are how engineering teams uncover the needs, frustrations, and constraints that never appear in a project brief.

# Before the interview

1. Do your homework — learn the stakeholder's context so you don't waste their time on basics.
2. Write 6–10 open-ended questions. Avoid anything answerable with yes/no.
3. Assign team roles: lead interviewer, note-taker, and observer.
4. Bring the Client Notes template (or open it in the app) to capture everything.

# During the interview

- Ask open questions: 'Tell me about the last time…' not 'Do you like…?'
- Follow up with 'why' — the real need is usually two or three whys deep.
- Let silence work. Stakeholders fill pauses with their best insights.
- Write down exact quotes, word for word, with the speaker's name.
- Watch what they do, not just what they say — note workarounds and frustrations.

# Questions that work

- Walk me through how you handle this today.
- What's the most frustrating part of that process?
- What have you tried before? Why didn't it stick?
- If you could wave a magic wand, what would change?
- Who else is affected by this problem?

# After the interview

1. Debrief as a team for 10 minutes while it's fresh — what surprised you?
2. Highlight every stated or implied need in your notes.
3. File the notes as a notebook entry in the Understand Problem stage.
4. Send a thank-you and confirm your understanding with the stakeholder.

! Record exact quotes — a stakeholder's own words are your strongest evidence for the Desirability rubric.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('research-guide', 'guide', $DOC$Research Guide$DOC$, $DOC$How to research a design problem like an engineer: asking the right questions, finding credible sources, and turning findings into design requirements.$DOC$, 'research', 30, $DOC$Research keeps you from reinventing the wheel — and from designing something that already failed. The goal is not a report; it is a set of design requirements your team can build from.

# Start with research questions

- What solutions already exist, and why are they not good enough?
- What science, materials, or mechanisms does this problem involve?
- What constraints are non-negotiable — cost, size, safety, regulations?
- Who has solved a similar problem in a different field?

# Where to look

- Existing products and reviews — user complaints are free research.
- Patent databases (Google Patents) — see how others solved the mechanism.
- Standards and safety codes relevant to your project.
- Forums and communities where your users actually talk.
- Your school's subject teachers — physics, chemistry, and math teachers are consultants.

# Evaluate every source

[ ] Current — is the information still accurate?
[ ] Credible — who published it and what is their expertise?
[ ] Biased — is someone trying to sell you something?
[ ] Corroborated — does at least one other source agree?

# Turn research into requirements

1. Summarize each finding in one sentence: what did you learn and where from?
2. Convert findings into measurable requirements ('must lift 2 kg', not 'must be strong').
3. Rank requirements: must-have vs. nice-to-have.
4. Log everything in a Research-stage notebook entry with sources cited.

! Every requirement should be measurable. If you can't test it, rewrite it until you can.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('brainstorming-guide', 'guide', $DOC$Brainstorming Guide$DOC$, $DOC$Rules and methods for generating a large quantity of genuinely different ideas — solo and as a team — before narrowing down.$DOC$, 'brainstorm', 40, $DOC$The first idea is rarely the best idea. Brainstorming is a discipline: separate idea generation from idea judgment, and push past the obvious solutions to find the interesting ones.

# The four rules

- Defer judgment — no criticizing, ranking, or 'that won't work' during generation.
- Encourage wild ideas — an impractical idea often sparks a practical breakthrough.
- Build on others' ideas — 'yes, and…' instead of 'no, but…'.
- Go for quantity — aim for 20+ ideas before you evaluate anything.

# Solo method: brainwriting

1. Set a timer for 10 minutes.
2. Sketch or write one idea per sticky note or notebook block — no filtering.
3. When stuck, combine two existing ideas into a new one.
4. Bring your notes to the team session; ideas multiply when shared.

# Team methods

- Round-robin: each person adds one idea in turn, no skipping, until everyone passes twice.
- SCAMPER: Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse — run your best idea through each lens.
- Worst-possible-idea: deliberately design terrible solutions, then invert them.
- How Might We: reframe the problem statement into 'How might we…?' questions and brainstorm each one.

# From 30 ideas to 5

1. Cluster similar ideas into themes.
2. Dot-vote: each member gets 3 votes for the most promising concepts.
3. Keep 4–6 finalists that are genuinely different from each other.
4. Log the full brainstorm and the shortlist in a Brainstorm-stage notebook entry.

! If every idea on your shortlist looks the same, you stopped too early — go back and force five ideas that break your assumptions.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('decision-matrix-guide', 'guide', $DOC$Decision Matrix Guide$DOC$, $DOC$How to choose between concepts objectively using weighted criteria — and how to document the decision so it stands up to scrutiny.$DOC$, 'select', 50, $DOC$Choosing a concept by gut feel invites bias and team conflict. A decision matrix makes your criteria explicit, weights what matters most to the client, and produces a defensible, documented decision.

# Build the matrix

1. List your finalist concepts across the top (3–6 options).
2. Choose 4–6 criteria down the side, drawn from your design requirements (e.g., cost, safety, ease of build, user appeal).
3. Weight each criterion 1–5 based on how much the client cares about it.
4. Score every concept 1–5 against every criterion.
5. Multiply score × weight and total each column. Highest total wins.

# Rules for honest scoring

- Score as a team, out loud — disagreements reveal misunderstood criteria.
- Score one criterion at a time across all concepts, not one concept at a time.
- Anchor your scale: define what a 1 and a 5 look like for each criterion before scoring.
- Never adjust weights after seeing totals — that is reverse-engineering the answer you wanted.

# Sanity check the winner

Ask: if the weight of our top criterion changed by one point, would the winner change? If yes, the decision is close — say so, and explain what tipped it. Then write a short rationale in your notebook: which concept won, why, and what you'll watch for as you prototype it. Use the Decision Matrix template to capture the full table.

! The matrix informs the decision — it doesn't make it. If the winner feels wrong, examine your criteria and weights, and write down why you overrode or accepted the result.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('cad-guide', 'guide', $DOC$CAD Guide$DOC$, $DOC$Professional CAD habits: setup, design intent, version control, and preparing clean files for fabrication.$DOC$, 'prototype', 60, $DOC$CAD is where your concept becomes a buildable object. Good CAD habits save hours at the printer and the laser cutter — and make your work understandable to teammates and fabricators.

# Set up before you model

- Confirm units (mm unless told otherwise) before the first sketch.
- Name every part and file descriptively: 'bracket-left-v3', never 'final-final-2'.
- One shared team folder — everyone models from the same files.
- Anchor your first sketch to the origin so assemblies behave predictably.

# Model with design intent

- Fully define sketches — dimensions and constraints, not eyeballed shapes.
- Drive dimensions from your requirements: if the part must clear a 40 mm bolt, dimension the 40 mm.
- Use parameters for anything likely to change (thickness, hole size) so edits don't rebuild the model.
- Model mating parts in one assembly to check fit before fabrication.

# Version and log

1. Save a new numbered version before every major change.
2. After each CAD session, write a CAD Log entry: what you modeled, what changed, and why.
3. Attach screenshots of key versions to your log — they're evidence for the Prototyping rubric.

# Preparing files for fabrication

- 3D printing: export STL at high resolution; check wall thickness and orientation for strength.
- Laser cutting: export DXF/SVG at true scale; account for kerf in slots and tabs.
- Always state critical dimensions and tolerances in your fabrication request.

! Check fit on screen before you check it in plastic — an assembly interference check is free, a failed print costs a day.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('prototype-guide', 'guide', $DOC$Prototype Guide$DOC$, $DOC$How to choose the right prototype fidelity, plan the build, work safely, and document everything for the Prototyping rubric.$DOC$, 'prototype', 70, $DOC$A prototype is a question, not an answer. Each version exists to test something specific — build the smallest, fastest thing that tests your riskiest assumption.

# Pick the right fidelity

- Looks-like: cardboard, foam, tape — tests size, shape, and ergonomics in hours.
- Works-like: rough mechanism from scrap — tests whether the core function is even possible.
- Looks-like-works-like: near-final materials — tests the real user experience.
- Match fidelity to the question. Don't 3D print what cardboard can answer.

# Plan the build

1. Write down the question this prototype answers before you touch materials.
2. List materials and check supplies — file a supply request early if something's missing.
3. Divide the build into sub-assemblies so teammates can work in parallel.
4. Estimate time honestly, then add 50% — builds always overrun.

# Shop safety

[ ] Safety glasses on before any tool starts.
[ ] Know where the emergency stops are for every machine you use.
[ ] Never use a tool you haven't been trained and signed off on.
[ ] Clean as you go — a cluttered bench causes accidents.

# Document as you build

Keep a Prototype Log entry per build session: what you built, photos at each stage, what worked, what broke, and what you'll change next. The Prototyping rubric rewards visible iteration — version 1, version 2, and the reason version 3 exists.

! Photograph failures immediately. A broken part with a note about why it broke is some of the most valuable evidence in your notebook.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('testing-guide', 'guide', $DOC$Testing Guide$DOC$, $DOC$How to design fair tests, collect trustworthy data, and turn results into iteration decisions.$DOC$, 'test', 80, $DOC$Testing is how you find out whether your design actually works — before your client does. A good test is planned before it's run, repeated enough to trust, and reported honestly whether it passes or fails.

# Design the test

1. Write a hypothesis: 'We expect ___ when ___ because ___.'
2. Write a procedure another team could follow exactly — steps, tools, settings.
3. Identify variables: what you change, what you measure, what you hold constant.
4. Build a data table before testing so you can't cherry-pick results afterward.
5. Plan at least 3 trials per condition; 5 is better.

# While testing

- Record everything, including runs that went wrong — note why and re-run.
- One person runs the test, another records — swap roles between trials.
- Photograph or film each trial; raw test data is a required mission artifact.
- Never round, estimate, or 'fix' a measurement after the fact.

# Analyze honestly

Compute averages, look at the spread between trials, and compare results against your requirements — not against your hopes. If the design failed a test, that is a successful experiment: you learned something before the client did. Say so plainly in your Testing Log.

# From results to iteration

Every test should end with a decision: pass and move on, or fail and iterate. State the decision and the specific change you'll make, then log it — that decision trail is what the Iterate stage is made of. Use the Testing Sheet template to capture each test cleanly.

! Test one change at a time. If you change two things and performance improves, you'll never know which one did it.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('presentation-guide', 'guide', $DOC$Presentation Guide$DOC$, $DOC$How to structure, design, rehearse, and deliver a final presentation that does your engineering work justice.$DOC$, 'present', 90, $DOC$Engineers win or lose work in presentations. Your final presentation is the story of a real problem, a real client, and a tested solution — tell it like one.

# Structure the story

1. The need: who has the problem and why it matters (use the client's own words).
2. The journey: key decisions, dead ends, and what you learned — briefly.
3. The solution: what you built and how it works.
4. The evidence: test data that proves it meets requirements.
5. The ask: next steps, limitations, and what you'd do with more time.

# Slides that work

- One idea per slide; big visuals, few words.
- Photos of your actual prototypes beat clip art every time.
- Show real data in simple charts — label axes and units.
- Check readability from the back of the room.

# The live demo

- A working 30-second demo outweighs five slides of claims.
- Have a backup plan: photos and video ready if the demo fails.
- Assign one person to run the demo — everyone else stays in role.

# Rehearse like engineers

1. Run the full presentation out loud at least twice, timed.
2. Every speaker practices their transitions — handoffs are where presentations stumble.
3. Anticipate the three hardest questions and assign who answers each.
4. Use the Presentation Planner template to lock in roles and outline.

! If something failed during the project, say what you learned instead of hiding it — engineers who own their failures are trusted with bigger problems.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('reflection-guide', 'guide', $DOC$Reflection Guide$DOC$, $DOC$How to write honest, specific reflections that connect your project experience to your growth as an engineer.$DOC$, 'reflect', 100, $DOC$Reflection is where experience becomes learning. A good reflection is specific, honest, and connected to evidence — not a victory lap or an apology.

# Individual prompts

- What decision would you make differently, and what do you know now that you didn't then?
- Where did you grow the most — a skill, a habit, or an attitude?
- What did you contribute that the team couldn't have done without?
- Which notebook entry are you proudest of, and why?

# Team prompts

- When did the team work best together? What conditions made that possible?
- Where did communication break down, and what will you change next project?
- Did everyone carry a fair share? How do you know?
- What would you tell next year's teams to do in week one?

# Connect to your learning targets

Look at your rubric scores for time management, desirability, and prototyping. For each one, cite the evidence that earned the level and name one concrete thing that would move you up a level next time. Use the Reflection Template to structure it.

! Specific beats vague: 'I learned to communicate better' says nothing; 'I started posting my task status before standup after I blocked Maya for two days' says everything.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('engineering-ethics-guide', 'guide', $DOC$Engineering Ethics Guide$DOC$, $DOC$The professional standards engineers are held to — safety, honest data, credit, and responsibility — and how they apply to your project.$DOC$, NULL, 110, $DOC$Engineering codes of ethics exist because engineering failures hurt people. The same standards that govern professional engineers apply to your project — scaled down, but never optional.

# Safety first

- Hold safety above schedule, budget, and grades — always.
- Report hazards immediately, even if you caused them.
- Design for the user who misuses your product, not just the one who reads instructions.

# Honest data

- Report failed tests with the same prominence as passed ones.
- Never adjust, omit, or invent data to make results look better.
- State uncertainty: '3 trials, results varied by 15%' is honest; 'it works' is not.

# People and credit

- Cite every source, image, and idea that isn't yours.
- Credit teammates accurately — in notebooks, presentations, and reflections.
- Keep client information confidential; ask before quoting them publicly.
- Give feedback that is honest and kind; receive it without defensiveness.

# Sustainability

- Choose materials and processes with waste in mind.
- Design for repair and reuse where you can.
- Count the full cost of your solution — including disposal.

! The ethical test: would you be comfortable defending this decision in front of your client, your teacher, and the person most affected by it?$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('time-management-guide', 'guide', $DOC$Time Management Guide$DOC$, $DOC$How engineering teams plan backward from deadlines, run sprints, and use daily standups to deliver on time — the core of the Time Management rubric.$DOC$, NULL, 120, $DOC$Projects don't fail at the deadline — they fail in week two, quietly. Time management in engineering is a team discipline: plan backward, work in sprints, surface blockers daily.

# Plan backward from the deadline

1. Put the final presentation date on the calendar first.
2. Work backward: testing needs a week, so the prototype must work by ___.
3. Mark the stage gates for each workflow stage and agree on them as a team.
4. Leave the final week for iteration and rehearsal — never for first-time fabrication.

# Run your week in sprints

- Plan each sprint with the Sprint Planner template: one goal, few tasks, clear owners.
- Every task has a 'definition of done' — agreed before work starts.
- Move tasks on the Kanban board daily so the whole team sees real status.
- End each sprint by asking: what's done, what slipped, and why?

# The daily 5-minute standup

- What did I finish since yesterday?
- What will I finish today?
- What's blocking me — and who can unblock it?

# Avoiding crunch

If you're behind, cut scope — don't cut testing or documentation. A smaller solution that works beats an ambitious one that doesn't. Raise schedule risks in your team's Risk Register the moment you see them, not the night before the deadline.

! If everything is a priority, nothing is. Each sprint, name the ONE task that matters most and protect it.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('manufacturing-guide', 'guide', $DOC$Manufacturing Guide$DOC$, $DOC$How to choose a fabrication process, design parts that can actually be made, and submit clean fabrication requests.$DOC$, 'prototype', 130, $DOC$A design isn't finished when it looks right on screen — it's finished when it can be made, repeatedly, within tolerance. Designing for manufacturing means respecting the limits of the process before you commit to it.

# Choose the process

- 3D printing: complex shapes, low strength in layer direction, slow — best for prototypes and small parts.
- Laser cutting: fast, precise flat parts from sheet material — best for enclosures, brackets, and linkages.
- Hand tools and shop tools: strong, quick for simple geometry — best for structural frames and one-offs.
- Combine processes: laser-cut frame + printed brackets beats forcing one process to do everything.

# Design for the process

[ ] 3D printing: walls ≥ 1.2 mm, avoid unsupported overhangs past 45°, orient for strength.
[ ] Laser cutting: account for kerf (~0.1–0.3 mm) in press-fits; keep features larger than material thickness.
[ ] All processes: can the tool actually reach this feature?
[ ] Check your school's available materials before designing around them.

# Tolerance and fit

No machine makes exact dimensions. Decide which dimensions are critical, state their tolerances ('20.0 ± 0.2 mm'), and design clearances for everything else. For mating parts, prototype the interface first — a small test fit coupon saves a full failed print.

# Submitting a fabrication request

1. Prepare the file (STL or DXF) and verify it opens correctly.
2. Fill in the Fabrication Request template: material, quantity, critical dimensions, deadline.
3. Submit it through Supply Requests in the app and watch the queue for approval.
4. Pick up parts promptly and inspect them against your drawing before assembly.

! Talk to the fabricator before you finalize the design. Ten minutes of questions saves a week of rework.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('sprint-planner', 'template', $DOC$Sprint Planner$DOC$, $DOC$Plan one week of team work: a single goal, owned tasks, and a shared definition of done.$DOC$, NULL, 140, $DOC$Fill this out at the start of every sprint — one page, five minutes, whole team. Keep it visible and check tasks off on the Kanban board as they move.

# Template

@ Sprint name | A short, memorable name for the week — e.g., 'Drivetrain Week'.

@ Sprint goal | ONE sentence: what will be true at the end of this sprint that isn't true now?

@ Dates | Start and end date. A sprint is one school week by default.

@ Tasks & owners | Each task: what, who, and its definition of done. No ownerless tasks.

@ Definition of done (sprint) | How will you demonstrate the goal is met — a working mechanism, a logged test, a reviewed drawing?

@ Risks | What could derail this sprint? Add big ones to the Risk Register.

! If a task can't be finished inside one sprint, split it — half-done tasks hide schedule risk.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('meeting-minutes', 'template', $DOC$Meeting Minutes$DOC$, $DOC$Capture what was discussed, what was decided, and who owes what — so no decision evaporates.$DOC$, NULL, 150, $DOC$Minutes are the memory of your team. Record decisions and action items during the meeting, not after — and file them in the app under Meeting Minutes the same day.

# Template

@ Date & attendees | Who was present, and who was absent.

@ Agenda | The 2–4 things this meeting must accomplish.

@ Discussion notes | Key points only — bullet fragments, not transcripts.

@ Decisions made | Each decision stated as a sentence: 'We will…'. This section is mandatory.

@ Action items | Who does what by when. Every item has exactly one owner.

! Read the action items aloud at the end of the meeting — if someone is surprised, the minute is wrong.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('decision-matrix', 'template', $DOC$Decision Matrix$DOC$, $DOC$Score concepts against weighted criteria to make a documented, defensible selection.$DOC$, NULL, 160, $DOC$Use this with the Decision Matrix Guide. Score as a team, one criterion at a time, and never touch the weights after seeing totals.

# Template

@ Concepts | Your 3–6 finalists, named and sketched.

@ Criteria & weights | 4–6 criteria from your requirements, each weighted 1–5 by client importance.

@ Scoring anchors | For each criterion, what does a 1 look like? What does a 5 look like?

@ Score table | Score × weight for every cell; total each column.

@ Decision & rationale | The winner, why, and what you'll watch for as you prototype it.

! Attach the completed matrix to your Select-stage notebook entry — it's strong rubric evidence for a justified selection.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('client-notes', 'template', $DOC$Client Notes$DOC$, $DOC$Structure for capturing a client meeting: their goals, exact quotes, constraints, and follow-ups.$DOC$, NULL, 170, $DOC$Bring this to every client interaction. The client's own words are the backbone of your need statement and your desirability evidence.

# Template

@ Meeting date & attendees | Who from the client side and who from your team.

@ Client's goals in their words | Summarize, then mark anything you paraphrased vs. quoted.

@ Key quotes | Exact sentences, in quotation marks, with the speaker's name.

@ Constraints & requirements | Budget, deadlines, size limits, must-haves, deal-breakers.

@ Open questions | What you still don't know and who can answer it.

@ Follow-ups | What you promised to send or check, and by when.

! Send the client a short recap within a day — catching a misunderstanding now is free; catching it after fabrication is not.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('testing-sheet', 'template', $DOC$Testing Sheet$DOC$, $DOC$One page per test: hypothesis, procedure, raw data, and the decision the results force.$DOC$, NULL, 180, $DOC$Fill in everything above the data table before you run a single trial. Pair this with the Testing Guide.

# Template

@ Test name & date | Name the requirement this test checks — e.g., 'Lift capacity ≥ 2 kg'.

@ Hypothesis | We expect ___ when ___ because ___.

@ Procedure | Numbered steps another team could repeat exactly.

@ Variables | What you change, what you measure (with units), what you hold constant.

@ Data table | Trial number, measurements, notes — at least 3 trials per condition.

@ Results | Average, spread, and pass/fail against the requirement.

@ Decision & next step | Pass and move on, or iterate — and the specific change you'll make.

! File the completed sheet as a Testing Log entry — raw test data is a required Test-stage mission artifact.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('fabrication-request', 'template', $DOC$Fabrication Request$DOC$, $DOC$Everything a fabricator needs to make your part correctly the first time.$DOC$, NULL, 190, $DOC$A clear fabrication request gets parts made right the first time. Submit it through Supply Requests in the app with these details attached.

# Template

@ Part name & file | Descriptive name plus the STL/DXF file or a Drive link.

@ Material | Specific material and thickness — '3 mm birch plywood', not 'wood'.

@ Quantity | How many, plus spares if the part is fragile.

@ Critical dimensions & tolerances | Which dimensions must be exact, and how exact — e.g., 'hole Ø 20.0 ± 0.2 mm'.

@ Needed by | Real date, tied to your sprint plan — not 'ASAP'.

@ Notes for the fabricator | Orientation, finish, or anything not obvious from the file.

! Check the Manufacturing Guide's design-for-process checklist before submitting — it catches most failed builds.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('supply-request', 'template', $DOC$Supply Request$DOC$, $DOC$Request materials or supplies with enough justification for a fast approval.$DOC$, NULL, 200, $DOC$Requests get approved fastest when the purpose is clear. Submit through Supply Requests in the app; use this structure for the details field.

# Template

@ Item | Exact item — name, size, spec, or a link to the product.

@ Quantity | How much you need, including reasonable spares.

@ Purpose | What this enables in your project — tie it to a requirement or test.

@ Needed by | The sprint or build session it supports.

@ Budget estimate | Approximate cost and where you found it.

! Check the lab's existing stock first — a request for something already on the shelf slows down the queue for everyone.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('reflection-template', 'template', $DOC$Reflection Template$DOC$, $DOC$A structure for honest end-of-stage or end-of-project reflections tied to your learning targets.$DOC$, NULL, 210, $DOC$Use at the end of each major stage and at project close. Answer in specifics — name entries, dates, and decisions. Pair with the Reflection Guide.

# Template

@ What went well | Two or three specifics, with evidence — entries, tests, moments.

@ What was hard | The honest version. What cost you time, quality, or team energy?

@ What I learned | A skill, a concept, or something about how you work.

@ Evidence I can point to | Notebook entries, test sheets, or CAD versions that prove the growth.

@ My learning targets | For time management, desirability, and prototyping: where am I, and what would move me up a level?

@ Next steps | One to three concrete commitments for the next stage or project.

! Write it while the stage is fresh — reflections written the day the stage ends are worth twice the ones written at semester's end.$DOC$);

INSERT INTO public.resource_docs (slug, kind, title, summary, stage, sort_order, body) VALUES ('presentation-planner', 'template', $DOC$Presentation Planner$DOC$, $DOC$Lock in your message, outline, roles, and rehearsal schedule before you open your slide tool.$DOC$, NULL, 220, $DOC$Plan the presentation on paper first. Every decision here is cheaper than a decision made while staring at slides. Pair with the Presentation Guide.

# Template

@ Audience | Who is in the room and what do they care about most?

@ One-sentence message | If they remember one thing: 'We built ___ that ___ for ___.'

@ Story outline | Need → journey → solution → evidence → ask. One line per beat.

@ Visuals & demo plan | Which photos, charts, and the 30-second live demo — plus the backup plan.

@ Speaker roles | Who covers which section, and who runs the demo and Q&A.

@ Rehearsal schedule | Two full timed run-throughs, with dates.

@ Anticipated questions | The three hardest questions and who answers each.

! Time the rehearsal and cut the weakest content first — every minute over the limit taxes your audience's attention.$DOC$);

ALTER PUBLICATION supabase_realtime ADD TABLE public.resource_docs;