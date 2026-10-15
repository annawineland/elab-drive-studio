import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { clearDraft, draftKey, readDraft, useDraftAutosave } from "@/hooks/use-draft-autosave";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  LocateFixed,
  NotebookPen,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyTeam } from "@/hooks/use-my-team";
import { useTeamMembers } from "@/hooks/use-team-members";
import {
  useActiveWriters,
  usePresenceHeartbeat,
  type ActiveWriter,
} from "@/hooks/use-notebook-presence";

import { ENTRY_TYPES, WORKFLOW_STAGES, entryTypeLabel, stageLabel } from "@/lib/studio";
import { cn } from "@/lib/utils";
import { encodeMissionAttachment } from "@/lib/mission-attachment";
import { PostedMissionBanner, usePostedMission } from "@/components/posted-mission-banner";
import { PageHeader, EmptyState } from "@/components/studio-ui";
import { VocabText } from "@/components/vocab-text";
import { MissionGradingPanel } from "@/components/mission-grading";

import { TargetRubricSummary } from "@/components/rubric-ui";
import type { LearningTarget, RubricCriterion, RubricScore } from "@/lib/rubrics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/_authenticated/notebook")({
  validateSearch: (search: Record<string, unknown>): { stage?: string; mission?: string } => ({
    stage: typeof search.stage === "string" && search.stage.length > 0 ? search.stage : undefined,
    mission:
      typeof search.mission === "string" && search.mission.length > 0 ? search.mission : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Design Notebook — Engineering Studio" },
      {
        name: "description",
        content:
          "A guided engineering design notebook: work through each stage of the design process with instructions and missions, and respond with notebook entries.",
      },
      { property: "og:title", content: "Design Notebook — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DesignNotebookPage,
});

interface Entry {
  id: string;
  user_id: string;
  team_id: string | null;
  entry_type: string;
  title: string;
  content: string;
  stage: string;
  mission_id: string | null;
  created_at: string;
}

interface StageGuide {
  id: string;
  stage: string;
  title: string;
  instructions: string;
  sort_order: number;
}

interface StageMission {
  id: string;
  stage: string;
  title: string;
  prompt: string;
  sort_order: number;
}

const UNFILED = "unfiled";

/** The stage of the notebook prompt a link points at, so links without `stage` still land on it. */
function linkedPromptStage(id: string | undefined, prompts: StageMission[] | undefined) {
  return id ? prompts?.find((m) => m.id === id)?.stage : undefined;
}

function DesignNotebookPage() {
  // `mission` is either a notebook prompt (stage_missions) or a posted mission
  // (missions) — links from notifications and grades use the former, mission
  // briefs the latter.
  const { stage: stageParam, mission: missionParam } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const { data: team } = useMyTeam();
  const isTeacher = role === "teacher";

  const guides = useQuery({
    queryKey: ["stage-guides"],
    queryFn: async () => {
      const { data, error } = await db.from("stage_guides").select("*").order("sort_order");
      if (error) throw error;
      return data as StageGuide[];
    },
  });

  const missions = useQuery({
    queryKey: ["stage-missions"],
    queryFn: async () => {
      const { data, error } = await db.from("stage_missions").select("*").order("sort_order");
      if (error) throw error;
      return data as StageMission[];
    },
  });

  const targets = useQuery({
    queryKey: ["learning-targets"],
    queryFn: async () => {
      const { data, error } = await db.from("learning_targets").select("*").order("sort_order");
      if (error) throw error;
      return data as LearningTarget[];
    },
  });

  const criteria = useQuery({
    queryKey: ["rubric-criteria"],
    queryFn: async () => {
      const { data, error } = await db.from("rubric_criteria").select("*").order("sort_order");
      if (error) throw error;
      return data as RubricCriterion[];
    },
  });

  const rubricScores = useQuery({
    queryKey: ["rubric-scores", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db.from("rubric_scores").select("*");
      if (error) throw error;
      return data as RubricScore[];
    },
  });

  // My entries plus my teammates' entries (the rules allow reading team entries).
  const entries = useQuery({
    queryKey: ["my-entries", user?.id, team?.id],
    enabled: !!user,
    queryFn: async () => {
      const clauses = [`user_id.eq.${user!.id}`];
      if (team) clauses.push(`team_id.eq.${team.id}`);
      const { data, error } = await db
        .from("entries")
        .select("*")
        .or(clauses.join(","))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Entry[];
    },
  });

  const { data: teamMembers } = useTeamMembers(team?.id);
  const nameByUser = useMemo(
    () => new Map((teamMembers ?? []).map((m) => [m.user_id, m.full_name])),
    [teamMembers],
  );

  const selectedStage =
    stageParam ??
    linkedPromptStage(missionParam, missions.data) ??
    team?.current_stage ??
    "kickoff";
  const isUnfiled = selectedStage === UNFILED;

  const selectStage = (key: string) =>
    void navigate({ to: "/notebook", search: { stage: key }, replace: true });

  const missionsByStage = useMemo(() => {
    const map = new Map<string, StageMission[]>();
    for (const m of missions.data ?? []) {
      const list = map.get(m.stage) ?? [];
      list.push(m);
      map.set(m.stage, list);
    }
    return map;
  }, [missions.data]);

  const missionById = useMemo(() => {
    const map = new Map<string, StageMission>();
    for (const m of missions.data ?? []) map.set(m.id, m);
    return map;
  }, [missions.data]);

  const entriesByStage = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries.data ?? []) {
      if (e.user_id !== user!.id) continue;
      const key = e.stage || UNFILED;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [entries.data, user]);

  // Teammates' entries, grouped the same way (read-only for the student).
  const teamEntriesByStage = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries.data ?? []) {
      if (e.user_id === user!.id) continue;
      const key = e.stage || UNFILED;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [entries.data, user]);

  const linkedPrompt = missionParam ? missionById.get(missionParam) : undefined;
  const posted = usePostedMission(
    missionParam && missions.isSuccess && !linkedPrompt ? missionParam : undefined,
  );
  const postedMissionId = posted.data?.id;
  // The prompt to open: the linked one, or the one a posted mission was made from.
  const focusedPrompt =
    linkedPrompt ??
    (posted.data
      ? (missions.data ?? []).find(
          (m) => m.stage === posted.data!.stage && m.title === posted.data!.title,
        )
      : undefined);

  // mission_id -> authors of the entries responding to it: mine and my
  // teammates', so a mission counts as responded once anyone on the team has.
  const respondersByMission = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of entries.data ?? []) {
      if (e.mission_id) map.set(e.mission_id, [...(map.get(e.mission_id) ?? []), e.user_id]);
    }
    return map;
  }, [entries.data]);

  // Teacher: which missions have already been posted to students, and when.
  const postedMissions = useQuery({
    queryKey: ["notebook-posted-missions"],
    enabled: isTeacher,
    queryFn: async () => {
      const { data, error } = await db
        .from("missions")
        .select("id, title, stage, mission_date, due_date")
        .order("mission_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const postedByKey = useMemo(() => {
    const map = new Map<string, { count: number; last: string }>();
    for (const p of postedMissions.data ?? []) {
      const key = `${p.stage}::${p.title}`;
      const prev = map.get(key);
      if (!prev) map.set(key, { count: 1, last: p.mission_date });
      else map.set(key, { count: prev.count + 1, last: prev.last });
    }
    return map;
  }, [postedMissions.data]);

  const guide = guides.data?.find((g) => g.stage === selectedStage) ?? null;
  const stageMissions = missionsByStage.get(selectedStage) ?? [];
  const stageEntries = entriesByStage.get(selectedStage) ?? [];
  const teamStageEntries = teamEntriesByStage.get(selectedStage) ?? [];
  const unfiledCount = entriesByStage.get(UNFILED)?.length ?? 0;

  const stageTargets = useMemo(
    () => (targets.data ?? []).filter((t) => t.stage === selectedStage),
    [targets.data, selectedStage],
  );

  // ---------- Entry dialog state ----------
  const [entryDialog, setEntryDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [respondingMission, setRespondingMission] = useState<StageMission | null>(null);
  const [formType, setFormType] = useState("notebook");
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [activeDraftKey, setActiveDraftKey] = useState<string | null>(null);
  const [restoredDraft, setRestoredDraft] = useState(false);

  const draftSavedAt = useDraftAutosave(
    activeDraftKey,
    { title: formTitle, content: formContent },
    entryDialog,
  );

  // Mission responses are written inline under their mission; everything else in the dialog.
  const editorMissionId = entryDialog
    ? editingEntry
      ? editingEntry.mission_id
      : (respondingMission?.id ?? null)
    : null;
  const inlineMissionId =
    !isUnfiled && stageMissions.some((m) => m.id === editorMissionId) ? editorMissionId : null;

  // Show teammates who is writing what, and see who else is.
  usePresenceHeartbeat(
    team?.id,
    user?.id,
    entryDialog && !isTeacher
      ? { missionId: editorMissionId, entryId: editingEntry?.id ?? null }
      : null,
  );
  const activeWriters = useActiveWriters(team?.id, user?.id);
  const writerName = (w: ActiveWriter) => nameByUser.get(w.userId)?.split(/\s+/)[0] ?? "A teammate";

  // Missions whose responses dropdown is open.
  const [openResponses, setOpenResponses] = useState<Set<string>>(() => new Set());
  const setResponsesOpen = (missionId: string, open: boolean) =>
    setOpenResponses((prev) => {
      const next = new Set(prev);
      if (open) next.add(missionId);
      else next.delete(missionId);
      return next;
    });

  const startDraft = (scope: string, fallback: { title: string; content: string }) => {
    const key = draftKey(user?.id, scope);
    const saved = readDraft(key);
    setActiveDraftKey(key);
    setRestoredDraft(Boolean(saved));
    setFormTitle(saved?.title ?? fallback.title);
    setFormContent(saved?.content ?? fallback.content);
  };

  const openRespond = (m: StageMission) => {
    setEditingEntry(null);
    setRespondingMission(m);
    setFormType("notebook");
    startDraft(`mission:${m.id}`, { title: m.title, content: "" });
    setEntryDialog(true);
    setResponsesOpen(m.id, true);
  };

  const openFreeEntry = () => {
    setEditingEntry(null);
    setRespondingMission(null);
    setFormType("notebook");
    startDraft(`new:${isUnfiled ? "unfiled" : selectedStage}`, { title: "", content: "" });
    setEntryDialog(true);
  };

  const openEditEntry = (e: Entry) => {
    setEditingEntry(e);
    setRespondingMission(null);
    setFormType(e.entry_type);
    startDraft(`entry:${e.id}`, { title: e.title, content: e.content });
    setEntryDialog(true);
    if (e.mission_id) setResponsesOpen(e.mission_id, true);
  };

  const saveEntry = useMutation({
    mutationFn: async () => {
      const stage = isUnfiled ? "" : selectedStage;
      const payload = {
        entry_type: formType,
        title: formTitle.trim(),
        content: formContent.trim(),
        stage: editingEntry ? editingEntry.stage : stage,
        mission_id: editingEntry ? editingEntry.mission_id : (respondingMission?.id ?? null),
        user_id: user!.id,
        team_id: team?.id ?? null,
      };
      if (editingEntry) {
        // A teammate's entry keeps its author and team; only the writing changes.
        const changes =
          editingEntry.user_id === user!.id
            ? payload
            : { entry_type: payload.entry_type, title: payload.title, content: payload.content };
        const { error } = await db.from("entries").update(changes).eq("id", editingEntry.id);
        if (error) throw error;
        return { autoCompleted: false };
      }
      const { error } = await db.from("entries").insert(payload);
      if (error) throw error;

      // Auto check-off: if this entry answers a posted mission and the student
      // is on a team, mark that mission complete for the team (once).
      if (postedMissionId && team && !isTeacher) {
        const { data: existing } = await db
          .from("mission_completions")
          .select("id")
          .eq("mission_id", postedMissionId)
          .eq("team_id", team.id)
          .maybeSingle();
        if (!existing) {
          const { error: cErr } = await db.from("mission_completions").insert({
            mission_id: postedMissionId,
            team_id: team.id,
            completed_by: user!.id,
          });
          if (!cErr) return { autoCompleted: true };
        }
      }
      return { autoCompleted: false };
    },
    onSuccess: (result) => {
      toast.success(editingEntry ? "Entry updated" : "Entry added to your notebook");
      if (result?.autoCompleted) toast.success("Mission checked off for your team");
      if (activeDraftKey) clearDraft(activeDraftKey);
      setRestoredDraft(false);
      setEntryDialog(false);

      queryClient.invalidateQueries({ queryKey: ["my-entries"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["count"] });
      queryClient.invalidateQueries({ queryKey: ["posted-mission-completion"] });
      queryClient.invalidateQueries({ queryKey: ["mission-completions"] });
      queryClient.invalidateQueries({ queryKey: ["control-mission-completions"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry deleted");
      queryClient.invalidateQueries({ queryKey: ["my-entries"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["count"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ---------- Teacher: guide editing ----------
  const [guideDialog, setGuideDialog] = useState(false);
  const [guideTitle, setGuideTitle] = useState("");
  const [guideInstructions, setGuideInstructions] = useState("");

  const openEditGuide = () => {
    setGuideTitle(guide?.title ?? stageLabel(selectedStage));
    setGuideInstructions(guide?.instructions ?? "");
    setGuideDialog(true);
  };

  const saveGuide = useMutation({
    mutationFn: async () => {
      if (!guide) throw new Error("No guide found for this stage");
      const { error } = await db
        .from("stage_guides")
        .update({ title: guideTitle.trim(), instructions: guideInstructions.trim() })
        .eq("id", guide.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stage instructions updated — students see this immediately");
      setGuideDialog(false);
      queryClient.invalidateQueries({ queryKey: ["stage-guides"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ---------- Teacher: mission management ----------
  const [missionDialog, setMissionDialog] = useState(false);
  const [editingMission, setEditingMission] = useState<StageMission | null>(null);
  const [missionTitle, setMissionTitle] = useState("");
  const [missionPrompt, setMissionPrompt] = useState("");

  const openNewMission = () => {
    setEditingMission(null);
    setMissionTitle("");
    setMissionPrompt("");
    setMissionDialog(true);
  };

  const openEditMission = (m: StageMission) => {
    setEditingMission(m);
    setMissionTitle(m.title);
    setMissionPrompt(m.prompt);
    setMissionDialog(true);
  };

  const saveMission = useMutation({
    mutationFn: async () => {
      if (editingMission) {
        const { error } = await db
          .from("stage_missions")
          .update({ title: missionTitle.trim(), prompt: missionPrompt.trim() })
          .eq("id", editingMission.id);
        if (error) throw error;
      } else {
        const nextOrder = Math.max(0, ...stageMissions.map((m) => m.sort_order)) + 1;
        const { error } = await db.from("stage_missions").insert({
          stage: selectedStage,
          title: missionTitle.trim(),
          prompt: missionPrompt.trim(),
          sort_order: nextOrder,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingMission ? "Mission updated" : "Mission added");
      setMissionDialog(false);
      queryClient.invalidateQueries({ queryKey: ["stage-missions"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMission = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("stage_missions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mission removed — student entries are kept");
      queryClient.invalidateQueries({ queryKey: ["stage-missions"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ---------- Teacher: post a stage mission as today's brief ----------
  const [postDialog, setPostDialog] = useState(false);
  const [postMission, setPostMission] = useState<StageMission | null>(null);
  const [postDocSlug, setPostDocSlug] = useState<string>("none");

  const resourceDocs = useQuery({
    queryKey: ["resource-docs-picker"],
    enabled: isTeacher,
    queryFn: async () => {
      const { data, error } = await db
        .from("resource_docs")
        .select("slug, title, kind")
        .order("kind")
        .order("sort_order");
      if (error) throw error;
      return data as { slug: string; title: string; kind: string }[];
    },
  });

  const openPostDialog = (m: StageMission) => {
    setPostMission(m);
    setPostDocSlug("none");
    setPostDialog(true);
  };

  const postToday = useMutation({
    mutationFn: async () => {
      const m = postMission;
      if (!m) throw new Error("No mission selected");
      const doc =
        postDocSlug === "none"
          ? null
          : (resourceDocs.data?.find((d) => d.slug === postDocSlug) ?? null);
      const description = doc
        ? `${m.prompt}\n\n${encodeMissionAttachment(doc.slug, doc.title)}`
        : m.prompt;
      const { error } = await db.from("missions").insert({
        title: m.title,
        description,
        stage: selectedStage,
        mod_id: null,
        mission_date: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Posted as today's mission — students see it on Studio Home");
      setPostDialog(false);
      queryClient.invalidateQueries({ queryKey: ["notebook-posted-missions"] });
      queryClient.invalidateQueries({ queryKey: ["missions-today"] });
      queryClient.invalidateQueries({ queryKey: ["control-missions"] });
      queryClient.invalidateQueries({ queryKey: ["control-missions-today"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const loading = guides.isLoading || missions.isLoading;

  const isStageResponse = (e: Entry) =>
    !!e.mission_id && stageMissions.some((m) => m.id === e.mission_id);

  const entryForm = (inline: boolean) => (
    <EntryForm
      showType={!inline && !respondingMission}
      formType={formType}
      onFormType={setFormType}
      title={formTitle}
      onTitle={setFormTitle}
      content={formContent}
      onContent={setFormContent}
      restoredDraft={restoredDraft}
      draftSavedAt={draftSavedAt}
      pending={saveEntry.isPending}
      submitLabel={editingEntry ? "Save changes" : "Add to notebook"}
      onSubmit={() => saveEntry.mutate()}
      onCancel={inline ? () => setEntryDialog(false) : undefined}
      heading={
        inline
          ? editingEntry
            ? editingEntry.user_id === user?.id
              ? "Edit your response"
              : `Edit ${nameByUser.get(editingEntry.user_id) ?? "your teammate"}'s response`
            : "Your response"
          : undefined
      }
    />
  );
  const inlineEditor = entryForm(true);

  // Bring the linked prompt into view once it's on screen.
  const focusedPromptId = focusedPrompt?.stage === selectedStage ? focusedPrompt.id : undefined;
  useEffect(() => {
    if (!focusedPromptId || loading) return;
    document
      .getElementById(`prompt-${focusedPromptId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedPromptId, loading]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Engineering workflow"
        title="Design Notebook"
        description={
          isTeacher
            ? "This is the guided notebook your students see. Edit instructions and missions for any stage — changes appear to students immediately."
            : "Work through the design process stage by stage: read the instructions, then respond to each mission with a notebook entry."
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Stage rail */}
        <aside>
          <p className="px-1 pb-2 text-label text-muted-foreground">Design process</p>
          <ol className="flex flex-col gap-1">
            {WORKFLOW_STAGES.map((s, i) => {
              const total = missionsByStage.get(s.key)?.length ?? 0;
              const done =
                missionsByStage.get(s.key)?.filter((m) => respondersByMission.has(m.id)).length ??
                0;
              const entryCount = entriesByStage.get(s.key)?.length ?? 0;
              const active = selectedStage === s.key;
              const isCurrent = team?.current_stage === s.key;
              return (
                <li key={s.key}>
                  <button
                    onClick={() => selectStage(s.key)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:border-border hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "font-mono text-[10px] font-bold",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          active ? "text-foreground" : "text-foreground/80",
                        )}
                      >
                        {s.label}
                      </span>
                      <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {total > 0 ? `${done}/${total} missions` : "no missions"}
                        {entryCount > 0 &&
                          ` · ${entryCount} ${entryCount === 1 ? "entry" : "entries"}`}
                      </span>
                    </span>
                    {isCurrent && (
                      <span title="Your team's current stage">
                        <LocateFixed className="h-3.5 w-3.5 shrink-0 text-primary" />
                      </span>
                    )}
                    {total > 0 && done >= total && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                    )}
                  </button>
                </li>
              );
            })}
            {unfiledCount > 0 && (
              <li>
                <button
                  onClick={() => selectStage(UNFILED)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border border-dashed px-3 py-2 text-left transition-colors",
                    isUnfiled ? "border-primary bg-primary/10" : "border-border hover:bg-muted/60",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">Unfiled</span>
                    <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {unfiledCount} {unfiledCount === 1 ? "entry" : "entries"} · no stage
                    </span>
                  </span>
                </button>
              </li>
            )}
          </ol>
        </aside>

        {/* Stage workspace */}
        <section className="min-w-0 space-y-6">
          {postedMissionId && (
            <PostedMissionBanner
              missionId={postedMissionId}
              onRespond={focusedPrompt ? () => openRespond(focusedPrompt) : undefined}
            />
          )}
          {loading && (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {!loading && isUnfiled && (
            <EntriesSection
              title="Unfiled entries"
              entries={stageEntries}
              missionById={missionById}
              onEdit={openEditEntry}
              onDelete={(id) => removeEntry.mutate(id)}
            />
          )}

          {!loading && !isUnfiled && (
            <>
              {/* Instructions */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BookOpen className="h-4 w-4 text-primary" />
                      {guide?.title ?? stageLabel(selectedStage)}
                    </CardTitle>
                    {isTeacher && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={openEditGuide}
                        aria-label="Edit instructions"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    <VocabText
                      text={guide?.instructions || "No instructions for this stage yet."}
                    />
                  </p>
                </CardContent>
              </Card>

              {/* Stage grading rubrics */}
              {stageTargets.map((t) => {
                const myScore =
                  (rubricScores.data ?? []).find(
                    (s) => s.target_id === t.id && s.student_id === user?.id,
                  ) ??
                  (rubricScores.data ?? []).find(
                    (s) => s.target_id === t.id && s.team_id === team?.id,
                  );
                return (
                  <TargetRubricSummary
                    key={t.id}
                    target={t}
                    criteria={criteria.data ?? []}
                    score={myScore}
                  />
                );
              })}

              {/* Scoring rubric for every mission in this stage */}
              {stageMissions.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ClipboardCheck className="h-4 w-4 text-primary" />
                      Scoring rubric
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {stageMissions.map((m) => (
                      <MissionGradingPanel
                        key={m.id}
                        missionId={m.id}
                        missionTitle={m.title}
                        heading={m.title}
                        className="mt-0"
                        teamId={team?.id ?? null}
                        isTeacher={isTeacher}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Missions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Missions
                  </h2>
                  {isTeacher && (
                    <Button variant="outline" size="sm" onClick={openNewMission}>
                      <Plus className="mr-1.5 h-4 w-4" /> Add mission
                    </Button>
                  )}
                </div>

                {stageMissions.length === 0 && (
                  <EmptyState
                    icon={NotebookPen}
                    title="No missions in this stage"
                    description={
                      isTeacher
                        ? "Add a mission to prompt students to document their work here."
                        : "Your teacher hasn't posted missions for this stage yet."
                    }
                    action={
                      isTeacher ? (
                        <Button variant="outline" onClick={openNewMission}>
                          <Plus className="mr-1.5 h-4 w-4" /> Add the first mission
                        </Button>
                      ) : undefined
                    }
                  />
                )}

                {stageMissions.map((m) => {
                  const responders = respondersByMission.get(m.id) ?? [];
                  const responses = responders.filter((id) => id === user!.id).length;
                  const teammates = [...new Set(responders)]
                    .filter((id) => id !== user!.id)
                    .map((id) => nameByUser.get(id)?.split(/\s+/)[0] ?? "a teammate");
                  const posted = postedByKey.get(`${m.stage}::${m.title}`) ?? null;
                  const missionResponses = (entries.data ?? []).filter(
                    (e) => e.mission_id === m.id,
                  );
                  // Writing a new response here (edits show on the response itself).
                  const missionWriters = activeWriters.filter(
                    (w) => w.missionId === m.id && !w.entryId,
                  );
                  const postedLabel = posted
                    ? (() => {
                        const [y, mo, d] = posted.last.split("-").map(Number);
                        return format(new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1), "MMM d");
                      })()
                    : null;
                  return (
                    <Card
                      key={m.id}
                      id={`prompt-${m.id}`}
                      className={cn(
                        "scroll-mt-24",
                        m.id === focusedPromptId && "border-primary ring-2 ring-primary/30",
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold">{m.title}</h3>
                              {responders.length > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {responses > 0
                                    ? `Responded${responses > 1 ? ` · ${responses}` : ""}`
                                    : `Responded by ${teammates.join(", ")}`}
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  Not started
                                </span>
                              )}
                              {isTeacher && posted && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                  <Send className="h-3 w-3" />
                                  Posted {postedLabel}
                                  {posted.count > 1 ? ` · ${posted.count}×` : ""}
                                </span>
                              )}
                              {isTeacher && !posted && (
                                <span className="inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  Not posted yet
                                </span>
                              )}
                            </div>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                              <VocabText text={m.prompt} />
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {isTeacher ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openPostDialog(m)}
                                  title="Post this mission as today's brief, optionally with a guide or template"
                                >
                                  <Send className="mr-1.5 h-4 w-4" />
                                  {posted ? "Post again today" : "Post as today's mission"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditMission(m)}
                                  aria-label="Edit mission"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeMission.mutate(m.id)}
                                  aria-label="Delete mission"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant={responses > 0 ? "outline" : "default"}
                                onClick={() => openRespond(m)}
                              >
                                <NotebookPen className="mr-1.5 h-4 w-4" />
                                {responses > 0 ? "Add another response" : "Respond with an entry"}
                              </Button>
                            )}
                          </div>
                        </div>
                        {missionWriters.length > 0 && (
                          <WritingNote
                            names={missionWriters.map(writerName)}
                            what="writing a response"
                          />
                        )}
                        <MissionResponses
                          responses={missionResponses}
                          open={openResponses.has(m.id)}
                          onOpenChange={(open) => setResponsesOpen(m.id, open)}
                          myId={user!.id}
                          teamId={team?.id}
                          authorName={(id) =>
                            id === user!.id ? "You" : (nameByUser.get(id) ?? "Teammate")
                          }
                          writers={activeWriters}
                          writerName={writerName}
                          editingId={inlineMissionId === m.id ? editingEntry?.id : undefined}
                          editor={inlineMissionId === m.id ? inlineEditor : null}
                          onEdit={openEditEntry}
                          onDelete={(id) => removeEntry.mutate(id)}
                        />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Free entries in this stage (mission responses sit under their mission) */}
              <EntriesSection
                title={`Your other entries — ${stageLabel(selectedStage)}`}
                entries={stageEntries.filter((e) => !isStageResponse(e))}
                writingNames={(id) => activeWriters.filter((w) => w.entryId === id).map(writerName)}
                missionById={missionById}
                onEdit={openEditEntry}
                onDelete={(id) => removeEntry.mutate(id)}
                action={
                  <Button variant="outline" size="sm" onClick={openFreeEntry}>
                    <Plus className="mr-1.5 h-4 w-4" /> Free entry
                  </Button>
                }
              />

              {/* Teammates' free entries in this stage: editable, not deletable */}
              {team && teamStageEntries.some((e) => !isStageResponse(e)) && (
                <EntriesSection
                  title={`Teammates' other entries — ${stageLabel(selectedStage)}`}
                  entries={teamStageEntries.filter((e) => !isStageResponse(e))}
                  missionById={missionById}
                  onEdit={openEditEntry}
                  authorName={(id) => nameByUser.get(id) ?? "Teammate"}
                  writingNames={(id) =>
                    activeWriters.filter((w) => w.entryId === id).map(writerName)
                  }
                />
              )}
            </>
          )}
        </section>
      </div>

      {/* Entry dialog (free entries; mission responses are written inline) */}
      <Dialog open={entryDialog && !inlineMissionId} onOpenChange={setEntryDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingEntry
                ? "Edit entry"
                : respondingMission
                  ? "Respond to mission"
                  : "New notebook entry"}
            </DialogTitle>
            <DialogDescription>
              {editingEntry && editingEntry.user_id !== user?.id
                ? `${nameByUser.get(editingEntry.user_id) ?? "Your teammate"}'s entry — your teammates see your changes.`
                : respondingMission
                  ? "Your response is saved as a notebook entry linked to this mission."
                  : isUnfiled
                    ? "This entry won't be attached to a workflow stage."
                    : `Saved under ${stageLabel(selectedStage)}.`}
            </DialogDescription>
          </DialogHeader>
          {respondingMission && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="text-sm font-semibold">{respondingMission.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <VocabText text={respondingMission.prompt} />
              </p>
            </div>
          )}
          {entryForm(false)}
        </DialogContent>
      </Dialog>

      {/* Teacher: guide dialog */}
      <Dialog open={guideDialog} onOpenChange={setGuideDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit stage instructions</DialogTitle>
            <DialogDescription>
              Students see this text at the top of the {stageLabel(selectedStage)} stage.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveGuide.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="guide-title">Stage title</Label>
              <Input
                id="guide-title"
                value={guideTitle}
                onChange={(e) => setGuideTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guide-instructions">Instructions</Label>
              <Textarea
                id="guide-instructions"
                value={guideInstructions}
                onChange={(e) => setGuideInstructions(e.target.value)}
                rows={6}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveGuide.isPending}>
                {saveGuide.isPending ? "Saving…" : "Save instructions"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Teacher: mission dialog */}
      <Dialog open={missionDialog} onOpenChange={setMissionDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMission ? "Edit mission" : "New mission"}</DialogTitle>
            <DialogDescription>
              Students respond to this mission with a notebook entry in the{" "}
              {stageLabel(selectedStage)} stage.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMission.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="mission-title">Mission title</Label>
              <Input
                id="mission-title"
                value={missionTitle}
                onChange={(e) => setMissionTitle(e.target.value)}
                placeholder="e.g. Decision Matrix"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mission-prompt">Prompt</Label>
              <Textarea
                id="mission-prompt"
                value={missionPrompt}
                onChange={(e) => setMissionPrompt(e.target.value)}
                placeholder="What should students document or produce?"
                rows={5}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveMission.isPending}>
                {saveMission.isPending
                  ? "Saving…"
                  : editingMission
                    ? "Save changes"
                    : "Add mission"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Post as today's mission (optionally attach a guide/template) */}
      <Dialog open={postDialog} onOpenChange={setPostDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Post as today's mission</DialogTitle>
            <DialogDescription>
              {postMission?.title} goes out to every mod as today's brief on Studio Home. You can
              attach a guide or template for students to open.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Attach a guide or template (optional)</Label>
              <Select value={postDocSlug} onValueChange={setPostDocSlug}>
                <SelectTrigger>
                  <SelectValue placeholder="No attachment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No attachment</SelectItem>
                  {resourceDocs.data?.map((d) => (
                    <SelectItem key={d.slug} value={d.slug}>
                      {d.kind === "template" ? "Template · " : "Guide · "}
                      {d.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button onClick={() => postToday.mutate()} disabled={postToday.isPending}>
                <Send className="mr-1.5 h-4 w-4" />
                {postToday.isPending ? "Posting…" : "Post mission"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EntriesSection({
  title,
  entries,
  missionById,
  onEdit,
  onDelete,
  action,
  authorName,
  writingNames,
}: {
  title: string;
  entries: Entry[];
  missionById: Map<string, StageMission>;
  onEdit?: (e: Entry) => void;
  onDelete?: (id: string) => void;
  action?: React.ReactNode;
  authorName?: (userId: string) => string;
  /** Teammates editing an entry right now. */
  writingNames?: (entryId: string) => string[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No entries here yet — respond to a mission above or add a free entry.
        </p>
      ) : (
        entries.map((e) => {
          const mission = e.mission_id ? missionById.get(e.mission_id) : undefined;
          return (
            <Card key={e.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {entryTypeLabel(e.entry_type)}
                      </span>
                      {mission && (
                        <span className="rounded-full bg-chart-2/10 px-2 py-0.5 text-[11px] font-medium text-chart-2">
                          Mission: {mission.title}
                        </span>
                      )}
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {format(new Date(e.created_at), "MMM d, yyyy · h:mm a")}
                      </span>
                      {authorName && (
                        <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {authorName(e.user_id)}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1.5 text-base font-semibold">{e.title}</h3>
                  </div>
                  <div className="flex gap-1">
                    {onEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(e)}
                        aria-label="Edit entry"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(e.id)}
                        aria-label="Delete entry"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {e.content}
                </p>
                {(writingNames?.(e.id).length ?? 0) > 0 && (
                  <WritingNote names={writingNames!(e.id)} what="editing this entry" />
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

/** "Maya is writing a response…" */
function WritingNote({ names, what }: { names: string[]; what: string }) {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-primary">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      {names.join(", ")} {names.length > 1 ? "are" : "is"} {what}…
    </p>
  );
}

/** Title + response fields, shared by the inline mission editor and the entry dialog. */
function EntryForm({
  showType,
  formType,
  onFormType,
  title,
  onTitle,
  content,
  onContent,
  restoredDraft,
  draftSavedAt,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
  heading,
}: {
  showType: boolean;
  formType: string;
  onFormType: (v: string) => void;
  title: string;
  onTitle: (v: string) => void;
  content: string;
  onContent: (v: string) => void;
  restoredDraft: boolean;
  draftSavedAt: number | null;
  pending: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel?: () => void;
  heading?: string;
}) {
  return (
    <form
      className={cn("space-y-4", heading && "rounded-lg border border-primary/40 bg-primary/5 p-3")}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {heading && (
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{heading}</p>
      )}
      {showType && (
        <div className="space-y-1.5">
          <Label>Entry type</Label>
          <Select value={formType} onValueChange={onFormType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTRY_TYPES.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="entry-title">Title</Label>
        <Input
          id="entry-title"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="e.g. Decision matrix results"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="entry-content">Response</Label>
        <Textarea
          id="entry-content"
          value={content}
          onChange={(e) => onContent(e.target.value)}
          placeholder="Write your answer, observations, and next steps. Link files from your Evidence Vault if you have them."
          rows={7}
          autoFocus={!!heading}
          required
        />
      </div>
      {restoredDraft && (
        <p className="text-xs text-muted-foreground">
          Restored what you were typing last time. Keep going, then save when you're done.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {draftSavedAt
            ? `Draft saved ${format(draftSavedAt, "h:mm a")} — safe on this device`
            : "Your typing is saved automatically as you go."}
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * The team's responses to one mission, in a dropdown under it. Anyone on the
 * team can edit a response; only its author can delete it.
 */
function MissionResponses({
  responses,
  open,
  onOpenChange,
  myId,
  teamId,
  authorName,
  writers,
  writerName,
  editingId,
  editor,
  onEdit,
  onDelete,
}: {
  responses: Entry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myId: string;
  teamId?: string;
  authorName: (userId: string) => string;
  writers: ActiveWriter[];
  writerName: (w: ActiveWriter) => string;
  /** The response being edited inline, replaced by `editor`. */
  editingId?: string;
  /** The inline editor, when it belongs to this mission. */
  editor: React.ReactNode;
  onEdit: (e: Entry) => void;
  onDelete: (id: string) => void;
}) {
  const newResponseEditor = editor && !editingId ? editor : null;
  return (
    <div className="mt-3 space-y-3">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted"
          >
            Responses ({responses.length})
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          {responses.length === 0 && (
            <p className="px-1 text-sm text-muted-foreground">No responses yet.</p>
          )}
          {responses.map((e) => {
            if (e.id === editingId) return <div key={e.id}>{editor}</div>;
            const canEdit = e.user_id === myId || (!!teamId && e.team_id === teamId);
            const editors = writers.filter((w) => w.entryId === e.id);
            return (
              <div key={e.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {authorName(e.user_id)}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {format(new Date(e.created_at), "MMM d · h:mm a")}
                      </span>
                    </div>
                    <h4 className="mt-1 text-sm font-semibold">{e.title}</h4>
                  </div>
                  <div className="flex gap-1">
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEdit(e)}
                        aria-label="Edit response"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {e.user_id === myId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onDelete(e.id)}
                        aria-label="Delete response"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">
                  {e.content}
                </p>
                {editors.length > 0 && (
                  <WritingNote names={editors.map(writerName)} what="editing this response" />
                )}
              </div>
            );
          })}
        </CollapsibleContent>
      </Collapsible>
      {newResponseEditor}
    </div>
  );
}
