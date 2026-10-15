import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ClipboardList,
  Flag,
  KanbanSquare,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  pacingWeeksQueryOptions,
  parseLocalDate,
  teamPacingWeeksQueryOptions,
  weekStatus,
  type PacingWeek,
} from "@/lib/pacing-queries";
import { stageLabel } from "@/lib/studio";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type EventKind = "event" | "mission" | "sprint" | "meeting";

interface CalendarEvent {
  id: string;
  date: string; // yyyy-MM-dd
  kind: EventKind;
  title: string;
  notes?: string;
  done?: boolean;
  /** Set for rows from team_events, which the team can edit here. */
  eventId?: string;
  /** Posted mission ID and stage, for opening it in the notebook. */
  mission?: { id: string; stage: string };
}

const KIND_META: Record<EventKind, { icon: typeof Flag; dot: string; label: string }> = {
  event: { icon: Star, dot: "bg-chart-4", label: "Team event" },
  mission: { icon: Flag, dot: "bg-warning", label: "Mission due" },
  sprint: { icon: KanbanSquare, dot: "bg-primary", label: "Sprint" },
  meeting: { icon: ClipboardList, dot: "bg-success", label: "Meeting" },
};

const toIso = (d: Date) => format(d, "yyyy-MM-dd");

/** Team events plus mission due dates, sprint start/end dates, and logged meetings. */
function useTeamEvents(teamId: string, modId: string | null) {
  return useQuery({
    queryKey: ["team-calendar", teamId, modId],
    queryFn: async () => {
      let missions = db.from("missions").select("id, title, stage, due_date");
      if (modId) missions = missions.or(`mod_id.is.null,mod_id.eq.${modId}`);
      const [eventsRes, missionsRes, doneRes, sprintsRes, minutesRes] = await Promise.all([
        db.from("team_events").select("id, title, event_date, notes").eq("team_id", teamId),
        missions,
        db.from("mission_completions").select("mission_id").eq("team_id", teamId),
        db.from("sprints").select("id, name, start_date, end_date").eq("team_id", teamId),
        db.from("meeting_minutes").select("id, meeting_date").eq("team_id", teamId),
      ]);
      for (const res of [eventsRes, missionsRes, doneRes, sprintsRes, minutesRes]) {
        if (res.error) throw res.error;
      }

      const done = new Set((doneRes.data ?? []).map((c) => c.mission_id));
      const events: CalendarEvent[] = [];
      for (const e of eventsRes.data ?? []) {
        events.push({
          id: `e-${e.id}`,
          date: e.event_date,
          kind: "event",
          title: e.title,
          notes: e.notes,
          eventId: e.id,
        });
      }
      for (const m of missionsRes.data ?? []) {
        if (m.due_date) {
          events.push({
            id: `m-${m.id}`,
            date: m.due_date,
            kind: "mission",
            title: m.title,
            done: done.has(m.id),
            mission: { id: m.id, stage: m.stage },
          });
        }
      }
      for (const s of sprintsRes.data ?? []) {
        if (s.start_date) {
          events.push({
            id: `ss-${s.id}`,
            date: s.start_date,
            kind: "sprint",
            title: `${s.name} starts`,
          });
        }
        if (s.end_date) {
          events.push({
            id: `se-${s.id}`,
            date: s.end_date,
            kind: "sprint",
            title: `${s.name} ends`,
          });
        }
      }
      for (const m of minutesRes.data ?? []) {
        events.push({
          id: `mt-${m.id}`,
          date: m.meeting_date,
          kind: "meeting",
          title: "Team meeting",
        });
      }
      return events;
    },
  });
}

