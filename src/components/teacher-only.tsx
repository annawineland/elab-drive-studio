import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { EmptyState } from "@/components/studio-ui";

/** Client-side gate for teacher-only pages. Data stays protected by firestore.rules regardless. */
export function TeacherOnly({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  if (role !== "teacher") {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Teachers only"
        description="Mission Control is where your teacher manages teams, missions, and requests."
      />
    );
  }
  return <>{children}</>;
}
