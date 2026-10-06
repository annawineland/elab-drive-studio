import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isFuture, parseISO } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  MessageSquare,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MissionFeedbackDialog } from "@/components/mission-feedback";

import { parseMissionDescription, encodeMissionAttachment } from "@/lib/mission-attachment";
import { resourceDocsQueryOptions } from "@/lib/resource-queries";
import { db } from "@/integrations/firebase/client";
import { TeacherOnly } from "@/components/teacher-only";
import { WORKFLOW_STAGES, missionDueStatus, stageLabel, DUE_TONE_CLASS } from "@/lib/studio";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState, StageBadge } from "@/components/studio-ui";
import { VocabText } from "@/components/vocab-text";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/control/missions")({
  head: () => ({
    meta: [
      { title: "Missions — Mission Control" },
      {
        name: "description",
        content:
          "Post daily mission briefs for your mods — they appear on every student's Studio Home.",
      },
      { property: "og:title", content: "Missions — Mission Control" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MissionsPage,
});

function MissionsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{ slug: string; title: string } | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<{ id: string; title: string } | null>(null);

  const [mTitle, setMTitle] = useState("");
  const [mDesc, setMDesc] = useState("");
  const [mMod, setMMod] = useState("all");
  const [mStage, setMStage] = useState("none");
  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10));
  const [mDue, setMDue] = useState("");

  const resetForm = () => {
    setEditingId(null);
    setAttachment(null);
    setMTitle("");
    setMDesc("");
    setMMod("all");
    setMStage("none");
    setMDate(new Date().toISOString().slice(0, 10));
    setMDue("");
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (m: {
    id: string;
    title: string;
    description: string | null;
    mod_id: string | null;
    stage: string | null;
    mission_date: string;
    due_date: string | null;
  }) => {
    const parsed = parseMissionDescription(m.description);
    setEditingId(m.id);
    setAttachment(parsed.attachment);
    setMTitle(m.title);
    setMDesc(parsed.text);
    setMMod(m.mod_id ?? "all");
    setMStage(m.stage ? m.stage : "none");
    setMDate(m.mission_date);
    setMDue(m.due_date ?? "");
    setDialogOpen(true);
  };

  const resourceDocs = useQuery(resourceDocsQueryOptions());

  const mods = useQuery({
    queryKey: ["mods"],
    queryFn: async () => {
      const { data, error } = await db.from("mods").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const missions = useQuery({
    queryKey: ["control-missions"],
    queryFn: async () => {
      const { data, error } = await db
        .from("missions")
        .select("*, mods(name)")
        .order("mission_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const teams = useQuery({
    queryKey: ["control-teams-lite"],
    queryFn: async () => {
      const { data, error } = await db.from("teams").select("id, name, mod_id");
      if (error) throw error;
      return data;
    },
  });

  const completions = useQuery({
    queryKey: ["control-mission-completions"],
    queryFn: async () => {
      const { data, error } = await db
        .from("mission_completions")
        .select("mission_id, team_id, completed_at, teams(name)")
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const completionsByMission = new Map<
    string,
    { team_id: string; name: string; completed_at: string }[]
  >();
  for (const c of completions.data ?? []) {
    const list = completionsByMission.get(c.mission_id) ?? [];
    list.push({
      team_id: c.team_id,
      name: c.teams?.name ?? "Team",
      completed_at: c.completed_at,
    });
    completionsByMission.set(c.mission_id, list);
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = [
        mDesc.trim(),
        attachment ? encodeMissionAttachment(attachment.slug, attachment.title) : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const payload = {
        title: mTitle.trim(),
        description: body,
        mod_id: mMod === "all" ? null : mMod,
        stage: mStage === "none" ? "" : mStage,
        mission_date: mDate,
        due_date: mDue || null,
      };
      const { error } = editingId
        ? await db.from("missions").update(payload).eq("id", editingId)
        : await db.from("missions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingId ? "Mission updated" : "Mission posted");
      setDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["control-missions"] });
      queryClient.invalidateQueries({ queryKey: ["missions-today"] });
      queryClient.invalidateQueries({ queryKey: ["control-missions-today"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("missions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mission removed");
      queryClient.invalidateQueries({ queryKey: ["control-missions"] });
      queryClient.invalidateQueries({ queryKey: ["missions-today"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const flagPastDue = useMutation({
    mutationFn: async ({ id, flag }: { id: string; flag: boolean }) => {
      const { error } = await db
        .from("missions")
        .update({ past_due_at: flag ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.flag ? "Mission marked past due" : "Past-due flag cleared");
      queryClient.invalidateQueries({ queryKey: ["control-missions"] });
      queryClient.invalidateQueries({ queryKey: ["missions-today"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const dateLabel = (d: string) => {
    const parsed = parseISO(d);
    if (isToday(parsed)) return "Today";
    if (isFuture(parsed)) return format(parsed, "MMM d") + " (upcoming)";
    return format(parsed, "MMM d, yyyy");
  };

  return (
    <TeacherOnly>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Teacher Mission Control"
          title="Missions"
          description="Daily briefs that greet students on their Studio Home."
          actions={
            <Button onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> New mission
            </Button>
          }
        />

        {missions.isLoading && <p className="text-sm text-muted-foreground">Loading missions…</p>}

        {!missions.isLoading && (missions.data?.length ?? 0) === 0 && (
          <EmptyState
            icon={CalendarClock}
            title="No missions posted"
            description="Post today's mission — it shows up on every student's Studio Home."
            action={
              <Button variant="outline" onClick={openNew}>
                <Plus className="mr-1.5 h-4 w-4" /> Post your first mission
              </Button>
            }
          />
        )}

        <div className="space-y-3">
          {missions.data?.map((m) => (
            <Card key={m.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{m.title}</h3>
                      {m.stage && <StageBadge stage={m.stage} />}
                      {(() => {
                        const due = missionDueStatus(m.due_date);
                        return due ? (
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              DUE_TONE_CLASS[due.tone],
                            )}
                          >
                            {due.label}
                          </span>
                        ) : null;
                      })()}
                      {m.past_due_at && (
                        <span className="flex items-center gap-1 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          Marked past due
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {dateLabel(m.mission_date)} · {m.mods?.name ?? "All mods"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setFeedbackFor({ id: m.id, title: m.title })}
                      aria-label="Leave feedback on this mission"
                      title="Leave feedback for a team on this mission"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={flagPastDue.isPending}
                      onClick={() => flagPastDue.mutate({ id: m.id, flag: !m.past_due_at })}
                      aria-label={m.past_due_at ? "Clear past-due flag" : "Mark mission past due"}
                      title={
                        m.past_due_at
                          ? "Clear past-due flag"
                          : "Mark past due — shows on team home pages until checked off"
                      }
                    >
                      <AlertTriangle
                        className={cn("h-4 w-4", m.past_due_at && "text-destructive")}
                      />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(m)}
                      aria-label="Edit mission"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove.mutate(m.id)}
                      aria-label="Delete mission"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {m.description && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    <VocabText text={parseMissionDescription(m.description).text} />
                  </p>
                )}
                {parseMissionDescription(m.description).attachment && (
                  <p className="mt-2 text-xs font-medium text-primary">
                    Attached: {parseMissionDescription(m.description).attachment!.title}
                  </p>
                )}
                <div className="mt-3">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/notebook"
                      search={m.stage ? { stage: m.stage, mission: m.id } : { mission: m.id }}
                    >
                      <NotebookPen className="mr-1.5 h-4 w-4" />
                      {m.stage ? `Open ${stageLabel(m.stage)} in notebook` : "Open design notebook"}
                    </Link>
                  </Button>
                </div>
                {(() => {
                  const done = completionsByMission.get(m.id) ?? [];
                  const eligible = (teams.data ?? []).filter(
                    (t) => !m.mod_id || t.mod_id === m.mod_id,
                  );
                  const doneIds = new Set(done.map((d) => d.team_id));
                  const pending = eligible.filter((t) => !doneIds.has(t.id));
                  return (
                    <div className="mt-3 rounded-md border bg-muted/30 p-3">
                      <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        Checked off by {done.length} of {eligible.length} team
                        {eligible.length === 1 ? "" : "s"}
                      </p>
                      {done.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {done.map((d) => (
                            <li
                              key={d.team_id}
                              className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                              title={new Date(d.completed_at).toLocaleString()}
                            >
                              {d.name} ·{" "}
                              {new Date(d.completed_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              {new Date(d.completed_at).toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </li>
                          ))}
                        </ul>
                      )}
                      {pending.length > 0 && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Still open: {pending.map((t) => t.name).join(", ")}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit mission" : "New mission"}</DialogTitle>
              <DialogDescription>
                {editingId
                  ? "Changes appear on every student's Studio Home right away."
                  : "One clear objective for the day."}
              </DialogDescription>
            </DialogHeader>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="mi-title">Title</Label>
                <Input
                  id="mi-title"
                  value={mTitle}
                  onChange={(e) => setMTitle(e.target.value)}
                  placeholder="e.g. Decision matrix due — pick your concept"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mi-desc">Brief</Label>
                <Textarea
                  id="mi-desc"
                  value={mDesc}
                  onChange={(e) => setMDesc(e.target.value)}
                  placeholder="What should teams accomplish today? Deliverables?"
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Mod</Label>
                  <Select value={mMod} onValueChange={setMMod}>
                    <SelectTrigger>
                      <SelectValue />
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
                </div>
                <div className="space-y-1.5">
                  <Label>Stage</Label>
                  <Select value={mStage} onValueChange={setMStage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any stage</SelectItem>
                      {WORKFLOW_STAGES.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mi-date">Date</Label>
                  <Input
                    id="mi-date"
                    type="date"
                    value={mDate}
                    onChange={(e) => setMDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mi-due">Due date</Label>
                  <Input
                    id="mi-due"
                    type="date"
                    value={mDue}
                    onChange={(e) => setMDue(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Attached resource</Label>
                <Select
                  value={attachment?.slug ?? "none"}
                  onValueChange={(slug) => {
                    if (slug === "none") return setAttachment(null);
                    const doc = (resourceDocs.data ?? []).find((d) => d.slug === slug);
                    if (doc) setAttachment({ slug: doc.slug, title: doc.title });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No resource attached" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No resource attached</SelectItem>
                    {(resourceDocs.data ?? []).map((d) => (
                      <SelectItem key={d.slug} value={d.slug}>
                        {d.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {attachment && (
                  <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
                    <p className="text-xs">
                      Attached: <span className="font-medium text-primary">{attachment.title}</span>
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setAttachment(null)}
                      aria-label="Remove attachment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending
                    ? editingId
                      ? "Saving…"
                      : "Posting…"
                    : editingId
                      ? "Save changes"
                      : "Post mission"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {feedbackFor && (
          <MissionFeedbackDialog
            missionId={feedbackFor.id}
            missionTitle={feedbackFor.title}
            teams={(() => {
              const mission = (missions.data ?? []).find((m) => m.id === feedbackFor.id);
              return (teams.data ?? [])
                .filter((t) => !mission?.mod_id || t.mod_id === mission.mod_id)
                .map((t) => ({ id: t.id, name: t.name }));
            })()}
            open
            onOpenChange={(v) => {
              if (!v) setFeedbackFor(null);
            }}
          />
        )}
      </div>
    </TeacherOnly>
  );
}
