import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  CheckCircle2,
  NotebookPen,
  Target,
  TrendingUp,
  Vault,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { entryTypeLabel, stageLabel } from "@/lib/studio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, StageBadge, StatCard } from "@/components/studio-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface EntryRow {
  id: string;
  title: string;
  content: string;
  entry_type: string;
  stage: string;
  mission_id: string | null;
  created_at: string;
}

interface CompletionRow {
  id: string;
  mission_id: string;
  completed_by: string | null;
  completed_at: string;
  missions: { title: string; mission_date: string; due_date: string | null } | null;
}

interface GradeRow {
  id: string;
  mission_id: string;
  total_points: number;
  possible_points: number;
  feedback: string;
  updated_at: string;
  stage_missions: { title: string; stage: string } | null;
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

/**
 * One student's full record: notebook entries, mission check-offs, grades,
 * and a progress graph over time. Used for a student's own page and for the
 * teacher viewing any student.
 */
export function StudentProfile({ studentId }: { studentId: string }) {
  const [openEntry, setOpenEntry] = useState<EntryRow | null>(null);

  const profile = useQuery({
    queryKey: ["profile-basic", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", studentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const team = useQuery({
    queryKey: ["profile-team", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("team_id, teams(id, name, current_stage, mods(name))")
        .eq("user_id", studentId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.teams as unknown as {
        id: string;
        name: string;
        current_stage: string;
        mods: { name: string } | null;
      } | null) ?? null;
    },
  });

  const teamId = team.data?.id;

  const entries = useQuery({
    queryKey: ["profile-entries", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, title, content, entry_type, stage, mission_id, created_at")
        .eq("user_id", studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as EntryRow[];
    },
  });

  const evidenceCount = useQuery({
    queryKey: ["profile-evidence-count", studentId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("evidence")
        .select("id", { count: "exact", head: true })
        .eq("user_id", studentId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const completions = useQuery({
    queryKey: ["profile-completions", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_completions")
        .select("id, mission_id, completed_by, completed_at, missions(title, mission_date, due_date)")
        .eq("team_id", teamId!)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CompletionRow[];
    },
  });

  const grades = useQuery({
    queryKey: ["profile-grades", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_grades")
        .select(
          "id, mission_id, total_points, possible_points, feedback, updated_at, stage_missions(title, stage)",
        )
        .eq("team_id", teamId!)
        .order("updated_at", { ascending: true });
      if (error) throw error;
      return data as unknown as GradeRow[];
    },
  });

  const chartData = useMemo(() => {
    const days = new Map<
      string,
      { day: string; entries: number; missions: number; score: number | null }
    >();
    const touch = (d: string) =>
      days.get(d) ?? days.set(d, { day: d, entries: 0, missions: 0, score: null }).get(d)!;

    for (const e of entries.data ?? []) touch(dayKey(e.created_at)).entries += 1;
    for (const c of completions.data ?? []) touch(dayKey(c.completed_at)).missions += 1;
    for (const g of grades.data ?? []) {
      const row = touch(dayKey(g.updated_at));
      const pct = g.possible_points ? Math.round((g.total_points / g.possible_points) * 100) : 0;
      row.score = pct;
    }

    const sorted = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
    let entryTotal = 0;
    let missionTotal = 0;
    let lastScore: number | null = null;
    return sorted.map((r) => {
      entryTotal += r.entries;
      missionTotal += r.missions;
      if (r.score !== null) lastScore = r.score;
      return {
        label: format(parseISO(r.day), "MMM d"),
        entries: entryTotal,
        missions: missionTotal,
        score: lastScore,
      };
    });
  }, [entries.data, completions.data, grades.data]);

  const gradedPct = useMemo(() => {
    const list = grades.data ?? [];
    if (!list.length) return null;
    const got = list.reduce((s, g) => s + g.total_points, 0);
    const poss = list.reduce((s, g) => s + g.possible_points, 0);
    return poss ? Math.round((got / poss) * 100) : null;
  }, [grades.data]);

  const loading = profile.isLoading || entries.isLoading || team.isLoading;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const myCheckOffs = (completions.data ?? []).filter((c) => c.completed_by === studentId).length;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-label text-muted-foreground">Student</p>
        <h2 className="font-display text-xl font-bold text-foreground">
          {profile.data?.full_name || "Student"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {team.data
            ? `${team.data.name}${team.data.mods?.name ? ` · ${team.data.mods.name}` : ""} · current stage ${stageLabel(team.data.current_stage)}`
            : "Not on a team yet"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={NotebookPen} label="Notebook entries" value={entries.data?.length ?? 0} />
        <StatCard
          icon={CheckCircle2}
          label="Missions completed"
          value={completions.data?.length ?? 0}
          hint={`${myCheckOffs} checked off by this student`}
        />
        <StatCard
          icon={Target}
          label="Average grade"
          value={gradedPct === null ? "—" : `${gradedPct}%`}
          hint={`${grades.data?.length ?? 0} graded missions`}
        />
        <StatCard icon={Vault} label="Evidence files" value={evidenceCount.data ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" /> Progress over time
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length < 2 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              The graph appears once there are a few days of work saved.
            </p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis
                    yAxisId="left"
                    fontSize={11}
                    allowDecimals={false}
                    stroke="var(--color-muted-foreground)"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    fontSize={11}
                    stroke="var(--color-muted-foreground)"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="entries"
                    name="Notebook entries"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="missions"
                    name="Missions completed"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="score"
                    name="Latest grade %"
                    stroke="var(--color-chart-4)"
                    strokeWidth={2}
                    connectNulls
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="h-4 w-4 text-primary" /> Mission history
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(completions.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No missions checked off yet.</p>
            ) : (
              (completions.data ?? []).map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.missions?.title ?? "Mission"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Completed {format(parseISO(c.completed_at), "MMM d, yyyy")}
                      {c.completed_by === studentId ? " · checked off by this student" : ""}
                    </p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" /> Grades
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(grades.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No graded missions yet.</p>
            ) : (
              [...(grades.data ?? [])].reverse().map((g) => (
                <div key={g.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-foreground">
                      {g.stage_missions?.title ?? "Mission"}
                    </p>
                    <span className="shrink-0 font-mono text-sm font-semibold text-primary">
                      {g.total_points}/{g.possible_points}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {g.stage_missions?.stage ? `${stageLabel(g.stage_missions.stage)} · ` : ""}
                    {format(parseISO(g.updated_at), "MMM d, yyyy")}
                  </p>
                  {g.feedback ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {g.feedback}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <NotebookPen className="h-4 w-4 text-primary" /> Notebook entries
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(entries.data ?? []).length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="No notebook entries yet"
              description="Entries saved in the Design Notebook show up here."
              action={
                <Button asChild size="sm">
                  <Link to="/notebook">Open Design Notebook</Link>
                </Button>
              }
            />
          ) : (
            (entries.data ?? []).map((e) => (
              <button
                key={e.id}
                onClick={() => setOpenEntry(e)}
                className="flex w-full items-start justify-between gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {entryTypeLabel(e.entry_type)} · {format(parseISO(e.created_at), "MMM d, yyyy")}
                  </p>
                </div>
                <StageBadge stage={e.stage} />
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!openEntry} onOpenChange={(o) => !o && setOpenEntry(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{openEntry?.title}</DialogTitle>
            <DialogDescription>
              {openEntry
                ? `${entryTypeLabel(openEntry.entry_type)} · ${stageLabel(openEntry.stage)} · ${format(parseISO(openEntry.created_at), "MMM d, yyyy")}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm text-foreground">{openEntry?.content}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
