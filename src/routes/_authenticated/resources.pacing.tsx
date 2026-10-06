import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import {
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  ListChecks,
  Loader2,
  PackageCheck,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  PACING_WEEKS_KEY,
  TEAM_PACING_KEY,
  pacingWeeksQueryOptions,
  teamPacingWeeksQueryOptions,
  parseLocalDate,
  todayLocalISO,
  weekStatus,
  type PacingWeek,
  type WeekStatus,
} from "@/lib/pacing-queries";
import { stageLabel, WORKFLOW_STAGES } from "@/lib/studio";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyTeam } from "@/hooks/use-my-team";
import { PageHeader } from "@/components/studio-ui";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/resources/pacing")({
  head: () => ({
    meta: [
      { title: "Pacing Guide — Engineering Studio" },
      {
        name: "description",
        content:
          "The quarter at a glance: week-by-week pacing from client kickoff to final presentations, mapped to the engineering workflow stages.",
      },
      { property: "og:title", content: "Pacing Guide — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PacingGuidePage,
});

const NO_STAGE = "__none__";

function dateRangeLabel(week: PacingWeek): string {
  const s = parseLocalDate(week.start_date);
  const e = parseLocalDate(week.end_date);
  return s.getMonth() === e.getMonth()
    ? `${format(s, "MMM d")} – ${format(e, "d")}`
    : `${format(s, "MMM d")} – ${format(e, "MMM d")}`;
}

function StatusBadge({ status }: { status: WeekStatus }) {
  if (status === "current") {
    return <Badge>This week</Badge>;
  }
  if (status === "done") {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="h-3 w-3" /> Wrapped up
      </Badge>
    );
  }
  return <Badge variant="outline">Upcoming</Badge>;
}

function LineList({ text }: { text: string }) {
  const items = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (items.length === 0) return <p className="text-xs text-muted-foreground">—</p>;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/70" />
          {item}
        </li>
      ))}
    </ul>
  );
}

interface WeekDraft {
  start_date: string;
  end_date: string;
  focus: string;
  stage: string;
  milestones: string;
  deliverables: string;
}

