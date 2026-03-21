"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Critique } from "@/types";

interface FeedbackPanelProps {
  critiques: Critique[];
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function FeedbackPanel({ critiques }: FeedbackPanelProps) {
  if (critiques.length === 0) {
    return (
      <Card className="border-zinc-700 bg-zinc-900">
        <CardContent className="pt-6">
          <p className="text-zinc-400">No critiques — great performance!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-700 bg-zinc-900">
      <CardHeader>
        <CardTitle className="text-lg">Feedback</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {critiques.map((critique, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="shrink-0 font-mono text-cyan-400">
                {formatTimestamp(critique.timestamp_ms)}
              </span>
              <span className="text-zinc-300">{critique.text}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
