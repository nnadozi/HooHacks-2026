"use client";

import { useEffect, useRef } from "react";

import type { Keypoint } from "@/types";
import { cn } from "@/lib/utils";

// MediaPipe Pose connection pairs (indices into 33-landmark array)
const CONNECTIONS: [number, number][] = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso
  [23, 24], // hips
  [23, 25], [25, 27], // left leg
  [24, 26], [26, 28], // right leg
  [27, 29], [29, 31], // left foot
  [28, 30], [30, 32], // right foot
  [0, 1], [1, 2], [2, 3], // left eye
  [0, 4], [4, 5], [5, 6], // right eye
  [9, 10], // mouth
];

interface SkeletonCanvasProps {
  frames: Keypoint[][];
  fps: number;
  isPlaying: boolean;
  /**
   * The source (unscaled) dimensions of the keypoint frames, used to preserve
   * aspect ratio when `fitMode` is `contain`/`cover`.
   */
  width?: number;
  height?: number;
  className?: string;
  /** When true, renders with transparent background for overlaying on video */
  overlay?: boolean;
  /** Callback with current frame index so parent can sync */
  onFrameChange?: (frameIndex: number) => void;
  /** Optional video element to sync frame index to video currentTime */
  videoElement?: HTMLVideoElement | null;
  /**
   * How to map normalized keypoints into the canvas area.
   * - `fill`: stretch to canvas (matches `object-fill`)
   * - `contain`: preserve aspect ratio with letterboxing (matches `object-contain`)
   * - `cover`: preserve aspect ratio with cropping (matches `object-cover`)
   */
  fitMode?: "fill" | "contain" | "cover";
}

export default function SkeletonCanvas({
  frames,
  fps,
  isPlaying,
  width = 640,
  height = 480,
  className,
  overlay = false,
  onFrameChange,
  videoElement,
  fitMode = "fill",
}: SkeletonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIndexRef = useRef(0);
  const lastTimeRef = useRef(0);
  const sizeRef = useRef<{ cssW: number; cssH: number; dpr: number }>({
    cssW: width,
    cssH: height,
    dpr: 1,
  });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.max(1, rect.width);
      const cssH = Math.max(1, rect.height);
      sizeRef.current = { cssW, cssH, dpr };

      const nextW = Math.max(1, Math.round(cssW * dpr));
      const nextH = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== nextW) canvas.width = nextW;
      if (canvas.height !== nextH) canvas.height = nextH;
    };

    resize();
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(resize);
    resizeObserverRef.current.observe(canvas);

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frameDuration = 1000 / fps;
    frameIndexRef.current = 0;
    lastTimeRef.current = 0;

    let animId: number;

    const draw = (timestamp: number) => {
      const { cssW, cssH, dpr } = sizeRef.current;
      // Draw in CSS pixels for easier fit calculations.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (videoElement && videoElement.duration && isFinite(videoElement.duration)) {
        // Sync frame index to video currentTime
        const progress = videoElement.currentTime / videoElement.duration;
        frameIndexRef.current = Math.min(
          Math.floor(progress * frames.length),
          frames.length - 1
        );
        onFrameChange?.(frameIndexRef.current);
      } else {
        // Fallback: independent timer when no video element
        if (!lastTimeRef.current) lastTimeRef.current = timestamp;
        const elapsed = timestamp - lastTimeRef.current;

        if (elapsed >= frameDuration) {
          lastTimeRef.current = timestamp;
          frameIndexRef.current =
            (frameIndexRef.current + 1) % frames.length;
          onFrameChange?.(frameIndexRef.current);
        }
      }

      const frame = frames[frameIndexRef.current];
      ctx.clearRect(0, 0, cssW, cssH);

      if (!frame || frame.length === 0) {
        animId = requestAnimationFrame(draw);
        return;
      }

      const srcW = videoElement?.videoWidth || width;
      const srcH = videoElement?.videoHeight || height;

      let scaleX = cssW;
      let scaleY = cssH;
      let offsetX = 0;
      let offsetY = 0;

      if (fitMode !== "fill" && srcW > 0 && srcH > 0) {
        const scale =
          fitMode === "cover"
            ? Math.max(cssW / srcW, cssH / srcH)
            : Math.min(cssW / srcW, cssH / srcH);
        scaleX = srcW * scale;
        scaleY = srcH * scale;
        offsetX = (cssW - scaleX) / 2;
        offsetY = (cssH - scaleY) / 2;
      }

      // Bones / joints: neutral + accent (avoid a second “brand” blue on canvas)
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 3;
      if (overlay) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
        ctx.shadowBlur = 4;
      }
      for (const [a, b] of CONNECTIONS) {
        if (a >= frame.length || b >= frame.length) continue;
        const pa = frame[a];
        const pb = frame[b];
        if (pa.visibility < 0.5 || pb.visibility < 0.5) continue;

        ctx.beginPath();
        ctx.moveTo(offsetX + pa.x * scaleX, offsetY + pa.y * scaleY);
        ctx.lineTo(offsetX + pb.x * scaleX, offsetY + pb.y * scaleY);
        ctx.stroke();
      }

      ctx.fillStyle = "#fb7185";
      for (const kp of frame) {
        if (kp.visibility < 0.5) continue;
        ctx.beginPath();
        ctx.arc(offsetX + kp.x * scaleX, offsetY + kp.y * scaleY, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Reset shadow so it doesn't affect other callers sharing the context.
      if (overlay) {
        ctx.shadowBlur = 0;
      }
      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [frames, fps, isPlaying, width, height, overlay, onFrameChange, videoElement, fitMode]);

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        overlay
          ? "h-full w-full rounded-xl bg-transparent"
          : "rounded-xl border border-border bg-card/80 shadow-inner",
        className
      )}
    />
  );
}
