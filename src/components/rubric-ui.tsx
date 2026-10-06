import { Link } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  rubricLevelLabel,
  type LearningTarget,
  type RubricCriterion,
  type RubricScore,
} from "@/lib/rubrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LEVEL_STYLES: Record<string, string> = {
  advanced: "border-success/40 bg-success/10 text-success",
  proficient: "border-primary/40 bg-primary/10 text-primary",
  developing: "border-warning/40 bg-warning/10 text-warning",
};

export function RubricLevelChip({
  level,
  className,
}: {
  level: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        LEVEL_STYLES[level] ?? "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {rubricLevelLabel(level)}
    </span>
  );
}

const LEVEL_DOTS: Record<string, string> = {
  advanced: "bg-success",
  proficient: "bg-primary",
  developing: "bg-warning",
};

function MiniCriteriaList({ level, items }: { level: string; items: RubricCriterion[] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <RubricLevelChip level={level} className="mb-2" />
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No criteria listed.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span
                className={cn(
                  "mt-1.5 h-1 w-1 shrink-0 rounded-full",
                  LEVEL_DOTS[c.level] ?? "bg-muted-foreground",
                )}
              />
              {c.criterion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact rubric card shown inside the Design Notebook stage workspace. */
export function TargetRubricSummary({
  target,
  criteria,
  score,
}: {
  target: LearningTarget;
  criteria: RubricCriterion[];
  score?: RubricScore;
}) {
  const own = criteria.filter((c) => c.target_id === target.id);
  const advanced = own.filter((c) => c.level === "advanced");
  const proficient = own.filter((c) => c.level === "proficient");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            Grading rubric: {target.title}
          </CardTitle>
          {score && <RubricLevelChip level={score.level} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{target.description}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniCriteriaList level="advanced" items={advanced} />
          <MiniCriteriaList level="proficient" items={proficient} />
        </div>
        {score?.note && (
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Teacher note:</span> {score.note}
          </p>
        )}
        <Link
          to="/rubrics"
          className="inline-block text-xs font-medium text-primary hover:underline"
        >
          View full rubrics page →
        </Link>
      </CardContent>
    </Card>
  );
}
