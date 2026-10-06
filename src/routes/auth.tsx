import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Compass, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import {
  authErrorMessage,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "@/integrations/firebase/auth";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Engineering Studio" },
      {
        name: "description",
        content: "Sign in to Engineering Studio, the VW eLab STEM III engineering design platform.",
      },
      { property: "og:title", content: "Sign in — Engineering Studio" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/welcome", replace: true });
  }, [loading, user, navigate]);

  async function handleGoogle() {
    setGoogleBusy(true);
    try {
      if (await signInWithGoogle()) navigate({ to: "/welcome" });
    } catch (err) {
      toast.error(authErrorMessage(err, "Google sign-in failed"));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password, fullName);
        setCheckEmail(true);
      } else {
        await signInWithEmail(email, password);
        navigate({ to: "/welcome" });
      }
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      toast.error("Enter your email first, then click forgot password.");
      return;
    }
    try {
      await sendPasswordReset(email);
      toast.success("Password reset email sent.");
    } catch (err) {
      toast.error(authErrorMessage(err));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar bg-blueprint-dark px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
            <Compass className="h-6 w-6 text-sidebar-primary-foreground" />
          </div>
          <div>
            <p className="font-display text-lg font-bold text-sidebar-accent-foreground">
              Engineering Studio
            </p>
            <p className="text-label text-sidebar-foreground/60">VW eLab · STEM III</p>
          </div>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl md:p-8">
          {checkEmail ? (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <MailCheck className="h-6 w-6 text-success" />
              </div>
              <h2 className="mt-4 font-display text-xl font-semibold text-foreground">
                Check your email
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to{" "}
                <span className="font-medium text-foreground">{email}</span>. Confirm it, then come
                back and sign in.
              </p>
              <Button variant="outline" className="mt-6" onClick={() => setCheckEmail(false)}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void handleGoogle()}
                disabled={googleBusy}
              >
                {googleBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M12 5.04c1.62 0 3.06.56 4.2 1.64l3.12-3.12C17.46 1.8 14.96.75 12 .75 7.4.75 3.44 3.4 1.61 7.26l3.66 2.84C6.16 7.31 8.88 5.04 12 5.04Z"
                    />
                    <path
                      fill="currentColor"
                      d="M23.5 12.27c0-.85-.08-1.66-.21-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62l3.66 2.84c2.14-1.97 3.78-4.88 3.78-8.65Z"
                      opacity=".7"
                    />
                    <path
                      fill="currentColor"
                      d="M5.28 14.36a7.2 7.2 0 0 1 0-4.72L1.62 6.8a11.24 11.24 0 0 0 0 10.4l3.66-2.84Z"
                      opacity=".5"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23.25c3.04 0 5.6-1 7.46-2.72l-3.66-2.84c-1.02.68-2.32 1.08-3.8 1.08-3.12 0-5.84-2.27-6.73-5.42l-3.66 2.84c1.83 3.86 5.79 6.06 10.39 6.06Z"
                      opacity=".9"
                    />
                  </svg>
                )}
                Continue with Google
              </Button>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-label text-muted-foreground">or with email</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Create account</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-5">
                  <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input
                        id="signin-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@school.edu"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="signin-password">Password</Label>
                      <Input
                        id="signin-password"
                        type="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>
                    <Button type="submit" disabled={busy}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Sign in
                    </Button>
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      className="text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Forgot your password?
                    </button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-5">
                  <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="signup-name">Full name</Label>
                      <Input
                        id="signup-name"
                        required
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ada Lovelace"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@school.edu"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 6 characters"
                      />
                    </div>
                    <Button type="submit" disabled={busy}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Create account
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      You'll choose your role (student or teacher) after confirming your email.
                    </p>
                  </form>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-sidebar-foreground/60">
          Real Problems. Real Partners. Real Engineering.
        </p>
      </div>
    </div>
  );
}
