import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ExternalLink,
  FileText,
  FolderOpen,
  HardDrive,
  Link2,
  Loader2,
  Plus,
  StickyNote,
  Trash2,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyTeam } from "@/hooks/use-my-team";
import { WORKFLOW_STAGES } from "@/lib/studio";
import {
  getStudentDriveStatus,
  startStudentDriveConnect,
  listStudentDriveFiles,
  disconnectStudentDrive,
} from "@/lib/studentDrive.functions";
import { PageHeader, EmptyState, StageBadge } from "@/components/studio-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/evidence")({
  head: () => ({
    meta: [
      { title: "Evidence Vault — Engineering Studio" },
      {
        name: "description",
        content: "Photos, links, and Drive files that prove your engineering work — organized by stage.",
      },
      { property: "og:title", content: "Evidence Vault — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EvidencePage,
});

interface EvidenceItem {
  id: string;
  title: string;
  description: string;
  evidence_type: string;
  url: string;
  stage: string;
  team_id: string | null;
  user_id: string;
  created_at: string;
  author_name?: string;
  team_name?: string;
}

const TYPE_ICONS: Record<string, typeof Link2> = {
  link: Link2,
  note: StickyNote,
  drive: HardDrive,
};

function waitForOAuthCompletion(popup: Window) {
  return new Promise<void>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        event.data?.connectorId !== "google_drive" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve();
        return;
      }
      popup.close();
      reject(new Error("Google Drive connection was not completed."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("OAuth window closed before completion."));
    }, 500);
  });
}

