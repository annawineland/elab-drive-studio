import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Compass,
  Gauge,
  NotebookPen,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { WORKFLOW_STAGES } from "@/lib/studio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Engineering Studio — Real Problems. Real Partners. Real Engineering." },
      {
        name: "description",
        content:
          "The digital operating system for VW eLab STEM III: daily missions, engineering notebooks, team sprints, evidence, and assessment — one integrated platform for authentic engineering.",
      },
      { property: "og:title", content: "Engineering Studio — VW eLab STEM III" },
      {
        property: "og:description",
        content:
          "Daily missions, engineering notebooks, team sprints, evidence, and assessment in one integrated platform for VW eLab STEM III.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  {
    icon: NotebookPen,
    title: "Student Studio",
    body: "Your private engineering workspace — daily mission, notebook and logs, evidence vault, supply requests, and teacher feedback.",
  },
  {
    icon: Users,
    title: "Team Command Center",
    body: "Where teams run like engineering firms: kanban boards, sprints, meeting minutes, and a living risk register.",
  },
  {
    icon: Gauge,
    title: "Teacher Mission Control",
    body: "Progress dashboards, missing evidence, request queues, and feedback — every classroom signal in one place.",
  },
];

function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="relative overflow-hidden bg-sidebar bg-blueprint-dark">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
              <Compass className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <p className="font-display text-sm font-bold text-sidebar-accent-foreground">
                Engineering Studio
              </p>
              <p className="text-label text-sidebar-foreground/60">VW eLab · STEM III</p>
            </div>
          </div>
          <Link
            to={user ? "/welcome" : "/auth"}
            className="rounded-lg bg-sidebar-primary px-4 py-2 text-sm font-semibold text-sidebar-primary-foreground transition-opacity hover:opacity-90"
          >
            {user ? "Enter Studio" : "Sign in"}
          </Link>
        </nav>

        <div className="mx-auto max-w-6xl px-4 pb-20 pt-14 md:px-8 md:pb-28 md:pt-20">
          <p className="text-label text-sidebar-primary">STEM School Chattanooga · eLab Engineering Design</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight text-sidebar-accent-foreground md:text-6xl">
            Real Problems. Real Partners.{" "}
            <span className="text-sidebar-primary">Real Engineering.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-sidebar-foreground md:text-lg">
            Collaborate with purpose. Innovate with courage. Think critically. Engineer the
            future — one platform for your mission, your team, and your evidence.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={user ? "/welcome" : "/auth"}
              className="inline-flex items-center gap-2 rounded-lg bg-sidebar-primary px-5 py-3 text-sm font-semibold text-sidebar-primary-foreground transition-opacity hover:opacity-90"
            >
              {user ? "Enter your studio" : "Get started"} <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#workflow"
              className="inline-flex items-center gap-2 rounded-lg border border-sidebar-border px-5 py-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              See the workflow
            </a>
          </div>
        </div>
      </header>

      {/* Pillars */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-8">
        <p className="text-label text-primary">One integrated platform</p>
        <h2 className="mt-2 font-display text-2xl font-bold text-foreground md:text-3xl">
          Three workspaces, one engineering story
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <p.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="border-y border-border bg-muted/50 bg-blueprint">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <p className="text-label text-primary">The engineering workflow</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-foreground md:text-3xl">
            Ten stages. Evidence at every step.
          </h2>
          <ol className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {WORKFLOW_STAGES.map((stage, i) => (
              <li
                key={stage.key}
                className="rounded-xl border border-border bg-card p-4"
              >
                <p className="font-mono text-xs font-semibold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-1.5 text-sm font-medium text-foreground">{stage.label}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 md:px-8">
        <p className="text-sm text-muted-foreground">
          Engineering Studio · VW eLab · STEM School Chattanooga
        </p>
        <p className="text-label text-muted-foreground">Collaborate · Innovate · Think Critically</p>
      </footer>
    </div>
  );
}
