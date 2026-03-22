"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Recorder from "@/components/Recorder";
import SkeletonCanvas from "@/components/SkeletonCanvas";
import StickFigure3D from "@/components/StickFigure3D";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  analyzeFeedback,
  getChoreographyPreview,
  getVideoServeUrl,
  regenerateChoreography,
} from "@/lib/api";
import type { Keypoint } from "@/types";

const ACCEPTED_VIDEO_TYPES = "video/mp4,video/quicktime,video/webm";
const COUNTDOWN_SECONDS = 5;

type PageMode = "preview" | "countdown" | "recording" | "submitting";

function isVideoUri(uri: string): boolean {
  return /\.(mp4|m4v|mov|webm)(\?|#|$)/i.test(uri);
}

export default function ChoreographyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelPanelRef = useRef<HTMLDivElement>(null);
  const [panelSize, setPanelSize] = useState({ width: 640, height: 480 });
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const [previewPanelSize, setPreviewPanelSize] = useState({ width: 960, height: 540 });
  const [referenceVideoElement, setReferenceVideoElement] = useState<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Live recording state
  const [mode, setMode] = useState<PageMode>("preview");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: preview, isLoading, refetch } = useQuery({
    queryKey: ["choreography-preview", id],
    queryFn: () => getChoreographyPreview(id),
    enabled: !!id,
  });

  const allFrames: Keypoint[][] =
    preview?.moves.flatMap((m) => m.keypoints) || [];

  const referenceVideoUrl = useMemo(() => {
    if (!preview) return null;
    if (preview.song_uri && isVideoUri(preview.song_uri)) {
      return getVideoServeUrl(preview.song_uri);
    }
    return null;
  }, [preview]);

  const hasReferenceVideo = Boolean(referenceVideoUrl);

  useEffect(() => {
    const v = referenceVideoElement;
    if (!v) return;
    v.muted = true;
    v.loop = true;
    if (isPlaying) {
      void v.play().catch(() => {
        // Ignore autoplay / gesture failures; Play button can be pressed again.
      });
    } else {
      v.pause();
    }
  }, [isPlaying, referenceVideoElement, referenceVideoUrl]);

  // Calculate total duration from preview data
  const totalDurationMs = useMemo(() => {
    if (!preview?.moves) return 0;
    return preview.moves.reduce((sum, m) => sum + (m.duration_ms || 0), 0);
  }, [preview]);

  // Track model panel size for recording view
  useEffect(() => {
    const el = modelPanelRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setPanelSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode]);

  // Track preview panel size (for larger routine window in preview mode)
  useEffect(() => {
    const el = previewPanelRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setPreviewPanelSize({ width: Math.round(width), height: Math.round(height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [preview]);

  // Auto-stop recording after choreography duration
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (mode === "recording" && totalDurationMs > 0) {
      autoStopRef.current = setTimeout(() => {
        setIsPlaying(false);
        setMode("submitting");
      }, totalDurationMs);
      return () => {
        if (autoStopRef.current) clearTimeout(autoStopRef.current);
      };
    }
  }, [mode, totalDurationMs]);

  // Countdown logic
  const startCountdown = useCallback(() => {
    setMode("countdown");
    setCountdown(COUNTDOWN_SECONDS);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          // Start recording + playback
          setMode("recording");
          setIsPlaying(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const handleRecordingComplete = useCallback(
    async (blob: Blob) => {
      setMode("submitting");
      try {
        const result = await analyzeFeedback(blob, id);
        router.push(`/feedback/${id}?job_id=${result.job_id}`);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Upload failed");
        setMode("preview");
      }
    },
    [id, router]
  );

  const handleCancelRecording = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    setIsPlaying(false);
    setMode("preview");
  }, []);

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

  const isRecordingFlow = mode === "countdown" || mode === "recording" || mode === "submitting";

  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-3.5rem)] bg-background px-4 py-8 sm:py-10">
        <div className="mx-auto flex w-full max-w-none flex-col gap-6 md:max-w-[75vw]">
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
              <Skeleton className="h-[min(55vh,44rem)] w-full rounded-lg" />
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

  // Full-screen recording view
  if (isRecordingFlow && preview) {
    return (
      <main className="flex h-[calc(100vh-3.5rem)] flex-col bg-background">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {preview.bpm} BPM · {preview.difficulty} · {preview.moves.length} moves
            </span>
            {mode === "recording" && (
              <span className="flex items-center gap-2 text-sm font-medium text-destructive">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                Recording
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(mode === "countdown" || mode === "recording") && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleCancelRecording}
              >
                Cancel
              </Button>
            )}
            {mode === "recording" && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setIsPlaying(false);
                  setMode("submitting");
                }}
              >
                Stop & Submit
              </Button>
            )}
          </div>
        </div>

        {/* Side-by-side panels filling remaining height */}
        <div className="flex flex-1 gap-1 overflow-hidden p-1">
          {/* 3D model preview panel */}
          <div className="flex flex-1 flex-col gap-1">
            <h3 className="px-2 text-xs font-medium text-muted-foreground">Follow Along</h3>
            <div ref={modelPanelRef} className="relative flex-1 overflow-hidden rounded-lg border border-border">
              {hasReferenceVideo ? (
                <>
                  <video
                    ref={setReferenceVideoElement}
                    src={referenceVideoUrl ?? undefined}
                    playsInline
                    className="absolute inset-0 h-full w-full rounded-lg object-contain"
                  />
                  <div className="pointer-events-none absolute inset-0">
                    <SkeletonCanvas
                      frames={allFrames}
                      fps={30}
                      isPlaying={isPlaying}
                      overlay
                      fitMode="contain"
                      videoElement={referenceVideoElement}
                      width={panelSize.width}
                      height={panelSize.height}
                      className="h-full w-full rounded-lg"
                    />
                  </div>
                </>
              ) : (
                <StickFigure3D
                  frames={allFrames}
                  fps={30}
                  isPlaying={isPlaying}
                  width={panelSize.width}
                  height={panelSize.height}
                  className="h-full w-full rounded-lg"
                />
              )}

              {/* Countdown overlay */}
              {mode === "countdown" && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60">
                  <span className="text-8xl font-bold text-primary animate-pulse">
                    {countdown}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Webcam panel */}
          <div className="flex flex-1 flex-col gap-1">
            <h3 className="px-2 text-xs font-medium text-muted-foreground">Your Camera</h3>
            <div className="relative flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
              <Recorder
                onRecordingComplete={handleRecordingComplete}
                externalControl
                shouldStart={mode === "recording"}
                shouldStop={mode === "submitting"}
              />

              {/* Countdown overlay on webcam */}
              {mode === "countdown" && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60">
                  <span className="text-5xl font-bold text-white">Get Ready!</span>
                </div>
              )}

              {/* Submitting overlay */}
              {mode === "submitting" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/70">
                  <div className="size-10 animate-spin rounded-full border-2 border-muted border-t-foreground/30" />
                  <span className="text-sm text-muted-foreground">Submitting performance…</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-none flex-col gap-8 md:max-w-[75vw]">
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
              {hasReferenceVideo ? (
                <div
                  ref={previewPanelRef}
                  className="relative h-[min(55vh,44rem)] w-full overflow-hidden rounded-xl border border-border bg-black"
                >
                  <video
                    ref={setReferenceVideoElement}
                    src={referenceVideoUrl ?? undefined}
                    playsInline
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                  <div className="pointer-events-none absolute inset-0">
                    <SkeletonCanvas
                      frames={allFrames}
                      fps={30}
                      isPlaying={isPlaying}
                      overlay
                      fitMode="contain"
                      videoElement={referenceVideoElement}
                      width={previewPanelSize.width}
                      height={previewPanelSize.height}
                      className="h-full w-full rounded-none border-0 bg-transparent shadow-none"
                    />
                  </div>
                </div>
              ) : (
                <div
                  ref={previewPanelRef}
                  className="w-full overflow-hidden rounded-xl border border-border bg-black"
                  style={{ height: "min(55vh, 44rem)" }}
                >
                  <StickFigure3D
                    frames={allFrames}
                    fps={30}
                    isPlaying={isPlaying}
                    width={previewPanelSize.width}
                    height={previewPanelSize.height}
                    className="h-full w-full"
                  />
                </div>
              )}

              <Separator className="max-w-md" />

              <TooltipProvider>
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

                  <Tooltip>
                    <TooltipTrigger
                      delay={150}
                      render={
                        <Button
                          type="button"
                          size="lg"
                          onClick={() => {
                            setIsPlaying(false);
                            startCountdown();
                          }}
                        >
                          Record
                        </Button>
                      }
                    />
                    <TooltipContent>
                      Record your performance with the webcam, then get feedback
                      on how closely you matched this choreography.
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger
                      delay={150}
                      render={
                        <Button
                          type="button"
                          size="lg"
                          onClick={() => router.push(`/practice/choreography/${id}`)}
                        >
                          Practice
                        </Button>
                      }
                    />
                    <TooltipContent>
                      Practice mode opens the reference player + your live camera
                      skeleton with an accuracy bar so you can drill the routine.
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger
                      delay={150}
                      render={
                        <Button
                          type="button"
                          size="lg"
                          disabled={isUploading}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {isUploading ? "Uploading…" : "Upload video"}
                        </Button>
                      }
                    />
                    <TooltipContent>
                      Upload an existing performance video file to score it
                      against this choreography.
                    </TooltipContent>
                  </Tooltip>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_VIDEO_TYPES}
                    onChange={handleUploadVideo}
                    className="hidden"
                  />
                </div>
              </TooltipProvider>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