function EvidencePage() {
  const { user, role } = useAuth();
  const isTeacher = role === "teacher";
  const { data: team } = useMyTeam();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(isTeacher ? "all" : "mine");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState("link");
  const [formUrl, setFormUrl] = useState("");
  const [formStage, setFormStage] = useState<string>("none");
  const [formDescription, setFormDescription] = useState("");

  const driveStatus = useQuery({
    queryKey: ["student-drive-status"],
    queryFn: () => getStudentDriveStatus(),
  });

  const driveFiles = useQuery({
    queryKey: ["student-drive-files"],
    queryFn: () => listStudentDriveFiles(),
    enabled: driveOpen && driveStatus.data?.connected === true,
  });

  const evidence = useQuery({
    queryKey: ["evidence", user!.id, team?.id, tab],
    queryFn: async () => {
      let q = supabase
        .from("evidence")
        .select("*")
        .order("created_at", { ascending: false });
      if (tab === "mine") q = q.eq("user_id", user!.id);
      else if (tab === "team" && team) q = q.eq("team_id", team.id);
      const { data, error } = await q;
      if (error) throw error;
      const items = (data ?? []) as EvidenceItem[];
      if (items.length === 0) return items;

      const userIds = [...new Set(items.map((i) => i.user_id))];
      const teamIds = [...new Set(items.map((i) => i.team_id).filter(Boolean))] as string[];
      const [profs, teams] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", userIds),
        teamIds.length
          ? supabase.from("teams").select("id, name").in("id", teamIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const nameById = new Map((profs.data ?? []).map((p) => [p.id, p.full_name]));
      const teamById = new Map((teams.data ?? []).map((t) => [t.id, t.name]));
      return items.map((i) => ({
        ...i,
        author_name: nameById.get(i.user_id) ?? "Student",
        team_name: i.team_id ? (teamById.get(i.team_id) ?? "") : "",
      }));
    },
  });

  const addEvidence = useMutation({
    mutationFn: async (item: {
      title: string;
      evidence_type: string;
      url: string;
      stage: string;
      description: string;
    }) => {
      const { error } = await supabase.from("evidence").insert({
        ...item,
        user_id: user!.id,
        team_id: team?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evidence added");
      setDialogOpen(false);
      setFormTitle("");
      setFormUrl("");
      setFormDescription("");
      queryClient.invalidateQueries({ queryKey: ["evidence"] });
      queryClient.invalidateQueries({ queryKey: ["count"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("evidence").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evidence removed");
      queryClient.invalidateQueries({ queryKey: ["evidence"] });
      queryClient.invalidateQueries({ queryKey: ["count"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectStudentDrive(),
    onSuccess: () => {
      toast.success("Google Drive disconnected");
      queryClient.invalidateQueries({ queryKey: ["student-drive-status"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function connectDrive() {
    const popup = window.open("", "lovable-oauth", "width=600,height=720");
    if (!popup) {
      toast.error("Popup blocked. Allow popups and try again.");
      return;
    }
    setConnecting(true);
    try {
      const { authorizationUrl } = await startStudentDriveConnect();
      const completion = waitForOAuthCompletion(popup);
      popup.location.href = authorizationUrl;
      await completion;
      toast.success("Google Drive connected");
      queryClient.invalidateQueries({ queryKey: ["student-drive-status"] });
    } catch (err) {
      popup.close();
      toast.error(err instanceof Error ? err.message : "Could not connect Google Drive");
    } finally {
      setConnecting(false);
    }
  }

  const drive = driveStatus.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Proof of work"
        title="Evidence Vault"
        description="Collect the links, files, and notes that document your engineering process."
        actions={
          <Button
            onClick={() => {
              setFormStage(team?.current_stage ?? "none");
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add evidence
          </Button>
        }
      />

      {/* Student Drive card */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <HardDrive className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Your Google Drive</p>
              <p className="text-xs text-muted-foreground">
                {drive?.connected
                  ? "Connected — attach files straight from your Drive."
                  : drive?.configured === false
                    ? "Not available yet — your teacher is finishing the setup."
                    : "Connect your Drive to attach files as evidence."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {drive?.connected ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setDriveOpen(true)}>
                  Browse my Drive
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                >
                  <Unplug className="mr-1 h-3.5 w-3.5" /> Disconnect
                </Button>
              </>
            ) : (
              drive?.configured !== false && (
                <Button variant="outline" size="sm" onClick={connectDrive} disabled={connecting}>
                  {connecting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <HardDrive className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Connect Google Drive
                </Button>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {(team || isTeacher) && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {isTeacher && <TabsTrigger value="all">All student evidence</TabsTrigger>}
            <TabsTrigger value="mine">My evidence</TabsTrigger>
            {team && <TabsTrigger value="team">Team evidence</TabsTrigger>}
          </TabsList>
        </Tabs>
      )}

      {evidence.isLoading && <p className="text-sm text-muted-foreground">Loading evidence…</p>}

      {!evidence.isLoading && (evidence.data?.length ?? 0) === 0 && (
        <EmptyState
          icon={FolderOpen}
          title="No evidence yet"
          description="Add links to photos, CAD files, test data, or connect your Drive."
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {evidence.data?.map((item) => {
          const Icon = TYPE_ICONS[item.evidence_type] ?? Link2;
          return (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {item.user_id === user!.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => remove.mutate(item.id)}
                      aria-label="Delete evidence"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
                <h3 className="mt-2.5 text-sm font-semibold">{item.title}</h3>
                {(item.author_name || item.team_name) && item.user_id !== user!.id && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.author_name}
                    {item.team_name ? ` · ${item.team_name}` : ""}
                  </p>
                )}
                {item.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {item.stage && <StageBadge stage={item.stage} />}
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {format(new Date(item.created_at), "MMM d")}
                  </span>
                </div>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add evidence dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add evidence</DialogTitle>
            <DialogDescription>Link to a file, photo, or write a quick note.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              addEvidence.mutate({
                title: formTitle.trim(),
                evidence_type: formType,
                url: formUrl.trim(),
                stage: formStage === "none" ? "" : formStage,
                description: formDescription.trim(),
              });
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="link">Link</SelectItem>
                    <SelectItem value="drive">Drive file</SelectItem>
                    <SelectItem value="note">Note</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Workflow stage</Label>
                <Select value={formStage} onValueChange={setFormStage}>
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No stage</SelectItem>
                    {WORKFLOW_STAGES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-title">Title</Label>
              <Input
                id="ev-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Stress test photo — trial 3"
                required
              />
            </div>
            {formType !== "note" && (
              <div className="space-y-1.5">
                <Label htmlFor="ev-url">URL</Label>
                <Input
                  id="ev-url"
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://…"
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ev-desc">Description</Label>
              <Textarea
                id="ev-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What does this evidence show?"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={addEvidence.isPending}>
                {addEvidence.isPending ? "Adding…" : "Add evidence"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Drive browser dialog */}
      <Dialog open={driveOpen} onOpenChange={setDriveOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Attach from Google Drive</DialogTitle>
            <DialogDescription>
              Pick a file to add it to your evidence vault.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {driveFiles.isLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your files…
              </p>
            )}
            {driveFiles.data?.files.length === 0 && (
              <p className="text-sm text-muted-foreground">No files found in your Drive.</p>
            )}
            {driveFiles.data?.files.map((f) => (
              <button
                key={f.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
                onClick={() => {
                  addEvidence.mutate({
                    title: f.name,
                    evidence_type: "drive",
                    url: f.webViewLink ?? "",
                    stage: team?.current_stage ?? "",
                    description: "Attached from Google Drive",
                  });
                  setDriveOpen(false);
                }}
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                <Plus className="h-4 w-4 shrink-0 text-primary" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
