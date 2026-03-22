"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Recorder from "@/components/Recorder";
import SkeletonCanvas from "@/components/SkeletonCanvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyzeFeedback, getChoreographyPreview, getVideoServeUrl, regenerateChoreography } from "@/lib/api";
import type { Keypoint } from "@/types";

const ACCEPTED_VIDEO_TYPES = "video/mp4,video/quicktime,video/webm";
const COUNTDOWN_SECONDS = 3;

type PageMode = "preview" | "countdown" | "recording" | "submitting";

export default function ChoreographyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Live recording state
  const [mode, setMode] = useState<PageMode>("preview");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: preview, isLoading, refetch } = useQuery({
    queryKey: ["choreography-preview", id],
    queryFn: () => getChoreographyPreview(id),
    enabled: !!id,
  });

  // Flatten all move keypoints into a single frame sequence
  const allFrames: Keypoint[][] =
    preview?.moves.flatMap((m) => m.keypoints) || [];

  // Calculate total duration from preview data
  const totalDurationMs = useMemo(() => {
    if (!preview?.moves) return 0;
    return preview.moves.reduce((sum, m) => sum + (m.duration_ms || 0), 0);
  }, [preview]);

  // Get source video URL if available (first move with a source video)
  const sourceVideoUrl = useMemo(() => {
    const moveWithVideo = preview?.moves.find((m) => m.source_video_uri);
    return moveWithVideo?.source_video_uri
      ? getVideoServeUrl(moveWithVideo.source_video_uri)
      : null;
  }, [preview]);

  // Sync video playback with isPlaying state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !sourceVideoUrl) return;

    if (isPlaying) {
      video.currentTime = 0;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, sourceVideoUrl]);

  // Auto-stop recording after choreography duration
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (mode === "recording" && totalDurationMs > 0) {
      autoStopRef.current = setTimeout(() => {
        setIsPlaying(false);
        setMode("submitting");
      }, totalDurationMs);
      return () => {
        if (autoStopRef.current) clearTimeout(autoStopRef.current);
      };
    }
  }, [mode, totalDurationMs]);

  // Countdown logic
  const startCountdown = useCallback(() => {
    setMode("countdown");
    setCountdown(COUNTDOWN_SECONDS);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          // Start recording + playback
          setMode("recording");
          setIsPlaying(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const handleRecordingComplete = useCallback(
    async (blob: Blob) => {
      setMode("submitting");
      try {
        const result = await analyzeFeedback(blob, id);
        router.push(`/feedback/${id}?job_id=${result.job_id}`);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Upload failed");
        setMode("preview");
      }
    },
    [id, router]
  );

  const handleCancelRecording = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    setIsPlaying(false);
    setMode("preview");
  }, []);

  const handleUploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await analyzeFeedback(file, id);
      router.push(`/feedback/${id}?job_id=${result.job_id}`);
    } catch (err) {
      setIsUploading(false);
      alert(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await regenerateChoreography(id, null);
      await refetch();
    } finally {
      setIsRegenerating(false);
    }
  };

  const isRecordingFlow = mode === "countdown" || mode === "recording" || mode === "submitting";

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-600 border-t-cyan-400" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-8">
      <h1 className="text-3xl font-bold">
        {isRecordingFlow ? "Record Your Performance" : "Choreography Preview"}
      </h1>

      {preview && (
        <Card className="w-full max-w-5xl border-zinc-700 bg-zinc-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg">
              <span>{preview.bpm} BPM</span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-sm capitalize text-zinc-400">
                {preview.difficulty}
              </span>
              <span className="text-sm text-zinc-500">
                {preview.moves.length} moves
              </span>
              {mode === "recording" && (
                <span className="ml-auto flex items-center gap-2 text-sm font-medium text-red-400">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                  Recording
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            {/* Side-by-side layout when recording, single panel otherwise */}
            <div className={`flex w-full justify-center gap-4 ${isRecordingFlow ? "flex-col md:flex-row" : ""}`}>
              {/* Skeleton preview panel */}
              <div className={`flex flex-col items-center gap-2 ${isRecordingFlow ? "w-full md:w-1/2" : "w-full max-w-lg"}`}>
                <h3 className="text-sm font-medium text-zinc-400">
                  {isRecordingFlow ? "Follow Along" : "Preview"}
                </h3>
                <div
                  className="relative w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950"
                  style={{ aspectRatio: "4/3" }}
                >
                  {/* Source video underneath */}
                  {sourceVideoUrl && (
                    <video
                      ref={(el) => {
                        videoRef.current = el;
                        setVideoElement(el);
                      }}
                      src={sourceVideoUrl}
                      muted
                      playsInline
                      loop
                      className="absolute inset-0 h-full w-full rounded-lg object-fill"
                    />
                  )}
                  {/* Skeleton wireframe overlay */}
                  <SkeletonCanvas
                    frames={allFrames}
                    fps={30}
                    isPlaying={isPlaying}
                    overlay
                    videoElement={videoElement}
                  />

                  {/* Countdown overlay */}
                  {mode === "countdown" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg">
                      <span className="text-8xl font-bold text-cyan-400 animate-pulse">
                        {countdown}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Webcam panel (visible during recording flow) */}
              {isRecordingFlow && (
                <div className="flex w-full flex-col items-center gap-2 md:w-1/2">
                  <h3 className="text-sm font-medium text-zinc-400">Your Camera</h3>
                  <div
                    className="relative w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950"
                    style={{ aspectRatio: "4/3" }}
                  >
                    <Recorder
                      onRecordingComplete={handleRecordingComplete}
                      externalControl
                      shouldStart={mode === "recording"}
                      shouldStop={mode === "submitting"}
                    />

                    {/* Countdown overlay on webcam too */}
                    {mode === "countdown" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg">
                        <span className="text-6xl font-bold text-white">Get Ready!</span>
                      </div>
                    )}

                    {/* Submitting overlay */}
                    {mode === "submitting" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 rounded-lg">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-600 border-t-cyan-400" />
                        <span className="text-sm text-zinc-300">Submitting performance...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap justify-center gap-3">
              {mode === "preview" && (
                <>
                  <Button
                    onClick={() => setIsPlaying(!isPlaying)}
                    variant="outline"
                  >
                    {isPlaying ? "Pause" : "Play Preview"}
                  </Button>

                  <Button
                    onClick={handleRegenerate}
                    variant="outline"
                    disabled={isRegenerating}
                  >
                    {isRegenerating ? "Regenerating..." : "Regenerate"}
                  </Button>

                  <Button
                    size="lg"
                    onClick={() => {
                      setIsPlaying(false);
                      startCountdown();
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Record Performance
                  </Button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_VIDEO_TYPES}
                    onChange={handleUploadVideo}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? "Uploading..." : "Upload Video Instead"}
                  </Button>
                </>
              )}

              {(mode === "countdown" || mode === "recording") && (
                <Button
                  variant="destructive"
                  onClick={handleCancelRecording}
                >
                  Cancel Recording
                </Button>
              )}

              {mode === "recording" && (
                <Button
                  onClick={() => {
                    setIsPlaying(false);
                    setMode("submitting");
                  }}
                >
                  Stop & Submit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
