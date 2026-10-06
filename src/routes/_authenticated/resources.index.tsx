import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarRange,
  ChevronRight,
  ExternalLink,
  FileText,
  Files,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  driveConfigured,
  listStudioDriveResources,
  preloadGoogleDrive,
  syncClassDrive,
  type DriveFile,
} from "@/lib/google-drive";
import {
  pacingWeeksQueryOptions,
  parseLocalDate,
  todayLocalISO,
  weekStatus,
} from "@/lib/pacing-queries";
import { resourceSlug, type ResourceDocRow } from "@/lib/resource-doc-format";
import { RESOURCE_DOCS_KEY, resourceDocsQueryOptions } from "@/lib/resource-queries";
import { stageLabel, WORKFLOW_STAGES } from "@/lib/studio";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/studio-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/resources/")({
  head: () => ({
    meta: [
      { title: "Resource Library — Engineering Studio" },
      {
        name: "description",
        content:
          "Built-in guides and templates for every stage of the engineering design process, plus files from your teacher's Drive.",
      },
      { property: "og:title", content: "Resource Library — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResourcesPage,
});

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Match a Drive file to a library document by fuzzy name containment. */
function matchFile(name: string, files: DriveFile[]): DriveFile | undefined {
  const n = norm(name);
  return files.find((f) => {
    const fn = norm(f.name);
    return fn.includes(n) || n.includes(fn);
  });
}

/** Row for a library document — opens the in-app document page. */
function ResourceRow({ doc, file }: { doc: ResourceDocRow; file?: DriveFile }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-muted/50">
      <Link
        to="/resources/$slug"
        params={{ slug: doc.slug }}
        search={{ edit: false }}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{doc.title}</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {doc.stage ? `Stage: ${stageLabel(doc.stage)}` : "Open in studio"}
          </p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" />
      </Link>
      {file?.webViewLink && (
        <a
          href={file.webViewLink}
          target="_blank"
          rel="noreferrer"
          title="Also in Drive"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

const STARTER_BODY: Record<"guide" | "template", string> = {
  guide:
    "Write the opening paragraph here — what this guide is for and when students should use it.\n\n# First section\n\n- First point\n- Second point\n\n! A helpful tip for students.",
  template:
    "Explain how students should use this template.\n\n# Template\n\n@ Field name | What students should write here.\n\n! A helpful tip for students.",
};

/** Teacher dialog: create a new guide or template, then open it in edit mode. */
function NewResourceDialog({
  open,
  onOpenChange,
  docs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docs: ResourceDocRow[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"guide" | "template">("guide");
  const [stage, setStage] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const base = resourceSlug(title.trim());
      if (!base) throw new Error("Give the document a title first");
      const taken = new Set(docs.map((d) => d.slug));
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      const maxOrder = docs.reduce((m, d) => Math.max(m, d.sort_order), 0);
      const { error } = await db.from("resource_docs").insert({
        slug,
        kind,
        title: title.trim(),
        summary: "",
        stage: stage || null,
        sort_order: maxOrder + 10,
        body: STARTER_BODY[kind],
      });
      if (error) throw error;
      return slug;
    },
    onSuccess: (slug) => {
      void queryClient.invalidateQueries({ queryKey: RESOURCE_DOCS_KEY });
      toast.success("Document created — add your content, then save");
      onOpenChange(false);
      setTitle("");
      setKind("guide");
      setStage("");
      void navigate({
        to: "/resources/$slug",
        params: { slug },
        search: { edit: true },
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New library document</DialogTitle>
          <DialogDescription>
            Add a guide or template to the Resource Library. You'll write the content next —
            students see it as soon as you save.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-resource-title">Title</Label>
            <Input
              id="new-resource-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Laser Cutter Setup Guide"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "guide" | "template")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guide">Guide</SelectItem>
                  <SelectItem value="template">Template</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Workflow stage (optional)</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger>
                  <SelectValue placeholder="No stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No stage</SelectItem>
                  {WORKFLOW_STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create & edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResourcesPage() {
  const { role } = useAuth();
  const isTeacher = role === "teacher";
  const docs = useQuery(resourceDocsQueryOptions());
  const pacing = useQuery(pacingWeeksQueryOptions());
  const drive = useQuery({
    queryKey: ["studio-drive-resources"],
    queryFn: () => listStudioDriveResources(),
    retry: false,
  });
  const [newOpen, setNewOpen] = useState(false);
  const queryClient = useQueryClient();
  const canSyncDrive = isTeacher && driveConfigured();

  // Load Google's sign-in script up front so Sync opens its popup on the click.
  useEffect(() => {
    if (canSyncDrive) preloadGoogleDrive().catch(() => {});
  }, [canSyncDrive]);

  const syncDrive = useMutation({
    mutationFn: syncClassDrive,
    onSuccess: (count) => {
      toast.success(`Synced ${count} file${count === 1 ? "" : "s"} from your Drive`);
      queryClient.invalidateQueries({ queryKey: ["studio-drive-resources"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pacingWeeks = pacing.data ?? [];
  const currentWeek = pacingWeeks.find((w) => weekStatus(w, todayLocalISO()) === "current");
  const firstWeek = pacingWeeks[0];
  const lastWeek = pacingWeeks[pacingWeeks.length - 1];
  const pacingRange =
    firstWeek && lastWeek
      ? `${format(parseLocalDate(firstWeek.start_date), "MMM d")} – ${format(parseLocalDate(lastWeek.end_date), "MMM d")}`
      : "";

  const all = docs.data ?? [];
  const files = drive.data?.files ?? [];
  const mapRows = (rows: ResourceDocRow[]) =>
    rows.map((doc) => ({ doc, file: matchFile(doc.title, files) }));
  const guideRows = mapRows(all.filter((d) => d.kind === "guide"));
  const templateRows = mapRows(all.filter((d) => d.kind === "template"));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Library"
        title="Resource Library"
        description="Guides and templates for every stage of the design process — built right into the studio, with your teacher's Drive files alongside."
        actions={
          isTeacher ? (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> Add guide or template
            </Button>
          ) : undefined
        }
      />

      <Link to="/resources/pacing" className="block">
        <Card className="transition-colors hover:border-primary/50 hover:bg-muted/40">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <CalendarRange className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Pacing Guide</p>
              <p className="truncate text-xs text-muted-foreground">
                {currentWeek
                  ? `This week is Week ${currentWeek.week_number} — ${currentWeek.focus}`
                  : pacingRange
                    ? `${pacingWeeks.length} weeks · ${pacingRange}`
                    : "The quarter, week by week"}
              </p>
            </div>
            {currentWeek && (
              <span className="hidden shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary sm:inline">
                Week {currentWeek.week_number} now
              </span>
            )}
            <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
          </CardContent>
        </Card>
      </Link>

      {docs.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the library…
        </p>
      )}

      {drive.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking the Drive…
        </p>
      )}

      {canSyncDrive ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
            <span>
              {files.length
                ? `${files.length} files from your Google Drive show up next to matching guides and templates.`
                : "Sync guides and templates from your Google Drive so students see them alongside the library."}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncDrive.mutate()}
              disabled={syncDrive.isPending}
            >
              {syncDrive.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sync from my Drive
            </Button>
          </CardContent>
        </Card>
      ) : (
        (drive.isError || drive.data?.configured === false) && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              The class Drive isn't reachable right now. The library will fill in automatically once
              it's connected — check back soon.
            </CardContent>
          </Card>
        )
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" /> Guides
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {guideRows.map((r) => (
              <ResourceRow key={r.doc.id} doc={r.doc} file={r.file} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Files className="h-4 w-4 text-primary" /> Templates
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {templateRows.map((r) => (
              <ResourceRow key={r.doc.id} doc={r.doc} file={r.file} />
            ))}
          </CardContent>
        </Card>
      </div>

      {isTeacher && <NewResourceDialog open={newOpen} onOpenChange={setNewOpen} docs={all} />}
    </div>
  );
}
