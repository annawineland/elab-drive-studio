import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyTeam } from "@/hooks/use-my-team";
import { useTeamMembers } from "@/hooks/use-team-members";
import { PageHeader, EmptyState } from "@/components/studio-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/minutes")({
  head: () => ({
    meta: [
      { title: "Meeting Minutes — Engineering Studio" },
      {
        name: "description",
        content: "Record team meetings: attendees, discussion notes, and decisions made.",
      },
      { property: "og:title", content: "Meeting Minutes — Engineering Studio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinutesPage,
});

function MinutesPage() {
  const { user } = useAuth();
  const { data: team, isLoading: teamLoading } = useMyTeam();
  const { data: members } = useTeamMembers(team?.id);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10));
  const [mAttendees, setMAttendees] = useState("");
  const [mNotes, setMNotes] = useState("");
  const [mDecisions, setMDecisions] = useState("");

  const minutes = useQuery({
    queryKey: ["minutes", team?.id],
    enabled: !!team,
    queryFn: async () => {
      const { data, error } = await db
        .from("meeting_minutes")
        .select("*")
        .eq("team_id", team!.id)
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("meeting_minutes").insert({
        team_id: team!.id,
        meeting_date: mDate,
        attendees: mAttendees.trim(),
        notes: mNotes.trim(),
        decisions: mDecisions.trim(),
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Minutes saved");
      setDialogOpen(false);
      setMNotes("");
      setMDecisions("");
      queryClient.invalidateQueries({ queryKey: ["minutes"] });
      queryClient.invalidateQueries({ queryKey: ["minutes-recent"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("meeting_minutes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Minutes deleted");
      queryClient.invalidateQueries({ queryKey: ["minutes"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openNew = () => {
    setMDate(new Date().toISOString().slice(0, 10));
    setMAttendees((members ?? []).map((m) => m.full_name).join(", "));
    setDialogOpen(true);
  };

  if (teamLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!team) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Team Command Center" title="Meeting Minutes" />
        <EmptyState
          icon={ClipboardList}
          title="Join a team first"
          description="Minutes belong to your team — join one from the Team Dashboard."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${team.name} · Team Command Center`}
        title="Meeting Minutes"
        description="A record of who met, what you discussed, and what you decided."
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" /> New minutes
          </Button>
        }
      />

      {minutes.isLoading && <p className="text-sm text-muted-foreground">Loading minutes…</p>}

      {!minutes.isLoading && (minutes.data?.length ?? 0) === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="No minutes yet"
          description="Document your next stand-up or design review."
          action={
            <Button variant="outline" onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> Record minutes
            </Button>
          }
        />
      )}

      <div className="space-y-3">
        {minutes.data?.map((m) => (
          <Card key={m.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold">
                    {format(new Date(m.meeting_date), "EEEE, MMM d, yyyy")}
                  </h3>
                  {m.attendees && (
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {m.attendees}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate(m.id)}
                  aria-label="Delete minutes"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              {m.notes && (
                <div className="mt-3">
                  <p className="text-label text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-line text-sm">{m.notes}</p>
                </div>
              )}
              {m.decisions && (
                <div className="mt-3 rounded-lg border bg-muted/40 p-3">
                  <p className="text-label text-muted-foreground">Decisions</p>
                  <p className="mt-1 whitespace-pre-line text-sm">{m.decisions}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New meeting minutes</DialogTitle>
            <DialogDescription>Capture the meeting while it's fresh.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="min-date">Date</Label>
                <Input
                  id="min-date"
                  type="date"
                  value={mDate}
                  onChange={(e) => setMDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="min-attendees">Attendees</Label>
                <Input
                  id="min-attendees"
                  value={mAttendees}
                  onChange={(e) => setMAttendees(e.target.value)}
                  placeholder="Names, comma separated"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min-notes">Notes</Label>
              <Textarea
                id="min-notes"
                value={mNotes}
                onChange={(e) => setMNotes(e.target.value)}
                placeholder="What did you discuss?"
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min-decisions">Decisions</Label>
              <Textarea
                id="min-decisions"
                value={mDecisions}
                onChange={(e) => setMDecisions(e.target.value)}
                placeholder="What did the team decide? Who does what next?"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Save minutes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
