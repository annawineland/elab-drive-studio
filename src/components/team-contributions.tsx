import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { FolderOpen, NotebookPen, Target, Users } from "lucide-react";
import { db } from "@/integrations/firebase/client";
import { useTeamMembers } from "@/hooks/use-team-members";
import { entryTypeLabel, stageLabel } from "@/lib/studio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EntryRow {
  id: string;
  user_id: string;
  title: string;
  content: string;
  entry_type: string;
  stage: string;
  mission_id: string | null;
  created_at: string;
}

interface EvidenceRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  evidence_type: string;
  url: string;
  stage: string;
  created_at: string;
}

/** Shows every teammate's notebook entries, mission work, and evidence. */
export function TeamContributions({ teamId }: { teamId: string }) {
  const { data: members } = useTeamMembers(teamId);
  const [open, setOpen] = useState<EntryRow | null>(null);

  const work = useQuery({
    queryKey: ["team-contributions", teamId],
    queryFn: async () => {
      const [entriesRes, evidenceRes] = await Promise.all([
        db
          .from("entries")
          .select("id, user_id, title, content, entry_type, stage, mission_id, created_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false }),
        db
          .from("evidence")
          .select("id, user_id, title, description, evidence_type, url, stage, created_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false }),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (evidenceRes.error) throw evidenceRes.error;
      return {
        entries: (entriesRes.data ?? []) as EntryRow[],
        evidence: (evidenceRes.data ?? []) as EvidenceRow[],
      };
    },
  });

  const nameById = useMemo(
    () => new Map((members ?? []).map((m) => [m.user_id, m.full_name])),
    [members],
  );

  const perMember = useMemo(() => {
    const entries = work.data?.entries ?? [];
    const evidence = work.data?.evidence ?? [];
    return (members ?? []).map((m) => {
      const mine = entries.filter((e) => e.user_id === m.user_id);
      return {
        ...m,
        missions: mine.filter((e) => e.mission_id).length,
        notes: mine.filter((e) => !e.mission_id).length,
        evidence: evidence.filter((e) => e.user_id === m.user_id).length,
        last: mine[0]?.created_at ?? evidence.find((e) => e.user_id === m.user_id)?.created_at,
      };
    });
  }, [members, work.data]);

  const recent = useMemo(() => {
    const items = [
      ...(work.data?.entries ?? []).map((e) => ({ kind: "entry" as const, at: e.created_at, e })),
      ...(work.data?.evidence ?? []).map((e) => ({
        kind: "evidence" as const,
        at: e.created_at,
        e,
      })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  }, [work.data]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> Team contributions
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/notebook">Open notebook</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {work.isLoading && <p className="text-sm text-muted-foreground">Loading team work…</p>}

        {!work.isLoading && (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {perMember.map((m) => (
                <div key={m.user_id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{m.full_name}</p>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {m.last ? `last ${format(new Date(m.last), "MMM d")}` : "no work yet"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Target className="h-3 w-3" /> {m.missions} mission
                      {m.missions === 1 ? "" : "s"}
                    </span>
                    <span className="flex items-center gap-1">
                      <NotebookPen className="h-3 w-3" /> {m.notes} notebook
                    </span>
                    <span className="flex items-center gap-1">
                      <FolderOpen className="h-3 w-3" /> {m.evidence} evidence
                    </span>
                  </div>
                </div>
              ))}
              {perMember.length === 0 && (
                <p className="text-sm text-muted-foreground">No teammates yet.</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-label text-muted-foreground">Latest team work</p>
              {recent.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing filed yet — notebook entries and evidence your team saves show up here.
                </p>
              )}
              {recent.map((item) =>
                item.kind === "entry" ? (
                  <button
                    key={`e-${item.e.id}`}
                    type="button"
                    onClick={() => setOpen(item.e)}
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:border-primary"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.e.title}</p>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {nameById.get(item.e.user_id) ?? "Teammate"} ·{" "}
                        {format(new Date(item.at), "MMM d")}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {item.e.content}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-primary">
                      {item.e.mission_id ? "Mission response" : entryTypeLabel(item.e.entry_type)} ·{" "}
                      {stageLabel(item.e.stage)}
                    </p>
                  </button>
                ) : (
                  <a
                    key={`v-${item.e.id}`}
                    href={item.e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border p-3 transition-colors hover:border-primary"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.e.title}</p>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {nameById.get(item.e.user_id) ?? "Teammate"} ·{" "}
                        {format(new Date(item.at), "MMM d")}
                      </span>
                    </div>
                    {item.e.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.e.description}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-primary">
                      Evidence · {stageLabel(item.e.stage)}
                    </p>
                  </a>
                ),
              )}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{open?.title}</DialogTitle>
            <DialogDescription>
              {open
                ? `${nameById.get(open.user_id) ?? "Teammate"} · ${stageLabel(open.stage)} · ${format(
                    new Date(open.created_at),
                    "MMM d, yyyy",
                  )}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm">{open?.content}</p>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
