import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  Lightbulb,
  Loader2,
  Pencil,
  Save,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseResourceBody,
  type ResourceBlock,
  type ResourceDocRow,
} from "@/lib/resource-doc-format";
import { RESOURCE_DOCS_KEY, resourceDocsQueryOptions } from "@/lib/resource-queries";
import { stageLabel, WORKFLOW_STAGES } from "@/lib/studio";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/studio-ui";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/resources/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: search.edit === true || search.edit === "true",
  }),
  head: () => ({
    meta: [
      { title: "Resource — Engineering Studio" },
      {
        name: "description",
        content: "A guide or template from the Engineering Studio resource library.",
      },
      { property: "og:title", content: "Resource — Engineering Studio" },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResourceDocPage,
});

function Block({ block }: { block: ResourceBlock }) {
  switch (block.type) {
    case "intro":
      return <p className="text-base leading-relaxed text-muted-foreground">{block.text}</p>;
    case "heading":
      return <h2 className="pt-5 font-display text-lg font-bold tracking-tight">{block.text}</h2>;
    case "paragraph":
      return <p className="text-sm leading-relaxed">{block.text}</p>;
    case "list":
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-primary">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed marker:font-mono marker:text-primary">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case "checklist":
      return (
        <ul className="space-y-2 text-sm leading-relaxed">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <Square className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {item}
            </li>
          ))}
        </ul>
      );
    case "tip":
      return (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed">{block.text}</p>
        </div>
      );
    case "field":
      return (
        <div className="rounded-lg border border-dashed border-primary/40 bg-muted/40 p-3.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
            {block.label}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{block.hint}</p>
        </div>
      );
  }
}

function BlockList({ blocks }: { blocks: ResourceBlock[] }) {
  return (
    <div className="max-w-3xl space-y-3">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

const FORMAT_HELP: Array<[string, string]> = [
  ["# Heading", "Section heading"],
  ["- item", "Bullet list (one per line)"],
  ["1. item", "Numbered steps (one per line)"],
  ["[ ] item", "Checklist (one per line)"],
  ["! text", "Highlighted tip"],
  ["@ Label | hint", "Template field card"],
];

/** Teacher editing form with a live preview of the parsed document. */
function ResourceEditor({
  doc,
  onDone,
}: {
  doc: ResourceDocRow;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState(doc.title);
  const [summary, setSummary] = useState(doc.summary);
  const [kind, setKind] = useState<"guide" | "template">(doc.kind);
  const [stage, setStage] = useState(doc.stage ?? "");
  const [body, setBody] = useState(doc.body);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const preview = useMemo(() => parseResourceBody(body), [body]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("resource_docs")
        .update({
          title: title.trim(),
          summary: summary.trim(),
          kind,
          stage: stage || null,
          body,
          updated_by: user?.id ?? null,
        })
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RESOURCE_DOCS_KEY });
      toast.success("Saved — students see the update right away");
      onDone();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("resource_docs").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RESOURCE_DOCS_KEY });
      toast.success("Document removed from the library");
      void navigate({ to: "/resources" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Edit document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="res-title">Title</Label>
              <Input id="res-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
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
                <Label>Stage</Label>
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

          <div className="space-y-2">
            <Label htmlFor="res-summary">Summary (shown under the title)</Label>
            <Input
              id="res-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One sentence: what is this and when should students use it?"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="res-body">Content</Label>
              <Textarea
                id="res-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[480px] font-mono text-xs leading-relaxed"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                One line per item, blank line between sections. The first paragraph becomes the
                intro.
              </p>
              <div className="grid gap-1.5 rounded-lg border bg-muted/40 p-3">
                {FORMAT_HELP.map(([syntax, meaning]) => (
                  <p key={syntax} className="flex items-baseline gap-3 text-xs">
                    <code className="w-28 shrink-0 font-mono text-primary">{syntax}</code>
                    <span className="text-muted-foreground">{meaning}</span>
                  </p>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Preview (updates as you type)</Label>
              <div className="max-h-[560px] overflow-y-auto rounded-lg border p-5">
                {preview.length > 0 ? (
                  <BlockList blocks={preview} />
                ) : (
                  <p className="text-sm text-muted-foreground">Start typing to see the preview.</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" /> Delete document
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onDone} disabled={save.isPending}>
                <X className="h-4 w-4" /> Cancel
              </Button>
              <Button
                onClick={() => save.mutate()}
                disabled={!title.trim() || !body.trim() || save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save changes
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{doc.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the document from the Resource Library for everyone. This can't be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ResourceDocPage() {
  const { slug } = Route.useParams();
  const { edit: wantsEdit } = Route.useSearch();
  const { role } = useAuth();
  const isTeacher = role === "teacher";
  const docs = useQuery(resourceDocsQueryOptions());
  const [editing, setEditing] = useState(false);

  const doc = docs.data?.find((d) => d.slug === slug);

  // Open straight into edit mode when arriving from "Create & edit".
  useEffect(() => {
    if (wantsEdit && isTeacher && doc) setEditing(true);
  }, [wantsEdit, isTeacher, doc]);

  if (docs.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading document…
      </p>
    );
  }

  if (!doc) return <ResourceNotFound />;

  const KindIcon = doc.kind === "guide" ? BookOpen : ClipboardList;

  return (
    <div className="space-y-6">
      <Link
        to="/resources"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Resource Library
      </Link>

      <PageHeader
        eyebrow={doc.kind === "guide" ? "Guide" : "Template"}
        title={doc.title}
        description={doc.summary}
        actions={
          isTeacher && !editing ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          ) : undefined
        }
      />

      {!editing && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <KindIcon className="h-3 w-3 text-primary" />
            {doc.kind}
          </span>
          {doc.stage && (
            <span className="inline-flex items-center rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Stage: {stageLabel(doc.stage)}
            </span>
          )}
        </div>
      )}

      {editing && isTeacher ? (
        <ResourceEditor key={doc.id + doc.updated_at} doc={doc} onDone={() => setEditing(false)} />
      ) : (
        <>
          {doc.kind === "template" && (
            <Card className="border-dashed">
              <CardContent className="p-4 text-sm text-muted-foreground">
                Copy this structure into a notebook entry, your team docs, or the matching form in
                the app. Fields marked below are the sections to fill in.
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-6">
              <BlockList blocks={parseResourceBody(doc.body)} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ResourceNotFound() {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Library"
        title="Resource not found"
        description="That guide or template doesn't exist in the library."
      />
      <Link
        to="/resources"
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Resource Library
      </Link>
    </div>
  );
}
