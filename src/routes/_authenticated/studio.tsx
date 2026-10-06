import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  BookOpen,
  FileText,
  FolderOpen,
  Inbox,
  MessageSquare,
  NotebookPen,
  Target,
  Users,
} from "lucide-react";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyTeam } from "@/hooks/use-my-team";
import {
  WORKFLOW_STAGES,
  stageLabel,
  stageIndex,
  missionDueStatus,
  DUE_TONE_CLASS,
} from "@/lib/studio";
import { PageHeader, StatCard, StageBadge, EmptyState } from "@/components/studio-ui";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { parseMissionDescription } from "@/lib/mission-attachment";
import { MissionNotes } from "@/components/mission-feedback";
import { VocabText } from "@/components/vocab-text";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({
    meta: [
      { title: "My Studio — Engineering Studio" },
      {
        name: "description",
        content:
          "Your engineering studio home: today's mission, workflow stage, entries, evidence, and feedback.",
      },
      { property: "og:title", content: "My Studio — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudioHome,
});

function useCount(key: string, run: () => PromiseLike<{ count: number | null; error: unknown }>) {
  return useQuery({
    queryKey: ["count", key],
    queryFn: async () => {
      const { count, error } = await run();
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function StudioHome() {
  const { user, fullName, role } = useAuth();
  const { data: team, isLoading: teamLoading } = useMyTeam();
  const today = new Date().toISOString().slice(0, 10);
  const queryClient = useQueryClient();

  const missions = useQuery({
    queryKey: ["missions-today", today, team?.mod_id],
    queryFn: async () => {
      let q = db
        .from("missions")
        .select("*, mods(name)")
        .lte("mission_date", today)
        .order("mission_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (team?.mod_id) q = q.or(`mod_id.is.null,mod_id.eq.${team.mod_id}`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const completions = useQuery({
    queryKey: ["mission-completions", team?.id],
    enabled: !!team,
    queryFn: async () => {
      const { data, error } = await db
        .from("mission_completions")
        .select("mission_id")
        .eq("team_id", team!.id);
      if (error) throw error;
      return data.map((c) => c.mission_id);
    },
  });

  const doneIds = new Set(completions.data ?? []);
  const openMissions = (missions.data ?? [])
    .filter((m) => !doneIds.has(m.id))
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const doneMissions = (missions.data ?? []).filter((m) => doneIds.has(m.id));

  const toggleMission = useMutation({
    mutationFn: async ({ missionId, done }: { missionId: string; done: boolean }) => {
      if (done) {
        const { error } = await db
          .from("mission_completions")
          .insert({ mission_id: missionId, team_id: team!.id, completed_by: user!.id });
        if (error) throw error;
      } else {
        const { error } = await db
          .from("mission_completions")
          .delete()
          .eq("mission_id", missionId)
          .eq("team_id", team!.id);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      toast.success(v.done ? "Mission checked off" : "Mission reopened");
      void queryClient.invalidateQueries({ queryKey: ["mission-completions", team?.id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const entryCount = useCount(`entries-${user!.id}`, () =>
    db.from("entries").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
  );
  const evidenceCount = useCount(`evidence-${user!.id}`, () =>
    db.from("evidence").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
  );
  const requestCount = useCount(`requests-${user!.id}`, () =>
    db
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user!.id)
      .eq("status", "pending"),
  );
  const openTasks = useCount(`tasks-${team?.id ?? "none"}`, () =>
    team
      ? db
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("team_id", team.id)
          .neq("status", "done")
      : Promise.resolve({ count: 0, error: null }),
  );

  const recentFeedback = useQuery({
    queryKey: ["feedback-recent", user!.id, team?.id],
    queryFn: async () => {
      const clauses = [`target_user_id.eq.${user!.id}`];
      if (team) clauses.push(`team_id.eq.${team.id}`);
      const { data, error } = await db
        .from("feedback")
        .select("*")
        .or(clauses.join(","))
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data;
    },
  });

  // The student's mod placement (from the teacher's roster) and their classmates.
  const myMod = useQuery({
    queryKey: ["my-mod", user!.id],
    enabled: role === "student",
    queryFn: async () => {
      const { data, error } = await db
        .from("mod_enrollments")
        .select("mod_id, mods(name)")
        .eq("student_id", user!.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const classmates = useQuery({
    queryKey: ["mod-classmates", myMod.data?.mod_id],
    enabled: !!myMod.data?.mod_id,
    queryFn: async () => {
      const { data: enrolls, error } = await db
        .from("mod_enrollments")
        .select("student_id")
        .eq("mod_id", myMod.data!.mod_id)
        .not("student_id", "is", null);
      if (error) throw error;
      const ids = (enrolls ?? []).map((e) => e.student_id).filter((x): x is string => !!x);
      if (ids.length === 0) return [];
      const { data: profs, error: pErr } = await db
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (pErr) throw pErr;
      return (profs ?? [])
        .map((p) => {
          const name = p.full_name || "Classmate";
          return {
            id: p.id,
            name,
            initials: name
              .split(/\s+/)
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase(),
            isMe: p.id === user!.id,
          };
        })
        .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
    },
  });

  const firstName = fullName.split(" ")[0] || "Engineer";
  const stageIdx = team ? Math.max(0, stageIndex(team.current_stage)) : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
        title={`Welcome back, ${firstName}`}
        description={
          team
            ? `${team.name} · ${team.mods?.name ?? "No mod"} · ${stageLabel(team.current_stage)}`
            : "Pick up where you left off, or join a team to unlock the Team Command Center."
        }
      />

      {/* Getting started — quick onboarding for students */}
      {role === "student" && (
        <OnboardingChecklist
          placedInMod={!!myMod.data}
          inTeam={!!team}
          hasEntry={(entryCount.data ?? 0) > 0}
          hasEvidence={(evidenceCount.data ?? 0) > 0}
          loading={teamLoading || myMod.isLoading}
        />
      )}

      {/* Stage tracker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            Design workflow progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          {teamLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-5 lg:grid-cols-10">
              {WORKFLOW_STAGES.map((s, i) => (
                <li key={s.key}>
                  <Link
                    to="/notebook"
                    search={{ stage: s.key }}
                    className={cn(
                      "block rounded-md border px-2 py-1.5 text-center transition-colors hover:border-primary/60",
                      i === stageIdx && team
                        ? "border-primary bg-primary/10"
                        : team && i < stageIdx
                          ? "border-border bg-muted/60"
                          : "border-dashed border-border",
                    )}
                    title={`${s.label} — open in Design Notebook`}
                  >
                    <span
                      className={cn(
                        "block font-mono text-[10px] font-bold",
                        i === stageIdx && team ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-[11px] font-medium",
                        team && i <= stageIdx ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {!team && !teamLoading && (
            <p className="mt-3 text-xs text-muted-foreground">
              Join a team to track your stage through the engineering design process.
            </p>
          )}
        </CardContent>
      </Card>

      {/* My mod + classmates */}
      {role === "student" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Your mod{myMod.data?.mods?.name ? ` — ${myMod.data.mods.name}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myMod.isLoading && <Skeleton className="h-8 w-full" />}
            {!myMod.isLoading && !myMod.data && (
              <p className="text-sm text-muted-foreground">
                Your teacher hasn't placed you in a mod yet — once they add your email to a mod
                roster, your classmates will appear here.
              </p>
            )}
            {(classmates.data?.length ?? 0) > 0 && (
              <ul className="flex flex-wrap gap-2">
                {classmates.data!.map((c) => (
                  <li
                    key={c.id}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5",
                      c.isMe && "border-primary bg-primary/10",
                    )}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted font-mono text-[10px] font-semibold text-muted-foreground">
                      {c.initials}
                    </span>
                    <span className="text-sm font-medium">
                      {c.name}
                      {c.isMe ? " (you)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Missions */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Missions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {missions.isLoading && <Skeleton className="h-20 w-full" />}
            {!missions.isLoading && openMissions.length === 0 && doneMissions.length === 0 && (
              <EmptyState
                icon={Target}
                title="No missions posted yet"
                description="When your teacher posts a mission brief, it will show up here."
              />
            )}
            {!missions.isLoading && openMissions.length === 0 && doneMissions.length > 0 && (
              <p className="text-sm text-muted-foreground">All missions checked off. Nice work.</p>
            )}
            {[...openMissions, ...doneMissions].map((m) => {
              const parsed = parseMissionDescription(m.description);
              const done = doneIds.has(m.id);
              const due = missionDueStatus(m.due_date);
              const flaggedLate = !!m.past_due_at && !done;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "rounded-lg border bg-muted/40 p-4",
                    done && "border-dashed bg-muted/20 opacity-70",
                    !done && due?.tone === "overdue" && "border-destructive/50 bg-destructive/5",
                    flaggedLate && "border-destructive bg-destructive/10",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {team && (
                      <Checkbox
                        className="mt-1"
                        checked={done}
                        disabled={toggleMission.isPending}
                        aria-label={done ? "Mark mission not complete" : "Mark mission complete"}
                        onCheckedChange={(v) =>
                          toggleMission.mutate({ missionId: m.id, done: v === true })
                        }
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className={cn(
                            "text-base font-semibold",
                            done && "line-through text-muted-foreground",
                          )}
                        >
                          <Link
                            to="/notebook"
                            search={m.stage ? { stage: m.stage, mission: m.id } : { mission: m.id }}
                            className="underline-offset-4 hover:underline"
                            title="Open this mission in your design notebook"
                          >
                            {m.title}
                          </Link>
                        </h3>

                        {m.stage && <StageBadge stage={m.stage} />}
                        {flaggedLate && (
                          <span className="flex items-center gap-1 rounded-full border border-destructive bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            Past due — turn in ASAP
                          </span>
                        )}
                        {due && !done && (
                          <span
                            className={cn(
                              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              DUE_TONE_CLASS[due.tone],
                            )}
                          >
                            {due.tone === "overdue" ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : (
                              <CalendarClock className="h-3 w-3" />
                            )}
                            {due.label}
                          </span>
                        )}
                        {m.mods?.name && (
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {m.mods.name}
                          </span>
                        )}
                        {m.mission_date !== today && (
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            Posted {m.mission_date}
                          </span>
                        )}
                      </div>
                      {parsed.text && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          <VocabText text={parsed.text} />
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild size="sm" variant={m.stage ? "default" : "outline"}>
                          <Link
                            to="/notebook"
                            search={m.stage ? { stage: m.stage, mission: m.id } : { mission: m.id }}
                          >
                            <NotebookPen className="mr-1.5 h-4 w-4" />
                            {m.stage
                              ? `Open ${stageLabel(m.stage)} in notebook`
                              : "Open design notebook"}
                          </Link>
                        </Button>
                        {parsed.attachment && (
                          <Button asChild size="sm" variant="outline">
                            <Link
                              to="/resources/$slug"
                              params={{ slug: parsed.attachment.slug }}
                              search={{ edit: false }}
                            >
                              <FileText className="mr-1.5 h-4 w-4" />
                              Open {parsed.attachment.title}
                            </Link>
                          </Button>
                        )}
                      </div>
                      <MissionNotes missionId={m.id} teamId={team?.id} />
                    </div>
                  </div>
                </div>
              );
            })}
            {!team && (missions.data?.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                Join a team to check missions off as completed.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <StatCard label="My entries" value={entryCount.data ?? "—"} icon={NotebookPen} />
          <StatCard label="Evidence items" value={evidenceCount.data ?? "—"} icon={FolderOpen} />
          <StatCard label="Open team tasks" value={openTasks.data ?? "—"} icon={Users} />
          <StatCard label="Pending requests" value={requestCount.data ?? "—"} icon={Inbox} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent feedback */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-primary" />
              Latest feedback
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/feedback">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(recentFeedback.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No feedback yet — keep building.</p>
            )}
            {recentFeedback.data?.map((f) => (
              <div key={f.id} className="rounded-lg border bg-muted/40 p-3">
                <p className="text-sm">{f.content}</p>
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Teacher · {new Date(f.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" />
              Quick actions
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" className="justify-start" asChild>
              <Link to="/notebook">
                <NotebookPen className="mr-2 h-4 w-4" /> New log entry
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link to="/evidence">
                <FolderOpen className="mr-2 h-4 w-4" /> Add evidence
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link to="/board">
                <Users className="mr-2 h-4 w-4" /> Team board
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link to="/requests">
                <Inbox className="mr-2 h-4 w-4" /> New request
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
