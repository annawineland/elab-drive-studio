import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/firebase/client";

/** A heartbeat this often keeps a row fresh; rows older than STALE_MS are ignored. */
const HEARTBEAT_MS = 20_000;
const STALE_MS = 60_000;

export interface PresenceTarget {
  missionId: string | null;
  entryId: string | null;
}

export interface ActiveWriter extends PresenceTarget {
  userId: string;
}

/**
 * Marks the signed-in student as writing `target` while it's set: a row in
 * notebook_presence, refreshed every 20s and removed when `target` clears.
 */
export function usePresenceHeartbeat(
  teamId: string | undefined,
  userId: string | undefined,
  target: PresenceTarget | null,
) {
  const missionId = target?.missionId ?? null;
  const entryId = target?.entryId ?? null;
  const active = !!target;

  useEffect(() => {
    if (!teamId || !userId || !active) return;
    const beat = () =>
      void db
        .from("notebook_presence")
        .upsert({
          team_id: teamId,
          user_id: userId,
          mission_id: missionId,
          entry_id: entryId,
          updated_at: new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error) console.warn("[presence] could not mark you as writing:", error.message);
        });
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      void db
        .from("notebook_presence")
        .delete()
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .then(() => undefined);
    };
  }, [teamId, userId, active, missionId, entryId]);
}

/** Teammates (not the signed-in user) with a notebook response open right now, live. */
export function useActiveWriters(teamId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());

  const rows = useQuery({
    queryKey: ["notebook-presence", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await db
        .from("notebook_presence")
        .select("user_id, mission_id, entry_id, updated_at")
        .eq("team_id", teamId!);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!teamId) return;
    const channel = db
      .channel(`notebook-presence-${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notebook_presence",
          filter: `team_id=eq.${teamId}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: ["notebook-presence", teamId] }),
      )
      .subscribe();
    // Re-check staleness so a closed tab drops off without any write.
    const timer = setInterval(() => setNow(Date.now()), HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      void db.removeChannel(channel);
    };
  }, [teamId, queryClient]);

  return useMemo<ActiveWriter[]>(
    () =>
      (rows.data ?? [])
        .filter((r) => r.user_id !== userId && now - Date.parse(r.updated_at) < STALE_MS)
        .map((r) => ({ userId: r.user_id, missionId: r.mission_id, entryId: r.entry_id })),
    [rows.data, userId, now],
  );
}
