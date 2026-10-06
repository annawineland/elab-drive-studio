import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  ClipboardList,
  Compass,
  Gauge,
  Inbox,
  KanbanSquare,
  LineChart,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  NotebookPen,
  Package,
  Target,
  Users,
  UserRoundPlus,
  UsersRound,
  Vault,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/integrations/firebase/auth";
import type { AppRole } from "@/hooks/use-auth";
import { NotificationBell } from "@/components/notification-bell";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean };
type NavSection = { title: string; items: NavItem[] };

const TEAM_SECTION: NavSection = {
  title: "Team Command Center",
  items: [
    { to: "/team", label: "Team Dashboard", icon: Users, exact: true },
    { to: "/board", label: "Kanban Board", icon: KanbanSquare },
    { to: "/minutes", label: "Meeting Minutes", icon: ClipboardList },
    { to: "/risks", label: "Risk Register", icon: AlertTriangle },
  ],
};

const LIBRARY_SECTION: NavSection = {
  title: "Library",
  items: [{ to: "/resources", label: "Resource Library", icon: BookOpen }],
};

const STUDENT_NAV: NavSection[] = [
  {
    title: "Student Studio",
    items: [
      { to: "/studio", label: "Studio Home", icon: LayoutDashboard, exact: true },
      { to: "/notebook", label: "Design Notebook", icon: NotebookPen },
      { to: "/profile", label: "My Progress", icon: LineChart },

      { to: "/evidence", label: "Evidence Vault", icon: Vault },
      { to: "/requests", label: "Supply Requests", icon: Package },
      { to: "/feedback", label: "Teacher Feedback", icon: MessageSquareText },
      { to: "/rubrics", label: "Rubrics", icon: Target },
    ],
  },
  TEAM_SECTION,
  LIBRARY_SECTION,
];

const TEACHER_NAV: NavSection[] = [
  {
    title: "Teacher Mission Control",
    items: [
      { to: "/control", label: "Overview", icon: Gauge, exact: true },
      { to: "/control/students", label: "Students", icon: UsersRound },
      { to: "/control/rosters", label: "Rosters", icon: UserRoundPlus },
      { to: "/control/teams", label: "Teams", icon: Users },
      { to: "/control/missions", label: "Missions", icon: CalendarClock },
      { to: "/control/progress", label: "Progress", icon: Target },
      { to: "/control/requests", label: "Request Queue", icon: Inbox },
      { to: "/notebook", label: "Design Notebook", icon: NotebookPen },
      { to: "/evidence", label: "Evidence Vault", icon: Vault },
      { to: "/rubrics", label: "Rubrics", icon: Target },
    ],
  },
  TEAM_SECTION,
  LIBRARY_SECTION,
];

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3 px-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
        <Compass className="h-5 w-5 text-sidebar-primary-foreground" />
      </div>
      <div>
        <p className="font-display text-sm font-bold leading-tight text-sidebar-accent-foreground">
          Engineering Studio
        </p>
        <p className="text-label text-sidebar-foreground/60">VW eLab · STEM III</p>
      </div>
    </Link>
  );
}

function NavList({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-2 text-label text-sidebar-foreground/50">{section.title}</p>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  activeOptions={{ exact: item.exact ?? false }}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  activeProps={{
                    className:
                      "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_0_var(--color-sidebar-primary)]",
                  }}
                >
                  <item.icon className="h-4 w-4 shrink-0 opacity-80" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({
  role,
  fullName,
  email,
  children,
}: {
  role: Exclude<AppRole, null>;
  fullName: string;
  email: string;
  children: ReactNode;
}) {
  const sections = role === "teacher" ? TEACHER_NAV : STUDENT_NAV;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const initials = (fullName || email || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  const userFooter = (
    <div className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary font-mono text-xs font-semibold text-sidebar-primary-foreground">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-sidebar-accent-foreground">
          {fullName || email}
        </p>
        <p className="text-label capitalize text-sidebar-foreground/60">{role}</p>
      </div>
      <button
        onClick={() => void handleSignOut()}
        title="Sign out"
        className="rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto bg-sidebar bg-blueprint-dark p-4 md:flex">
        <div className="flex items-start justify-between gap-2">
          <Brand />
          {role === "teacher" && !isMobile && <NotificationBell />}
        </div>
        <div className="flex-1">
          <NavList sections={sections} />
        </div>
        {userFooter}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 md:hidden">
          <Brand />
          <div className="flex items-center gap-1">
            {role === "teacher" && isMobile && <NotificationBell />}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-4">
                <div className="mt-6 flex h-full flex-col gap-6">
                  <div className="flex-1 overflow-y-auto">
                    <NavList sections={sections} onNavigate={() => setMobileOpen(false)} />
                  </div>
                  {userFooter}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
