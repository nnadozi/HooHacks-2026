"use client";

import { useEffect, useRef } from "react";

import type { Keypoint } from "@/types";

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
  width?: number;
  height?: number;
}

export default function SkeletonCanvas({
  frames,
  fps,
  isPlaying,
  width = 640,
  height = 480,
}: SkeletonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIndexRef = useRef(0);
  const lastTimeRef = useRef(0);

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
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const elapsed = timestamp - lastTimeRef.current;

      if (elapsed >= frameDuration) {
        lastTimeRef.current = timestamp;
        frameIndexRef.current =
          (frameIndexRef.current + 1) % frames.length;
      }

      const frame = frames[frameIndexRef.current];
      ctx.clearRect(0, 0, width, height);

      if (!frame || frame.length === 0) {
        animId = requestAnimationFrame(draw);
        return;
      }

      // Draw bones
      ctx.strokeStyle = "#22d3ee"; // cyan
      ctx.lineWidth = 3;
      for (const [a, b] of CONNECTIONS) {
        if (a >= frame.length || b >= frame.length) continue;
        const pa = frame[a];
        const pb = frame[b];
        if (pa.visibility < 0.5 || pb.visibility < 0.5) continue;

        ctx.beginPath();
        ctx.moveTo(pa.x * width, pa.y * height);
        ctx.lineTo(pb.x * width, pb.y * height);
        ctx.stroke();
      }

      // Draw joints
      ctx.fillStyle = "#f43f5e"; // rose
      for (const kp of frame) {
        if (kp.visibility < 0.5) continue;
        ctx.beginPath();
        ctx.arc(kp.x * width, kp.y * height, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [frames, fps, isPlaying, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded-lg border border-zinc-700 bg-zinc-900"
    />
  );
}
