"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useRecorder } from "@/hooks/useRecorder";

interface RecorderProps {
  onRecordingComplete: (blob: Blob) => void;
}

export default function Recorder({ onRecordingComplete }: RecorderProps) {
  const { isRecording, startRecording, stopRecording, videoBlob, error, stream } =
    useRecorder();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach stream to video preview
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Notify parent when recording is complete
  useEffect(() => {
    if (videoBlob) {
      onRecordingComplete(videoBlob);
    }
  }, [videoBlob, onRecordingComplete]);

  return (
    <div className="flex flex-col items-center gap-4">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full max-w-[640px] rounded-lg border border-zinc-700 bg-zinc-900"
      />

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

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

      {videoBlob && (
        <p className="text-sm text-zinc-400">
          Recording captured ({(videoBlob.size / 1024 / 1024).toFixed(1)} MB)
        </p>
      )}
    </div>
  );
}
