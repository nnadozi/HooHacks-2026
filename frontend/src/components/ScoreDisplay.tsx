"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { GradeBreakdown } from "@/types";
import { cn } from "@/lib/utils";

interface ScoreDisplayProps {
  score: number;
  gradeBreakdown: GradeBreakdown;
}

const GRADE_CONFIG = {
  perfect: { label: "Perfect", dot: "bg-emerald-500/90", text: "text-emerald-600 dark:text-emerald-400" },
  good: { label: "Good", dot: "bg-violet-500/90", text: "text-violet-700 dark:text-violet-400" },
  ok: { label: "OK", dot: "bg-amber-500/90", text: "text-amber-700 dark:text-amber-400" },
  miss: { label: "Miss", dot: "bg-rose-500/90", text: "text-rose-700 dark:text-rose-400" },
} as const;

export default function ScoreDisplay({ score, gradeBreakdown }: ScoreDisplayProps) {
  const totalFrames =
    gradeBreakdown.perfect +
    gradeBreakdown.good +
    gradeBreakdown.ok +
    gradeBreakdown.miss;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Score</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="border-b border-border pb-6 text-center">
          <p
            className="font-heading text-6xl font-semibold tabular-nums tracking-tight text-foreground sm:text-7xl"
            aria-label={`Score ${score} out of 100`}
          >
            {score}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">out of 100</p>
          <Progress
            value={score}
            className="mt-4 [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-indicator]]:bg-foreground/30"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(GRADE_CONFIG) as (keyof typeof GRADE_CONFIG)[]).map(
            (grade) => {
              const config = GRADE_CONFIG[grade];
              const count = gradeBreakdown[grade];
              const percent =
                totalFrames > 0 ? Math.round((count / totalFrames) * 100) : 0;

              return (
                <div
                  key={grade}
                  className={cn(
                    "flex items-center justify-between rounded-md border border-border px-2.5 py-2",
                    "bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn("size-2 shrink-0 rounded-full", config.dot)} />
                    <span className={cn("text-sm font-medium", config.text)}>
                      {config.label}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {count}{" "}
                    <span className="text-foreground/90">({percent}%)</span>
                  </span>
                </div>
              );
            }
          )}
        </div>
      </CardContent>
    </Card>
  );
}
