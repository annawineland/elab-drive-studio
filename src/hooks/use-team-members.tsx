import { useQuery } from "@tanstack/react-query";
import { db } from "@/integrations/firebase/client";

export interface TeamMember {
  user_id: string;
  member_role: string;
  full_name: string;
}

/** Members of a team with their display names (profiles fetched separately — no FK to profiles). */
export function useTeamMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-members", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data: mems, error } = await db
        .from("team_members")
        .select("user_id, member_role")
        .eq("team_id", teamId!)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      if (!mems || mems.length === 0) return [] as TeamMember[];
      const ids = mems.map((m) => m.user_id);
      const { data: profs, error: pErr } = await db
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (pErr) throw pErr;
      const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
      return mems.map((m) => ({
        user_id: m.user_id,
        member_role: m.member_role,
        full_name: nameById.get(m.user_id) ?? "Teammate",
      })) as TeamMember[];
    },
  });
}
