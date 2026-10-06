import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-label text-muted-foreground">Loading studio</p>
      </div>
    </div>
  );
}

function AuthenticatedLayout() {
  const { user, role, fullName, loading, error, refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
    } else if (!role && !error) {
      navigate({ to: "/welcome", replace: true });
    }
  }, [loading, user, role, error, navigate]);

  if (loading || !user) return <LoadingScreen />;

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold text-foreground">
            Your studio needs another moment
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We could not finish opening your account. Try again without leaving this page.
          </p>
          <Button className="mt-5 gap-2" onClick={() => void refresh()}>
            <RotateCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!role) return <LoadingScreen />;

  return (
    <AppShell role={role} fullName={fullName} email={user.email ?? ""}>
      <Outlet />
    </AppShell>
  );
}
