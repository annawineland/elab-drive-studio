import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GraduationCap, Loader2, Compass, Wrench } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome — Engineering Studio" },
      { name: "description", content: "Set up your Engineering Studio role and join your team." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const { user, role, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<"student" | "teacher" | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (role === "teacher") navigate({ to: "/control", replace: true });
    else if (role === "student") navigate({ to: "/studio", replace: true });
  }, [loading, user, role, navigate]);

  async function chooseRole(nextRole: "student" | "teacher") {
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await db.from("user_roles").insert({ user_id: user.id, role: nextRole });
      if (error) throw error;
      await refresh();
      setPicked(nextRole);
      if (nextRole === "teacher") {
        navigate({ to: "/control", replace: true });
      }
      // Students stay to optionally join a team below.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save role");
    } finally {
      setBusy(false);
    }
  }

  async function joinTeam() {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const { error } = await db.rpc("join_team_by_code", { _code: joinCode.trim() });
      if (error) throw error;
      toast.success("You're on the team!");
      navigate({ to: "/studio", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid join code");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user || role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar bg-blueprint-dark px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
            <Compass className="h-6 w-6 text-sidebar-primary-foreground" />
          </div>
          <p className="font-display text-lg font-bold text-sidebar-accent-foreground">
            Engineering Studio
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl md:p-8">
          {!picked ? (
            <>
              <h1 className="font-display text-2xl font-bold text-foreground">
                Welcome to the studio
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                One question before we open the toolbox — how will you use Engineering Studio?
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => void chooseRole("student")}
                  disabled={busy}
                  className="group rounded-xl border border-border bg-background p-5 text-left transition-all hover:border-primary hover:shadow-md disabled:opacity-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <GraduationCap className="h-5 w-5 text-primary" />
                  </div>
                  <p className="mt-3 font-display text-base font-semibold text-foreground">
                    I'm a student
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Notebook, logs, evidence vault, team board, and your daily mission.
                  </p>
                </button>
                <button
                  onClick={() => void chooseRole("teacher")}
                  disabled={busy}
                  className="group rounded-xl border border-border bg-background p-5 text-left transition-all hover:border-primary hover:shadow-md disabled:opacity-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/40 transition-colors group-hover:bg-accent/60">
                    <Wrench className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <p className="mt-3 font-display text-base font-semibold text-foreground">
                    I'm the teacher
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Mission Control: teams, missions, requests, feedback, and progress.
                  </p>
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold text-foreground">Join your team</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your teacher has a 6-character team code. Enter it to join your engineering team —
                or skip for now and join later from the Team Dashboard.
              </p>
              <div className="mt-6 flex flex-col gap-1.5">
                <Label htmlFor="join-code">Team join code</Label>
                <Input
                  id="join-code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. X7K2PQ"
                  maxLength={6}
                  className="font-mono text-lg tracking-[0.3em] uppercase"
                />
              </div>
              <div className="mt-6 flex gap-2">
                <Button
                  onClick={() => void joinTeam()}
                  disabled={busy || joinCode.trim().length < 4}
                  className="flex-1"
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Join team
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate({ to: "/studio", replace: true })}
                >
                  Skip for now
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
