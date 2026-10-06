import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Inbox, Package, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/firebase/client";
import { TeacherOnly } from "@/components/teacher-only";
import { PageHeader, EmptyState, StatusBadge } from "@/components/studio-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/control/requests")({
  head: () => ({
    meta: [
      { title: "Request Queue — Mission Control" },
      {
        name: "description",
        content: "Approve, deny, and fulfill student supply and fabrication requests.",
      },
      { property: "og:title", content: "Request Queue — Mission Control" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestQueuePage,
});

const TABS = ["pending", "approved", "fulfilled", "denied"] as const;

function RequestQueuePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("pending");

  const requests = useQuery({
    queryKey: ["control-requests", tab],
    queryFn: async () => {
      const { data, error } = await db
        .from("requests")
        .select("*")
        .eq("status", tab)
        .order("created_at", { ascending: tab === "pending" });
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const userIds = [...new Set(data.map((r) => r.user_id))];
      const teamIds = [...new Set(data.map((r) => r.team_id).filter(Boolean))] as string[];
      const [profs, teams] = await Promise.all([
        db.from("profiles").select("id, full_name").in("id", userIds),
        teamIds.length
          ? db.from("teams").select("id, name").in("id", teamIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (profs.error) throw profs.error;
      if (teams.error) throw teams.error;
      const nameById = new Map((profs.data ?? []).map((p) => [p.id, p.full_name]));
      const teamById = new Map((teams.data ?? []).map((t) => [t.id, t.name]));
      return data.map((r) => ({
        ...r,
        requester: nameById.get(r.user_id) ?? "Student",
        teamName: r.team_id ? (teamById.get(r.team_id) ?? null) : null,
      }));
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db
        .from("requests")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(`Request ${v.status}`);
      queryClient.invalidateQueries({ queryKey: ["control-requests"] });
      queryClient.invalidateQueries({ queryKey: ["control-pending-requests"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <TeacherOnly>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Teacher Mission Control"
          title="Request Queue"
          description="Supplies and fabrication asks from every team — approve, deny, fulfill."
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {requests.isLoading && <p className="text-sm text-muted-foreground">Loading requests…</p>}

        {!requests.isLoading && (requests.data?.length ?? 0) === 0 && (
          <EmptyState
            icon={Inbox}
            title={`No ${tab} requests`}
            description={
              tab === "pending"
                ? "The queue is clear — nice."
                : "Requests will appear here as their status changes."
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
                      {r.kind} · {r.requester}
                      {r.teamName ? ` · ${r.teamName}` : ""} ·{" "}
                      {format(new Date(r.created_at), "MMM d")}
                    </p>
                    {r.details && <p className="mt-1 text-xs text-muted-foreground">{r.details}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => setStatus.mutate({ id: r.id, status: "approved" })}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStatus.mutate({ id: r.id, status: "denied" })}
                      >
                        <X className="mr-1 h-3.5 w-3.5" /> Deny
                      </Button>
                    </>
                  )}
                  {r.status === "approved" && (
                    <Button
                      size="sm"
                      onClick={() => setStatus.mutate({ id: r.id, status: "fulfilled" })}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" /> Mark fulfilled
                    </Button>
                  )}
                  {(r.status === "fulfilled" || r.status === "denied") && (
                    <StatusBadge status={r.status} />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </TeacherOnly>
  );
}
