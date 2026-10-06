import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, HeadContent } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-label text-muted-foreground">Error 404</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Off the drawing board</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to studio
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: { error: unknown; reset: () => void }) {
  console.error(error);
  useEffect(() => {
    // A browser tab left open across a publish can still point at an older
    // route file that no longer exists. Fetch the current page once instead
    // of leaving teachers and students trapped behind the error boundary.
    const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    const isStaleModule =
      /module script|dynamically imported module|failed to fetch.*module|importing a module/i.test(
        message,
      );
    const recoveryKey = `studio-module-recovery:${window.location.pathname}`;
    if (isStaleModule && sessionStorage.getItem(recoveryKey) !== "attempted") {
      sessionStorage.setItem(recoveryKey, "attempted");
      const url = new URL(window.location.href);
      url.searchParams.set("studio-refresh", Date.now().toString());
      window.location.replace(url.toString());
      return;
    }

    if (!isStaleModule) sessionStorage.removeItem(recoveryKey);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              sessionStorage.removeItem(`studio-module-recovery:${window.location.pathname}`);
              const url = new URL(window.location.href);
              url.searchParams.set("studio-refresh", Date.now().toString());
              window.location.replace(url.toString());
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Load latest version
          </button>
          <a
            href={import.meta.env.BASE_URL}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { title: "Engineering Studio — VW eLab STEM III" },
      {
        name: "description",
        content:
          "Engineering Studio is the digital operating system for VW eLab STEM III: missions, notebooks, sprints, evidence, and assessment in one place. Real Problems. Real Partners. Real Engineering.",
      },
      { property: "og:title", content: "Engineering Studio — VW eLab STEM III" },
      {
        property: "og:description",
        content:
          "One platform for missions, engineering notebooks, team sprints, evidence, and assessment. Real Problems. Real Partners. Real Engineering.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Applies each route's title and meta tags. */}
      <HeadContent />
      <AuthProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
