import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, PencilLine, AlertTriangle, FilePlus2 } from "lucide-react";
import { db } from "@/integrations/firebase/client";
import { stageLabel } from "@/lib/studio";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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

/** Teacher alert bell: shows when students save or edit mission responses. */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const list = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await db
        .from("notifications")
        .select("id, kind, team_id, entry_id, mission_id, stage, title, body, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = db
      .channel(`notifications-bell-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [queryClient]);

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = list.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Alerts"
          className="relative rounded-md p-2 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Alerts</p>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                <CheckCheck className="h-3 w-3" /> Mark all read
              </Button>
            )}
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
            >
              View all
            </Link>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No alerts yet. You'll see one here whenever a team saves or edits mission work.
            </p>
          )}
          {items.map((n) => {
            const Icon = KIND_ICON[n.kind] ?? Bell;
            return (
              <Link
                key={n.id}
                to="/notebook"
                search={{
                  ...(n.stage ? { stage: n.stage } : {}),
                  ...(n.mission_id ? { mission: n.mission_id } : {}),
                }}
                onClick={() => {
                  if (!n.read_at) markOne.mutate(n.id);
                }}
                className={cn(
                  "flex gap-2.5 border-b px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/60",
                  !n.read_at && "bg-primary/5",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    n.kind === "graded_mission_changed" ? "text-destructive" : "text-primary",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {n.stage ? `${stageLabel(n.stage)} · ` : ""}
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
