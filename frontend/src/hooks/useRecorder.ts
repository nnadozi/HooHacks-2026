"use client";

import { useCallback, useRef, useState } from "react";

interface UseRecorderReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  initCamera: () => Promise<void>;
  stopCamera: () => void;
  videoBlob: Blob | null;
  error: string | null;
  stream: MediaStream | null;
}

export function useRecorder(): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const streamRef = useRef<MediaStream | null>(null);

  const initCamera = useCallback(async () => {
    if (streamRef.current) return; // already initialized
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 1280, height: 720 },
        audio: false,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to access camera"
      );
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setVideoBlob(null);
      chunksRef.current = [];

      // Init camera if not already done
      if (!streamRef.current) {
        await initCamera();
      }

      const mediaStream = streamRef.current;
      if (!mediaStream) return;

      const recorder = new MediaRecorder(mediaStream, {
        mimeType: "video/webm",
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setVideoBlob(blob);
        setIsRecording(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // collect data every second
      setIsRecording(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to access camera"
      );
    }
  }, [initCamera, stopCamera]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { isRecording, startRecording, stopRecording, initCamera, stopCamera, videoBlob, error, stream };
}
