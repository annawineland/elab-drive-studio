import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import {
  BookOpen,
  MessageSquarePlus,
  Pencil,
  Trash2,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { deleteStudentAccount } from "@/lib/students.functions";
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
import { useAuth } from "@/hooks/use-auth";
import { TeacherOnly } from "@/components/teacher-only";
import { PageHeader, EmptyState } from "@/components/studio-ui";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/control/students")({
  head: () => ({
    meta: [
      { title: "Students — Mission Control" },
      {
        name: "description",
        content: "Class roster with notebook and evidence activity per student, plus quick feedback.",
      },
      { property: "og:title", content: "Students — Mission Control" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudentsPage,
});

interface Row {
  id: string;
  name: string;
  modName: string;
  teamName: string;
  teamId: string | null;
  entries7d: number;
  evidence: number;
  lastActive: string | null;
}

function StudentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [feedbackFor, setFeedbackFor] = useState<Row | null>(null);
  const [feedbackBody, setFeedbackBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [purgeFor, setPurgeFor] = useState<Row | null>(null);
  const deleteAccount = useServerFn(deleteStudentAccount);

  const purgeStudent = useMutation({
    mutationFn: async (row: Row) => {
      await deleteAccount({ data: { studentId: row.id } });
    },
    onSuccess: () => {
      toast.success("Account and all of that student's work were deleted");
      setPurgeFor(null);
      queryClient.invalidateQueries({ queryKey: ["control-roster"] });
      queryClient.invalidateQueries({ queryKey: ["control-rosters"] });
      queryClient.invalidateQueries({ queryKey: ["control-teams-full"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const roster = useQuery({
    queryKey: ["control-roster"],
    queryFn: async () => {
      // Every account that isn't a teacher — including students who were taken
      // off a roster or team, so they can still be managed here.
      const [allProfiles, teacherRoles] = await Promise.all([
        supabase.from("profiles").select("id, full_name"),
        supabase.from("user_roles").select("user_id").eq("role", "teacher"),
      ]);
      if (allProfiles.error) throw allProfiles.error;
      if (teacherRoles.error) throw teacherRoles.error;
      const teacherIds = new Set((teacherRoles.data ?? []).map((r) => r.user_id));
      const ids = (allProfiles.data ?? [])
        .map((p) => p.id)
        .filter((id) => !teacherIds.has(id));
      if (ids.length === 0) return [] as Row[];

      const since = subDays(new Date(), 7).toISOString();
      const [profs, memberships, teams, entries, evidence, enrollments] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", ids),
        supabase.from("team_members").select("user_id, team_id").in("user_id", ids),
        supabase.from("teams").select("id, name"),
        supabase.from("entries").select("user_id, created_at").in("user_id", ids),
        supabase.from("evidence").select("user_id").in("user_id", ids),
        supabase
          .from("mod_enrollments")
          .select("student_id, mods(name)")
          .in("student_id", ids),
      ]);
      if (profs.error) throw profs.error;
      if (memberships.error) throw memberships.error;
      if (teams.error) throw teams.error;
      if (entries.error) throw entries.error;
      if (evidence.error) throw evidence.error;
      if (enrollments.error) throw enrollments.error;

      const teamNameById = new Map((teams.data ?? []).map((t) => [t.id, t.name]));
      const teamByUser = new Map(
        (memberships.data ?? []).map((m) => [m.user_id, teamNameById.get(m.team_id) ?? "—"]),
      );
      const teamIdByUser = new Map(
        (memberships.data ?? []).map((m) => [m.user_id, m.team_id]),
      );
      const modByUser = new Map(
        (enrollments.data ?? [])
          .filter((e) => e.student_id)
          .map((e) => [e.student_id as string, e.mods?.name ?? "—"]),
      );

      return (profs.data ?? []).map((p) => {
        const myEntries = (entries.data ?? []).filter((e) => e.user_id === p.id);
        const latest = myEntries.reduce<string | null>(
          (acc, e) => (acc && acc > e.created_at ? acc : e.created_at),
          null,
        );
        return {
          id: p.id,
          name: p.full_name || "Unnamed",
          modName: modByUser.get(p.id) ?? "—",
          teamName: teamByUser.get(p.id) ?? "No team",
          teamId: teamIdByUser.get(p.id) ?? null,
          entries7d: myEntries.filter((e) => e.created_at >= since).length,
          evidence: (evidence.data ?? []).filter((e) => e.user_id === p.id).length,
          lastActive: latest,
        } satisfies Row;
      });
    },
  });

  // Feedback already sent to the selected student, so it can be edited or removed.
  const priorFeedback = useQuery({
    queryKey: ["student-feedback", feedbackFor?.id],
    enabled: !!feedbackFor,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("id, content, created_at")
        .eq("target_user_id", feedbackFor!.id)
        .eq("author_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const sendFeedback = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { error } = await supabase
          .from("feedback")
          .update({ content: feedbackBody.trim() })
          .eq("id", editingId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("feedback").insert({
        author_id: user!.id,
        target_user_id: feedbackFor!.id,
        content: feedbackBody.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingId ? "Feedback updated" : `Feedback sent to ${feedbackFor!.name}`);
      setEditingId(null);
      setFeedbackBody("");
      queryClient.invalidateQueries({ queryKey: ["student-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeFeedback = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feedback").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      toast.success("Feedback deleted");
      if (editingId === id) {
        setEditingId(null);
        setFeedbackBody("");
      }
      queryClient.invalidateQueries({ queryKey: ["student-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <TeacherOnly>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Teacher Mission Control"
          title="Students"
          description="Notebook activity, evidence counts, and quick feedback for every student."
        />

        {roster.isLoading && <p className="text-sm text-muted-foreground">Loading roster…</p>}

        {!roster.isLoading && (roster.data?.length ?? 0) === 0 && (
          <EmptyState
            icon={UsersRound}
            title="No students yet"
            description="Students appear here after they sign up and pick the student role."
          />
        )}

        {(roster.data?.length ?? 0) > 0 && (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Mod</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Entries (7d)</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Last entry</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.data!.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/profile/$studentId"
                        params={{ studentId: r.id }}
                        className="hover:text-primary hover:underline"
                      >
                        {r.name}
                      </Link>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">{r.modName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.teamName}</TableCell>
                    <TableCell>
                      <span
                        className={
                          r.entries7d === 0
                            ? "font-mono text-xs text-destructive"
                            : "font-mono text-xs text-foreground"
                        }
                      >
                        {r.entries7d}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          r.evidence === 0
                            ? "font-mono text-xs text-destructive"
                            : "font-mono text-xs text-foreground"
                        }
                      >
                        {r.evidence}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.lastActive ? format(new Date(r.lastActive), "MMM d") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {r.teamId && (
                          <Button variant="ghost" size="icon" asChild>
                            <Link
                              to="/review/$teamId"
                              params={{ teamId: r.teamId }}
                              search={{ student: r.id }}
                              aria-label={`Open ${r.name}'s notebook`}
                              title={`Open ${r.name}'s notebook`}
                            >
                              <BookOpen className="h-4 w-4 text-primary" />
                            </Link>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setFeedbackFor(r);
                            setFeedbackBody("");
                            setEditingId(null);
                          }}
                          aria-label={`Send feedback to ${r.name}`}
                        >
                          <MessageSquarePlus className="h-4 w-4 text-primary" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPurgeFor(r)}
                          aria-label={`Delete ${r.name}'s account and work`}
                          title="Delete account and all their work"
                        >
                          <UserRoundX className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog
          open={!!feedbackFor}
          onOpenChange={(o) => {
            if (!o) {
              setFeedbackFor(null);
              setEditingId(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Feedback for {feedbackFor?.name}</DialogTitle>
              <DialogDescription>
                Specific, actionable, and kind — it lands in their Feedback page immediately.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                sendFeedback.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="fb-body">{editingId ? "Edit feedback" : "Feedback"}</Label>
                <Textarea
                  id="fb-body"
                  value={feedbackBody}
                  onChange={(e) => setFeedbackBody(e.target.value)}
                  placeholder="e.g. Great iteration notes this week — next, tie your test data back to the criteria."
                  rows={4}
                  required
                />
              </div>
              <DialogFooter className="gap-2 sm:justify-end">
                {editingId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingId(null);
                      setFeedbackBody("");
                    }}
                  >
                    Cancel edit
                  </Button>
                )}
                <Button type="submit" disabled={sendFeedback.isPending}>
                  {sendFeedback.isPending
                    ? "Saving…"
                    : editingId
                      ? "Save changes"
                      : "Send feedback"}
                </Button>
              </DialogFooter>
            </form>

            {(priorFeedback.data?.length ?? 0) > 0 && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Feedback you've sent
                </p>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {priorFeedback.data!.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">{f.content}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {format(new Date(f.created_at), "MMM d, yyyy · h:mm a")}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditingId(f.id);
                            setFeedbackBody(f.content);
                          }}
                          aria-label="Edit this feedback"
                          title="Edit this feedback"
                        >
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeFeedback.mutate(f.id)}
                          aria-label="Delete this feedback"
                          title="Delete this feedback"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!purgeFor} onOpenChange={(o) => !o && setPurgeFor(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this student's account and work?</AlertDialogTitle>
              <AlertDialogDescription>
                {purgeFor?.name} will be signed out for good. This permanently deletes their
                account, notebook entries, evidence links, requests, feedback, rubric scores, team
                membership, and roster spots. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={purgeStudent.isPending}
                onClick={(ev) => {
                  ev.preventDefault();
                  if (purgeFor) purgeStudent.mutate(purgeFor);
                }}
              >
                {purgeStudent.isPending ? "Deleting…" : "Delete permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TeacherOnly>
  );
}
