"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import SkeletonCanvas from "@/components/SkeletonCanvas";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  getChoreographyPreview,
  getRoutinePreview,
  getVideoServeUrl,
} from "@/lib/api";
import type { Keypoint } from "@/types";

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const BASE_FPS = 30;

function clampToPreset(rate: number): number {
  const next = SPEED_PRESETS.reduce(
    (best, s) => (Math.abs(s - rate) < Math.abs(best - rate) ? s : best),
    1
  );
  return next;
}

export default function PracticePlayer({
  kind,
  id,
  onFrameIndexChange,
}: {
  kind: "choreography" | "routine";
  id: string;
  onFrameIndexChange?: (frameIndex: number) => void;
}) {
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [overlayDims, setOverlayDims] = useState<{ width: number; height: number }>({
    width: 640,
    height: 360,
  });
  const frameIndexRef = useRef(0);

  const reportFrameIndex = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.floor(next));
      frameIndexRef.current = clamped;
      onFrameIndexChange?.(clamped);
    },
    [onFrameIndexChange]
  );

  const choreoQuery = useQuery({
    queryKey: ["practice-choreography-preview", id],
    queryFn: () => getChoreographyPreview(id),
    enabled: kind === "choreography" && !!id,
  });

  const routineQuery = useQuery({
    queryKey: ["practice-routine-preview", id],
    queryFn: () => getRoutinePreview(id),
    enabled: kind === "routine" && !!id,
  });

  const sourceVideoUrl = useMemo(() => {
    if (kind !== "choreography") return null;
    const uri = choreoQuery.data?.moves.find((m) => m.source_video_uri)?.source_video_uri;
    return uri ? getVideoServeUrl(uri) : null;
  }, [choreoQuery.data?.moves, kind]);

  const frames: Keypoint[][] = useMemo(() => {
    if (kind === "choreography") {
      return choreoQuery.data?.moves.flatMap((m) => m.keypoints) ?? [];
    }
    return routineQuery.data?.moves.flatMap((m) => m.keypoints) ?? [];
  }, [choreoQuery.data?.moves, kind, routineQuery.data?.moves]);

  const effectiveFps = useMemo(() => {
    if (sourceVideoUrl) return BASE_FPS;
    return Math.max(1, Math.round(BASE_FPS * playbackRate));
  }, [playbackRate, sourceVideoUrl]);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCanvasKey((k) => k + 1);
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
    reportFrameIndex(0);
  }, [reportFrameIndex]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = playbackRate;
    v.defaultPlaybackRate = playbackRate;
  }, [playbackRate]);

  const togglePlay = async () => {
    const v = videoRef.current;
    if (sourceVideoUrl && v) {
      if (v.paused) {
        try {
          await v.play();
        } catch {
          // ignore gesture errors
        }
      } else {
        v.pause();
      }
      return;
    }

    setIsPlaying((p) => !p);
  };

  const restart = async () => {
    setCanvasKey((k) => k + 1);
    const v = videoRef.current;
    if (sourceVideoUrl && v) {
      v.currentTime = 0;
      reportFrameIndex(0);
      if (isPlaying) {
        try {
          await v.play();
        } catch {
          // ignore
        }
      }
      return;
    }
    reportFrameIndex(0);
    setIsPlaying(false);
    requestAnimationFrame(() => setIsPlaying(true));
  };

  const active = kind === "choreography" ? choreoQuery : routineQuery;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-medium">Player</CardTitle>
            <CardDescription>
              {sourceVideoUrl
                ? "Reference video + skeleton overlay."
                : "Skeleton playback."}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={frames.length === 0 || active.isLoading}
              onClick={() => void restart()}
            >
              Restart
            </Button>
            <Button
              type="button"
              disabled={frames.length === 0 || active.isLoading}
              onClick={() => void togglePlay()}
            >
              {isPlaying ? "Pause" : "Play"}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Speed</Label>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              value={[String(playbackRate)]}
              onValueChange={(next) => {
                const v = next[0];
                if (!v) return;
                const n = Number(v);
                if (!Number.isFinite(n)) return;
                setPlaybackRate(n);
              }}
              variant="outline"
              spacing={0}
              className="flex-wrap"
            >
              {SPEED_PRESETS.map((s) => (
                <ToggleGroupItem key={s} value={String(s)}>
                  {s}×
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPlaybackRate((r) => clampToPreset(r - 0.25))}
              >
                −
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPlaybackRate((r) => clampToPreset(r + 0.25))}
              >
                +
              </Button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                setPlaybackRate(1);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4">
        {active.isLoading && (
          <div className="flex items-center gap-2 py-14 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            Loading preview…
          </div>
        )}

        {active.isError && (
          <p className="py-10 text-center text-sm text-destructive">
            {active.error instanceof Error ? active.error.message : "Could not load preview."}
          </p>
        )}

        {!active.isLoading && !active.isError && frames.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No frames available.
          </p>
        )}

        {!active.isLoading && !active.isError && frames.length > 0 && (
          <div className="w-full">
            {sourceVideoUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-border bg-black">
                <video
                  ref={(el) => {
                    videoRef.current = el;
                    setVideoElement(el);
                  }}
                  src={sourceVideoUrl}
                  controls
                  playsInline
                  className="block aspect-video w-full object-cover"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    if (v.videoWidth > 0 && v.videoHeight > 0) {
                      setOverlayDims({ width: v.videoWidth, height: v.videoHeight });
                    }
                    if (v.duration && isFinite(v.duration) && frames.length > 0) {
                      const idx = Math.min(
                        frames.length - 1,
                        Math.max(0, Math.floor((v.currentTime / v.duration) * frames.length))
                      );
                      reportFrameIndex(idx);
                    }
                  }}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    if (!v.duration || !isFinite(v.duration) || frames.length === 0) return;
                    const idx = Math.min(
                      frames.length - 1,
                      Math.max(0, Math.floor((v.currentTime / v.duration) * frames.length))
                    );
                    reportFrameIndex(idx);
                  }}
                  onSeeked={(e) => {
                    const v = e.currentTarget;
                    if (!v.duration || !isFinite(v.duration) || frames.length === 0) return;
                    const idx = Math.min(
                      frames.length - 1,
                      Math.max(0, Math.floor((v.currentTime / v.duration) * frames.length))
                    );
                    reportFrameIndex(idx);
                  }}
                />
                <div className="pointer-events-none absolute inset-0">
                  <SkeletonCanvas
                    key={canvasKey}
                    frames={frames}
                    fps={BASE_FPS}
                    isPlaying={isPlaying}
                    overlay
                    videoElement={videoElement}
                    onFrameChange={reportFrameIndex}
                    width={overlayDims.width}
                    height={overlayDims.height}
                  />
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <SkeletonCanvas
                  key={canvasKey}
                  frames={frames}
                  fps={effectiveFps}
                  isPlaying={isPlaying}
                  onFrameChange={reportFrameIndex}
                  width={1280}
                  height={720}
                  className="h-auto w-full aspect-video"
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
