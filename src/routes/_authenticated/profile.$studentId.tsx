import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/studio-ui";
import { StudentProfile } from "@/components/student-profile";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/profile/$studentId")({
  head: () => ({
    meta: [
      { title: "Student Progress — Engineering Studio" },
      {
        name: "description",
        content: "A student's mission history, notebook entries, and grades over time.",
      },
      { property: "og:title", content: "Student Progress — Engineering Studio" },
      {
        property: "og:description",
        content: "Mission history, notebook entries, and grades over time.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudentProfilePage,
});

function StudentProfilePage() {
  const { studentId } = Route.useParams();
  return (
    <div>
      <PageHeader
        eyebrow="Student Record"
        title="Student Progress"
        description="Mission history, notebook entries, and grades over time."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/control/students">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Students
            </Link>
          </Button>
        }
      />
      <StudentProfile studentId={studentId} />
    </div>
  );
}
