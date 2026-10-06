import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { stageLabel } from "@/lib/studio";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="text-label text-primary">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

const STAGE_COLORS = [
  "bg-chart-1/10 text-chart-1",
  "bg-chart-2/10 text-chart-2",
  "bg-chart-3/10 text-chart-3",
  "bg-chart-4/10 text-chart-4",
  "bg-chart-5/10 text-chart-5",
];

export function StageBadge({ stage, className }: { stage: string; className?: string }) {
  const idx = Math.max(
    0,
    ["kickoff", "understand", "research", "brainstorm", "select", "prototype", "test", "iterate", "present", "reflect"].indexOf(stage),
  );
  const color = STAGE_COLORS[idx % STAGE_COLORS.length];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        color,
        className,
      )}
    >
      {stageLabel(stage)}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warning/15 text-warning-foreground",
  approved: "bg-success/15 text-success",
  fulfilled: "bg-success/15 text-success",
  denied: "bg-destructive/10 text-destructive",
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  review: "bg-chart-4/10 text-chart-4",
  done: "bg-success/15 text-success",
  planned: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  complete: "bg-success/15 text-success",
  open: "bg-destructive/10 text-destructive",
  mitigated: "bg-warning/15 text-warning-foreground",
  closed: "bg-success/15 text-success",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground";
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
        style,
        className,
      )}
    >
      {label}
    </span>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-label text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 font-display text-3xl font-bold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
