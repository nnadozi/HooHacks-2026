"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import SkeletonCanvas from "@/components/SkeletonCanvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getChoreographyPreview, regenerateChoreography } from "@/lib/api";
import type { Keypoint } from "@/types";

export default function ChoreographyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const { data: preview, isLoading, refetch } = useQuery({
    queryKey: ["choreography-preview", id],
    queryFn: () => getChoreographyPreview(id),
    enabled: !!id,
  });

  // Flatten all move keypoints into a single frame sequence
  const allFrames: Keypoint[][] =
    preview?.moves.flatMap((m) => m.keypoints) || [];

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await regenerateChoreography(id, null);
      await refetch();
    } finally {
      setIsRegenerating(false);
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-600 border-t-cyan-400" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-8">
      <h1 className="text-3xl font-bold">Choreography Preview</h1>

      {preview && (
        <Card className="border-zinc-700 bg-zinc-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg">
              <span>{preview.bpm} BPM</span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-sm capitalize text-zinc-400">
                {preview.difficulty}
              </span>
              <span className="text-sm text-zinc-500">
                {preview.moves.length} moves
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            <SkeletonCanvas
              frames={allFrames}
              fps={30}
              isPlaying={isPlaying}
            />

            <div className="flex gap-3">
              <Button
                onClick={() => setIsPlaying(!isPlaying)}
                variant="outline"
              >
                {isPlaying ? "Pause" : "Play Preview"}
              </Button>

              <Button
                onClick={handleRegenerate}
                variant="outline"
                disabled={isRegenerating}
              >
                {isRegenerating ? "Regenerating..." : "Regenerate"}
              </Button>

              <Button
                onClick={() => router.push(`/feedback/${id}`)}
                size="lg"
              >
                Record Performance
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
