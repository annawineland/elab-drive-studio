import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ResourceDocRow } from "@/lib/resource-doc-format";

export const RESOURCE_DOCS_KEY = ["resource-docs"] as const;

/** All resource library documents, ordered for display. RLS: any signed-in user can read. */
export const resourceDocsQueryOptions = () =>
  queryOptions({
    queryKey: RESOURCE_DOCS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_docs")
        .select("id, slug, kind, title, summary, stage, sort_order, body, updated_at")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ResourceDocRow[];
    },
  });
