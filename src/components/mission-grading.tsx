import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ClipboardCheck,
  GraduationCap,
  Lightbulb,
  Plus,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";

export interface MissionCriterion {
  id: string;
  mission_id: string;
  label: string;
  description: string;
  points: number;
  sort_order: number;
}

export interface MissionGrade {
  id: string;
  mission_id: string;
  team_id: string;
  scores: Record<string, number>;
  total_points: number;
  possible_points: number;
  feedback: string;
  updated_at: string;
}

interface GradeTeam {
  id: string;
  name: string;
  mods: { name: string } | null;
}

/** All per-mission rubric criteria (small table, cached once). */
export function useMissionCriteria() {
  return useQuery({
    queryKey: ["mission-rubric-criteria"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_rubric_criteria")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as MissionCriterion[];
    },
  });
}

/** Grades a signed-in user may read: their team's, or every team's for a teacher. */
export function useMissionGrades() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mission-grades", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("mission_grades").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as MissionGrade[];
    },
  });
}

/** Team names (teacher view), cached once for all missions. */
function useGradingTeams(enabled: boolean) {
  return useQuery({
    queryKey: ["grading-teams"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, mods(name)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as GradeTeam[];
    },
  });
}

function pointsLabel(n: number) {
  return `${n} ${n === 1 ? "pt" : "pts"}`;
}

/**
 * Rubric + grade block shown under a notebook mission.
 * Students see the criteria and, once graded, their team's points and feedback.
 * Teachers additionally get rubric editing, the teacher-only model answer, and grading.
 */
export function MissionGradingPanel({
  missionId,
  missionTitle,
  teamId,
  isTeacher,
}: {
  missionId: string;
  missionTitle: string;
  teamId?: string | null;
  isTeacher: boolean;
}) {
  const criteriaQuery = useMissionCriteria();
  const gradesQuery = useMissionGrades();
  const [rubricOpen, setRubricOpen] = useState(false);
  const [exemplarOpen, setExemplarOpen] = useState(false);
  const [gradeOpen, setGradeOpen] = useState(false);

  const criteria = useMemo(
    () => (criteriaQuery.data ?? []).filter((c) => c.mission_id === missionId),
    [criteriaQuery.data, missionId],
  );
  const grades = useMemo(
    () => (gradesQuery.data ?? []).filter((g) => g.mission_id === missionId),
    [gradesQuery.data, missionId],
  );
  const myGrade = teamId ? grades.find((g) => g.team_id === teamId) : undefined;
  const possible = criteria.reduce((sum, c) => sum + c.points, 0);

  return (
    <div className="mt-3 rounded-md border border-border/70 bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ClipboardCheck className="h-3.5 w-3.5" />
          Scoring rubric{possible > 0 ? ` — ${pointsLabel(possible)}` : ""}
        </p>
        {isTeacher && (
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setRubricOpen(true)}>
              Edit rubric
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setExemplarOpen(true)}>
              <Lightbulb className="mr-1.5 h-4 w-4" /> Model answer
            </Button>
            <Button variant="outline" size="sm" onClick={() => setGradeOpen(true)}>
              <GraduationCap className="mr-1.5 h-4 w-4" /> Grade teams
            </Button>
          </div>
        )}
      </div>

      {criteria.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {isTeacher
            ? "No criteria yet — add them with Edit rubric."
            : "Your teacher hasn't set criteria for this mission yet."}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {criteria.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 text-xs">
              <span>
                <span className="font-medium text-foreground">{c.label}</span>
                {c.description && (
                  <span className="text-muted-foreground"> — {c.description}</span>
                )}
              </span>
              <span className="shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {myGrade ? `${myGrade.scores?.[c.id] ?? 0}/${c.points}` : pointsLabel(c.points)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {myGrade && (
        <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-2.5">
          <p className="text-xs font-semibold">
            {isTeacher ? "Team score" : "Your team's score"}: {myGrade.total_points}/
            {myGrade.possible_points || possible}
          </p>
          {myGrade.feedback && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {myGrade.feedback}
            </p>
          )}
        </div>
      )}

      {isTeacher && (
        <TeacherGradeList grades={grades} possible={possible} onGrade={() => setGradeOpen(true)} />
      )}

      {isTeacher && (
        <>
          <RubricEditorDialog
            open={rubricOpen}
            onOpenChange={setRubricOpen}
            missionId={missionId}
            missionTitle={missionTitle}
            criteria={criteria}
          />
          <ExemplarDialog
            open={exemplarOpen}
            onOpenChange={setExemplarOpen}
            missionId={missionId}
            missionTitle={missionTitle}
          />
          <GradeTeamsDialog
            open={gradeOpen}
            onOpenChange={setGradeOpen}
            missionId={missionId}
            missionTitle={missionTitle}
            criteria={criteria}
            grades={grades}
            defaultTeamId={teamId ?? undefined}
          />
        </>
      )}
    </div>
  );
}

