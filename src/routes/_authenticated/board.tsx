import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  KanbanSquare,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyTeam } from "@/hooks/use-my-team";
import { useTeamMembers } from "@/hooks/use-team-members";
import { TASK_STATUSES } from "@/lib/studio";
import { PageHeader, EmptyState, StatusBadge } from "@/components/studio-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

export const Route = createFileRoute("/_authenticated/board")({
  head: () => ({
    meta: [
      { title: "Kanban Board — Engineering Studio" },
      {
        name: "description",
        content: "Your team's sprint board: plan work, assign tasks, and move them to done.",
      },
      { property: "og:title", content: "Kanban Board — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BoardPage,
});

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  assignee_id: string | null;
  sprint_id: string | null;
}

function BoardPage() {
  const { user } = useAuth();
  const { data: team, isLoading: teamLoading } = useMyTeam();
  const { data: members } = useTeamMembers(team?.id);
  const queryClient = useQueryClient();

  const [taskOpen, setTaskOpen] = useState(false);
  const [sprintOpen, setSprintOpen] = useState(false);
  const [sprintFilter, setSprintFilter] = useState("all");

  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [tTitle, setTTitle] = useState("");
  const [tDesc, setTDesc] = useState("");
  const [tAssignee, setTAssignee] = useState("none");
  const [tSprint, setTSprint] = useState("none");

  const [editSprintId, setEditSprintId] = useState<string | null>(null);
  const [sName, setSName] = useState("");
  const [sGoal, setSGoal] = useState("");
  const [sStart, setSStart] = useState("");
  const [sEnd, setSEnd] = useState("");
  const [sprintToDelete, setSprintToDelete] = useState<{ id: string; name: string } | null>(null);

  const sprints = useQuery({
    queryKey: ["sprints", team?.id],
    enabled: !!team,
    queryFn: async () => {
      const { data, error } = await db
        .from("sprints")
        .select("*")
        .eq("team_id", team!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const tasks = useQuery({
    queryKey: ["tasks", team?.id, sprintFilter],
    enabled: !!team,
    queryFn: async () => {
      let q = db
        .from("tasks")
        .select("*")
        .eq("team_id", team!.id)
        .order("created_at", { ascending: true });
      if (sprintFilter === "backlog") q = q.is("sprint_id", null);
      else if (sprintFilter !== "all") q = q.eq("sprint_id", sprintFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as Task[];
    },
  });

  const saveTask = useMutation({
    mutationFn: async () => {
      const fields = {
        title: tTitle.trim(),
        description: tDesc.trim(),
        assignee_id: tAssignee === "none" ? null : tAssignee,
        sprint_id: tSprint === "none" ? null : tSprint,
      };
      if (editTaskId) {
        const { error } = await db.from("tasks").update(fields).eq("id", editTaskId);
        if (error) throw error;
      } else {
        const { error } = await db
          .from("tasks")
          .insert({ ...fields, team_id: team!.id, created_by: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editTaskId ? "Task updated" : "Task added");
      setTaskOpen(false);
      setEditTaskId(null);
      setTTitle("");
      setTDesc("");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["team-stats"] });
      queryClient.invalidateQueries({ queryKey: ["count"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const moveTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["team-stats"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveSprint = useMutation({
    mutationFn: async () => {
      const fields = {
        name: sName.trim(),
        goal: sGoal.trim(),
        start_date: sStart || null,
        end_date: sEnd || null,
      };
      if (editSprintId) {
        const { error } = await db.from("sprints").update(fields).eq("id", editSprintId);
        if (error) throw error;
      } else {
        const { error } = await db.from("sprints").insert({ ...fields, team_id: team!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editSprintId ? "Sprint updated" : "Sprint created");
      setSprintOpen(false);
      setEditSprintId(null);
      setSName("");
      setSGoal("");
      setSStart("");
      setSEnd("");
      queryClient.invalidateQueries({ queryKey: ["sprints"] });
      queryClient.invalidateQueries({ queryKey: ["active-sprint"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteSprint = useMutation({
    mutationFn: async (id: string) => {
      // Tasks stay on the board; they just move back to the backlog.
      const { error: taskErr } = await db
        .from("tasks")
        .update({ sprint_id: null })
        .eq("sprint_id", id);
      if (taskErr) throw taskErr;
      const { error } = await db.from("sprints").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      toast.success("Sprint deleted — its tasks moved to the backlog");
      setSprintFilter((f) => (f === id ? "all" : f));
      queryClient.invalidateQueries({ queryKey: ["sprints"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["active-sprint"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setSprintStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (status === "active") {
        // Only one active sprint at a time.
        await db
          .from("sprints")
          .update({ status: "complete" })
          .eq("team_id", team!.id)
          .eq("status", "active");
      }
      const { error } = await db.from("sprints").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprints"] });
      queryClient.invalidateQueries({ queryKey: ["active-sprint"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (teamLoading) return <p className="text-sm text-muted-foreground">Loading board…</p>;
  if (!team) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Team Command Center" title="Kanban Board" />
        <EmptyState
          icon={KanbanSquare}
          title="Join a team first"
          description="The board belongs to your team — join one from the Team Dashboard."
        />
      </div>
    );
  }

  const memberName = (id: string | null) =>
    id ? ((members ?? []).find((m) => m.user_id === id)?.full_name ?? "Teammate") : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${team.name} · Team Command Center`}
        title="Kanban Board"
        description="Plan the sprint, assign the work, move it to done."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditSprintId(null);
                setSName("");
                setSGoal("");
                setSStart("");
                setSEnd("");
                setSprintOpen(true);
              }}
            >
              <CalendarClock className="mr-1.5 h-4 w-4" /> New sprint
            </Button>
            <Button
              onClick={() => {
                const active = (sprints.data ?? []).find((s) => s.status === "active");
                setEditTaskId(null);
                setTTitle("");
                setTDesc("");
                setTAssignee("none");
                setTSprint(active?.id ?? "none");
                setTaskOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> New task
            </Button>
          </div>
        }
      />

      {/* Sprint bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sprintFilter} onValueChange={setSprintFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tasks</SelectItem>
            <SelectItem value="backlog">Backlog (no sprint)</SelectItem>
            {(sprints.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(sprints.data ?? []).map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1"
          >
            <StatusBadge status={s.status} />
            <span className="text-xs text-muted-foreground">{s.name}</span>
            {s.status === "planned" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setSprintStatus.mutate({ id: s.id, status: "active" })}
              >
                Start
              </Button>
            )}
            {s.status === "active" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setSprintStatus.mutate({ id: s.id, status: "complete" })}
              >
                Complete
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={`Edit ${s.name}`}
              onClick={() => {
                setEditSprintId(s.id);
                setSName(s.name);
                setSGoal(s.goal ?? "");
                setSStart(s.start_date ?? "");
                setSEnd(s.end_date ?? "");
                setSprintOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={`Delete ${s.name}`}
              onClick={() => setSprintToDelete({ id: s.id, name: s.name })}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </span>
        ))}
      </div>

      {/* Board */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((col, colIdx) => {
          const colTasks = (tasks.data ?? []).filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="rounded-xl border bg-muted/30 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-label text-muted-foreground">{col.label}</p>
                <span className="font-mono text-xs text-muted-foreground">{colTasks.length}</span>
              </div>
              <div className="space-y-2">
                {colTasks.map((t) => (
                  <Card key={t.id}>
                    <CardContent className="p-3">
                      <p className="text-sm font-medium">{t.title}</p>
                      {t.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                      {memberName(t.assignee_id) && (
                        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                          {memberName(t.assignee_id)}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={colIdx === 0}
                            onClick={() =>
                              moveTask.mutate({ id: t.id, status: TASK_STATUSES[colIdx - 1]!.key })
                            }
                            aria-label="Move back"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={colIdx === TASK_STATUSES.length - 1}
                            onClick={() =>
                              moveTask.mutate({ id: t.id, status: TASK_STATUSES[colIdx + 1]!.key })
                            }
                            aria-label="Move forward"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="flex gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditTaskId(t.id);
                              setTTitle(t.title);
                              setTDesc(t.description ?? "");
                              setTAssignee(t.assignee_id ?? "none");
                              setTSprint(t.sprint_id ?? "none");
                              setTaskOpen(true);
                            }}
                            aria-label="Edit task"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => deleteTask.mutate(t.id)}
                            aria-label="Delete task"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {colTasks.length === 0 && (
                  <p
                    className={cn(
                      "rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground",
                    )}
                  >
                    No tasks
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task dialog (new + edit) */}
      <Dialog
        open={taskOpen}
        onOpenChange={(o) => {
          setTaskOpen(o);
          if (!o) setEditTaskId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTaskId ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>
              {editTaskId ? "Update this task." : "Add work to the board."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveTask.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={tTitle}
                onChange={(e) => setTTitle(e.target.value)}
                placeholder="e.g. Cut chassis plates"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea
                id="task-desc"
                value={tDesc}
                onChange={(e) => setTDesc(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <Select value={tAssignee} onValueChange={setTAssignee}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {(members ?? []).map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sprint</Label>
                <Select value={tSprint} onValueChange={setTSprint}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Backlog</SelectItem>
                    {(sprints.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveTask.isPending}>
                {saveTask.isPending ? "Saving…" : editTaskId ? "Save changes" : "Add task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sprint dialog (new + edit) */}
      <Dialog
        open={sprintOpen}
        onOpenChange={(o) => {
          setSprintOpen(o);
          if (!o) setEditSprintId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editSprintId ? "Edit sprint" : "New sprint"}</DialogTitle>
            <DialogDescription>
              {editSprintId ? "Update this sprint." : "Timebox the next chunk of work."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveSprint.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="sprint-name">Name</Label>
              <Input
                id="sprint-name"
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                placeholder="e.g. Sprint 3 — Prototype v2"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sprint-goal">Goal</Label>
              <Textarea
                id="sprint-goal"
                value={sGoal}
                onChange={(e) => setSGoal(e.target.value)}
                placeholder="What must be true at the end of this sprint?"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sprint-start">Start date</Label>
                <Input
                  id="sprint-start"
                  type="date"
                  value={sStart}
                  onChange={(e) => setSStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sprint-end">End date</Label>
                <Input
                  id="sprint-end"
                  type="date"
                  value={sEnd}
                  onChange={(e) => setSEnd(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveSprint.isPending}>
                {saveSprint.isPending ? "Saving…" : editSprintId ? "Save changes" : "Create sprint"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm sprint delete */}
      <AlertDialog
        open={!!sprintToDelete}
        onOpenChange={(o) => {
          if (!o) setSprintToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{sprintToDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The sprint is removed. Its tasks are not deleted — they move back to the backlog so
              you can re-assign them to another sprint.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (sprintToDelete) deleteSprint.mutate(sprintToDelete.id);
                setSprintToDelete(null);
              }}
            >
              Delete sprint
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
