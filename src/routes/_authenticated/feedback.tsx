import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { MessageSquare, Target } from "lucide-react";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyTeam } from "@/hooks/use-my-team";
import { PageHeader, EmptyState } from "@/components/studio-ui";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/feedback")({
  head: () => ({
    meta: [
      { title: "Feedback — Engineering Studio" },
      {
        name: "description",
        content: "Timely feedback from your teacher on your work and your team's progress.",
      },
      { property: "og:title", content: "Feedback — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { user } = useAuth();
  const { data: team } = useMyTeam();

  const feedback = useQuery({
    queryKey: ["feedback", user!.id, team?.id],
    queryFn: async () => {
      const clauses = [`target_user_id.eq.${user!.id}`];
      if (team) clauses.push(`team_id.eq.${team.id}`);
      const { data, error } = await db
        .from("feedback")
        .select("*, missions:mission_id (title)")
        .or(clauses.join(","))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as typeof data & {
        missions?: { title: string } | null;
      };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assessment"
        title="Feedback"
        description="Comments from your teacher on your work and your team's progress."
      />

      {feedback.isLoading && <p className="text-sm text-muted-foreground">Loading feedback…</p>}

      {!feedback.isLoading && (feedback.data?.length ?? 0) === 0 && (
        <EmptyState
          icon={MessageSquare}
          title="No feedback yet"
          description="As your teacher reviews entries, evidence, and boards, feedback will appear here."
        />
      )}

      <div className="space-y-3">
        {feedback.data?.map((f) => (
          <Card key={f.id}>
            <CardContent className="p-4">
              {f.missions?.title && (
                <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                  <Target className="h-3.5 w-3.5" />
                  {f.missions.title}
                </p>
              )}
              <p className="text-sm">{f.content}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {f.team_id && !f.target_user_id ? "Team feedback · " : ""}
                Teacher · {format(new Date(f.created_at), "MMM d, yyyy · h:mm a")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
