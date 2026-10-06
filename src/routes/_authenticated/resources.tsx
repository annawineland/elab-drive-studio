import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RESOURCE_DOCS_KEY } from "@/lib/resource-queries";

export const Route = createFileRoute("/_authenticated/resources")({
  component: ResourcesLayout,
});

/**
 * Shared layout for the Resource Library. Subscribes to changes on the
 * resource_docs table so teacher edits appear live for every student who
 * has the library (or a document) open.
 */
function ResourcesLayout() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("resource-docs-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "resource_docs" },
        () => {
          void queryClient.invalidateQueries({ queryKey: RESOURCE_DOCS_KEY });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return <Outlet />;
}