/* ---------------- Teacher: per-team grades on the mission ---------------- */

function TeacherGradeList({
  grades,
  possible,
  onGrade,
}: {
  grades: MissionGrade[];
  possible: number;
  onGrade: () => void;
}) {
  const teams = useGradingTeams(true);
  const byId = useMemo(
    () => new Map((teams.data ?? []).map((t) => [t.id, t])),
    [teams.data],
  );
  const ungraded = (teams.data ?? []).filter((t) => !grades.some((g) => g.team_id === t.id));

  return (
    <div className="mt-3 rounded-md border border-border/70 bg-background/60 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Team grades — {grades.length} of {teams.data?.length ?? 0} graded
      </p>
      {grades.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No team graded on this mission yet.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {grades.map((g) => {
            const team = byId.get(g.team_id);
            return (
              <li key={g.id} className="flex items-start justify-between gap-3 text-xs">
                <button
                  type="button"
                  onClick={onGrade}
                  className="text-left font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {team?.mods?.name ? `${team.mods.name} · ` : ""}
                  {team?.name ?? "Team"}
                </button>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                  {g.total_points}/{g.possible_points || possible}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {ungraded.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Not graded yet: {ungraded.map((t) => t.name).join(", ")}
        </p>
      )}
    </div>
  );
}

/* ---------------- Teacher: rubric editor ---------------- */

interface DraftCriterion {
  id?: string;
  label: string;
  description: string;
  points: number;
}

function RubricEditorDialog({
  open,
  onOpenChange,
  missionId,
  missionTitle,
  criteria,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string;
  missionTitle: string;
  criteria: MissionCriterion[];
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<DraftCriterion[]>([]);

  useEffect(() => {
    if (open) {
      setRows(
        criteria.map((c) => ({
          id: c.id,
          label: c.label,
          description: c.description,
          points: c.points,
        })),
      );
    }
  }, [open, criteria]);

  const save = useMutation({
    mutationFn: async () => {
      const keep = rows.filter((r) => r.label.trim().length > 0);
      const removed = criteria.filter((c) => !keep.some((r) => r.id === c.id));
      if (removed.length > 0) {
        const { error } = await supabase
          .from("mission_rubric_criteria")
          .delete()
          .in(
            "id",
            removed.map((r) => r.id),
          );
        if (error) throw error;
      }
      for (const [i, r] of keep.entries()) {
        const payload = {
          mission_id: missionId,
          label: r.label.trim(),
          description: r.description.trim(),
          points: Number.isFinite(r.points) ? Math.max(0, Math.round(r.points)) : 0,
          sort_order: i + 1,
        };
        const { error } = r.id
          ? await supabase.from("mission_rubric_criteria").update(payload).eq("id", r.id)
          : await supabase.from("mission_rubric_criteria").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Rubric saved");
      void queryClient.invalidateQueries({ queryKey: ["mission-rubric-criteria"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = rows.reduce((s, r) => s + (Number(r.points) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Rubric — {missionTitle}</DialogTitle>
          <DialogDescription>
            Students see these criteria and point values before they respond. Total: {total} pts.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {rows.map((r, i) => (
            <div key={r.id ?? `new-${i}`} className="rounded-md border p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <Input
                    value={r.label}
                    placeholder="Criterion (e.g. Evidence & engineering thinking)"
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)),
                      )
                    }
                  />
                  <Textarea
                    rows={2}
                    value={r.description}
                    placeholder="What earns full points?"
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, description: e.target.value } : p)),
                      )
                    }
                  />
                </div>
                <div className="w-20 shrink-0">
                  <Label className="text-[11px] text-muted-foreground">Points</Label>
                  <Input
                    type="number"
                    min={0}
                    value={r.points}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((p, j) =>
                          j === i ? { ...p, points: Number(e.target.value) } : p,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove criterion"
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((prev) => [...prev, { label: "", description: "", points: 2 }])
            }
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add criterion
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save rubric
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Teacher: model answer ---------------- */

function useExemplar(missionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["mission-exemplar", missionId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_exemplars")
        .select("id, content")
        .eq("mission_id", missionId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; content: string } | null;
    },
  });
}

function ExemplarDialog({
  open,
  onOpenChange,
  missionId,
  missionTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string;
  missionTitle: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const exemplar = useExemplar(missionId, open);
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) setText(exemplar.data?.content ?? "");
  }, [open, exemplar.data?.content]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("mission_exemplars")
        .upsert(
          { mission_id: missionId, content: text, updated_by: user?.id ?? null },
          { onConflict: "mission_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Model answer saved");
      void queryClient.invalidateQueries({ queryKey: ["mission-exemplar", missionId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Model answer — {missionTitle}</DialogTitle>
          <DialogDescription>
            Teacher-only. Students never see this; you can drop it into feedback while grading.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What a strong response looks like…"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Teacher: grading ---------------- */

export function GradeTeamsDialog({
  open,
  onOpenChange,
  missionId,
  missionTitle,
  criteria,
  grades,
  defaultTeamId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string;
  missionTitle: string;
  criteria: MissionCriterion[];
  grades: MissionGrade[];
  defaultTeamId?: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const exemplar = useExemplar(missionId, open);
  const [teamId, setTeamId] = useState<string>(defaultTeamId ?? "");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState("");

  const teams = useQuery({
    queryKey: ["grading-teams"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, mods(name)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as GradeTeam[];
    },
  });

  const responses = useQuery({
    queryKey: ["mission-responses", missionId, teamId],
    enabled: open && !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, title, content, created_at, user_id")
        .eq("mission_id", missionId)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const existing = grades.find((g) => g.team_id === teamId);

  useEffect(() => {
    if (!open) return;
    setScores(existing?.scores ?? {});
    setFeedback(existing?.feedback ?? "");
  }, [open, teamId, existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && !teamId && defaultTeamId) setTeamId(defaultTeamId);
  }, [open, defaultTeamId, teamId]);

  const possible = criteria.reduce((s, c) => s + c.points, 0);
  const total = criteria.reduce((s, c) => s + (Number(scores[c.id]) || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!teamId) throw new Error("Pick a team first");
      const { error } = await supabase.from("mission_grades").upsert(
        {
          mission_id: missionId,
          team_id: teamId,
          teacher_id: user!.id,
          scores,
          total_points: total,
          possible_points: possible,
          feedback,
        },
        { onConflict: "mission_id,team_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grade saved — the team can see it in the notebook");
      void queryClient.invalidateQueries({ queryKey: ["mission-grades"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gradedTeamIds = new Set(grades.map((g) => g.team_id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Grade — {missionTitle}</DialogTitle>
          <DialogDescription>
            One score per team. The team sees the points and your feedback in their notebook.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>Team</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a team" />
              </SelectTrigger>
              <SelectContent>
                {(teams.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.mods?.name ? `${t.mods.name} · ` : ""}
                    {t.name}
                    {gradedTeamIds.has(t.id) ? " ✓" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {teamId && (
            <div className="rounded-md border p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Their response
              </p>
              {(responses.data ?? []).length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  No notebook entry linked to this mission yet.
                </p>
              ) : (
                <div className="mt-2 space-y-3">
                  {(responses.data ?? []).map((r) => (
                    <div key={r.id}>
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {r.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            {criteria.map((c) => (
              <div key={c.id} className="flex items-start gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.label}</p>
                  {c.description && (
                    <p className="text-xs text-muted-foreground">{c.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Input
                    className="w-16"
                    type="number"
                    min={0}
                    max={c.points}
                    value={scores[c.id] ?? ""}
                    onChange={(e) =>
                      setScores((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">/ {c.points}</span>
                </div>
              </div>
            ))}
            <p className={cn("text-right text-sm font-semibold")}>
              Total: {total}/{possible}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="grade-feedback">Feedback to the team</Label>
              {exemplar.data?.content && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFeedback((prev) =>
                      `${prev.trim()}${prev.trim() ? "\n\n" : ""}Example of a strong response:\n${exemplar.data!.content}`.trim(),
                    )
                  }
                >
                  <Lightbulb className="mr-1.5 h-4 w-4" /> Add model answer
                </Button>
              )}
            </div>
            <Textarea
              id="grade-feedback"
              rows={6}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What they did well, and what to fix…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !teamId}>
            {existing ? "Update grade" : "Save grade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
