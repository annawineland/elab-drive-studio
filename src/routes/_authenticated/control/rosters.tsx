import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, UserRoundPlus, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/firebase/client";
import { deleteStudentAccount, listUnrosteredAccounts } from "@/lib/students";
import { useAuth } from "@/hooks/use-auth";
import { TeacherOnly } from "@/components/teacher-only";
import { PageHeader } from "@/components/studio-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/control/rosters")({
  head: () => ({
    meta: [
      { title: "Rosters — Mission Control" },
      {
        name: "description",
        content:
          "Add students to each mod by email — they're placed automatically when they sign in.",
      },
      { property: "og:title", content: "Rosters — Mission Control" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RostersPage,
});

interface RosterEntry {
  id: string;
  mod_id: string;
  email: string;
  student_id: string | null;
  student_name: string | null;
  name: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ParsedEntry {
  email: string;
  name: string | null;
}

/**
 * Accepts one student per line in any of these shapes:
 *   Ada Lovelace <ada@school.org>
 *   Ada Lovelace, ada@school.org
 *   Ada Lovelace ada@school.org
 *   ada@school.org
 * Bare emails may also share a line (comma/space separated).
 */
function parseRosterInput(text: string): { entries: ParsedEntry[]; invalid: string[] } {
  const entries: ParsedEntry[] = [];
  const invalid: string[] = [];
  const byEmail = new Map<string, ParsedEntry>();

  const push = (email: string, name: string | null) => {
    const key = email.toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      if (!existing.name && name) existing.name = name;
      return;
    }
    const entry = { email: key, name };
    byEmail.set(key, entry);
    entries.push(entry);
  };

  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;

    // "Name <email>"
    const angle = line.match(/^(.*?)<\s*([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)\s*>\s*$/);
    if (angle) {
      push(angle[2]!, (angle[1] ?? "").trim().replace(/[;,]\s*$/, "") || null);
      continue;
    }

    // "Name, email" (or semicolon)
    const comma = line.match(/^(.*?)[,;]\s*([^\s@,;]+@[^\s@,;]+\.[^\s@,;]+)\s*$/);
    if (comma) {
      push(comma[2]!, (comma[1] ?? "").trim() || null);
      continue;
    }

    // Bare email(s), or "Name email"
    const tokens = line.split(/[\s,;]+/).filter(Boolean);
    const emailTokens = tokens.filter((t) => EMAIL_RE.test(t));
    const otherTokens = tokens.filter((t) => !EMAIL_RE.test(t));
    if (tokens.length > 0 && emailTokens.length === tokens.length) {
      tokens.forEach((t) => push(t, null));
    } else if (emailTokens.length === 1 && otherTokens.length > 0) {
      push(emailTokens[0]!, otherTokens.join(" "));
    } else {
      invalid.push(line);
    }
  }

  return { entries, invalid };
}

function RostersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [addFor, setAddFor] = useState<{ id: string; name: string } | null>(null);
  const [emailsText, setEmailsText] = useState("");
  const [renameFor, setRenameFor] = useState<{ id: string; name: string } | null>(null);
  const [renameText, setRenameText] = useState("");
  const [nameFor, setNameFor] = useState<RosterEntry | null>(null);
  const [nameText, setNameText] = useState("");
  const [purgeFor, setPurgeFor] = useState<RosterEntry | null>(null);

  const unrostered = useQuery({
    queryKey: ["unrostered-accounts"],
    queryFn: () => listUnrosteredAccounts(),
  });

  const mods = useQuery({
    queryKey: ["mods"],
    queryFn: async () => {
      const { data, error } = await db.from("mods").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const roster = useQuery({
    queryKey: ["control-rosters"],
    queryFn: async () => {
      const { data: enrolls, error } = await db
        .from("mod_enrollments")
        .select("id, mod_id, email, student_id, student_name")
        .order("email");
      if (error) throw error;
      const ids = [
        ...new Set((enrolls ?? []).map((e) => e.student_id).filter((x): x is string => !!x)),
      ];
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profs, error: pErr } = await db
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        if (pErr) throw pErr;
        (profs ?? []).forEach((p) => names.set(p.id, p.full_name));
      }
      return (enrolls ?? []).map((e): RosterEntry => ({
        ...e,
        name: e.student_id ? (names.get(e.student_id) ?? null) : null,
      }));
    },
  });

  const addStudents = useMutation({
    mutationFn: async () => {
      const { entries, invalid } = parseRosterInput(emailsText);
      if (entries.length === 0) throw new Error("No valid email addresses found");

      const { data: existing, error: exErr } = await db
        .from("mod_enrollments")
        .select("id, email")
        .eq("mod_id", addFor!.id)
        .in(
          "email",
          entries.map((e) => e.email),
        );
      if (exErr) throw exErr;
      const existingByEmail = new Map((existing ?? []).map((r) => [r.email, r.id]));

      const toInsert = entries
        .filter((e) => !existingByEmail.has(e.email))
        .map((e) => ({
          mod_id: addFor!.id,
          email: e.email,
          student_name: e.name,
          added_by: user!.id,
        }));
      const toRename = entries.filter((e) => existingByEmail.has(e.email) && e.name);

      if (toInsert.length > 0) {
        const { error } = await db.from("mod_enrollments").insert(toInsert);
        if (error) throw error;
      }
      for (const e of toRename) {
        const { error } = await db
          .from("mod_enrollments")
          .update({ student_name: e.name })
          .eq("id", existingByEmail.get(e.email)!);
        if (error) throw error;
      }

      return { added: toInsert.length, renamed: toRename.length, invalid };
    },
    onSuccess: (r) => {
      toast.success(
        `Added ${r.added} student${r.added === 1 ? "" : "s"} to ${addFor!.name}` +
          (r.renamed > 0 ? ` (updated names for ${r.renamed} already on the roster)` : ""),
      );
      if (r.invalid.length > 0) {
        toast.warning(
          `Skipped ${r.invalid.length} line${r.invalid.length === 1 ? "" : "s"} with no valid email: ${r.invalid.join(", ")}`,
        );
      }
      setAddFor(null);
      setEmailsText("");
      queryClient.invalidateQueries({ queryKey: ["control-rosters"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeStudent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("mod_enrollments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from roster");
      queryClient.invalidateQueries({ queryKey: ["control-rosters"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const purgeStudent = useMutation({
    mutationFn: async (entry: RosterEntry) => {
      await deleteStudentAccount(entry.student_id!);
    },
    onSuccess: () => {
      toast.success("Account and all of that student's work were deleted");
      setPurgeFor(null);
      queryClient.invalidateQueries({ queryKey: ["control-rosters"] });
      queryClient.invalidateQueries({ queryKey: ["control-teams-full"] });
      queryClient.invalidateQueries({ queryKey: ["control-teams"] });
      queryClient.invalidateQueries({ queryKey: ["unrostered-accounts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const renameMod = useMutation({
    mutationFn: async () => {
      const name = renameText.trim();
      if (!name) throw new Error("Mod name cannot be empty");
      const { error } = await db.from("mods").update({ name }).eq("id", renameFor!.id);
      if (error) throw error;
      return name;
    },
    onSuccess: (name) => {
      toast.success(`Mod renamed to “${name}”`);
      setRenameFor(null);
      queryClient.invalidateQueries({ queryKey: ["mods"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setStudentName = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("mod_enrollments")
        .update({ student_name: nameText.trim() || null })
        .eq("id", nameFor!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student name saved");
      setNameFor(null);
      queryClient.invalidateQueries({ queryKey: ["control-rosters"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const entries = roster.data ?? [];

  return (
    <TeacherOnly>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Teacher Mission Control"
          title="Mod rosters"
          description="Add students by email before they ever sign in — when they do, they're placed in the right mod automatically."
        />

        <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Paste each mod's students — one per line — as{" "}
          <span className="font-medium text-foreground">Ada Lovelace &lt;ada@school.org&gt;</span>,{" "}
          <span className="font-medium text-foreground">Ada Lovelace, ada@school.org</span>, or just
          the email. Students who haven't signed in yet show as{" "}
          <span className="font-medium text-foreground">Pending</span>; the moment they sign in with
          that email, they flip to <span className="font-medium text-foreground">Joined</span> and
          land in your class — no codes or invites to manage. Use the pencil next to a mod's name to
          rename it.
        </div>

        {(mods.isLoading || roster.isLoading) && (
          <p className="text-sm text-muted-foreground">Loading rosters…</p>
        )}

        {(mods.data ?? []).map((m) => {
          const mine = entries.filter((e) => e.mod_id === m.id);
          const joined = mine.filter((e) => e.student_id).length;
          return (
            <Card key={m.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h2 className="font-display text-base font-semibold">{m.name}</h2>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setRenameFor({ id: m.id, name: m.name });
                          setRenameText(m.name);
                        }}
                        aria-label={`Rename ${m.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {mine.length} on roster · {joined} joined · {mine.length - joined} pending
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAddFor({ id: m.id, name: m.name });
                      setEmailsText("");
                    }}
                  >
                    <UserRoundPlus className="mr-1.5 h-4 w-4" /> Add students
                  </Button>
                </div>

                {mine.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No students yet — add this mod's students to build the roster.
                  </p>
                ) : (
                  <div className="mt-3 rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-24" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mine.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">
                              {e.name || e.student_name || (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {e.email}
                            </TableCell>
                            <TableCell>
                              {e.student_id ? (
                                <Badge>Joined</Badge>
                              ) : (
                                <Badge variant="outline">Pending</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end">
                                {!e.student_id && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setNameFor(e);
                                      setNameText(e.student_name ?? "");
                                    }}
                                    aria-label={`Set name for ${e.email}`}
                                  >
                                    <Pencil className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                )}
                                {e.student_id && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setPurgeFor(e)}
                                    aria-label={`Delete account and work for ${e.email}`}
                                    title="Delete account and all their work"
                                  >
                                    <UserRoundX className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeStudent.mutate(e.id)}
                                  aria-label={`Remove ${e.email} from ${m.name}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {(unrostered.data ?? []).length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h2 className="font-display text-base font-semibold">Accounts not on any roster</h2>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {(unrostered.data ?? []).length} signed-in account
                {(unrostered.data ?? []).length === 1 ? "" : "s"} · removed from rosters/teams but
                still able to sign in
              </p>
              <div className="mt-3 rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(unrostered.data ?? []).map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {a.name || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.email}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setPurgeFor({
                                  id: a.id,
                                  mod_id: "",
                                  email: a.email,
                                  student_id: a.id,
                                  student_name: a.name,
                                  name: a.name,
                                })
                              }
                              aria-label={`Delete account and work for ${a.email}`}
                              title="Delete account and all their work"
                            >
                              <UserRoundX className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add students */}
        <Dialog open={!!addFor} onOpenChange={(o) => !o && setAddFor(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add students — {addFor?.name}</DialogTitle>
              <DialogDescription>
                One student per line, with or without a name. Anyone already signed up is placed
                immediately; everyone else is placed automatically the first time they sign in.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                addStudents.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="roster-emails">Students (name + email)</Label>
                <Textarea
                  id="roster-emails"
                  value={emailsText}
                  onChange={(e) => setEmailsText(e.target.value)}
                  placeholder={
                    "Ada Lovelace <ada.lovelace@school.org>\nGrace Hopper, grace.hopper@school.org\nalan.turing@school.org"
                  }
                  rows={7}
                  className="font-mono text-sm"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Name and email separated by a comma or &lt;&gt; — or just the email by itself.
                  Re-adding an existing student updates their name.
                </p>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={addStudents.isPending}>
                  {addStudents.isPending ? "Adding…" : "Add to roster"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Rename mod */}
        <Dialog open={!!renameFor} onOpenChange={(o) => !o && setRenameFor(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rename mod</DialogTitle>
              <DialogDescription>
                This updates the mod name everywhere — rosters, teams, and dashboards.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                renameMod.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="mod-name">Mod name</Label>
                <Input
                  id="mod-name"
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  placeholder="e.g. Mod 1 — Period 2"
                  maxLength={80}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={renameMod.isPending}>
                  {renameMod.isPending ? "Saving…" : "Save name"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Set student name (pending entries) */}
        <Dialog open={!!nameFor} onOpenChange={(o) => !o && setNameFor(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Student name</DialogTitle>
              <DialogDescription>
                {nameFor?.email} — the name you set here shows on the roster until the student signs
                in.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setStudentName.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="student-name">Name</Label>
                <Input
                  id="student-name"
                  value={nameText}
                  onChange={(e) => setNameText(e.target.value)}
                  placeholder="e.g. Ada Lovelace"
                  maxLength={120}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={setStudentName.isPending}>
                  {setStudentName.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete account + all work */}
        <AlertDialog open={!!purgeFor} onOpenChange={(o) => !o && setPurgeFor(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this student's account and work?</AlertDialogTitle>
              <AlertDialogDescription>
                {purgeFor?.name || purgeFor?.student_name || purgeFor?.email} will be signed out for
                good. This permanently deletes their account, notebook entries, evidence links,
                requests, feedback, rubric scores, team membership, and roster spots. This cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={purgeStudent.isPending}
                onClick={(ev) => {
                  ev.preventDefault();
                  if (purgeFor) purgeStudent.mutate(purgeFor);
                }}
              >
                {purgeStudent.isPending ? "Deleting…" : "Delete permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TeacherOnly>
  );
}
