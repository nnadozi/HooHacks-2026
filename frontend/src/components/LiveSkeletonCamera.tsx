"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePoseDetection } from "@/hooks/usePoseDetection";
import { useRecorder } from "@/hooks/useRecorder";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import type { Keypoint } from "@/types";

function setCanvasToVideoRect(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const rect = video.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const nextW = Math.max(1, Math.round(rect.width * dpr));
  const nextH = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== nextW) canvas.width = nextW;
  if (canvas.height !== nextH) canvas.height = nextH;
}

function computeAccuracy(baseline: Keypoint[], live: Keypoint[]): number | null {
  const common: number[] = [];
  for (let i = 0; i < Math.min(baseline.length, live.length, 33); i++) {
    const a = baseline[i];
    const b = live[i];
    if (!a || !b) continue;
    if ((a.visibility ?? 0) < 0.5 || (b.visibility ?? 0) < 0.5) continue;
    common.push(i);
  }
  if (common.length < 8) return null;

  const ax: number[] = [];
  const ay: number[] = [];
  const bx: number[] = [];
  const by: number[] = [];
  for (const i of common) {
    ax.push(baseline[i].x);
    ay.push(baseline[i].y);
    bx.push(live[i].x);
    by.push(live[i].y);
  }

  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const aCx = mean(ax);
  const aCy = mean(ay);
  const bCx = mean(bx);
  const bCy = mean(by);

  const aScale = Math.sqrt(
    ax.reduce((s, v, i) => {
      const dx = v - aCx;
      const dy = ay[i] - aCy;
      return s + dx * dx + dy * dy;
    }, 0) / ax.length
  );
  const bScale = Math.sqrt(
    bx.reduce((s, v, i) => {
      const dx = v - bCx;
      const dy = by[i] - bCy;
      return s + dx * dx + dy * dy;
    }, 0) / bx.length
  );
  if (!Number.isFinite(aScale) || !Number.isFinite(bScale) || aScale <= 1e-6 || bScale <= 1e-6) {
    return null;
  }

  let dist = 0;
  for (let i = 0; i < ax.length; i++) {
    const nax = (ax[i] - aCx) / aScale;
    const nay = (ay[i] - aCy) / aScale;
    const nbx = (bx[i] - bCx) / bScale;
    const nby = (by[i] - bCy) / bScale;
    const dx = nax - nbx;
    const dy = nay - nby;
    dist += Math.sqrt(dx * dx + dy * dy);
  }
  dist /= ax.length;

  const divisor = 0.6;
  const score01 = Math.max(0, Math.min(1, 1 - dist / divisor));
  return score01 * 100;
}

export default function LiveSkeletonCamera({
  baselineFrame,
}: {
  baselineFrame: Keypoint[] | null;
}) {
  const { initCamera, stopCamera, stream, error } = useRecorder();
  const { start: startPose, stop: stopPose, isReady } = usePoseDetection();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseStartedRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const baselineRef = useRef<Keypoint[] | null>(baselineFrame);
  const emaRef = useRef<number | null>(null);

  const stopEverything = useCallback(() => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    poseStartedRef.current = false;
    stopPose();
    stopCamera();
  }, [stopCamera, stopPose]);

  useEffect(() => {
    baselineRef.current = baselineFrame;
  }, [baselineFrame]);

  useEffect(() => {
    initCamera();
    return () => {
      stopEverything();
    };
  }, [initCamera, stopEverything]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !stream) return;

    video.srcObject = stream;

    const ensureStarted = async () => {
      if (poseStartedRef.current) return;
      if (video.readyState < 2) return;
      poseStartedRef.current = true;
      setIsStarting(true);
      try {
        setCanvasToVideoRect(video, canvas);
        await startPose(video, canvas, {
          onLandmarks: (landmarks) => {
            const base = baselineRef.current;
            if (!base || base.length === 0 || landmarks.length === 0) {
              emaRef.current = null;
              setAccuracy(null);
              return;
            }

            const score = computeAccuracy(base, landmarks as unknown as Keypoint[]);
            if (score === null) {
              emaRef.current = null;
              setAccuracy(null);
              return;
            }

            const prev = emaRef.current;
            const next = prev === null ? score : prev * 0.8 + score * 0.2;
            emaRef.current = next;
            setAccuracy(next);
          },
        });
      } finally {
        setIsStarting(false);
      }
    };

    const onPlaying = () => {
      void ensureStarted();
    };

    video.addEventListener("playing", onPlaying);
    if (video.readyState >= 2) void ensureStarted();

    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(() => {
      if (videoRef.current && canvasRef.current) {
        setCanvasToVideoRect(videoRef.current, canvasRef.current);
      }
    });
    resizeObserverRef.current.observe(video);

    return () => {
      video.removeEventListener("playing", onPlaying);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [startPose, stream]);

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="gap-1">
        <CardTitle className="text-base font-medium">Your camera</CardTitle>
        <CardDescription>
          Live skeleton overlay{isReady ? "" : isStarting ? " (starting…)" : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <div className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/20">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-video w-full object-cover"
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        </div>

        <div className="w-full">
          <Progress value={accuracy ?? 0}>
            <ProgressLabel className="text-xs text-muted-foreground">
              Accuracy
            </ProgressLabel>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {accuracy === null ? "—" : `${Math.round(accuracy)}%`}
            </span>
          </Progress>
          {baselineFrame === null && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Start the reference routine to set a baseline frame.
            </p>
          )}
        </div>

        {error && (
          <div className="flex w-full flex-col items-center gap-2">
            <p className="text-center text-sm text-destructive" role="alert">
              {error}
            </p>
            <Button type="button" variant="outline" onClick={() => initCamera()}>
              Retry camera
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
