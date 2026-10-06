import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Inbox, Package, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyTeam } from "@/hooks/use-my-team";
import { useTeamMembers } from "@/hooks/use-team-members";
import { PageHeader, EmptyState, StatusBadge } from "@/components/studio-ui";
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

export const Route = createFileRoute("/_authenticated/requests")({
  head: () => ({
    meta: [
      { title: "Supply & Fabrication Requests — Engineering Studio" },
      {
        name: "description",
        content: "Request supplies and fabrication time from your teacher and track their status.",
      },
      { property: "og:title", content: "Supply & Fabrication Requests — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestsPage,
});

function RequestsPage() {
  const { user } = useAuth();
  const { data: team } = useMyTeam();
  const { data: members } = useTeamMembers(team?.id);
  const nameById = new Map((members ?? []).map((m) => [m.user_id, m.full_name]));
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const [kind, setKind] = useState("supply");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [details, setDetails] = useState("");

  const requests = useQuery({
    queryKey: ["requests", user!.id, team?.id],
    queryFn: async () => {
      const clauses = [`user_id.eq.${user!.id}`];
      if (team) clauses.push(`team_id.eq.${team.id}`);
      const { data, error } = await db
        .from("requests")
        .select("*")
        .or(clauses.join(","))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("requests").insert({
        kind,
        item: item.trim(),
        quantity: quantity.trim(),
        details: details.trim(),
        user_id: user!.id,
        team_id: team?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request submitted");
      setDialogOpen(false);
      setItem("");
      setQuantity("1");
      setDetails("");
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["count"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Logistics"
        title="Supply & Fabrication Requests"
        description="Ask for materials or machine time — your teacher approves and fulfills them here."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New request
          </Button>
        }
      />

      {requests.isLoading && <p className="text-sm text-muted-foreground">Loading requests…</p>}

      {!requests.isLoading && (requests.data?.length ?? 0) === 0 && (
        <EmptyState
          icon={Inbox}
          title="No requests yet"
          description="Need plywood, filament, or time on the laser cutter? Send your first request."
          action={
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New request
            </Button>
          }
        />
      )}

      <div className="space-y-3">
        {requests.data?.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  {r.kind === "fabrication" ? (
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Package className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {r.item}{" "}
                    <span className="font-normal text-muted-foreground">× {r.quantity}</span>
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {r.kind} · {format(new Date(r.created_at), "MMM d, yyyy")} ·{" "}
                    {r.user_id === user!.id ? "You" : (nameById.get(r.user_id) ?? "Teammate")}
                  </p>
                  {r.details && <p className="mt-1 text-xs text-muted-foreground">{r.details}</p>}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New request</DialogTitle>
            <DialogDescription>Tell your teacher what you need and why.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kind</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supply">Supply</SelectItem>
                    <SelectItem value="fabrication">Fabrication</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-qty">Quantity</Label>
                <Input
                  id="req-qty"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 2 sheets"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-item">Item</Label>
              <Input
                id="req-item"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                placeholder={
                  kind === "fabrication" ? "e.g. Laser-cut chassis plate" : "e.g. 1/4 in plywood"
                }
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-details">Details</Label>
              <Textarea
                id="req-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Dimensions, deadlines, which prototype it's for…"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Submitting…" : "Submit request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
