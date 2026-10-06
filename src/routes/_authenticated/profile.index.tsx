import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/studio-ui";
import { StudentProfile } from "@/components/student-profile";

export const Route = createFileRoute("/_authenticated/profile/")({
  head: () => ({
    meta: [
      { title: "My Progress — Engineering Studio" },
      {
        name: "description",
        content:
          "Your engineering studio record: mission history, notebook entries, grades, and a progress graph.",
      },
      { property: "og:title", content: "My Progress — Engineering Studio" },
      {
        property: "og:description",
        content: "Mission history, notebook entries, and grades over time.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyProfilePage,
});

function MyProfilePage() {
  const { user, fullName } = useAuth();
  return (
    <div>
      <PageHeader
        eyebrow="My Record"
        title="My Progress"
        description={`Everything ${fullName || "you"} have logged: missions, notebook entries, and grades over time.`}
      />
      {user ? <StudentProfile studentId={user.id} /> : null}
    </div>
  );
}