/** The event's title, linking to where it's worked on. */
function EventTitle({ event: e }: { event: CalendarEvent }) {
  const className = "underline-offset-4 hover:text-primary hover:underline";
  if (e.mission) {
    const { id, stage } = e.mission;
    return (
      <Link
        to="/notebook"
        search={stage ? { stage, mission: id } : { mission: id }}
        className={className}
        title="Open in your design notebook"
      >
        {e.title}
      </Link>
    );
  }
  if (e.kind === "sprint") {
    return (
      <Link to="/board" className={className}>
        {e.title}
      </Link>
    );
  }
  if (e.kind === "meeting") {
    return (
      <Link to="/minutes" className={className}>
        {e.title}
      </Link>
    );
  }
  return <>{e.title}</>;
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** The pacing week a day falls in: its focus, stage, milestones and deliverables. */
function PacingWeekSummary({ week }: { week: PacingWeek }) {
  const fmt = (iso: string) => format(parseLocalDate(iso), "MMM d");
  const sections = [
    { label: "Milestones", items: lines(week.milestones) },
    { label: "Deliverables", items: lines(week.deliverables) },
  ];
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        weekStatus(week) === "current" ? "border-primary/40 bg-primary/5" : "bg-muted/30",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          Week {week.week_number} · {fmt(week.start_date)} – {fmt(week.end_date)}
        </p>
        {week.stage && (
          <Link
            to="/notebook"
            search={{ stage: week.stage }}
            className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
            title="Open this stage in the design notebook"
          >
            {stageLabel(week.stage)}
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm font-medium">{week.focus}</p>
      {sections.map(
        ({ label, items }) =>
          items.length > 0 && (
            <div key={label} className="mt-2">
              <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
              <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                {items.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          ),
      )}
    </div>
  );
}

interface Draft {
  eventId: string | null;
  title: string;
  date: string;
  notes: string;
}

/**
 * A month view of everything with a date for one team. Team members and
 * teachers can add, edit and delete the team's own events.
 */
export function TeamCalendar({ teamId, modId }: { teamId: string; modId: string | null }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: events = [] } = useTeamEvents(teamId, modId);
  // The team's own copy of the pacing guide, or the class guide until they make one.
  const teamWeeks = useQuery(teamPacingWeeksQueryOptions(teamId));
  const classWeeks = useQuery(pacingWeeksQueryOptions());
  const isOwnPlan = (teamWeeks.data?.length ?? 0) > 0;
  const weeks = isOwnPlan ? teamWeeks.data! : (classWeeks.data ?? []);
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [draft, setDraft] = useState<Draft | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [events]);

  const eventDays = useMemo(() => [...byDate.keys()].map(parseLocalDate), [byDate]);
  const selectedEvents = byDate.get(toIso(selected)) ?? [];
  const selectedWeek = weeks.find(
    (w) => w.start_date <= toIso(selected) && toIso(selected) <= w.end_date,
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["team-calendar", teamId] });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const fields = { title: d.title.trim(), event_date: d.date, notes: d.notes.trim() };
      const { error } = d.eventId
        ? await db.from("team_events").update(fields).eq("id", d.eventId)
        : await db
            .from("team_events")
            .insert({ ...fields, team_id: teamId, created_by: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: (_, d) => {
      toast.success(d.eventId ? "Event updated" : "Event added");
      setSelected(parseLocalDate(d.date));
      setDraft(null);
      void refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await db.from("team_events").delete().eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event deleted");
      setDraft(null);
      void refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-primary" />
            Team calendar
          </CardTitle>
          <div className="flex flex-wrap gap-3 pt-2">
            {(Object.keys(KIND_META) as EventKind[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full", KIND_META[k].dot)} />
                {KIND_META[k].label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            asChild
            title={
              isOwnPlan
                ? "Edit your team's pacing plan"
                : "Using the class pacing guide — make your team's own copy to adjust it"
            }
          >
            <Link to="/resources/pacing">
              <CalendarRange className="mr-1.5 h-4 w-4" />
              {isOwnPlan ? "Edit pacing" : "Make our pacing copy"}
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDraft({ eventId: null, title: "", date: toIso(selected), notes: "" })}
          >
            <CalendarPlus className="mr-1.5 h-4 w-4" /> Add event
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:flex-row">
        <Calendar
          mode="single"
          required
          selected={selected}
          onSelect={setSelected}
          modifiers={{
            hasEvents: eventDays,
            pacingWeek: selectedWeek
              ? {
                  from: parseLocalDate(selectedWeek.start_date),
                  to: parseLocalDate(selectedWeek.end_date),
                }
              : [],
          }}
          modifiersClassNames={{
            pacingWeek: "bg-primary/5",
            hasEvents:
              "after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
          }}
          className="rounded-lg border"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {format(selected, "EEEE, MMM d")}
          </p>
          {selectedWeek && <PacingWeekSummary week={selectedWeek} />}
          {selectedEvents.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
          )}
          {selectedEvents.map((e) => {
            const Icon = KIND_META[e.kind].icon;
            const eventId = e.eventId;
            return (
              <div key={e.id} className="flex items-start gap-3 rounded-lg border p-2.5">
                <span
                  className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", KIND_META[e.kind].dot)}
                />
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", e.done && "text-muted-foreground line-through")}>
                    <EventTitle event={e} />
                  </p>
                  {e.notes && (
                    <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
                      {e.notes}
                    </p>
                  )}
                </div>
                {eventId ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    title="Edit event"
                    onClick={() =>
                      setDraft({ eventId, title: e.title, date: e.date, notes: e.notes ?? "" })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {e.done ? "Done" : KIND_META[e.kind].label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>

      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.eventId ? "Edit event" : "New team event"}</DialogTitle>
            <DialogDescription>
              Everyone on the team and your teacher can see and edit it.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(draft);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="event-title">Title</Label>
                <Input
                  id="event-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Client check-in, prototype demo…"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-date">Date</Label>
                <Input
                  id="event-date"
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-notes">Notes</Label>
                <Textarea
                  id="event-notes"
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Time, place, what to bring"
                  rows={3}
                />
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                {draft.eventId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(draft.eventId!)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" disabled={save.isPending || !draft.title.trim()}>
                  {save.isPending ? "Saving…" : "Save event"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