/** Teacher dialog: edit one week's dates, focus, stage, milestones, and deliverables. */
function EditWeekDialog({
  week,
  table,
  onClose,
}: {
  week: PacingWeek | null;
  /** Which plan is being edited: the shared class guide or a team's private plan. */
  table: "pacing_weeks" | "team_pacing_weeks";
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<WeekDraft | null>(null);

  // Initialize the draft whenever a different week is opened.
  if (week && draft === null) {
    setDraft({
      start_date: week.start_date,
      end_date: week.end_date,
      focus: week.focus,
      stage: week.stage ?? NO_STAGE,
      milestones: week.milestones,
      deliverables: week.deliverables,
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!week || !draft) return;
      if (!draft.start_date || !draft.end_date) throw new Error("Both dates are required");
      if (draft.end_date < draft.start_date)
        throw new Error("The end date must be on or after the start date");
      const { error } = await supabase
        .from(table)
        .update({
          start_date: draft.start_date,
          end_date: draft.end_date,
          focus: draft.focus.trim(),
          stage: draft.stage === NO_STAGE ? null : draft.stage,
          milestones: draft.milestones.trim(),
          deliverables: draft.deliverables.trim(),
        })
        .eq("id", week.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: table === "pacing_weeks" ? PACING_WEEKS_KEY : TEAM_PACING_KEY,
      });
      toast.success(
        table === "pacing_weeks"
          ? "Week updated — students see the change right away"
          : "Week updated in your team plan",
      );
      handleClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleClose() {
    setDraft(null);
    onClose();
  }

  return (
    <Dialog open={week !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Week {week?.week_number}</DialogTitle>
          <DialogDescription>
            Update the dates and content for this week. Use one item per line for milestones and
            deliverables.
          </DialogDescription>
        </DialogHeader>
        {draft && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pacing-start">Start date</Label>
                <Input
                  id="pacing-start"
                  type="date"
                  value={draft.start_date}
                  onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pacing-end">End date</Label>
                <Input
                  id="pacing-end"
                  type="date"
                  value={draft.end_date}
                  onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pacing-focus">Focus for the week</Label>
              <Input
                id="pacing-focus"
                value={draft.focus}
                onChange={(e) => setDraft({ ...draft, focus: e.target.value })}
                placeholder="e.g., Research — benchmark existing solutions."
              />
            </div>
            <div className="space-y-2">
              <Label>Workflow stage (links to the notebook)</Label>
              <Select
                value={draft.stage}
                onValueChange={(v) => setDraft({ ...draft, stage: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STAGE}>No stage</SelectItem>
                  {WORKFLOW_STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pacing-milestones">Milestones — one per line</Label>
              <Textarea
                id="pacing-milestones"
                rows={4}
                value={draft.milestones}
                onChange={(e) => setDraft({ ...draft, milestones: e.target.value })}
                placeholder={"Interviews completed\nProblem statement drafted"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pacing-deliverables">Deliverables — one per line</Label>
              <Textarea
                id="pacing-deliverables"
                rows={4}
                value={draft.deliverables}
                onChange={(e) => setDraft({ ...draft, deliverables: e.target.value })}
                placeholder={"Interview notes in the notebook"}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !draft?.focus.trim()}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save week
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PacingGuidePage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isTeacher = role === "teacher";
  const { data: team } = useMyTeam();
  const weeks = useQuery(pacingWeeksQueryOptions());
  const teamWeeks = useQuery(teamPacingWeeksQueryOptions(team?.id));
  const [view, setView] = useState<"class" | "team">("class");
  const [editing, setEditing] = useState<PacingWeek | null>(null);
  const today = todayLocalISO();

  const showingTeam = view === "team" && !!team;
  const classRows = weeks.data ?? [];
  const teamRows = teamWeeks.data ?? [];
  const rows = showingTeam ? teamRows : classRows;
  const current = rows.find((w) => weekStatus(w, today) === "current");
  const canEdit = showingTeam || isTeacher;

  const copyClassGuide = useMutation({
    mutationFn: async () => {
      if (!team) return;
      const { error } = await supabase.from("team_pacing_weeks").insert(
        classRows.map((w) => ({
          team_id: team.id,
          week_number: w.week_number,
          start_date: w.start_date,
          end_date: w.end_date,
          focus: w.focus,
          stage: w.stage,
          milestones: w.milestones,
          deliverables: w.deliverables,
        })),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEAM_PACING_KEY });
      toast.success("Your team plan now starts from the class guide");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const clearTeamPlan = useMutation({
    mutationFn: async () => {
      if (!team) return;
      const { error } = await supabase.from("team_pacing_weeks").delete().eq("team_id", team.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEAM_PACING_KEY });
      toast.success("Team plan cleared");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Library"
        title="Pacing Guide"
        description="The quarter at a glance — what your team should accomplish each week, from client kickoff to final presentations."
        actions={
          <Button variant="outline" asChild>
            <Link to="/resources">Back to library</Link>
          </Button>
        }
      />

      {team && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-1">
            <Button
              variant={view === "class" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("class")}
            >
              Class guide
            </Button>
            <Button
              variant={view === "team" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("team")}
            >
              Our team plan
            </Button>
          </div>
          {showingTeam && teamRows.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearTeamPlan.mutate()}
              disabled={clearTeamPlan.isPending}
            >
              Clear team plan
            </Button>
          )}
        </div>
      )}

      {showingTeam && teamRows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-4">
            <p className="text-sm text-muted-foreground">
              Your team doesn't have a private plan yet. Start from the class guide, then edit any
              week — only your teammates (and your teacher) can see it.
            </p>
            <Button
              onClick={() => copyClassGuide.mutate()}
              disabled={copyClassGuide.isPending || classRows.length === 0}
            >
              {copyClassGuide.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Start from the class guide
            </Button>
          </CardContent>
        </Card>
      )}

      {weeks.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the pacing guide…
        </p>
      )}

      {current && (
        <Card className="border-primary/50 bg-primary/[0.04]">
          <CardContent className="flex items-center gap-3 p-4">
            <CalendarRange className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm">
              <span className="font-semibold">
                You're in Week {current.week_number} ({dateRangeLabel(current)}):
              </span>{" "}
              <span className="text-muted-foreground">{current.focus}</span>
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((week) => {
          const status = weekStatus(week, today);
          return (
            <Card
              key={week.id}
              className={cn(
                "overflow-hidden",
                status === "current" && "border-primary/60 shadow-[0_0_0_1px_var(--color-primary)]",
                status === "done" && "opacity-75",
              )}
            >
              <div className="flex">
                <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 border-r bg-muted/40 p-3 text-center sm:w-24">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Week
                  </span>
                  <span className="font-display text-2xl font-bold">{week.week_number}</span>
                  <span className="font-mono text-[10px] leading-tight text-muted-foreground">
                    {dateRangeLabel(week)}
                  </span>
                </div>

                <div className="min-w-0 flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-sm font-semibold leading-snug">{week.focus}</p>
                      {week.stage && (
                        <Link
                          to="/notebook"
                          search={{ stage: week.stage }}
                          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
                        >
                          Stage: {stageLabel(week.stage)}
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={status} />
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit this week"
                          onClick={() => setEditing(week)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        <ListChecks className="h-3 w-3" /> Milestones
                      </p>
                      <LineList text={week.milestones} />
                    </div>
                    <div className="space-y-1.5">
                      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        <PackageCheck className="h-3 w-3" /> Deliverables
                      </p>
                      <LineList text={week.deliverables} />
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {showingTeam
          ? "This plan is private to your team. Edit any week to set your own dates, milestones, and deliverables."
          : isTeacher
            ? "New quarter? Use the pencil on each week to shift the dates and adjust the content — the current-week highlight follows the dates automatically."
            : "This is the shared class guide set by your teacher. Switch to \u201cOur team plan\u201d to keep your own editable version."}
      </p>

      <EditWeekDialog
        week={editing}
        table={showingTeam ? "team_pacing_weeks" : "pacing_weeks"}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
