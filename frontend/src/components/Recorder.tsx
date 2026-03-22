"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useRecorder } from "@/hooks/useRecorder";
import { cn } from "@/lib/utils";

interface RecorderProps {
  onRecordingComplete: (blob: Blob) => void;
}

export default function Recorder({ onRecordingComplete }: RecorderProps) {
  const { isRecording, startRecording, stopRecording, videoBlob, error, stream } =
    useRecorder();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (videoBlob) {
      onRecordingComplete(videoBlob);
    }
  }, [videoBlob, onRecordingComplete]);

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
