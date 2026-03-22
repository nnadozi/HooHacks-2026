"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Critique } from "@/types";

interface FeedbackPanelProps {
  critiques: Critique[];
}

function formatTimestamp(ms: number): string {
  const safeMs = Number.isFinite(ms) ? ms : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((safeMs % 1000) / 100);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
}

export default function FeedbackPanel({ critiques }: FeedbackPanelProps) {
  if (critiques.length === 0) {
    return (
      <Card className="border-border shadow-sm">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No notes for this run.
        </CardContent>
      </Card>
    );
  }

  const ordered = [...critiques].sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Notes</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-0">
          {ordered.map((critique, i) => (
            <li key={`${critique.timestamp_ms}-${critique.text}`}>
              {i > 0 && <Separator className="my-3" />}
              <div className="flex gap-3 text-sm leading-relaxed">
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {formatTimestamp(critique.timestamp_ms)}
                </span>
                <span>{critique.text}</span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
