import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Compass, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Engineering Studio" },
      { name: "description", content: "Set a new password for your Engineering Studio account." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase puts type=recovery in the URL hash after the email link.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("type") === "recovery") {
      setReady(true);
      return;
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated. Sign in with your new password.");
      navigate({ to: "/auth", replace: true });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar bg-blueprint-dark px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
            <Compass className="h-6 w-6 text-sidebar-primary-foreground" />
          </div>
          <p className="font-display text-lg font-bold text-sidebar-accent-foreground">
            Engineering Studio
          </p>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl md:p-8">
          {ready ? (
            <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
              <h1 className="font-display text-xl font-bold text-foreground">Set a new password</h1>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Update password
              </Button>
            </form>
          ) : (
            <div className="text-center">
              <h1 className="font-display text-xl font-bold text-foreground">Open your reset link</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This page only works from the password-reset link in your email. Request a new one
                from the sign-in page.
              </p>
              <Button variant="outline" className="mt-6" onClick={() => navigate({ to: "/auth" })}>
                Back to sign in
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
