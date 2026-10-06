export const WORKFLOW_STAGES = [
  { key: "kickoff", label: "Client Kickoff" },
  { key: "understand", label: "Understand Problem" },
  { key: "research", label: "Research" },
  { key: "brainstorm", label: "Brainstorm" },
  { key: "select", label: "Select Concept" },
  { key: "prototype", label: "Prototype" },
  { key: "test", label: "Test" },
  { key: "iterate", label: "Iterate" },
  { key: "present", label: "Present" },
  { key: "reflect", label: "Reflect" },
] as const;

export type StageKey = (typeof WORKFLOW_STAGES)[number]["key"];

export function stageLabel(key: string): string {
  return WORKFLOW_STAGES.find((s) => s.key === key)?.label ?? key;
}

export function stageIndex(key: string): number {
  return WORKFLOW_STAGES.findIndex((s) => s.key === key);
}

export const ENTRY_TYPES = [
  { key: "notebook", label: "Engineering Notebook" },
  { key: "cad", label: "CAD Log" },
  { key: "prototype", label: "Prototype Log" },
  { key: "testing", label: "Testing Log" },
  { key: "reflection", label: "Reflection Journal" },
] as const;

export type EntryType = (typeof ENTRY_TYPES)[number]["key"];

export function entryTypeLabel(key: string): string {
  return ENTRY_TYPES.find((t) => t.key === key)?.label ?? key;
}

export const TASK_STATUSES = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
] as const;

export const REQUEST_STATUSES = ["pending", "approved", "fulfilled", "denied"] as const;

// Resource Library documents now live in the resource_docs database table
// (teacher-editable, realtime). See src/lib/resource-doc-format.ts and
// src/lib/resource-queries.ts.

/** Due-date status for a mission (YYYY-MM-DD string or null). */
export type DueStatus = {
  label: string;
  tone: "overdue" | "today" | "soon" | "later";
};

export function missionDueStatus(due: string | null | undefined): DueStatus | null {
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parts = due.split("-").map(Number);
  const dueDate = new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
  const days = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
  const pretty = dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (days < 0)
    return { label: `Overdue — was due ${pretty}`, tone: "overdue" };
  if (days === 0) return { label: "Due today", tone: "today" };
  if (days === 1) return { label: "Due tomorrow", tone: "soon" };
  if (days <= 3) return { label: `Due in ${days} days (${pretty})`, tone: "soon" };
  return { label: `Due ${pretty}`, tone: "later" };
}

export const DUE_TONE_CLASS: Record<DueStatus["tone"], string> = {
  overdue: "border-destructive/50 bg-destructive/10 text-destructive",
  today: "border-primary/50 bg-primary/10 text-primary",
  soon: "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  later: "border-border bg-muted text-muted-foreground",
};
