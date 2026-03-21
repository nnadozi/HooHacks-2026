"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";

import SkeletonCanvas from "@/components/SkeletonCanvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyzeFeedback, getChoreographyPreview, regenerateChoreography } from "@/lib/api";
import type { Keypoint } from "@/types";

const ACCEPTED_VIDEO_TYPES = "video/mp4,video/quicktime,video/webm";

export default function ChoreographyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const { data: preview, isLoading, refetch } = useQuery({
    queryKey: ["choreography-preview", id],
    queryFn: () => getChoreographyPreview(id),
    enabled: !!id,
  });

  // Flatten all move keypoints into a single frame sequence
  const allFrames: Keypoint[][] =
    preview?.moves.flatMap((m) => m.keypoints) || [];

  const handleUploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await analyzeFeedback(file, id);
      router.push(`/feedback/${id}?job_id=${result.job_id}`);
    } catch (err) {
      setIsUploading(false);
      alert(err instanceof Error ? err.message : "Upload failed");
    }
  };

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

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_VIDEO_TYPES}
                onChange={handleUploadVideo}
                className="hidden"
              />
              <Button
                variant="outline"
                size="lg"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? "Uploading..." : "Upload Video"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
