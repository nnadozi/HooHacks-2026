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

type Mode = "preview" | "ready" | "countdown" | "recording" | "submitting";

export default function ChoreographyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mode, setMode] = useState<Mode>("preview");
  const [countdown, setCountdown] = useState(3);
  const [shouldStartRecording, setShouldStartRecording] = useState(false);
  const [shouldStopRecording, setShouldStopRecording] = useState(false);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);

  const { data: preview, isLoading, refetch } = useQuery({
    queryKey: ["choreography-preview", id],
    queryFn: () => getChoreographyPreview(id),
    enabled: !!id,
  });

  // Flatten all move keypoints into a single frame sequence
  const allFrames: Keypoint[][] =
    preview?.moves.flatMap((m) => m.keypoints) || [];

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

  const startCountdown = useCallback(() => {
    setMode("countdown");
    setCountdown(3);
    setShouldStartRecording(false);
    setShouldStopRecording(false);

    // Stop any current playback
    setIsPlaying(false);

    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(interval);
        // Start both simultaneously
        setMode("recording");
        setIsPlaying(true);
        setShouldStartRecording(true);
      }
    }, 1000);
  }, []);

  const handleStopRecording = useCallback(() => {
    setShouldStopRecording(true);
    setIsPlaying(false);
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
        setShouldStartRecording(false);
        setShouldStopRecording(false);
      }
    },
    [id, router]
  );

  const handleCancelRecording = useCallback(() => {
    setShouldStopRecording(true);
    setIsPlaying(false);
    setMode("preview");
    setShouldStartRecording(false);
    setShouldStopRecording(false);
  }, []);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-600 border-t-cyan-400" />
      </main>
    );
  }

  const isRecordingMode = mode === "ready" || mode === "countdown" || mode === "recording" || mode === "submitting";

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-8">
      <h1 className="text-3xl font-bold">Choreography Preview</h1>

      {preview && (
        <Card className={`w-full border-zinc-700 bg-zinc-900 ${isRecordingMode ? "max-w-5xl" : "max-w-3xl"}`}>
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
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  RECORDING
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            {/* Side-by-side layout when recording, centered preview otherwise */}
            <div
              className={
                isRecordingMode
                  ? "grid w-full grid-cols-2 gap-6"
                  : "flex w-full justify-center"
              }
            >
              {/* Preview panel with video + skeleton overlay */}
              <div className={`flex flex-col items-center gap-2 ${isRecordingMode ? "w-full" : "w-full max-w-lg"}`}>
                <h3 className="text-sm font-medium text-zinc-400">
                  {isRecordingMode ? "Reference" : "Preview"}
                </h3>
                <div
                  className="relative w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950"
                  style={{ aspectRatio: "1/1" }}
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
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget;
                        if (v.videoWidth && v.videoHeight) {
                          setVideoAspect(v.videoWidth / v.videoHeight);
                        }
                      }}
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
                  {/* Countdown overlay on preview */}
                  {mode === "countdown" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <span className="animate-pulse text-8xl font-black text-cyan-400 drop-shadow-[0_0_30px_rgba(34,211,238,0.6)]">
                        {countdown}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Recording panel — only shown in recording modes */}
              {isRecordingMode && (
                <div className="flex w-full flex-col items-center gap-2">
                  <h3 className="text-sm font-medium text-zinc-400">Your Performance</h3>
                  <div
                    className="relative w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950"
                    style={{ aspectRatio: "1/1" }}
                  >
                    <Recorder
                      onRecordingComplete={handleRecordingComplete}
                      externalControl
                      shouldStart={shouldStartRecording}
                      shouldStop={shouldStopRecording}
                    />
                    {/* Countdown overlay on recording */}
                    {mode === "countdown" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <span className="animate-pulse text-8xl font-black text-cyan-400 drop-shadow-[0_0_30px_rgba(34,211,238,0.6)]">
                          {countdown}
                        </span>
                      </div>
                    )}
                    {/* Submitting overlay */}
                    {mode === "submitting" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-600 border-t-cyan-400" />
                        <span className="text-sm text-zinc-300">Submitting...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex gap-3">
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

                  <Button onClick={() => setMode("ready")} size="lg">
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
                    size="lg"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? "Uploading..." : "Upload Video"}
                  </Button>
                </>
              )}

              {mode === "ready" && (
                <>
                  <Button onClick={startCountdown} size="lg">
                    Start Recording
                  </Button>
                  <Button
                    onClick={() => { setMode("preview"); }}
                    variant="outline"
                    size="lg"
                  >
                    Cancel
                  </Button>
                </>
              )}

              {mode === "recording" && (
                <>
                  <Button
                    onClick={handleStopRecording}
                    variant="destructive"
                    size="lg"
                  >
                    Stop Recording
                  </Button>
                  <Button
                    onClick={handleCancelRecording}
                    variant="outline"
                    size="lg"
                  >
                    Cancel
                  </Button>
                </>
              )}

              {mode === "countdown" && (
                <Button
                  onClick={handleCancelRecording}
                  variant="outline"
                  size="lg"
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
