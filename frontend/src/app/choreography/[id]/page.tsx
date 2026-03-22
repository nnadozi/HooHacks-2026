"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";

import SkeletonCanvas from "@/components/SkeletonCanvas";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  analyzeFeedback,
  getChoreographyPreview,
  regenerateChoreography,
} from "@/lib/api";
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
      <main className="min-h-[calc(100vh-3.5rem)] bg-background px-4 py-8 sm:py-10">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <Card className="border-border shadow-sm">
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <Skeleton className="aspect-[4/3] w-full max-w-[640px] rounded-lg" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Preview
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Play the skeleton, shuffle moves, then record or upload a performance
            video.
          </p>
        </div>

        {preview && (
          <Card className="border-border shadow-sm">
            <CardHeader className="gap-1">
              <CardTitle className="text-base font-medium">Routine</CardTitle>
              <CardDescription>
                {preview.bpm} BPM · {preview.difficulty} · {preview.moves.length}{" "}
                moves
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6">
              <div className="overflow-hidden rounded-lg border border-border">
                <SkeletonCanvas
                  frames={allFrames}
                  fps={30}
                  isPlaying={isPlaying}
                />
              </div>

              <Separator className="max-w-md" />

              <div className="flex w-full flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? "Pause" : "Play"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={isRegenerating}
                  className="gap-2"
                  onClick={handleRegenerate}
                >
                  {isRegenerating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Regenerating…
                    </>
                  ) : (
                    "Regenerate"
                  )}
                </Button>

                <Button
                  type="button"
                  size="lg"
                  onClick={() => router.push(`/feedback/${id}`)}
                >
                  Record
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_VIDEO_TYPES}
                  onChange={handleUploadVideo}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? "Uploading…" : "Upload video"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
