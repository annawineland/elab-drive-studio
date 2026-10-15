import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, ClipboardList, KanbanSquare, NotebookPen } from "lucide-react";
import { db } from "@/integrations/firebase/client";
import { TASK_STATUSES } from "@/lib/studio";
import { PageHeader, EmptyState, StatusBadge, StageBadge } from "@/components/studio-ui";
import { TeacherOnly } from "@/components/teacher-only";
import { TeamCalendar } from "@/components/team-calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/control/team/$teamId")({
  head: () => ({
    meta: [
      { title: "Team Board & Minutes — Mission Control" },
      {
        name: "description",
        content:
          "Read-only view of a team's kanban board, sprints, and meeting minutes for the teacher.",
      },
      { property: "og:title", content: "Team Board & Minutes — Mission Control" },
      {
        property: "og:description",
        content: "See how a team is planning work and what they decided in meetings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamWorkspacePage,
});

function TeamWorkspacePage() {
  const { teamId } = Route.useParams();

  const data = useQuery({
    queryKey: ["team-workspace", teamId],
    queryFn: async () => {
      const [teamRes, sprintRes, taskRes, minuteRes, memberRes] = await Promise.all([
        db.from("teams").select("*, mods(name)").eq("id", teamId).maybeSingle(),
        db
          .from("sprints")
          .select("*")
          .eq("team_id", teamId)
          .order("created_at", { ascending: true }),
        db.from("tasks").select("*").eq("team_id", teamId).order("created_at", { ascending: true }),
        db
          .from("meeting_minutes")
          .select("*")
          .eq("team_id", teamId)
          .order("meeting_date", { ascending: false }),
        db.from("team_members").select("user_id").eq("team_id", teamId),
      ]);
      if (teamRes.error) throw teamRes.error;
      if (sprintRes.error) throw sprintRes.error;
      if (taskRes.error) throw taskRes.error;
      if (minuteRes.error) throw minuteRes.error;
      if (memberRes.error) throw memberRes.error;

      const ids = (memberRes.data ?? []).map((m) => m.user_id);
      const nameById: Record<string, string> = {};
      if (ids.length) {
        const { data: profiles } = await db.from("profiles").select("id, full_name").in("id", ids);
        for (const p of profiles ?? []) nameById[p.id] = p.full_name;
      }

      return {
        team: teamRes.data,
        sprints: sprintRes.data ?? [],
        tasks: taskRes.data ?? [],
        minutes: minuteRes.data ?? [],
        nameById,
      };
    },
  });

  const team = data.data?.team;
  const sprintName = (id: string | null) =>
    id ? (data.data?.sprints.find((s) => s.id === id)?.name ?? null) : null;

  return (
    <TeacherOnly>
      <div className="space-y-6">
        <PageHeader
          eyebrow={team?.mods?.name ?? "Mission Control"}
          title={team ? `${team.name} — board & minutes` : "Team workspace"}
          description={
            team
              ? [team.client_name && `Client: ${team.client_name}`, team.project_focus]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/control/teams">
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Teams
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/review/$teamId" params={{ teamId }}>
                  <NotebookPen className="mr-1.5 h-4 w-4" /> Notebook
                </Link>
              </Button>
            </div>
          }
        />

        {data.isLoading && <p className="text-sm text-muted-foreground">Loading team workspace…</p>}

        {!data.isLoading && team && (
          <>
            <TeamCalendar teamId={teamId} modId={team.mod_id} />

            {/* Sprints */}
            <section className="space-y-3">
              <h2 className="text-label text-muted-foreground">Sprints</h2>
              {data.data!.sprints.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This team hasn&apos;t planned any sprints yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.data!.sprints.map((s) => (
                    <div key={s.id} className="rounded-lg border bg-card px-3 py-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={s.status} />
                        <span className="text-sm font-medium">{s.name}</span>
                      </div>
                      {s.goal && (
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">{s.goal}</p>
                      )}
                      {(s.start_date || s.end_date) && (
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {s.start_date ? format(new Date(s.start_date), "MMM d") : "—"} →{" "}
                          {s.end_date ? format(new Date(s.end_date), "MMM d") : "—"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Board */}
            <section className="space-y-3">
              <h2 className="text-label text-muted-foreground">Kanban board</h2>
              {data.data!.tasks.length === 0 ? (
                <EmptyState
                  icon={KanbanSquare}
                  title="No tasks on the board yet"
                  description="Tasks this team creates on their kanban board will appear here."
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {TASK_STATUSES.map((col) => {
                    const colTasks = data.data!.tasks.filter((t) => t.status === col.key);
                    return (
                      <div key={col.key} className="rounded-xl border bg-muted/30 p-3">
                        <div className="mb-3 flex items-center justify-between px-1">
                          <p className="text-label text-muted-foreground">{col.label}</p>
                          <span className="font-mono text-xs text-muted-foreground">
                            {colTasks.length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {colTasks.map((t) => (
                            <Card key={t.id}>
                              <CardContent className="p-3">
                                <p className="text-sm font-medium">{t.title}</p>
                                {t.description && (
                                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                                    {t.description}
                                  </p>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  {t.assignee_id && (
                                    <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
                                      {data.data!.nameById[t.assignee_id] ?? "Student"}
                                    </span>
                                  )}
                                  {sprintName(t.sprint_id) && (
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                      {sprintName(t.sprint_id)}
                                    </span>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                          {colTasks.length === 0 && (
                            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                              Nothing here
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Minutes */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-label text-muted-foreground">Meeting minutes</h2>
                <StageBadge stage={team.current_stage} />
              </div>
              {data.data!.minutes.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No meeting minutes yet"
                  description="When this team records a meeting, the notes and decisions show up here."
                />
              ) : (
                <div className="space-y-3">
                  {data.data!.minutes.map((m) => (
                    <Card key={m.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {format(new Date(m.meeting_date), "MMM d, yyyy")}
                          </p>
                          {m.attendees && (
                            <p className="text-xs text-muted-foreground">Present: {m.attendees}</p>
                          )}
                        </div>
                        {m.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{m.notes}</p>}
                        {m.decisions && (
                          <div className="mt-3 rounded-lg bg-muted/50 p-3">
                            <p className="text-label text-muted-foreground">Decisions</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm">{m.decisions}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {!data.isLoading && !team && (
          <EmptyState title="Team not found" description="This team may have been deleted." />
        )}
      </div>
    </TeacherOnly>
  );
}
