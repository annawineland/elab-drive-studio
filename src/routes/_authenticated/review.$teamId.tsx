import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  LayoutList,
  ListTree,
  LocateFixed,
  MessageSquarePlus,
  NotebookPen,
  Pencil,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { TeacherOnly } from "@/components/teacher-only";
import { WORKFLOW_STAGES, entryTypeLabel, stageLabel } from "@/lib/studio";
import {
  RUBRIC_LEVELS,
  type LearningTarget,
  type RubricCriterion,
  type RubricScore,
} from "@/lib/rubrics";
import { RubricLevelChip, TargetRubricSummary } from "@/components/rubric-ui";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/studio-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { MissionGradingPanel } from "@/components/mission-grading";
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

export const Route = createFileRoute("/_authenticated/review/$teamId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { stage?: string; student?: string; view?: "feed" } => ({
    stage:
      typeof search.stage === "string" && search.stage.length > 0
        ? search.stage
        : undefined,
    student:
      typeof search.student === "string" && search.student.length > 0
        ? search.student
        : undefined,
    view: search.view === "feed" ? "feed" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Team Notebook Review — Mission Control" },
      {
        name: "description",
        content:
          "Read a team's design notebook stage by stage or as a feed, with inline rubric scoring and feedback.",
      },
      { property: "og:title", content: "Team Notebook Review — Mission Control" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamNotebookReviewPage,
});

interface ReviewEntry {
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

interface FeedbackRow {
  id: string;
  entry_id: string | null;
  content: string;
  created_at: string;
}

const UNFILED = "unfiled";

function TeamNotebookReviewPage() {
  const { teamId } = Route.useParams();
  const { stage: stageParam, student: studentParam, view } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isFeed = view === "feed";

  const guides = useQuery({
    queryKey: ["stage-guides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_guides")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as StageGuide[];
    },
  });

