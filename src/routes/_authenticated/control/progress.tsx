import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { AlertTriangle, CheckCircle2, CircleDashed, Gauge, Target } from "lucide-react";
import { db } from "@/integrations/firebase/client";
import { TeacherOnly } from "@/components/teacher-only";
import { PageHeader, StatCard, EmptyState, StageBadge } from "@/components/studio-ui";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/control/progress")({
  head: () => ({
    meta: [
      { title: "Progress — Mission Control" },
      {
        name: "description",
        content:
          "Track which teams have checked off each posted mission, filtered by mod, timeframe, and completion status.",
      },
      { property: "og:title", content: "Progress — Mission Control" },
      {
        property: "og:description",
        content: "Mission completion summary for every team in your eLab mods.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgressPage,
});

type Timeframe = "7" | "30" | "all";
type StatusFilter = "all" | "incomplete" | "complete" | "overdue";

function ProgressPage() {
  const [modFilter, setModFilter] = useState("all");
  const [timeframe, setTimeframe] = useState<Timeframe>("30");
  const [status, setStatus] = useState<StatusFilter>("all");

  const mods = useQuery({
    queryKey: ["progress-mods"],
    queryFn: async () => {
      const { data, error } = await db
        .from("mods")
        .select("id, name, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const teams = useQuery({
    queryKey: ["progress-teams"],
    queryFn: async () => {
      const { data, error } = await db
        .from("teams")
        .select("id, name, mod_id, current_stage")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const missions = useQuery({
    queryKey: ["progress-missions"],
    queryFn: async () => {
      const { data, error } = await db
        .from("missions")
        .select("id, title, stage, mod_id, mission_date, due_date, past_due_at")
        .order("mission_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const completions = useQuery({
    queryKey: ["progress-completions"],
    queryFn: async () => {
      const { data, error } = await db
        .from("mission_completions")
        .select("mission_id, team_id, completed_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const done = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of completions.data ?? []) {
      map.set(`${c.mission_id}:${c.team_id}`, c.completed_at);
    }
    return map;
  }, [completions.data]);

  const cutoff = timeframe === "all" ? null : subDays(new Date(), Number(timeframe));

  const visibleMissions = (missions.data ?? []).filter((m) => {
    if (modFilter !== "all" && m.mod_id && m.mod_id !== modFilter) return false;
    if (cutoff && parseISO(m.mission_date) < cutoff) return false;
    return true;
  });

  const teamsFor = (modId: string | null) =>
    (teams.data ?? []).filter(
      (t) =>
        (modId === null || t.mod_id === modId) && (modFilter === "all" || t.mod_id === modFilter),
    );

  const rows = visibleMissions
    .map((m) => {
      const assigned = teamsFor(m.mod_id);
      const completedTeams = assigned.filter((t) => done.has(`${m.id}:${t.id}`));
      const pastDue = m.past_due_at
        ? true
        : m.due_date
          ? parseISO(m.due_date) < new Date(new Date().toDateString())
          : false;
      return { mission: m, assigned, completedTeams, pastDue };
    })
    .filter((r) => r.assigned.length > 0)
    .filter((r) => {
      if (status === "complete") return r.completedTeams.length === r.assigned.length;
      if (status === "incomplete") return r.completedTeams.length < r.assigned.length;
      if (status === "overdue") return r.pastDue && r.completedTeams.length < r.assigned.length;
      return true;
    });

  const totalPairs = rows.reduce((n, r) => n + r.assigned.length, 0);
  const donePairs = rows.reduce((n, r) => n + r.completedTeams.length, 0);
  const overdueRows = rows.filter(
    (r) => r.pastDue && r.completedTeams.length < r.assigned.length,
  ).length;
  const pct = totalPairs === 0 ? 0 : Math.round((donePairs / totalPairs) * 100);

  const loading = missions.isLoading || teams.isLoading || completions.isLoading || mods.isLoading;

  return (
    <TeacherOnly>
      <div className="space-y-6">
        <PageHeader
          title="Progress"
          description="How each team is tracking on posted missions. Completions come from mission check-offs and saved notebook entries."
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={Gauge}
            label="Completion rate"
            value={`${pct}%`}
            hint={`${donePairs} of ${totalPairs} team check-offs`}
          />
          <StatCard
            icon={Target}
            label="Missions in view"
            value={rows.length}
            hint="Matching your filters"
          />
          <StatCard
            icon={AlertTriangle}
            label="Past due & open"
            value={overdueRows}
            hint="Missions with teams still not done"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Select value={modFilter} onValueChange={setModFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Mod" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All mods</SelectItem>
              {(mods.data ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="all">All missions</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="incomplete">Not finished by all</SelectItem>
              <SelectItem value="complete">Finished by every team</SelectItem>
              <SelectItem value="overdue">Past due & open</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading progress…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No missions match these filters"
            description="Try widening the timeframe or choosing All mods."
          />
        ) : (
          <div className="space-y-3">
            {rows.map(({ mission, assigned, completedTeams, pastDue }) => {
              const rowPct = Math.round((completedTeams.length / assigned.length) * 100);
              return (
                <Card key={mission.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{mission.title}</p>
                          {mission.stage ? <StageBadge stage={mission.stage} /> : null}
                          {pastDue && completedTeams.length < assigned.length ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                              <AlertTriangle className="h-3 w-3" /> Past due
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Posted {format(parseISO(mission.mission_date), "MMM d")}
                          {mission.due_date
                            ? ` · Due ${format(parseISO(mission.due_date), "MMM d")}`
                            : ""}
                        </p>
                      </div>
                      <div className="min-w-[160px] space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {completedTeams.length} of {assigned.length} teams · {rowPct}%
                        </p>
                        <Progress value={rowPct} className="h-2" />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {assigned.map((t) => {
                        const at = done.get(`${mission.id}:${t.id}`);
                        return (
                          <Link
                            key={t.id}
                            to="/control/team/$teamId"
                            params={{ teamId: t.id }}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                              at
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                            )}
                            title={
                              at
                                ? `Checked off ${format(new Date(at), "MMM d, h:mm a")}`
                                : "Not checked off"
                            }
                          >
                            {at ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <CircleDashed className="h-3.5 w-3.5" />
                            )}
                            {t.name}
                          </Link>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Button asChild variant="outline" size="sm">
          <Link to="/control/missions">Go to Missions</Link>
        </Button>
      </div>
    </TeacherOnly>
  );
}
