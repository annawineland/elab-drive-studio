import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Target } from "lucide-react";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyTeam } from "@/hooks/use-my-team";
import { parseMissionDescription } from "@/lib/mission-attachment";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { MissionNotes } from "@/components/mission-feedback";
import { VocabText } from "@/components/vocab-text";

/**
 * Shown in the Design Notebook when a student (or teacher) arrives from a
 * posted mission link. Lets the team check the mission off right here; the
 * status is the same record the Missions pages read.
 */
export function PostedMissionBanner({ missionId }: { missionId: string }) {
  const { user, role } = useAuth();
  const { data: team } = useMyTeam();
  const queryClient = useQueryClient();

  const mission = useQuery({
    queryKey: ["posted-mission", missionId],
    queryFn: async () => {
      const { data, error } = await db
        .from("missions")
        .select("id, title, description, stage, due_date")
        .eq("id", missionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const completion = useQuery({
    queryKey: ["posted-mission-completion", missionId, team?.id],
    enabled: !!team,
    queryFn: async () => {
      const { data, error } = await db
        .from("mission_completions")
        .select("id, completed_at")
        .eq("mission_id", missionId)
        .eq("team_id", team!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const toggle = useMutation({
    mutationFn: async (done: boolean) => {
      if (done) {
        const { error } = await db
          .from("mission_completions")
          .insert({ mission_id: missionId, team_id: team!.id, completed_by: user!.id });
        if (error) throw error;
      } else {
        const { error } = await db
          .from("mission_completions")
          .delete()
          .eq("mission_id", missionId)
          .eq("team_id", team!.id);
        if (error) throw error;
      }
    },
    onSuccess: (_d, done) => {
      toast.success(done ? "Mission checked off" : "Mission reopened");
      void queryClient.invalidateQueries({ queryKey: ["posted-mission-completion", missionId] });
      void queryClient.invalidateQueries({ queryKey: ["mission-completions"] });
      void queryClient.invalidateQueries({ queryKey: ["control-mission-completions"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!mission.data) return null;
  const parsed = parseMissionDescription(mission.data.description ?? "");
  const done = !!completion.data;

  return (
    <Card className={cn("border-primary/40", done && "border-success/50 bg-success/5")}>
      <CardContent className="flex items-start gap-3 p-4">
        {team ? (
          <Checkbox
            className="mt-0.5"
            checked={done}
            disabled={toggle.isPending}
            onCheckedChange={(v) => toggle.mutate(v === true)}
            aria-label="Mark this posted mission completed"
          />
        ) : (
          <Target className="mt-0.5 h-4 w-4 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Posted mission
          </p>
          <h3 className={cn("text-sm font-semibold", done && "text-muted-foreground line-through")}>
            {mission.data.title}
          </h3>
          {parsed.text && (
            <p className="mt-1 text-sm text-muted-foreground">
              <VocabText text={parsed.text} />
            </p>
          )}

          <p className="mt-2 text-xs text-muted-foreground">
            {done ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Completed{" "}
                {completion.data?.completed_at
                  ? new Date(completion.data.completed_at).toLocaleString()
                  : ""}
              </span>
            ) : team ? (
              "This checks off automatically when someone on your team saves a notebook entry here — or check the box yourself."
            ) : role === "teacher" ? (
              "Teams check this off from their Studio Home; completions show on Mission Control."
            ) : (
              "Join a team to check missions off."
            )}
          </p>
          <MissionNotes missionId={missionId} teamId={team?.id} />
        </div>
      </CardContent>
    </Card>
  );
}
