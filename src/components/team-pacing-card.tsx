import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarRange, ExternalLink } from "lucide-react";
import {
  pacingWeeksQueryOptions,
  teamPacingWeeksQueryOptions,
  parseLocalDate,
  weekStatus,
  type PacingWeek,
} from "@/lib/pacing-queries";
import { stageLabel } from "@/lib/studio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function dateRange(week: PacingWeek) {
  const fmt = (iso: string) =>
    parseLocalDate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(week.start_date)} – ${fmt(week.end_date)}`;
}

function lines(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * The team's own copy of the pacing guide, shown on the team dashboard.
 * Falls back to the class guide when the team hasn't made their own copy yet.
 */
export function TeamPacingCard({ teamId }: { teamId: string }) {
  const teamWeeks = useQuery(teamPacingWeeksQueryOptions(teamId));
  const classWeeks = useQuery(pacingWeeksQueryOptions());

  const isOwnPlan = (teamWeeks.data?.length ?? 0) > 0;
  const rows = isOwnPlan ? teamWeeks.data! : (classWeeks.data ?? []);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-primary" />
            {isOwnPlan ? "Our team pacing plan" : "Pacing guide"}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {isOwnPlan
              ? "Your team's own copy — edit any week in the library."
              : "Using the class guide. Make your own copy to adjust dates and goals."}
          </p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/resources/pacing">
            {isOwnPlan ? "Edit" : "Make our copy"} <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No pacing weeks set up yet.</p>
        )}
        {rows.map((w) => {
          const status = weekStatus(w);
          return (
            <div
              key={w.id}
              className={cn(
                "rounded-lg border p-3",
                status === "current" && "border-primary bg-primary/5",
                status === "done" && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Week {w.week_number} · {dateRange(w)}
                  {w.stage ? ` · ${stageLabel(w.stage)}` : ""}
                </p>
                {status === "current" && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    This week
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium">{w.focus}</p>
              {lines(w.deliverables).length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                  {lines(w.deliverables).map((d) => (
                    <li key={d}>• {d}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
