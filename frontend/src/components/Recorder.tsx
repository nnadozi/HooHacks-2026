"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { useRecorder } from "@/hooks/useRecorder";
import { cn } from "@/lib/utils";

interface RecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  /** When true, start recording is controlled externally */
  externalControl?: boolean;
  /** Signal from parent to start recording */
  shouldStart?: boolean;
  /** Signal from parent to stop recording */
  shouldStop?: boolean;
}

export default function Recorder({
  onRecordingComplete,
  externalControl = false,
  shouldStart = false,
  shouldStop = false,
}: RecorderProps) {
  const { isRecording, startRecording, stopRecording, initCamera, stopCamera, videoBlob, error, stream } =
    useRecorder();

  // Start camera immediately on mount
  useEffect(() => {
    initCamera();
  }, [initCamera]);
  const { start: startPose, stop: stopPose } = usePoseDetection();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseStartedRef = useRef(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;

      // Start pose detection once video is playing
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (canvas && !poseStartedRef.current) {
        const onPlaying = () => {
          if (canvas && !poseStartedRef.current) {
            // Use the displayed size so skeleton aligns with object-cover video
            const rect = video.getBoundingClientRect();
            canvas.width = rect.width * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;
            poseStartedRef.current = true;
            startPose(video, canvas);
          }
        };
        video.addEventListener("playing", onPlaying);
        // If already playing
        if (video.readyState >= 2) onPlaying();
        return () => video.removeEventListener("playing", onPlaying);
      }
    }
  }, [stream, startPose]);

  // Cleanup pose detection on unmount
  useEffect(() => {
    return () => {
      poseStartedRef.current = false;
      stopPose();
    };
  }, [stopPose]);

  // External control: start
  useEffect(() => {
    if (externalControl && shouldStart && !isRecording) {
      startRecording();
    }
  }, [externalControl, shouldStart, isRecording, startRecording]);

  // External control: stop
  useEffect(() => {
    if (externalControl && shouldStop && isRecording) {
      stopRecording();
    }
  }, [externalControl, shouldStop, isRecording, stopRecording]);

  useEffect(() => {
    if (videoBlob && videoBlob !== notifiedBlobRef.current) {
      notifiedBlobRef.current = videoBlob;
      onRecordingComplete(videoBlob);
      // Turn off camera after recording is done
      stopCamera();
    }
  }, [videoBlob, onRecordingComplete, stopCamera]);

  return (
    <div className="flex w-full max-w-[640px] flex-col items-center gap-4">
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg border bg-muted/30",
          isRecording ? "border-destructive/40" : "border-border"
        )}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-video w-full object-cover"
        />
        {isRecording && (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-destructive px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Rec
          </div>
        )}
      </div>

      {error && (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        {!isRecording ? (
          <Button onClick={startRecording} size="lg">
            Start
          </Button>
        ) : (
          <Button onClick={stopRecording} variant="destructive" size="lg">
            Stop
          </Button>
        )}
      </div>

      {videoBlob && (
        <p className="text-center text-xs text-muted-foreground">
          {(videoBlob.size / 1024 / 1024).toFixed(1)} MB
        </p>
      )}
    </div>
  );
}
