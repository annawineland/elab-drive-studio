import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface MissionNote {
  id: string;
  content: string;
  created_at: string;
  team_id: string | null;
  author_id: string;
}

function useMissionNotes(missionId: string, teamId?: string | null) {
  return useQuery({
    queryKey: ["mission-feedback", missionId, teamId ?? "all"],
    queryFn: async () => {
      let q = db
        .from("feedback")
        .select("id, content, created_at, team_id, author_id")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      if (teamId) q = q.eq("team_id", teamId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MissionNote[];
    },
  });
}

/** Teacher notes attached to a posted mission, shown to the team it was written for. */
export function MissionNotes({
  missionId,
  teamId,
}: {
  missionId: string;
  teamId: string | null | undefined;
}) {
  const notes = useMissionNotes(missionId, teamId);
  if (!teamId || (notes.data?.length ?? 0) === 0) return null;
  return (
    <div className="mt-3 space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
        <MessageSquare className="h-3.5 w-3.5" />
        Teacher feedback on this mission
      </p>
      {notes.data!.map((n) => (
        <div key={n.id} className="text-sm">
          <p className="whitespace-pre-line">{n.content}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {new Date(n.created_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Teacher control: write, edit, and delete feedback tied to a mission + team. */
export function MissionFeedbackDialog({
  missionId,
  missionTitle,
  teams,
  open,
  onOpenChange,
}: {
  missionId: string;
  missionTitle: string;
  teams: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notes = useMissionNotes(missionId);
  const [teamId, setTeamId] = useState<string>(teams[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["mission-feedback", missionId] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const text = content.trim();
      if (!text) throw new Error("Write a note first");
      if (editingId) {
        const { error } = await db.from("feedback").update({ content: text }).eq("id", editingId);
        if (error) throw error;
      } else {
        if (!teamId) throw new Error("Pick a team");
        const { error } = await db.from("feedback").insert({
          author_id: user!.id,
          team_id: teamId,
          mission_id: missionId,
          content: text,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Feedback updated" : "Feedback sent to the team");
      setContent("");
      setEditingId(null);
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("feedback").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Feedback removed");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "Team";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setContent("");
          setEditingId(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mission feedback</DialogTitle>
          <DialogDescription>
            Notes you leave here show on “{missionTitle}” for that team — on their Studio Home and
            in their design notebook.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {!editingId && (
            <div className="space-y-1.5">
              <Label>Team</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="mf-note">Note</Label>
            <Textarea
              id="mf-note"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What did this team do well, and what should they fix before the next check-in?"
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingId(null);
                  setContent("");
                }}
              >
                Cancel edit
              </Button>
            )}
            <Button type="submit" disabled={save.isPending}>
              {editingId ? "Save changes" : "Send feedback"}
            </Button>
          </DialogFooter>
        </form>

        {(notes.data?.length ?? 0) > 0 && (
          <div className="max-h-56 space-y-2 overflow-y-auto border-t pt-3">
            {notes.data!.map((n) => (
              <div key={n.id} className="rounded-md border bg-muted/30 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {teamName(n.team_id)} · {new Date(n.created_at).toLocaleDateString()}
                  </p>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Edit feedback"
                      onClick={() => {
                        setEditingId(n.id);
                        setContent(n.content);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Delete feedback"
                      onClick={() => remove.mutate(n.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm">{n.content}</p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
