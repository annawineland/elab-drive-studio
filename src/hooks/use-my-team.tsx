import { useQuery } from "@tanstack/react-query";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "./use-auth";

export interface MyTeam {
  id: string;
  name: string;
  mod_id: string | null;
  client_name: string;
  project_focus: string;
  current_stage: string;
  join_code: string;
  mods: { name: string } | null;
}

/** The team the signed-in student belongs to (first membership), or null. */
export function useMyTeam() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-team", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db
        .from("team_members")
        .select(
          "team_id, teams(id, name, mod_id, client_name, project_focus, current_stage, join_code, mods(name))",
        )
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.teams as unknown as MyTeam | null) ?? null;
    },
  });
}
