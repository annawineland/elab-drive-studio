import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  CheckCheck,
  PencilLine,
  AlertTriangle,
  FilePlus2,
  Inbox,
  ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { stageLabel } from "@/lib/studio";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/studio-ui";

interface NotificationRow {
  id: string;
  kind: string;
  team_id: string | null;
  entry_id: string | null;
  mission_id: string | null;
  stage: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

const KIND_ICON: Record<string, typeof Bell> = {
  mission_submitted: FilePlus2,
  mission_updated: PencilLine,
  graded_mission_changed: AlertTriangle,
};

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");

  const list = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, team_id, entry_id, mission_id, stage, title, body, read_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = list.data ?? [];
  const filtered = items.filter((n) => {
    if (filter === "unread") return !n.read_at;
    if (filter === "read") return n.read_at;
    return true;
  });
  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <div>
      <PageHeader
        eyebrow="Teacher Mission Control"
        title="Notifications"
        description="All alerts from student mission work. Click an alert to jump to that mission in the notebook."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={unreadCount === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">
              All
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium">
                {items.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="unread">
              Unread
              {unreadCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-medium text-primary">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="read">Read</TabsTrigger>
          </TabsList>
        </Tabs>

        <Link
          to="/control"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Mission Control
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={filter === "unread" ? "No unread alerts" : "No notifications yet"}
            description={
              filter === "unread"
                ? "You're all caught up. Switch to All to see older alerts."
                : "You'll see alerts here whenever students save or edit mission work."
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((n) => {
              const Icon = KIND_ICON[n.kind] ?? Bell;
              return (
                <li key={n.id}>
                  <Link
                    to="/notebook"
                    search={{
                      ...(n.stage ? { stage: n.stage } : {}),
                      ...(n.mission_id ? { mission: n.mission_id } : {}),
                    }}
                    onClick={() => {
                      if (!n.read_at) markOne.mutate(n.id);
                    }}
                    className={cn(
                      "group flex items-start gap-4 px-4 py-4 transition-colors hover:bg-muted/60",
                      !n.read_at && "bg-primary/[0.03]"
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        n.kind === "graded_mission_changed"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{n.title}</p>
                        {!n.read_at && (
                          <span className="rounded-full bg-primary px-1.5 py-0 text-[10px] font-semibold text-primary-foreground">
                            New
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                      <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {n.stage ? `${stageLabel(n.stage)} · ` : ""}
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>

                    {!n.read_at && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          markOne.mutate(n.id);
                        }}
                        disabled={markOne.isPending}
                      >
                        Mark read
                      </Button>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
