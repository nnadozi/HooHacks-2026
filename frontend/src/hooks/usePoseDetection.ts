"use client";

import { useCallback, useRef, useState } from "react";

import type { PoseLandmarker } from "@mediapipe/tasks-vision";

// MediaPipe Pose connection pairs (body only — skip face landmarks for clarity)
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
];

interface UsePoseDetectionReturn {
  start: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<void>;
  stop: () => void;
  isReady: boolean;
}

export function usePoseDetection(): UsePoseDetectionReturn {
  const [isReady, setIsReady] = useState(false);
  const animIdRef = useRef<number>(0);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const runningRef = useRef(false);

  const start = useCallback(async (video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    const mod = await import("@mediapipe/tasks-vision");

    const vision = await mod.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    const landmarker = await mod.PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });

    landmarkerRef.current = landmarker;
    runningRef.current = true;
    setIsReady(true);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastTime = -1;

    const detect = () => {
      if (!runningRef.current || !landmarkerRef.current) return;

      if (video.readyState >= 2 && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        const timestampMs = performance.now();

        const results = landmarkerRef.current.detectForVideo(video, timestampMs);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          const cw = canvas.width;
          const ch = canvas.height;

          // Compute object-cover transform to map landmark coords to canvas
          // Video native aspect vs canvas (display) aspect
          const videoAspect = video.videoWidth / video.videoHeight;
          const canvasAspect = cw / ch;
          let sx: number, sy: number, ox: number, oy: number;

          if (videoAspect > canvasAspect) {
            // Video is wider — cropped on sides
            const visibleFraction = canvasAspect / videoAspect;
            const cropOffset = (1 - visibleFraction) / 2;
            sx = cw / visibleFraction;
            sy = ch;
            ox = -cropOffset * sx;
            oy = 0;
          } else {
            // Video is taller — cropped on top/bottom
            const visibleFraction = videoAspect / canvasAspect;
            const cropOffset = (1 - visibleFraction) / 2;
            sx = cw;
            sy = ch / visibleFraction;
            ox = 0;
            oy = -cropOffset * sy;
          }

          const mapX = (x: number) => ox + x * sx;
          const mapY = (y: number) => oy + y * sy;

          // Draw bone glow (wider, semi-transparent underneath)
          ctx.strokeStyle = "rgba(34, 211, 238, 0.4)";
          ctx.lineWidth = 10;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";

          for (const [a, b] of CONNECTIONS) {
            if (a >= landmarks.length || b >= landmarks.length) continue;
            const pa = landmarks[a];
            const pb = landmarks[b];
            if (pa.visibility < 0.5 || pb.visibility < 0.5) continue;

            ctx.beginPath();
            ctx.moveTo(mapX(pa.x), mapY(pa.y));
            ctx.lineTo(mapX(pb.x), mapY(pb.y));
            ctx.stroke();
          }

          // Draw bones (solid)
          ctx.strokeStyle = "#22d3ee";
          ctx.lineWidth = 4;
          ctx.shadowColor = "rgba(34, 211, 238, 0.6)";
          ctx.shadowBlur = 8;

          for (const [a, b] of CONNECTIONS) {
            if (a >= landmarks.length || b >= landmarks.length) continue;
            const pa = landmarks[a];
            const pb = landmarks[b];
            if (pa.visibility < 0.5 || pb.visibility < 0.5) continue;

            ctx.beginPath();
            ctx.moveTo(mapX(pa.x), mapY(pa.y));
            ctx.lineTo(mapX(pb.x), mapY(pb.y));
            ctx.stroke();
          }

          // Draw joints
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;

          for (const lm of landmarks) {
            if (lm.visibility < 0.5) continue;
            // Outer glow
            ctx.fillStyle = "rgba(244, 63, 94, 0.4)";
            ctx.beginPath();
            ctx.arc(mapX(lm.x), mapY(lm.y), 9, 0, Math.PI * 2);
            ctx.fill();
            // Inner dot
            ctx.fillStyle = "#f43f5e";
            ctx.beginPath();
            ctx.arc(mapX(lm.x), mapY(lm.y), 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      animIdRef.current = requestAnimationFrame(detect);
    };

    animIdRef.current = requestAnimationFrame(detect);
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (animIdRef.current) {
      cancelAnimationFrame(animIdRef.current);
      animIdRef.current = 0;
    }
    if (landmarkerRef.current) {
      landmarkerRef.current.close();
      landmarkerRef.current = null;
    }
    setIsReady(false);
  }, []);

  return { start, stop, isReady };
}
