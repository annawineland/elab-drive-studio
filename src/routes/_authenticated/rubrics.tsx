import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Award, Link2, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyTeam } from "@/hooks/use-my-team";
import {
  RUBRIC_LEVELS,
  rubricLevelLabel,
  type LearningTarget,
  type RubricCriterion,
  type RubricScore,
} from "@/lib/rubrics";
import { WORKFLOW_STAGES, stageLabel } from "@/lib/studio";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/studio-ui";
import { RubricLevelChip } from "@/components/rubric-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/rubrics")({
  head: () => ({
    meta: [
      { title: "Rubrics — Engineering Studio" },
      {
        name: "description",
        content:
          "Learning-target rubrics for the engineering design studio: Advanced and Proficient criteria for Time Management, Desirability, and Prototyping, with teacher scoring tied to notebook evidence.",
      },
      { property: "og:title", content: "Rubrics — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RubricsPage,
});

interface StudentOption {
  id: string;
  full_name: string;
}

interface TeamOption {
  id: string;
  name: string;
}

interface EntryOption {
  id: string;
  title: string;
}

const LEVEL_TEXT: Record<string, string> = {
  advanced: "text-success",
  proficient: "text-primary",
  developing: "text-warning",
};

const LEVEL_DOTS: Record<string, string> = {
  advanced: "bg-success",
  proficient: "bg-primary",
  developing: "bg-warning",
};

function RubricsPage() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const { data: team } = useMyTeam();
  const isTeacher = role === "teacher";

  const targets = useQuery({
    queryKey: ["learning-targets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_targets")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as LearningTarget[];
    },
  });

  const criteria = useQuery({
    queryKey: ["rubric-criteria"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rubric_criteria")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as RubricCriterion[];
    },
  });

  const scores = useQuery({
    queryKey: ["rubric-scores", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("rubric_scores").select("*");
      if (error) throw error;
      return data as RubricScore[];
    },
  });

  // ---------- Teacher rosters for scoring ----------
  const students = useQuery({
    queryKey: ["rubric-students"],
    enabled: isTeacher,
    queryFn: async () => {
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");
      if (roleErr) throw roleErr;
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as StudentOption[];
      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (profErr) throw profErr;
      return (profs ?? [])
        .map((p) => ({ id: p.id, full_name: p.full_name || "Unnamed student" }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name)) as StudentOption[];
    },
  });

  const teams = useQuery({
    queryKey: ["rubric-teams"],
    enabled: isTeacher,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as TeamOption[];
    },
  });

  const studentNameById = useMemo(
    () => new Map((students.data ?? []).map((s) => [s.id, s.full_name])),
    [students.data],
  );
  const teamNameById = useMemo(
    () => new Map((teams.data ?? []).map((t) => [t.id, t.name])),
    [teams.data],
  );

  // Titles of entries linked as score evidence
  const evidenceIds = useMemo(
    () =>
      Array.from(
        new Set(
          (scores.data ?? [])
            .map((s) => s.entry_id)
            .filter((id): id is string => !!id),
        ),
      ),
    [scores.data],
  );
  const evidenceEntries = useQuery({
    queryKey: ["rubric-score-evidence", evidenceIds],
    enabled: evidenceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, title")
        .in("id", evidenceIds);
      if (error) throw error;
      return (data ?? []) as EntryOption[];
    },
  });
  const evidenceTitleById = useMemo(
    () => new Map((evidenceEntries.data ?? []).map((e) => [e.id, e.title])),
    [evidenceEntries.data],
  );

  // ---------- Teacher: edit learning target ----------
  const [targetDialog, setTargetDialog] = useState(false);
  const [editingTarget, setEditingTarget] = useState<LearningTarget | null>(null);
  const [targetTitle, setTargetTitle] = useState("");
  const [targetDescription, setTargetDescription] = useState("");
  const [targetStage, setTargetStage] = useState("all");

  const openEditTarget = (t: LearningTarget) => {
    setEditingTarget(t);
    setTargetTitle(t.title);
    setTargetDescription(t.description);
    setTargetStage(t.stage ?? "all");
    setTargetDialog(true);
  };

  const saveTarget = useMutation({
    mutationFn: async () => {
      if (!editingTarget) throw new Error("No target selected");
      const { error } = await supabase
        .from("learning_targets")
        .update({
          title: targetTitle.trim(),
          description: targetDescription.trim(),
          stage: targetStage === "all" ? null : targetStage,
        })
        .eq("id", editingTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Learning target updated");
      setTargetDialog(false);
      queryClient.invalidateQueries({ queryKey: ["learning-targets"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ---------- Teacher: criteria management ----------
  const [criterionDialog, setCriterionDialog] = useState(false);
  const [criterionTarget, setCriterionTarget] = useState<LearningTarget | null>(null);
  const [editingCriterion, setEditingCriterion] = useState<RubricCriterion | null>(null);
  const [criterionLevel, setCriterionLevel] = useState("proficient");
  const [criterionText, setCriterionText] = useState("");

  const openNewCriterion = (t: LearningTarget) => {
    setCriterionTarget(t);
    setEditingCriterion(null);
    setCriterionLevel("proficient");
    setCriterionText("");
    setCriterionDialog(true);
  };

  const openEditCriterion = (t: LearningTarget, c: RubricCriterion) => {
    setCriterionTarget(t);
    setEditingCriterion(c);
    setCriterionLevel(c.level);
    setCriterionText(c.criterion);
    setCriterionDialog(true);
  };

  const saveCriterion = useMutation({
    mutationFn: async () => {
      if (!criterionTarget) throw new Error("No target selected");
      if (editingCriterion) {
        const { error } = await supabase
          .from("rubric_criteria")
          .update({ criterion: criterionText.trim(), level: criterionLevel })
          .eq("id", editingCriterion.id);
        if (error) throw error;
      } else {
        const siblings = (criteria.data ?? []).filter(
          (c) => c.target_id === criterionTarget.id && c.level === criterionLevel,
        );
        const nextOrder = Math.max(0, ...siblings.map((c) => c.sort_order)) + 1;
        const { error } = await supabase.from("rubric_criteria").insert({
          target_id: criterionTarget.id,
          level: criterionLevel,
          criterion: criterionText.trim(),
          sort_order: nextOrder,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingCriterion ? "Criterion updated" : "Criterion added");
      setCriterionDialog(false);
      queryClient.invalidateQueries({ queryKey: ["rubric-criteria"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeCriterion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rubric_criteria").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Criterion removed");
      queryClient.invalidateQueries({ queryKey: ["rubric-criteria"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ---------- Teacher: scoring ----------
  const [scoreDialog, setScoreDialog] = useState(false);
  const [scoreTarget, setScoreTarget] = useState<LearningTarget | null>(null);
  const [editingScore, setEditingScore] = useState<RubricScore | null>(null);
  const [subjectType, setSubjectType] = useState<"student" | "team">("student");
  const [scoreStudentId, setScoreStudentId] = useState("");
  const [scoreTeamId, setScoreTeamId] = useState("");
  const [scoreLevel, setScoreLevel] = useState("proficient");
  const [scoreEntryId, setScoreEntryId] = useState("none");
  const [scoreNote, setScoreNote] = useState("");

  const openScore = (t: LearningTarget, existing?: RubricScore) => {
    setScoreTarget(t);
    setEditingScore(existing ?? null);
    if (existing) {
      setSubjectType(existing.student_id ? "student" : "team");
      setScoreStudentId(existing.student_id ?? "");
      setScoreTeamId(existing.team_id ?? "");
      setScoreLevel(existing.level);
      setScoreEntryId(existing.entry_id ?? "none");
      setScoreNote(existing.note);
    } else {
      setSubjectType("student");
      setScoreStudentId("");
      setScoreTeamId("");
      setScoreLevel("proficient");
      setScoreEntryId("none");
      setScoreNote("");
    }
    setScoreDialog(true);
  };

  const subjectEntries = useQuery({
    queryKey: ["rubric-subject-entries", scoreStudentId],
    enabled: scoreDialog && subjectType === "student" && !!scoreStudentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, title")
        .eq("user_id", scoreStudentId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as EntryOption[];
    },
  });

  const saveScore = useMutation({
    mutationFn: async () => {
      if (!scoreTarget) throw new Error("No target selected");
      const entryId = scoreEntryId === "none" ? null : scoreEntryId;
      if (editingScore) {
        const { error } = await supabase
          .from("rubric_scores")
          .update({ level: scoreLevel, note: scoreNote.trim(), entry_id: entryId })
          .eq("id", editingScore.id);
        if (error) throw error;
        return;
      }
      const existing = (scores.data ?? []).find(
        (s) =>
          s.target_id === scoreTarget.id &&
          (subjectType === "student"
            ? s.student_id === scoreStudentId
            : s.team_id === scoreTeamId),
      );
      const payload = {
        target_id: scoreTarget.id,
        teacher_id: user!.id,
        student_id: subjectType === "student" ? scoreStudentId : null,
        team_id: subjectType === "team" ? scoreTeamId : null,
        level: scoreLevel,
        note: scoreNote.trim(),
        entry_id: entryId,
      };
      if (existing) {
        const { error } = await supabase
          .from("rubric_scores")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rubric_scores").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingScore ? "Score updated" : "Score recorded — student can see it now");
      setScoreDialog(false);
      queryClient.invalidateQueries({ queryKey: ["rubric-scores"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeScore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rubric_scores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Score removed");
      queryClient.invalidateQueries({ queryKey: ["rubric-scores"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const scoreSubjectValid =
    subjectType === "student" ? !!scoreStudentId : !!scoreTeamId;

  const loading = targets.isLoading || criteria.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assessment"
        title="Learning-Target Rubrics"
        description={
          isTeacher
            ? "Edit criteria anytime — students see changes immediately. Score a student or a whole team, and link the notebook entry that serves as evidence."
            : "This is exactly how your work is graded. Read the criteria, aim for Advanced, and check back here for your teacher's scores."
        }
      />

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      )}

      {!loading && (targets.data ?? []).length === 0 && (
        <EmptyState
          icon={Target}
          title="No learning targets yet"
          description="Learning targets with rubric criteria will appear here once they're set up."
        />
      )}

      {!loading &&
        (targets.data ?? []).map((t) => {
          const targetCriteria = (criteria.data ?? []).filter((c) => c.target_id === t.id);
          const byLevel = (level: string) =>
            targetCriteria.filter((c) => c.level === level);
          const targetScores = (scores.data ?? []).filter((s) => s.target_id === t.id);
          const myScore = targetScores.find((s) => s.student_id === user?.id);
          const teamScore = targetScores.find(
            (s) => s.team_id && s.team_id === team?.id,
          );
          const showDeveloping = byLevel("developing").length > 0;

          return (
            <Card key={t.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                      {t.title}
                      <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {t.stage ? stageLabel(t.stage) : "All stages"}
                      </span>
                    </CardTitle>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isTeacher ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openScore(t)}>
                          <Award className="mr-1.5 h-4 w-4" /> Score
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openNewCriterion(t)}
                        >
                          <Plus className="mr-1.5 h-4 w-4" /> Criterion
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditTarget(t)}
                          aria-label="Edit learning target"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      myScore && <RubricLevelChip level={myScore.level} />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t.description}</p>

                {/* Student score banner */}
                {!isTeacher && (
                  <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                    {myScore || teamScore ? (
                      <div className="space-y-2">
                        {myScore && (
                          <ScoreLine
                            label="Your level"
                            score={myScore}
                            evidenceTitle={
                              myScore.entry_id
                                ? evidenceTitleById.get(myScore.entry_id)
                                : undefined
                            }
                          />
                        )}
                        {teamScore && (
                          <ScoreLine
                            label={`Team level${team ? ` — ${team.name}` : ""}`}
                            score={teamScore}
                            evidenceTitle={
                              teamScore.entry_id
                                ? evidenceTitleById.get(teamScore.entry_id)
                                : undefined
                            }
                          />
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Not scored yet — your teacher scores this target from your
                        notebook evidence.
                      </p>
                    )}
                  </div>
                )}

                {/* Criteria columns */}
                <div
                  className={cn(
                    "grid gap-3 md:grid-cols-2",
                    showDeveloping && "lg:grid-cols-3",
                  )}
                >
                  {RUBRIC_LEVELS.filter(
                    (l) => l.key !== "developing" || showDeveloping,
                  ).map((l) => (
                    <div
                      key={l.key}
                      className="rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <p
                        className={cn(
                          "pb-2 font-mono text-[10px] font-bold uppercase tracking-wider",
                          LEVEL_TEXT[l.key],
                        )}
                      >
                        {l.label}
                      </p>
                      {byLevel(l.key).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No criteria listed.</p>
                      ) : (
                        <ul className="space-y-2">
                          {byLevel(l.key).map((c) => (
                            <li
                              key={c.id}
                              className="group flex items-start gap-2 text-sm text-muted-foreground"
                            >
                              <span
                                className={cn(
                                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                                  LEVEL_DOTS[c.level],
                                )}
                              />
                              <span className="min-w-0 flex-1">{c.criterion}</span>
                              {isTeacher && (
                                <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                  <button
                                    onClick={() => openEditCriterion(t, c)}
                                    aria-label="Edit criterion"
                                    className="rounded p-1 hover:bg-muted"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => removeCriterion.mutate(c.id)}
                                    aria-label="Delete criterion"
                                    className="rounded p-1 hover:bg-muted"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </button>
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>

                {/* Teacher: recorded scores */}
                {isTeacher && targetScores.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-label text-muted-foreground">Recorded scores</p>
                    {targetScores.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2"
                      >
                        <span className="text-sm font-medium">
                          {s.student_id
                            ? (studentNameById.get(s.student_id) ?? "Student")
                            : `Team: ${s.team_id ? (teamNameById.get(s.team_id) ?? "Team") : "Team"}`}
                        </span>
                        <RubricLevelChip level={s.level} />
                        {s.entry_id && evidenceTitleById.get(s.entry_id) && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Link2 className="h-3 w-3" />
                            {evidenceTitleById.get(s.entry_id)}
                          </span>
                        )}
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {format(new Date(s.updated_at), "MMM d, yyyy")}
                        </span>
                        <span className="ml-auto flex gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openScore(t, s)}
                            aria-label="Edit score"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeScore.mutate(s.id)}
                            aria-label="Delete score"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </span>
                        {s.note && (
                          <p className="w-full text-xs text-muted-foreground">{s.note}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

      {/* Teacher: edit target dialog */}
      <Dialog open={targetDialog} onOpenChange={setTargetDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit learning target</DialogTitle>
            <DialogDescription>
              The stage tag controls which Design Notebook stage shows this rubric.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveTarget.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="target-title">Title</Label>
              <Input
                id="target-title"
                value={targetTitle}
                onChange={(e) => setTargetTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target-description">Description</Label>
              <Textarea
                id="target-description"
                value={targetDescription}
                onChange={(e) => setTargetDescription(e.target.value)}
                rows={3}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Shown in stage</Label>
              <Select value={targetStage} onValueChange={setTargetStage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages (cross-cutting)</SelectItem>
                  {WORKFLOW_STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveTarget.isPending}>
                {saveTarget.isPending ? "Saving…" : "Save target"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Teacher: criterion dialog */}
      <Dialog open={criterionDialog} onOpenChange={setCriterionDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCriterion ? "Edit criterion" : "Add criterion"}
              {criterionTarget ? ` — ${criterionTarget.title}` : ""}
            </DialogTitle>
            <DialogDescription>
              Describe what a student demonstrates at this level. Students see this
              immediately.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveCriterion.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Level</Label>
              <div className="grid grid-cols-3 gap-2">
                {RUBRIC_LEVELS.map((l) => (
                  <button
                    type="button"
                    key={l.key}
                    onClick={() => setCriterionLevel(l.key)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      criterionLevel === l.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="criterion-text">Criterion</Label>
              <Textarea
                id="criterion-text"
                value={criterionText}
                onChange={(e) => setCriterionText(e.target.value)}
                placeholder="e.g. Builds multiple iterative prototypes, each answering a specific question."
                rows={4}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveCriterion.isPending}>
                {saveCriterion.isPending
                  ? "Saving…"
                  : editingCriterion
                    ? "Save changes"
                    : "Add criterion"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Teacher: scoring dialog */}
      <Dialog open={scoreDialog} onOpenChange={setScoreDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingScore ? "Update score" : "Record a score"}
              {scoreTarget ? ` — ${scoreTarget.title}` : ""}
            </DialogTitle>
            <DialogDescription>
              Scores are visible to the student (or the whole team) right away.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveScore.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Score a…</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["student", "team"] as const).map((st) => (
                  <button
                    type="button"
                    key={st}
                    disabled={!!editingScore}
                    onClick={() => setSubjectType(st)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors disabled:opacity-60",
                      subjectType === st
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {subjectType === "student" ? (
              <div className="space-y-1.5">
                <Label>Student</Label>
                <Select
                  value={scoreStudentId}
                  onValueChange={setScoreStudentId}
                  disabled={!!editingScore}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a student" />
                  </SelectTrigger>
                  <SelectContent>
                    {(students.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Select
                  value={scoreTeamId}
                  onValueChange={setScoreTeamId}
                  disabled={!!editingScore}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {(teams.data ?? []).map((tm) => (
                      <SelectItem key={tm.id} value={tm.id}>
                        {tm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Level</Label>
              <div className="grid grid-cols-3 gap-2">
                {RUBRIC_LEVELS.map((l) => (
                  <button
                    type="button"
                    key={l.key}
                    onClick={() => setScoreLevel(l.key)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      scoreLevel === l.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {subjectType === "student" && scoreStudentId && (
              <div className="space-y-1.5">
                <Label>Evidence entry (optional)</Label>
                <Select value={scoreEntryId} onValueChange={setScoreEntryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Link a notebook entry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked entry</SelectItem>
                    {(subjectEntries.data ?? []).map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="score-note">Note to student (optional)</Label>
              <Textarea
                id="score-note"
                value={scoreNote}
                onChange={(e) => setScoreNote(e.target.value)}
                placeholder="What did they do well? What's the next step toward Advanced?"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={saveScore.isPending || !scoreSubjectValid}>
                {saveScore.isPending
                  ? "Saving…"
                  : editingScore
                    ? "Update score"
                    : "Record score"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScoreLine({
  label,
  score,
  evidenceTitle,
}: {
  label: string;
  score: RubricScore;
  evidenceTitle?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}:</span>
        <RubricLevelChip level={score.level} />
        {evidenceTitle && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Link2 className="h-3 w-3" />
            {evidenceTitle}
          </span>
        )}
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {format(new Date(score.updated_at), "MMM d, yyyy")}
        </span>
      </div>
      {score.note && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Teacher note:</span> {score.note}
        </p>
      )}
    </div>
  );
}
