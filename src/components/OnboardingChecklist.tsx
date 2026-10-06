import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface OnboardingState {
  placedInMod: boolean;
  inTeam: boolean;
  hasEntry: boolean;
  hasEvidence: boolean;
  loading: boolean;
}

interface Step {
  done: boolean;
  label: string;
  hint: string;
  to?: string;
}

export function OnboardingChecklist({
  placedInMod,
  inTeam,
  hasEntry,
  hasEvidence,
  loading,
}: OnboardingState) {
  const steps: Step[] = [
    {
      done: true,
      label: "Sign in with your school email",
      hint: "Done — you're in!",
    },
    {
      done: placedInMod,
      label: "Get placed in your mod",
      hint: "Your teacher adds your school email to the mod roster — you'll be placed automatically the next time you sign in.",
    },
    {
      done: inTeam,
      label: "Join your team",
      hint: "Ask your teacher for your team's 6-character join code, then enter it on the Team page.",
      to: "/team",
    },
    {
      done: hasEntry,
      label: "Answer a mission in your Design Notebook",
      hint: "Open the Notebook, read the instructions for your stage, and respond to a mission.",
      to: "/notebook",
    },
    {
      done: hasEvidence,
      label: "Attach evidence from Google Drive",
      hint: "Link photos, slides, or docs from your Drive as proof of your work.",
      to: "/evidence",
    },
  ];

  // Once everything is done the checklist has served its purpose.
  if (!loading && steps.every((s) => s.done)) return null;

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4 text-primary" />
          Getting started
          <span className="ml-auto font-mono text-[11px] font-normal text-muted-foreground">
            {doneCount}/{steps.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <ol className="space-y-1">
            {steps.map((step, i) => {
              const inner = (
                <>
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold",
                      step.done
                        ? "bg-primary text-primary-foreground"
                        : "border border-dashed border-muted-foreground/50 text-muted-foreground",
                    )}
                  >
                    {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-sm font-medium",
                        step.done && "text-muted-foreground line-through",
                      )}
                    >
                      {step.label}
                    </span>
                    {!step.done && (
                      <span className="block text-xs text-muted-foreground">{step.hint}</span>
                    )}
                  </span>
                  {!step.done && step.to && (
                    <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </>
              );
              return (
                <li key={step.label}>
                  {step.to && !step.done ? (
                    <Link
                      to={step.to}
                      className="flex items-start gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-primary/10"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 px-2 py-1.5">{inner}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
