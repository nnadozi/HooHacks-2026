"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { useRecorder } from "@/hooks/useRecorder";

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
  const { isRecording, startRecording, stopRecording, initCamera, videoBlob, error, stream } =
    useRecorder();

  // Start camera immediately on mount
  useEffect(() => {
    initCamera();
  }, [initCamera]);
  const { start: startPose, stop: stopPose } = usePoseDetection();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseStartedRef = useRef(false);

  // Attach stream to video preview and start pose detection
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

  // Notify parent when recording is complete (only once per blob)
  const notifiedBlobRef = useRef<Blob | null>(null);
  useEffect(() => {
    if (videoBlob && videoBlob !== notifiedBlobRef.current) {
      notifiedBlobRef.current = videoBlob;
      onRecordingComplete(videoBlob);
    }
  }, [videoBlob, onRecordingComplete]);

  return (
    <div className="absolute inset-0 flex flex-col items-center">
      <div className="relative h-full w-full">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full rounded-lg object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full rounded-lg"
          style={{ transform: "scaleX(-1)" }}
        />
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {!externalControl && (
        <div className="flex gap-3">
          {!isRecording ? (
            <Button onClick={startRecording} size="lg">
              Start Recording
            </Button>
          ) : (
            <Button onClick={stopRecording} variant="destructive" size="lg">
              Stop Recording
            </Button>
          )}
        </div>
      )}

      {videoBlob && (
        <p className="text-sm text-zinc-400">
          Recording captured ({(videoBlob.size / 1024 / 1024).toFixed(1)} MB)
        </p>
      )}
    </div>
  );
}
