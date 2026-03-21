"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { GradeBreakdown } from "@/types";

interface ScoreDisplayProps {
  score: number;
  gradeBreakdown: GradeBreakdown;
}

const GRADE_CONFIG = {
  perfect: { label: "Perfect", color: "bg-green-500", text: "text-green-400" },
  good: { label: "Good", color: "bg-blue-500", text: "text-blue-400" },
  ok: { label: "OK", color: "bg-yellow-500", text: "text-yellow-400" },
  miss: { label: "Miss", color: "bg-red-500", text: "text-red-400" },
} as const;

export default function ScoreDisplay({ score, gradeBreakdown }: ScoreDisplayProps) {
  const totalFrames =
    gradeBreakdown.perfect +
    gradeBreakdown.good +
    gradeBreakdown.ok +
    gradeBreakdown.miss;

  return (
    <Card className="border-zinc-700 bg-zinc-900">
      <CardHeader>
        <CardTitle className="text-lg">Score</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Aggregate score */}
        <div className="text-center">
          <p className="text-6xl font-bold text-white">{score}</p>
          <p className="text-sm text-zinc-400">out of 100</p>
          <Progress value={score} className="mt-3" />
        </div>

        {/* Grade breakdown */}
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(GRADE_CONFIG) as (keyof typeof GRADE_CONFIG)[]).map(
            (grade) => {
              const config = GRADE_CONFIG[grade];
              const count = gradeBreakdown[grade];
              const percent =
                totalFrames > 0 ? Math.round((count / totalFrames) * 100) : 0;

              return (
                <div
                  key={grade}
                  className="flex items-center justify-between rounded-md border border-zinc-700 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${config.color}`} />
                    <span className={`text-sm font-medium ${config.text}`}>
                      {config.label}
                    </span>
                  </div>
                  <span className="text-sm text-zinc-300">
                    {count} ({percent}%)
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
