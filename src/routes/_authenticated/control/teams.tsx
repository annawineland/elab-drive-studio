import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  GraduationCap,
  KanbanSquare,
  NotebookPen,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { TeacherOnly } from "@/components/teacher-only";
import { WORKFLOW_STAGES } from "@/lib/studio";
import { PageHeader, EmptyState } from "@/components/studio-ui";
import { PacingTracker } from "@/components/pacing-tracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/control/teams")({
  head: () => ({
    meta: [
      { title: "Teams — Mission Control" },
      {
        name: "description",
        content: "Create and manage engineering teams, join codes, and workflow stages.",
      },
      { property: "og:title", content: "Teams — Mission Control" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamsPage,
});

function TeamsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [tName, setTName] = useState("");
  const [tMod, setTMod] = useState("none");
  const [tClient, setTClient] = useState("");
  const [tFocus, setTFocus] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const mods = useQuery({
    queryKey: ["mods"],
    queryFn: async () => {
      const { data, error } = await db.from("mods").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Roster for the mod picked in the New team dialog — members are checkable.
  const dialogRoster = useQuery({
    queryKey: ["mod-roster", tMod],
    enabled: dialogOpen && tMod !== "none",
    queryFn: async () => {
      const { data: enrolls, error } = await db
        .from("mod_enrollments")
        .select("id, email, student_id")
        .eq("mod_id", tMod)
        .order("email");
      if (error) throw error;
      const ids = (enrolls ?? []).map((e) => e.student_id).filter((x): x is string => !!x);
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profs, error: pErr } = await db
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        if (pErr) throw pErr;
        (profs ?? []).forEach((p) => names.set(p.id, p.full_name));
      }
      return (enrolls ?? []).map((e) => ({
        ...e,
        name: e.student_id ? (names.get(e.student_id) ?? "") : "",
      }));
    },
  });

  const teams = useQuery({
    queryKey: ["control-teams-full"],
    queryFn: async () => {
      const { data: teamRows, error } = await db
        .from("teams")
        .select("*, mods(name)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const { data: mems, error: mErr } = await db
        .from("team_members")
        .select("id, team_id, user_id");
      if (mErr) throw mErr;
      const memberIds = (mems ?? []).map((m) => m.user_id);
      const names = new Map<string, string>();
      if (memberIds.length > 0) {
        const { data: profs, error: pErr } = await db
          .from("profiles")
          .select("id, full_name")
          .in("id", memberIds);
        if (pErr) throw pErr;
        (profs ?? []).forEach((p) => names.set(p.id, p.full_name));
      }
      const byTeam = new Map<string, { id: string; user_id: string; name: string }[]>();
      (mems ?? []).forEach((m) => {
        const list = byTeam.get(m.team_id) ?? [];
        list.push({ id: m.id, user_id: m.user_id, name: names.get(m.user_id) || "Student" });
        byTeam.set(m.team_id, list);
      });
      return (teamRows ?? []).map((t) => ({
        ...t,
        members: byTeam.get(t.id) ?? [],
        memberCount: (byTeam.get(t.id) ?? []).length,
      }));
    },
  });

  // Total mission score per team (summed from graded missions).
  const teamScores = useQuery({
    queryKey: ["control-team-scores"],
    queryFn: async () => {
      const { data, error } = await db
        .from("mission_grades")
        .select("team_id, total_points, possible_points");
      if (error) throw error;
      const byTeam = new Map<string, { earned: number; possible: number; count: number }>();
      (data ?? []).forEach((g) => {
        const cur = byTeam.get(g.team_id) ?? { earned: 0, possible: 0, count: 0 };
        cur.earned += g.total_points;
        cur.possible += g.possible_points;
        cur.count += 1;
        byTeam.set(g.team_id, cur);
      });
      return byTeam;
    },
  });

  const removeMember = useMutation({
    mutationFn: async ({ id }: { id: string; name: string }) => {
      const { error } = await db.from("team_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(`${vars.name} removed from the team`);
      queryClient.invalidateQueries({ queryKey: ["control-teams-full"] });
      queryClient.invalidateQueries({ queryKey: ["control-teams"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createTeam = useMutation({
    mutationFn: async () => {
      const { data: team, error } = await db
        .from("teams")
        .insert({
          name: tName.trim(),
          mod_id: tMod === "none" ? null : tMod,
          client_name: tClient.trim(),
          project_focus: tFocus.trim(),
          created_by: user!.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (selectedMembers.length > 0) {
        const { error: mErr } = await db
          .from("team_members")
          .insert(selectedMembers.map((uid) => ({ team_id: team.id, user_id: uid })));
        if (mErr) throw mErr;
      }
      return selectedMembers.length;
    },
    onSuccess: (memberCount) => {
      toast.success(
        memberCount > 0
          ? `Team created with ${memberCount} member${memberCount === 1 ? "" : "s"}`
          : "Team created — share the join code with students",
      );
      setDialogOpen(false);
      setTName("");
      setTMod("none");
      setTClient("");
      setTFocus("");
      setSelectedMembers([]);
      queryClient.invalidateQueries({ queryKey: ["control-teams-full"] });
      queryClient.invalidateQueries({ queryKey: ["control-teams"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await db.from("teams").update({ current_stage: stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["control-teams-full"] });
      queryClient.invalidateQueries({ queryKey: ["control-teams"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteTeam = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Team deleted");
      queryClient.invalidateQueries({ queryKey: ["control-teams-full"] });
      queryClient.invalidateQueries({ queryKey: ["control-teams"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <TeacherOnly>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Teacher Mission Control"
          title="Teams"
          description="Create teams per mod, share join codes, and track each team's stage."
          actions={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New team
            </Button>
          }
        />

        {teams.isLoading && <p className="text-sm text-muted-foreground">Loading teams…</p>}

        {!teams.isLoading && (teams.data?.length ?? 0) === 0 && (
          <EmptyState
            icon={Users}
            title="No teams yet"
            description="Create a team, then give students the 6-character join code."
            action={
              <Button variant="outline" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Create your first team
              </Button>
            }
          />
        )}

        {(() => {
          const all = teams.data ?? [];
          const groups: { key: string; label: string; teams: typeof all }[] = (mods.data ?? []).map(
            (m) => ({
              key: m.id,
              label: m.name,
              teams: all.filter((t) => t.mod_id === m.id),
            }),
          );
          const unassigned = all.filter((t) => !t.mod_id);
          if (unassigned.length > 0) {
            groups.push({ key: "none", label: "No mod assigned", teams: unassigned });
          }
          const visible = groups.filter((g) => g.teams.length > 0);

          return visible.map((g) => (
            <section key={g.key} className="space-y-3">
              <div className="flex items-baseline gap-2 border-b pb-1.5">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider">
                  {g.label}
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {g.teams.length} team{g.teams.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {g.teams.map((t) => {
                  const score = teamScores.data?.get(t.id);
                  return (
                    <Card key={t.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-base font-semibold">{t.name}</h3>
                            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                              {t.memberCount} member{t.memberCount === 1 ? "" : "s"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {score ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 font-mono text-xs text-primary"
                                title={`${score.count} mission${score.count === 1 ? "" : "s"} graded`}
                              >
                                <GraduationCap className="h-3.5 w-3.5" />
                                {score.earned}/{score.possible} pts
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                No grades yet
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteTeam.mutate(t.id)}
                              aria-label={`Delete ${t.name}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        {(t.client_name || t.project_focus) && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {[t.client_name && `Client: ${t.client_name}`, t.project_focus]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        <PacingTracker stage={t.current_stage} teamId={t.id} className="mt-3" />
                        {t.members.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {t.members.map((m) => (
                              <span
                                key={m.id}
                                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs"
                              >
                                {m.name}
                                <button
                                  type="button"
                                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={`Remove ${m.name} from ${t.name}`}
                                  onClick={() => removeMember.mutate({ id: m.id, name: m.name })}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 font-mono text-xs tracking-widest text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                            onClick={() => {
                              void navigator.clipboard.writeText(t.join_code);
                              setCopiedId(t.id);
                              setTimeout(() => setCopiedId(null), 1500);
                            }}
                          >
                            {copiedId === t.id ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {t.join_code}
                          </button>
                          <Select
                            value={t.current_stage}
                            onValueChange={(v) => setStage.mutate({ id: t.id, stage: v })}
                          >
                            <SelectTrigger className="h-8 w-44">
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
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/review/$teamId" params={{ teamId: t.id }}>
                              <NotebookPen className="mr-1.5 h-4 w-4" /> Notebook
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/control/team/$teamId" params={{ teamId: t.id }}>
                              <KanbanSquare className="mr-1.5 h-4 w-4" /> Board & minutes
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ));
        })()}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New team</DialogTitle>
              <DialogDescription>
                A join code is generated automatically — students enter it on their Team Dashboard.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                createTeam.mutate();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="team-name">Team name</Label>
                  <Input
                    id="team-name"
                    value={tName}
                    onChange={(e) => setTName(e.target.value)}
                    placeholder="e.g. Torque Wrenches"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Mod</Label>
                  <Select
                    value={tMod}
                    onValueChange={(v) => {
                      setTMod(v);
                      setSelectedMembers([]);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No mod</SelectItem>
                      {(mods.data ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="team-client">Client</Label>
                <Input
                  id="team-client"
                  value={tClient}
                  onChange={(e) => setTClient(e.target.value)}
                  placeholder="e.g. VW eLab front office"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="team-focus">Project focus</Label>
                <Input
                  id="team-focus"
                  value={tFocus}
                  onChange={(e) => setTFocus(e.target.value)}
                  placeholder="e.g. Modular storage for the robotics cart"
                />
              </div>
              {tMod !== "none" && (
                <div className="space-y-1.5">
                  <Label>
                    Members from {(mods.data ?? []).find((m) => m.id === tMod)?.name ?? "this mod"}
                    's roster
                  </Label>
                  <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border p-1.5">
                    {dialogRoster.isLoading && (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading roster…</p>
                    )}
                    {!dialogRoster.isLoading && (dialogRoster.data?.length ?? 0) === 0 && (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">
                        No students on this mod's roster yet — add them from the Rosters page.
                      </p>
                    )}
                    {dialogRoster.data?.map((e) =>
                      e.student_id ? (
                        <label
                          key={e.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
                        >
                          <Checkbox
                            checked={selectedMembers.includes(e.student_id)}
                            onCheckedChange={(v) =>
                              setSelectedMembers((prev) =>
                                v === true
                                  ? [...prev, e.student_id!]
                                  : prev.filter((id) => id !== e.student_id),
                              )
                            }
                          />
                          <span className="text-sm font-medium">{e.name || "Unnamed"}</span>
                          <span className="truncate text-xs text-muted-foreground">{e.email}</span>
                        </label>
                      ) : (
                        <div
                          key={e.id}
                          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 opacity-55"
                          title="This student hasn't signed in yet — they can join with the code later"
                        >
                          <Checkbox disabled />
                          <span className="truncate text-sm text-muted-foreground">{e.email}</span>
                          <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            not signed in
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Or skip this — students can still join themselves with the team code.
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button type="submit" disabled={createTeam.isPending}>
                  {createTeam.isPending ? "Creating…" : "Create team"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TeacherOnly>
  );
}
