"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import LiveSkeletonCamera from "@/components/LiveSkeletonCamera";
import PracticePlayer from "@/components/PracticePlayer";
import { Button } from "@/components/ui/button";
import { getRoutinePreview } from "@/lib/api";
import type { Keypoint } from "@/types";

export default function PracticeRoutinePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [frameIndex, setFrameIndex] = useState(0);

  const previewQuery = useQuery({
    queryKey: ["practice-routine-preview", id],
    queryFn: () => getRoutinePreview(id),
    enabled: !!id,
  });

  const baselineFrames: Keypoint[][] = useMemo(
    () => previewQuery.data?.moves.flatMap((m) => m.keypoints) ?? [],
    [previewQuery.data?.moves]
  );
  const baselineFrame = baselineFrames[frameIndex] ?? null;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background px-3 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-none flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              Practice
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Routine <span className="font-mono">{id}</span>
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => router.push("/practice")}>
            Change
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PracticePlayer
            kind="routine"
            id={id}
            onFrameIndexChange={setFrameIndex}
          />
          <LiveSkeletonCamera baselineFrame={baselineFrame} />
        </div>
      </div>
    </main>
  );
}
