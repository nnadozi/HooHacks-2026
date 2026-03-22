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
  const notifiedBlobRef = useRef<Blob | null>(null);

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

  // Cleanup pose detection and camera on unmount
  useEffect(() => {
    return () => {
      poseStartedRef.current = false;
      stopPose();
      stopCamera();
    };
  }, [stopPose, stopCamera]);

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
        <p className="absolute bottom-2 text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!externalControl && (
        <div className="absolute bottom-4 flex gap-2">
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
      )}
    </div>
  );
}
