import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Clock } from "lucide-react";
import { db } from "@/integrations/firebase/client";
import { pacingWeeksQueryOptions, weekStatus, type PacingWeek } from "@/lib/pacing-queries";
import { WORKFLOW_STAGES, stageIndex, stageLabel } from "@/lib/studio";
import { cn } from "@/lib/utils";

/**
 * Furthest stage the TEAM has fully covered in the notebook. A stage counts as
 * covered when every mission in it has at least one response from any teammate
 * — one student's entry counts for the whole team.
 */
function useTeamCoveredStageIndex(teamId?: string) {
  return useQuery({
    queryKey: ["team-stage-coverage", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const [missionsRes, entriesRes] = await Promise.all([
        db.from("stage_missions").select("id, stage"),
        db.from("entries").select("mission_id, stage").eq("team_id", teamId!),
      ]);
      if (missionsRes.error) throw missionsRes.error;
      if (entriesRes.error) throw entriesRes.error;

      const answered = new Set(
        (entriesRes.data ?? []).map((e) => e.mission_id).filter(Boolean) as string[],
      );
      const byStage = new Map<string, string[]>();
      for (const m of missionsRes.data ?? []) {
        const list = byStage.get(m.stage) ?? [];
        list.push(m.id);
        byStage.set(m.stage, list);
      }

      let covered = -1;
      WORKFLOW_STAGES.forEach((s, i) => {
        const ids = byStage.get(s.key) ?? [];
        if (ids.length > 0 && ids.every((id) => answered.has(id))) covered = Math.max(covered, i);
      });
      return covered;
    },
  });
}

/**
 * Missions the team still owes: anything the teacher flagged past due, or with
 * a due date of today/tomorrow or earlier, that the team hasn't checked off.
 */
function useTeamDueMissions(teamId?: string) {
  return useQuery({
    queryKey: ["team-due-missions", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const teamRes = await db.from("teams").select("mod_id").eq("id", teamId!).maybeSingle();
      if (teamRes.error) throw teamRes.error;
      const modId = teamRes.data?.mod_id ?? null;

      let q = db.from("missions").select("id, title, due_date, past_due_at");
      if (modId) q = q.or(`mod_id.is.null,mod_id.eq.${modId}`);
      const [missionsRes, doneRes] = await Promise.all([
        q,
        db.from("mission_completions").select("mission_id").eq("team_id", teamId!),
      ]);
      if (missionsRes.error) throw missionsRes.error;
      if (doneRes.error) throw doneRes.error;

      const done = new Set((doneRes.data ?? []).map((c) => c.mission_id));
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      today.setDate(today.getDate() + 1);
      const tomorrowStr = today.toISOString().slice(0, 10);

      const open = (missionsRes.data ?? []).filter((m) => !done.has(m.id));
      const late = open.filter((m) => !!m.past_due_at || (!!m.due_date && m.due_date < todayStr));
      const dueSoon = open.filter(
        (m) => !late.includes(m) && !!m.due_date && m.due_date <= tomorrowStr,
      );
      return { late, dueSoon };
    },
  });
}

type Pace = "ahead" | "on_track" | "behind" | "unknown";

const PACE_STYLES: Record<Pace, string> = {
  ahead: "bg-success/15 text-success",
  on_track: "bg-primary/10 text-primary",
  behind: "bg-warning/15 text-warning-foreground",
  unknown: "bg-muted text-muted-foreground",
};

const PACE_LABELS: Record<Pace, string> = {
  ahead: "Ahead of pace",
  on_track: "On pace",
  behind: "Behind pace",
  unknown: "No pacing set",
};

/** The week the class is in right now (or the most recent past week). */
function activeWeek(weeks: PacingWeek[]): PacingWeek | null {
  const current = weeks.find((w) => weekStatus(w) === "current");
  if (current) return current;
  const past = weeks.filter((w) => weekStatus(w) === "done");
  return past.length ? (past[past.length - 1] ?? null) : (weeks[0] ?? null);
}

/** Stage the pacing guide expects by this week (carries forward the last set stage). */
function expectedStage(weeks: PacingWeek[], week: PacingWeek | null): string | null {
  if (!week) return null;
  const upTo = weeks.filter((w) => w.week_number <= week.week_number);
  for (let i = upTo.length - 1; i >= 0; i--) {
    const s = upTo[i]?.stage;
    if (s) return s;
  }
  return null;
}

/**
 * Compact progress tracker comparing a team's current workflow stage to the
 * stage the pacing guide expects for the current week.
 */
export function PacingTracker({
  stage,
  teamId,
  className,
}: {
  stage: string;
  /** When set, completed notebook missions by ANY teammate count toward pace. */
  teamId?: string;
  className?: string;
}) {
  const { data: weeks } = useQuery(pacingWeeksQueryOptions());
  const { data: coveredIdx } = useTeamCoveredStageIndex(teamId);
  const { data: dueMissions } = useTeamDueMissions(teamId);
  const late = dueMissions?.late ?? [];
  const dueSoon = dueMissions?.dueSoon ?? [];

  const list = weeks ?? [];
  const week = activeWeek(list);
  const expected = expectedStage(list, week);

  const notebookIdx = coveredIdx ?? -1;
  const teamIdx = Math.max(stageIndex(stage), notebookIdx);
  const expectedIdx = expected ? stageIndex(expected) : -1;

  let pace: Pace = "unknown";
  if (expectedIdx >= 0 && teamIdx >= 0) {
    pace = teamIdx > expectedIdx ? "ahead" : teamIdx === expectedIdx ? "on_track" : "behind";
  }
  // Outstanding past-due missions override an otherwise healthy pace.
  if (late.length > 0 && pace !== "unknown") pace = "behind";

  const pct = Math.round(((Math.max(teamIdx, 0) + 1) / WORKFLOW_STAGES.length) * 100);
  const expectedPct = expectedIdx >= 0 ? ((expectedIdx + 1) / WORKFLOW_STAGES.length) * 100 : null;

  return (
    <div className={cn("rounded-lg border border-border bg-muted/30 p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          {week ? `Week ${week.week_number} · ${week.focus}` : "Pacing guide"}
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
            PACE_STYLES[pace],
          )}
        >
          {PACE_LABELS[pace]}
        </span>
      </div>

      <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pace === "behind" ? "bg-warning" : pace === "ahead" ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
        {expectedPct !== null ? (
          <div
            className="absolute top-0 h-full w-0.5 bg-foreground/60"
            style={{ left: `calc(${expectedPct}% - 1px)` }}
            title={`Pacing target: ${stageLabel(expected!)}`}
          />
        ) : null}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {stageLabel(WORKFLOW_STAGES[Math.max(teamIdx, 0)]?.key ?? stage)}
        </span>
        {expected ? ` · target this week: ${stageLabel(expected)}` : " · no target stage set"}
        {notebookIdx > stageIndex(stage)
          ? " · credited from teammates' completed notebook missions"
          : ""}
      </p>

      {late.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {late.length} past-due mission{late.length > 1 ? "s" : ""} not checked off:{" "}
            {late.map((m) => m.title).join(", ")}
          </span>
        </p>
      )}
      {dueSoon.length > 0 && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Due today or tomorrow: {dueSoon.map((m) => m.title).join(", ")}</span>
        </p>
      )}
    </div>
  );
}
