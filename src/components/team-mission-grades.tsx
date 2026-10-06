import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMissionCriteria, useMissionGrades } from "@/components/mission-grading";

interface StageMissionRow {
  id: string;
  stage: string;
  title: string;
  sort_order: number;
}

/**
 * Grade summary for one team: every graded notebook mission with points and
 * teacher feedback. Visible to team members and teachers.
 */
export function TeamMissionGrades({ teamId }: { teamId: string }) {
  const criteriaQuery = useMissionCriteria();
  const gradesQuery = useMissionGrades();

  const missionsQuery = useQuery({
    queryKey: ["stage-missions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_missions")
        .select("id, stage, title, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as StageMissionRow[];
    },
  });

  const missionById = useMemo(
    () => new Map((missionsQuery.data ?? []).map((m) => [m.id, m])),
    [missionsQuery.data],
  );

  const rows = useMemo(() => {
    const grades = (gradesQuery.data ?? []).filter((g) => g.team_id === teamId);
    return grades
      .map((g) => ({ grade: g, mission: missionById.get(g.mission_id) }))
      .filter((r) => !!r.mission)
      .sort((a, b) => (a.mission!.sort_order ?? 0) - (b.mission!.sort_order ?? 0));
  }, [gradesQuery.data, missionById, teamId]);

  const earned = rows.reduce((s, r) => s + r.grade.total_points, 0);
  const possible = rows.reduce(
    (s, r) => s + (r.grade.possible_points || 0),
    0,
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="h-4 w-4 text-primary" />
          Mission grades
        </CardTitle>
        {rows.length > 0 && (
          <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
            {earned}/{possible} pts
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No missions graded yet. Scores and teacher notes show up here as soon as
            your teacher grades a mission response.
          </p>
        ) : (
          rows.map(({ grade, mission }) => {
            const criteria = (criteriaQuery.data ?? []).filter(
              (c) => c.mission_id === grade.mission_id,
            );
            return (
              <div
                key={grade.id}
                className="rounded-md border border-border/70 bg-muted/30 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to="/notebook"
                    search={{ stage: mission!.stage, mission: mission!.id }}
                    className="text-sm font-semibold hover:text-primary hover:underline"
                  >
                    {mission!.title}
                  </Link>
                  <span className="shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-xs">
                    {grade.total_points}/{grade.possible_points}
                  </span>
                </div>
                {criteria.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {criteria.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-start justify-between gap-3 text-xs text-muted-foreground"
                      >
                        <span>{c.label}</span>
                        <span className="shrink-0 font-mono">
                          {grade.scores?.[c.id] ?? 0}/{c.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {grade.feedback && (
                  <p className="mt-2 whitespace-pre-wrap text-xs">
                    <span className="font-medium">Teacher feedback: </span>
                    {grade.feedback}
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
