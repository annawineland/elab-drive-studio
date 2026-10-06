import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import {
  ArrowRight,
  CalendarClock,
  FileWarning,
  Inbox,
  NotebookPen,
  Users,
  UsersRound,
} from "lucide-react";
import { db } from "@/integrations/firebase/client";
import { TeacherOnly } from "@/components/teacher-only";
import { PageHeader, StatCard, EmptyState } from "@/components/studio-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/control/")({
  head: () => ({
    meta: [
      { title: "Mission Control — Engineering Studio" },
      {
        name: "description",
        content:
          "Teacher overview: engagement, teams, pending requests, and students who need a nudge.",
      },
      { property: "og:title", content: "Mission Control — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ControlOverview,
});

function ControlOverview() {
  const students = useQuery({
    queryKey: ["control-students"],
    queryFn: async () => {
      const { data: roles, error } = await db
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");
      if (error) throw error;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as { id: string; full_name: string }[];
      const { data: profs, error: pErr } = await db
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (pErr) throw pErr;
      return profs ?? [];
    },
  });

  const teams = useQuery({
    queryKey: ["control-teams"],
    queryFn: async () => {
      const { data, error } = await db
        .from("teams")
        .select("id, name, current_stage, mod_id, mods(name, sort_order)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const pendingRequests = useQuery({
    queryKey: ["control-pending-requests"],
    queryFn: async () => {
      const { data, error } = await db
        .from("requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const todayMissions = useQuery({
    queryKey: ["control-missions-today"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await db
        .from("missions")
        .select("id, title, mods(name)")
        .eq("mission_date", today);
      if (error) throw error;
      return data;
    },
  });

  const engagement = useQuery({
    queryKey: ["control-engagement"],
    queryFn: async () => {
      const since = subDays(new Date(), 7).toISOString();
      const [entries, evidence] = await Promise.all([
        db.from("entries").select("user_id").gte("created_at", since),
        db.from("evidence").select("user_id"),
      ]);
      if (entries.error) throw entries.error;
      if (evidence.error) throw evidence.error;
      return {
        activeIds: new Set((entries.data ?? []).map((e) => e.user_id)),
        evidenceIds: new Set((evidence.data ?? []).map((e) => e.user_id)),
      };
    },
  });

  const totalStudents = students.data?.length ?? 0;
  const activeCount = (students.data ?? []).filter((s) =>
    engagement.data?.activeIds.has(s.id),
  ).length;
  const noEvidence = (students.data ?? []).filter((s) => !engagement.data?.evidenceIds.has(s.id));

  return (
    <TeacherOnly>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Teacher Mission Control"
          title="Overview"
          description="The pulse of every mod — engagement, teams, and what needs your attention."
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Students" value={totalStudents} icon={UsersRound} />
          <StatCard label="Teams" value={teams.data?.length ?? "—"} icon={Users} />
          <StatCard
            label="Pending requests"
            value={pendingRequests.data?.length ?? "—"}
            icon={Inbox}
          />
          <StatCard
            label="Missions today"
            value={todayMissions.data?.length ?? "—"}
            icon={CalendarClock}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Engagement */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <NotebookPen className="h-4 w-4 text-primary" />
                Notebook completion (7 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-display text-3xl font-bold">
                {totalStudents === 0 ? "—" : `${activeCount}/${totalStudents}`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                students logged at least one entry this week.
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: totalStudents ? `${(activeCount / totalStudents) * 100}%` : "0%",
                  }}
                />
              </div>
              <Button variant="ghost" size="sm" className="mt-3" asChild>
                <Link to="/control/students">
                  Open roster <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Missing evidence */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileWarning className="h-4 w-4 text-primary" />
                Missing evidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              {noEvidence.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Every student has evidence on file. Nice.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-sm text-muted-foreground">
                    {noEvidence.length} student{noEvidence.length === 1 ? "" : "s"} with no evidence
                    yet:
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {noEvidence.slice(0, 12).map((s) => (
                      <li
                        key={s.id}
                        className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium"
                      >
                        {s.full_name || "Unnamed"}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Pending requests */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Request queue</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/control/requests">
                  Open queue <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {(pendingRequests.data?.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>
              )}
              {pendingRequests.data?.slice(0, 5).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {r.item} <span className="text-muted-foreground">× {r.quantity}</span>
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.kind} · {format(new Date(r.created_at), "MMM d")}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Teams at a glance */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Teams at a glance</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/control/teams">
                  Manage teams <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {(teams.data?.length ?? 0) === 0 && (
                <EmptyState
                  icon={Users}
                  title="No teams yet"
                  description="Create your first team and share the join code with students."
                  action={
                    <Button variant="outline" asChild>
                      <Link to="/control/teams">Create a team</Link>
                    </Button>
                  }
                />
              )}
              {(() => {
                const all = teams.data ?? [];
                const byMod = new Map<
                  string,
                  { label: string; order: number; teams: typeof all }
                >();
                for (const t of all) {
                  const key = t.mod_id ?? "none";
                  if (!byMod.has(key)) {
                    byMod.set(key, {
                      label: t.mods?.name ?? "No mod assigned",
                      order: t.mods?.sort_order ?? 999,
                      teams: [],
                    });
                  }
                  byMod.get(key)!.teams.push(t);
                }
                const groups = [...byMod.values()].sort((a, b) => a.order - b.order);
                return groups.map((g) => (
                  <div key={g.label} className="space-y-2">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </p>
                    {g.teams.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
                      >
                        <p className="text-sm font-medium">{t.name}</p>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </CardContent>
          </Card>
        </div>
      </div>
    </TeacherOnly>
  );
}