  const missions = useQuery({
    queryKey: ["stage-missions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_missions")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as StageMission[];
    },
  });

  const targets = useQuery({
    queryKey: ["learning-targets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_targets")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as LearningTarget[];
    },
  });

  const criteria = useQuery({
    queryKey: ["rubric-criteria"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rubric_criteria")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as RubricCriterion[];
    },
  });

  const review = useQuery({
    queryKey: ["team-review", teamId],
    queryFn: async () => {
      const { data: team, error: tErr } = await supabase
        .from("teams")
        .select("id, name, client_name, project_focus, current_stage, mods(name)")
        .eq("id", teamId)
        .single();
      if (tErr) throw tErr;

      const { data: mems, error: mErr } = await supabase
        .from("team_members")
        .select("user_id, member_role")
        .eq("team_id", teamId);
      if (mErr) throw mErr;
      const memberIds = (mems ?? []).map((m) => m.user_id);

      // Entries filed under the team, plus pre-team work by current members.
      const { data: entryRows, error: eErr } =
        memberIds.length > 0
          ? await supabase
              .from("entries")
              .select("*")
              .or(`team_id.eq.${teamId},user_id.in.(${memberIds.join(",")})`)
              .order("created_at", { ascending: false })
          : await supabase
              .from("entries")
              .select("*")
              .eq("team_id", teamId)
              .order("created_at", { ascending: false });
      if (eErr) throw eErr;
      const entries = (entryRows ?? []) as ReviewEntry[];

      // Display names for members and any entry author no longer on the team.
      const authorIds = [...new Set([...memberIds, ...entries.map((e) => e.user_id)])];
      const { data: profs, error: pErr } =
        authorIds.length > 0
          ? await supabase.from("profiles").select("id, full_name").in("id", authorIds)
          : { data: [], error: null };
      if (pErr) throw pErr;
      const nameById = Object.fromEntries(
        (profs ?? []).map((p) => [p.id, p.full_name || "Student"]),
      );

      const entryIds = entries.map((e) => e.id);
      const { data: feedbackRows, error: fErr } =
        entryIds.length > 0
          ? await supabase
              .from("feedback")
              .select("id, entry_id, content, created_at")
              .in("entry_id", entryIds)
          : { data: [], error: null };
      if (fErr) throw fErr;

      const { data: scoreRows, error: sErr } =
        memberIds.length > 0
          ? await supabase
              .from("rubric_scores")
              .select("*")
              .or(`team_id.eq.${teamId},student_id.in.(${memberIds.join(",")})`)
          : await supabase.from("rubric_scores").select("*").eq("team_id", teamId);
      if (sErr) throw sErr;

      return {
        team,
        members: (mems ?? []) as { user_id: string; member_role: string }[],
        nameById: nameById as Record<string, string>,
        entries,
        feedback: (feedbackRows ?? []) as FeedbackRow[],
        scores: (scoreRows ?? []) as RubricScore[],
      };
    },
  });

  const team = review.data?.team;
  const selectedStage = stageParam ?? team?.current_stage ?? "kickoff";
  const isUnfiled = selectedStage === UNFILED;

  const setSearch = (patch: { stage?: string; student?: string; view?: "feed" }) =>
    void navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
      replace: true,
    });

  // Entries filtered by the selected student (or all team members).
  const entries = useMemo(() => {
    const all = review.data?.entries ?? [];
    return studentParam ? all.filter((e) => e.user_id === studentParam) : all;
  }, [review.data, studentParam]);

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
    const map = new Map<string, ReviewEntry[]>();
    for (const e of entries) {
      const key = e.stage || UNFILED;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [entries]);

  const responsesByMission = useMemo(() => {
    const map = new Map<string, ReviewEntry[]>();
    for (const e of entries) {
      if (!e.mission_id) continue;
      const list = map.get(e.mission_id) ?? [];
      list.push(e);
      map.set(e.mission_id, list);
    }
    return map;
  }, [entries]);

  const scoresByEntry = useMemo(() => {
    const map = new Map<string, RubricScore[]>();
    for (const s of review.data?.scores ?? []) {
      if (!s.entry_id) continue;
      const list = map.get(s.entry_id) ?? [];
      list.push(s);
      map.set(s.entry_id, list);
    }
    return map;
  }, [review.data]);

  const feedbackByEntry = useMemo(() => {
    const map = new Map<string, FeedbackRow[]>();
    for (const f of review.data?.feedback ?? []) {
      if (!f.entry_id) continue;
      const list = map.get(f.entry_id) ?? [];
      list.push(f);
      map.set(f.entry_id, list);
    }
    return map;
  }, [review.data]);

  const guide = guides.data?.find((g) => g.stage === selectedStage) ?? null;
  const stageMissions = missionsByStage.get(selectedStage) ?? [];
  const stageEntries = entriesByStage.get(selectedStage) ?? [];
  const unfiledCount = entriesByStage.get(UNFILED)?.length ?? 0;

  const stageTargets = useMemo(
    () => (targets.data ?? []).filter((t) => t.stage === selectedStage),
    [targets.data, selectedStage],
  );

  const authorName = (id: string) => review.data?.nameById[id] ?? "Student";

  // ---------- Inline scoring ----------
  const [scoringEntry, setScoringEntry] = useState<ReviewEntry | null>(null);
  const [scoreTarget, setScoreTarget] = useState("");
  const [scoreLevel, setScoreLevel] = useState("proficient");
  const [scoreNote, setScoreNote] = useState("");

  const existingScore = (entryId: string, targetId: string) =>
    (review.data?.scores ?? []).find(
      (s) => s.entry_id === entryId && s.target_id === targetId,
    );

  const openScore = (e: ReviewEntry) => {
    const stageTargetIds = new Set(stageTargets.map((t) => t.id));
    const preferred =
      (targets.data ?? []).find((t) => stageTargetIds.has(t.id)) ??
      (targets.data ?? [])[0];
    const targetId = preferred?.id ?? "";
    const existing = existingScore(e.id, targetId);
    setScoringEntry(e);
    setScoreTarget(targetId);
    setScoreLevel(existing?.level ?? "proficient");
    setScoreNote(existing?.note ?? "");
  };

  const onScoreTargetChange = (targetId: string) => {
    setScoreTarget(targetId);
    const existing = scoringEntry ? existingScore(scoringEntry.id, targetId) : undefined;
    setScoreLevel(existing?.level ?? "proficient");
    setScoreNote(existing?.note ?? "");
  };

  const saveScore = useMutation({
    mutationFn: async () => {
      if (!scoringEntry || !scoreTarget) throw new Error("Pick a learning target");
      const existing = existingScore(scoringEntry.id, scoreTarget);
      if (existing) {
        const { error } = await supabase
          .from("rubric_scores")
          .update({ level: scoreLevel, note: scoreNote.trim() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rubric_scores").insert({
          target_id: scoreTarget,
          teacher_id: user!.id,
          student_id: scoringEntry.user_id,
          team_id: teamId,
          entry_id: scoringEntry.id,
          level: scoreLevel,
          note: scoreNote.trim(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`Score saved for ${authorName(scoringEntry!.user_id)}`);
      setScoringEntry(null);
      queryClient.invalidateQueries({ queryKey: ["team-review", teamId] });
      queryClient.invalidateQueries({ queryKey: ["rubric-scores"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ---------- Inline feedback ----------
  const [feedbackEntry, setFeedbackEntry] = useState<ReviewEntry | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [editingFeedback, setEditingFeedback] = useState<FeedbackRow | null>(null);

  const saveFeedback = useMutation({
    mutationFn: async () => {
      if (!feedbackEntry) return;
      if (editingFeedback) {
        const { error } = await supabase
          .from("feedback")
          .update({ content: feedbackText.trim() })
          .eq("id", editingFeedback.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("feedback").insert({
        author_id: user!.id,
        target_user_id: feedbackEntry.user_id,
        team_id: teamId,
        entry_id: feedbackEntry.id,
        content: feedbackText.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        editingFeedback
          ? "Feedback updated"
          : `Feedback sent to ${authorName(feedbackEntry!.user_id)}`,
      );
      setFeedbackEntry(null);
      setEditingFeedback(null);
      setFeedbackText("");
      queryClient.invalidateQueries({ queryKey: ["team-review", teamId] });
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteFeedback = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feedback").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Feedback deleted");
      queryClient.invalidateQueries({ queryKey: ["team-review", teamId] });
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const loading = review.isLoading || guides.isLoading || missions.isLoading;

  const renderEntryCard = (e: ReviewEntry, showStage: boolean) => (
    <EntryReviewCard
      key={e.id}
      entry={e}
      authorName={authorName(e.user_id)}
      mission={e.mission_id ? missionById.get(e.mission_id) : undefined}
      showStage={showStage}
      scores={scoresByEntry.get(e.id) ?? []}
      feedback={feedbackByEntry.get(e.id) ?? []}
      targetTitle={(id) => targets.data?.find((t) => t.id === id)?.title ?? "Target"}
      onScore={() => openScore(e)}
      onFeedback={() => {
        setFeedbackEntry(e);
        setEditingFeedback(null);
        setFeedbackText("");
      }}
      onEditFeedback={(f) => {
        setFeedbackEntry(e);
        setEditingFeedback(f);
        setFeedbackText(f.content);
      }}
      onDeleteFeedback={(f) => deleteFeedback.mutate(f.id)}
    />
  );

  return (
    <TeacherOnly>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/control/teams">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Teams
          </Link>
        </Button>

        <PageHeader
          eyebrow={team?.mods?.name ?? "Team notebook review"}
          title={team ? `${team.name} — Notebook` : "Team notebook"}
          description={
            [
              team?.client_name && `Client: ${team.client_name}`,
              team?.project_focus,
              "Read entries, score against rubrics, and leave feedback — students see scores and notes immediately.",
            ]
              .filter(Boolean)
              .join(" · ")
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {/* Student filter */}
              <Select
                value={studentParam ?? "all"}
                onValueChange={(v) => setSearch({ student: v === "all" ? undefined : v })}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All members</SelectItem>
                  {(review.data?.members ?? []).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {authorName(m.user_id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* View toggle */}
              <div className="flex rounded-md border">
                <button
                  type="button"
                  onClick={() => setSearch({ view: undefined })}
                  className={cn(
                    "flex items-center gap-1.5 rounded-l-md px-3 py-1.5 text-xs font-medium transition-colors",
                    !isFeed
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <ListTree className="h-3.5 w-3.5" /> By stage
                </button>
                <button
                  type="button"
                  onClick={() => setSearch({ view: "feed" })}
                  className={cn(
                    "flex items-center gap-1.5 rounded-r-md px-3 py-1.5 text-xs font-medium transition-colors",
                    isFeed
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <LayoutList className="h-3.5 w-3.5" /> Feed
                </button>
              </div>
            </div>
          }
        />

        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {!loading && (review.data?.entries.length ?? 0) === 0 && (
          <EmptyState
            icon={NotebookPen}
            title="No notebook entries yet"
            description="This team hasn't written any notebook entries. They appear here as soon as students respond to missions or add free entries."
          />
        )}

        {/* ---------- Feed view ---------- */}
        {!loading && isFeed && (review.data?.entries.length ?? 0) > 0 && (
          <div className="space-y-3">
            <p className="text-label text-muted-foreground">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
              {studentParam ? ` by ${authorName(studentParam)}` : " across the team"} ·
              newest first
            </p>
            {entries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                {authorName(studentParam!)} hasn't written any entries yet.
              </p>
            ) : (
              entries.map((e) => renderEntryCard(e, true))
            )}
          </div>
        )}

        {/* ---------- Stage view ---------- */}
        {!loading && !isFeed && (review.data?.entries.length ?? 0) > 0 && (
          <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            {/* Stage rail */}
            <aside>
              <p className="px-1 pb-2 text-label text-muted-foreground">Design process</p>
              <ol className="flex flex-col gap-1">
                {WORKFLOW_STAGES.map((s, i) => {
                  const stageEntryList = entriesByStage.get(s.key) ?? [];
                  const stageMissionList = missionsByStage.get(s.key) ?? [];
                  const answered = stageMissionList.filter(
                    (m) => (responsesByMission.get(m.id)?.length ?? 0) > 0,
                  ).length;
                  const active = selectedStage === s.key;
                  const isCurrent = team?.current_stage === s.key;
                  return (
                    <li key={s.key}>
                      <button
                        onClick={() => setSearch({ stage: s.key })}
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
                            {stageMissionList.length > 0
                              ? `${answered}/${stageMissionList.length} missions`
                              : "no missions"}
                            {stageEntryList.length > 0 &&
                              ` · ${stageEntryList.length} ${stageEntryList.length === 1 ? "entry" : "entries"}`}
                          </span>
                        </span>
                        {isCurrent && (
                          <span title="Team's current stage">
                            <LocateFixed className="h-3.5 w-3.5 shrink-0 text-primary" />
                          </span>
                        )}
                        {stageMissionList.length > 0 && answered >= stageMissionList.length && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                        )}
                      </button>
                    </li>
                  );
                })}
                {unfiledCount > 0 && (
                  <li>
                    <button
                      onClick={() => setSearch({ stage: UNFILED })}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border border-dashed px-3 py-2 text-left transition-colors",
                        isUnfiled
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/60",
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
              {isUnfiled ? (
                <div className="space-y-3">
                  <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Unfiled entries
                  </h2>
                  {stageEntries.map((e) => renderEntryCard(e, false))}
                </div>
              ) : (
                <>
                  {/* Instructions (read-only context) */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <BookOpen className="h-4 w-4 text-primary" />
                        {guide?.title ?? stageLabel(selectedStage)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-line text-sm text-muted-foreground">
                        {guide?.instructions || "No instructions for this stage yet."}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Stage rubrics with current scores */}
                  {stageTargets.map((t) => {
                    const score = studentParam
                      ? (review.data?.scores ?? []).find(
                          (s) =>
                            s.target_id === t.id &&
                            s.student_id === studentParam &&
                            !s.entry_id,
                        )
                      : (review.data?.scores ?? []).find(
                          (s) =>
                            s.target_id === t.id && s.team_id === teamId && !s.entry_id,
                        );
                    return (
                      <TargetRubricSummary
                        key={t.id}
                        target={t}
                        criteria={criteria.data ?? []}
                        score={score}
                      />
                    );
                  })}

                  {/* Missions with team response counts */}
                  {stageMissions.length > 0 && (
                    <div className="space-y-3">
                      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Missions
                      </h2>
                      {stageMissions.map((m) => {
                        const responses = responsesByMission.get(m.id) ?? [];
                        const responders = new Set(responses.map((r) => r.user_id)).size;
                        return (
                          <Card key={m.id}>
                            <CardContent className="p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-semibold">{m.title}</h3>
                                {responses.length > 0 ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {responses.length}{" "}
                                    {responses.length === 1 ? "response" : "responses"}
                                    {studentParam
                                      ? ""
                                      : ` · ${responders} ${responders === 1 ? "student" : "students"}`}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                    No responses yet
                                  </span>
                                )}
                              </div>
                              <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">
                                {m.prompt}
                              </p>
                              <MissionGradingPanel
                                missionId={m.id}
                                missionTitle={m.title}
                                teamId={teamId}
                                isTeacher
                              />
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {/* Entries in this stage */}
                  <div className="space-y-3">
                    <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Entries — {stageLabel(selectedStage)}
                      {studentParam ? ` · ${authorName(studentParam)}` : ""}
                    </h2>
                    {stageEntries.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        No entries in this stage yet.
                      </p>
                    ) : (
                      stageEntries.map((e) => renderEntryCard(e, false))
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* Score dialog */}
        <Dialog open={!!scoringEntry} onOpenChange={(o) => !o && setScoringEntry(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                Score {scoringEntry ? authorName(scoringEntry.user_id) : ""}
              </DialogTitle>
              <DialogDescription>
                {scoringEntry
                  ? `Scoring "${scoringEntry.title}" — the student sees this on their Rubrics page and in their notebook.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveScore.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label>Learning target</Label>
                <Select value={scoreTarget} onValueChange={onScoreTargetChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a target" />
                  </SelectTrigger>
                  <SelectContent>
                    {(targets.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Level</Label>
                <div className="flex gap-2">
                  {RUBRIC_LEVELS.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => setScoreLevel(l.key)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        scoreLevel === l.key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted/60",
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                {/* Criteria for context */}
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {scoreLevel} criteria
                  </p>
                  <ul className="space-y-1">
                    {(criteria.data ?? [])
                      .filter((c) => c.target_id === scoreTarget && c.level === scoreLevel)
                      .map((c) => (
                        <li key={c.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                          {c.criterion}
                        </li>
                      ))}
                    {(criteria.data ?? []).filter(
                      (c) => c.target_id === scoreTarget && c.level === scoreLevel,
                    ).length === 0 && (
                      <li className="text-xs text-muted-foreground">No criteria listed.</li>
                    )}
                  </ul>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="score-note">Note to student (optional)</Label>
                <Textarea
                  id="score-note"
                  value={scoreNote}
                  onChange={(e) => setScoreNote(e.target.value)}
                  placeholder="Why this level? What's the next step to advance?"
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saveScore.isPending || !scoreTarget}>
                  {saveScore.isPending ? "Saving…" : "Save score"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Feedback dialog */}
        <Dialog
          open={!!feedbackEntry}
          onOpenChange={(o) => {
            if (!o) {
              setFeedbackEntry(null);
              setEditingFeedback(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingFeedback ? "Edit feedback for " : "Feedback for "}
                {feedbackEntry ? authorName(feedbackEntry.user_id) : ""}
              </DialogTitle>
              <DialogDescription>
                {feedbackEntry
                  ? `Attached to "${feedbackEntry.title}" — it lands on their Feedback page immediately.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveFeedback.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="entry-feedback">Feedback</Label>
                <Textarea
                  id="entry-feedback"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Specific, actionable, and kind."
                  rows={4}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saveFeedback.isPending}>
                  {saveFeedback.isPending
                    ? "Saving…"
                    : editingFeedback
                      ? "Save changes"
                      : "Send feedback"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TeacherOnly>
  );
}

function EntryReviewCard({
  entry,
  authorName,
  mission,
  showStage,
  scores,
  feedback,
  targetTitle,
  onScore,
  onFeedback,
  onEditFeedback,
  onDeleteFeedback,
}: {
  entry: ReviewEntry;
  authorName: string;
  mission?: StageMission;
  showStage: boolean;
  scores: RubricScore[];
  feedback: FeedbackRow[];
  targetTitle: (id: string) => string;
  onScore: () => void;
  onFeedback: () => void;
  onEditFeedback: (f: FeedbackRow) => void;
  onDeleteFeedback: (f: FeedbackRow) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                {entryTypeLabel(entry.entry_type)}
              </span>
              {showStage && entry.stage && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <ClipboardList className="h-3 w-3" />
                  {stageLabel(entry.stage)}
                </span>
              )}
              {mission && (
                <span className="rounded-full bg-chart-2/10 px-2 py-0.5 text-[11px] font-medium text-chart-2">
                  Mission: {mission.title}
                </span>
              )}
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {format(new Date(entry.created_at), "MMM d, yyyy · h:mm a")}
              </span>
            </div>
            <h3 className="mt-1.5 text-base font-semibold">{entry.title}</h3>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              by {authorName}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="outline" size="sm" onClick={onScore}>
              <Target className="mr-1.5 h-4 w-4" /> Score
            </Button>
            <Button variant="outline" size="sm" onClick={onFeedback}>
              <MessageSquarePlus className="mr-1.5 h-4 w-4" /> Feedback
            </Button>
          </div>
        </div>

        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
          {entry.content}
        </p>

        {scores.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {scores.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5">
                <RubricLevelChip level={s.level} />
                <span className="text-xs text-muted-foreground">{targetTitle(s.target_id)}</span>
                {s.note && (
                  <span className="max-w-64 truncate text-xs italic text-muted-foreground" title={s.note}>
                    “{s.note}”
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {feedback.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-border pt-3">
            {feedback.map((f) => (
              <div
                key={f.id}
                className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2"
              >
                <p className="flex-1 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Your feedback:</span>{" "}
                  {f.content}
                </p>
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onEditFeedback(f)}
                    aria-label="Edit feedback"
                    title="Edit feedback"
                  >
                    <Pencil className="h-3.5 w-3.5 text-primary" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onDeleteFeedback(f)}
                    aria-label="Delete feedback"
                    title="Delete feedback"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

