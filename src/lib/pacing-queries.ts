import { queryOptions } from "@tanstack/react-query";
import { db } from "@/integrations/firebase/client";

export interface PacingWeek {
  id: string;
  week_number: number;
  /** ISO date strings (YYYY-MM-DD) straight from Postgres date columns. */
  start_date: string;
  end_date: string;
  focus: string;
  stage: string | null;
  /** One item per line. */
  milestones: string;
  /** One item per line. */
  deliverables: string;
  updated_at: string;
}

export const PACING_WEEKS_KEY = ["pacing-weeks"] as const;

/** All pacing weeks in order. RLS: any signed-in user can read; teachers edit. */
export const pacingWeeksQueryOptions = () =>
  queryOptions({
    queryKey: PACING_WEEKS_KEY,
    queryFn: async () => {
      const { data, error } = await db
        .from("pacing_weeks")
        .select(
          "id, week_number, start_date, end_date, focus, stage, milestones, deliverables, updated_at",
        )
        .order("week_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PacingWeek[];
    },
  });

export const TEAM_PACING_KEY = ["team-pacing-weeks"] as const;

/** A team's own private plan. RLS: only that team's members (and teachers) can read. */
export const teamPacingWeeksQueryOptions = (teamId?: string) =>
  queryOptions({
    queryKey: [...TEAM_PACING_KEY, teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await db
        .from("team_pacing_weeks")
        .select(
          "id, week_number, start_date, end_date, focus, stage, milestones, deliverables, updated_at",
        )
        .eq("team_id", teamId!)
        .order("week_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PacingWeek[];
    },
  });

/** Local YYYY-MM-DD for comparisons against the date columns (no UTC drift). */
export function todayLocalISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type WeekStatus = "current" | "done" | "upcoming";

export function weekStatus(week: PacingWeek, today = todayLocalISO()): WeekStatus {
  if (week.end_date < today) return "done";
  if (week.start_date > today) return "upcoming";
  return "current";
}

/** Parse a YYYY-MM-DD string as a local date (avoids UTC off-by-one). */
export function parseLocalDate(iso: string): Date {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
