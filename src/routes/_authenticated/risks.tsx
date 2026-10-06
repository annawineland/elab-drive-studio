import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyTeam } from "@/hooks/use-my-team";
import { PageHeader, EmptyState, StatusBadge } from "@/components/studio-ui";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/risks")({
  head: () => ({
    meta: [
      { title: "Risk Register — Engineering Studio" },
      {
        name: "description",
        content: "Track what could go wrong on your project and how you'll handle it.",
      },
      { property: "og:title", content: "Risk Register — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RisksPage,
});

const LEVELS = ["low", "medium", "high"] as const;
const RISK_STATUSES = ["open", "mitigated", "closed"] as const;

function RisksPage() {
  const { data: team, isLoading: teamLoading } = useMyTeam();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [rDesc, setRDesc] = useState("");
  const [rLikelihood, setRLikelihood] = useState("medium");
  const [rImpact, setRImpact] = useState("medium");
  const [rMitigation, setRMitigation] = useState("");

  const risks = useQuery({
    queryKey: ["risks", team?.id],
    enabled: !!team,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risks")
        .select("*")
        .eq("team_id", team!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  function openNew() {
    setEditId(null);
    setRDesc("");
    setRLikelihood("medium");
    setRImpact("medium");
    setRMitigation("");
    setDialogOpen(true);
  }

  function openEdit(r: {
    id: string;
    description: string;
    likelihood: string;
    impact: string;
    mitigation: string;
  }) {
    setEditId(r.id);
    setRDesc(r.description);
    setRLikelihood(r.likelihood);
    setRImpact(r.impact);
    setRMitigation(r.mitigation ?? "");
    setDialogOpen(true);
  }

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        description: rDesc.trim(),
        likelihood: rLikelihood,
        impact: rImpact,
        mitigation: rMitigation.trim(),
      };
      if (editId) {
        const { error } = await supabase.from("risks").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("risks").insert({ team_id: team!.id, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Risk updated" : "Risk added");
      setDialogOpen(false);
      setEditId(null);
      setRDesc("");
      setRMitigation("");
      queryClient.invalidateQueries({ queryKey: ["risks"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("risks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["risks"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("risks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Risk removed");
      queryClient.invalidateQueries({ queryKey: ["risks"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (teamLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!team) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Team Command Center" title="Risk Register" />
        <EmptyState
          icon={AlertTriangle}
          title="Join a team first"
          description="Risks belong to your team — join one from the Team Dashboard."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${team.name} · Team Command Center`}
        title="Risk Register"
        description="Name what could derail the project — and your plan to handle it."
        actions={
          <Button onClick={() => openNew()}>
            <Plus className="mr-1.5 h-4 w-4" /> Add risk
          </Button>
        }
      />

      {risks.isLoading && <p className="text-sm text-muted-foreground">Loading risks…</p>}

      {!risks.isLoading && (risks.data?.length ?? 0) === 0 && (
        <EmptyState
          icon={AlertTriangle}
          title="No risks logged"
          description="Good teams surface risks early: material delays, machine downtime, scope creep…"
          action={
            <Button variant="outline" onClick={() => openNew()}>
              <Plus className="mr-1.5 h-4 w-4" /> Add your first risk
            </Button>
          }
        />
      )}

      {(risks.data?.length ?? 0) > 0 && (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">Risk</TableHead>
                <TableHead>Likelihood</TableHead>
                <TableHead>Impact</TableHead>
                <TableHead className="w-[30%]">Mitigation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {risks.data!.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="align-top text-sm">{r.description}</TableCell>
                  <TableCell className="align-top">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.likelihood}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.impact}
                    </span>
                  </TableCell>
                  <TableCell className="align-top text-sm text-muted-foreground">
                    {r.mitigation || "—"}
                  </TableCell>
                  <TableCell className="align-top">
                    <Select
                      value={r.status}
                      onValueChange={(v) => setStatus.mutate({ id: r.id, status: v })}
                    >
                      <SelectTrigger className="h-7 w-28 border-none bg-transparent p-0 shadow-none">
                        <StatusBadge status={r.status} />
                      </SelectTrigger>
                      <SelectContent>
                        {RISK_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(r)}
                        aria-label="Edit risk"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => remove.mutate(r.id)}
                        aria-label="Delete risk"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit risk" : "Add a risk"}</DialogTitle>
            <DialogDescription>What could go wrong, and how will you handle it?</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="risk-desc">Risk</Label>
              <Input
                id="risk-desc"
                value={rDesc}
                onChange={(e) => setRDesc(e.target.value)}
                placeholder="e.g. Laser cutter booked solid before demo day"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Likelihood</Label>
                <Select value={rLikelihood} onValueChange={setRLikelihood}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Impact</Label>
                <Select value={rImpact} onValueChange={setRImpact}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="risk-mitigation">Mitigation plan</Label>
              <Textarea
                id="risk-mitigation"
                value={rMitigation}
                onChange={(e) => setRMitigation(e.target.value)}
                placeholder="How will you prevent or respond to this?"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Saving…" : editId ? "Save changes" : "Add risk"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
