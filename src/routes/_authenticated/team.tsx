import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Check,
  ClipboardList,
  Copy,
  FolderOpen,
  KanbanSquare,
  ListTodo,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/firebase/client";
import { useMyTeam } from "@/hooks/use-my-team";
import { useTeamMembers } from "@/hooks/use-team-members";
import { WORKFLOW_STAGES } from "@/lib/studio";
import { PageHeader, EmptyState, StatCard } from "@/components/studio-ui";
import { PacingTracker } from "@/components/pacing-tracker";
import { TeamCalendar } from "@/components/team-calendar";
import { TeamContributions } from "@/components/team-contributions";
import { TeamMissionGrades } from "@/components/team-mission-grades";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team Dashboard — Engineering Studio" },
      {
        name: "description",
        content:
          "Your team's command center: project focus, workflow stage, members, and activity.",
      },
      { property: "og:title", content: "Team Dashboard — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

function JoinTeamCard() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");

  const join = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("join_team_by_code", {
        _code: code.trim().toUpperCase(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Welcome to the team!");
      queryClient.invalidateQueries({ queryKey: ["my-team"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <EmptyState
      icon={Users}
      title="You're not on a team yet"
      description="Enter the 6-character join code your teacher shared to join your team."
      action={
        <form
          className="flex w-full max-w-xs gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            join.mutate();
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="JOIN CODE"
            maxLength={6}
            className="font-mono uppercase tracking-widest"
            required
          />
          <Button type="submit" disabled={join.isPending || code.trim().length < 6}>
            Join
          </Button>
        </form>
      }
    />
  );
}

function TeamPage() {
  const { data: team, isLoading } = useMyTeam();
  const { data: members } = useTeamMembers(team?.id);
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const stats = useQuery({
    queryKey: ["team-stats", team?.id],
    enabled: !!team,
    queryFn: async () => {
      const [tasks, evidence, entries] = await Promise.all([
        db
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("team_id", team!.id)
          .neq("status", "done"),
        db.from("evidence").select("id", { count: "exact", head: true }).eq("team_id", team!.id),
        db.from("entries").select("id", { count: "exact", head: true }).eq("team_id", team!.id),
      ]);
      return {
        openTasks: tasks.count ?? 0,
        evidence: evidence.count ?? 0,
        entries: entries.count ?? 0,
      };
    },
  });

  const activeSprint = useQuery({
    queryKey: ["active-sprint", team?.id],
    enabled: !!team,
    queryFn: async () => {
      const { data, error } = await db
        .from("sprints")
        .select("*")
        .eq("team_id", team!.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const recentMinutes = useQuery({
    queryKey: ["minutes-recent", team?.id],
    enabled: !!team,
    queryFn: async () => {
      const { data, error } = await db
        .from("meeting_minutes")
        .select("*")
        .eq("team_id", team!.id)
        .order("meeting_date", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data;
    },
  });

  const setStage = useMutation({
    mutationFn: async (stage: string) => {
      const { error } = await db.from("teams").update({ current_stage: stage }).eq("id", team!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stage updated");
      queryClient.invalidateQueries({ queryKey: ["my-team"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading team…</p>;
  if (!team) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Team Command Center"
          title="Team Dashboard"
          description="Join a team to unlock sprints, boards, and shared planning."
        />
        <JoinTeamCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={team.mods?.name ?? "Team Command Center"}
        title={team.name}
        description={
          [team.client_name && `Client: ${team.client_name}`, team.project_focus]
            .filter(Boolean)
            .join(" · ") || "Team dashboard"
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="text-label text-muted-foreground">Stage</span>
            <Select value={team.current_stage} onValueChange={(v) => setStage.mutate(v)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKFLOW_STAGES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open tasks" value={stats.data?.openTasks ?? "—"} icon={ListTodo} />
        <StatCard label="Team evidence" value={stats.data?.evidence ?? "—"} icon={FolderOpen} />
        <StatCard label="Team entries" value={stats.data?.entries ?? "—"} icon={ClipboardList} />
        <StatCard
          label="Active sprint"
          value={activeSprint.data ? activeSprint.data.name : "None"}
          icon={KanbanSquare}
        />
      </div>

      <PacingTracker stage={team.current_stage} teamId={team.id} />

      <TeamCalendar teamId={team.id} modId={team.mod_id} />

      <TeamContributions teamId={team.id} />

      <TeamMissionGrades teamId={team.id} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Members + join code */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Members</CardTitle>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 font-mono text-xs tracking-widest text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              onClick={() => {
                void navigator.clipboard.writeText(team.join_code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              title="Copy join code"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {team.join_code}
            </button>
          </CardHeader>
          <CardContent className="space-y-2">
            {(members ?? []).map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 rounded-lg border p-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                  {m.full_name
                    .split(/\s+/)
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <p className="flex-1 text-sm font-medium">{m.full_name}</p>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.member_role}
                </span>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Share the join code with teammates so they can join from their Team Dashboard.
            </p>
          </CardContent>
        </Card>

        {/* Recent minutes */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Recent meeting minutes</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/minutes">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(recentMinutes.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">
                No minutes yet — record your next team meeting.
              </p>
            )}
            {recentMinutes.data?.map((m) => (
              <div key={m.id} className="rounded-lg border bg-muted/40 p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {format(new Date(m.meeting_date), "MMM d, yyyy")}
                </p>
                <p className="mt-1 line-clamp-2 text-sm">{m.notes || "No notes recorded."}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
