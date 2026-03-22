"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import FeedbackPanel from "@/components/FeedbackPanel";
import JobPoller from "@/components/JobPoller";
import ScoreDisplay from "@/components/ScoreDisplay";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { analyzeFeedback, getFeedbackById } from "@/lib/api";
import type { FeedbackResult, JobStatus } from "@/types";

const ACCEPTED_VIDEO_TYPES = "video/mp4,video/quicktime,video/webm";

export default function FeedbackPage() {
  const { id: choreographyId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialJobId = searchParams.get("job_id");
  const [phase, setPhase] = useState<"upload" | "uploading" | "polling" | "results">(
    initialJobId ? "polling" : "upload"
  );
  const completedRef = useRef(false);
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [feedbackResult, setFeedbackResult] = useState<FeedbackResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setPhase("uploading");
      setError(null);

      try {
        const result = await analyzeFeedback(file, choreographyId);
        setJobId(result.job_id);
        setPhase("polling");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setPhase("upload");
      }
    },
    [choreographyId]
  );

  const handleJobComplete = useCallback(
    async (job: JobStatus) => {
      if (completedRef.current) return;
      completedRef.current = true;

      if (job.status === "done" && job.result_id) {
        try {
          const result = await getFeedbackById(job.result_id);
          setFeedbackResult(result);
          setPhase("results");
        } catch (err) {
          console.error("Failed to fetch feedback:", err);
          setError("Failed to load feedback results. Please try again.");
          setPhase("upload");
          completedRef.current = false;
        }
      } else {
        setError("Processing failed. Please try again.");
        setPhase("upload");
        completedRef.current = false;
      }
    },
    []
  );

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Performance
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Webcam or file upload. We score alignment and add brief notes where it
            helps.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="w-full" role="alert">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {phase === "upload" && (
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-medium">Capture</CardTitle>
              <CardDescription>
                MP4, MOV, or WebM — up to 100MB.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6">
              <div className="flex flex-col items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_VIDEO_TYPES}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose a file
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "uploading" && (
          <Card className="w-full border-border shadow-sm">
            <CardContent className="flex flex-col items-center gap-3 py-12">
              <div
                className="size-10 animate-spin rounded-full border-2 border-muted border-t-foreground/30"
                aria-hidden
              />
              <p className="text-sm font-medium text-muted-foreground">Uploading…</p>
            </CardContent>
          </Card>
        )}

        {phase === "polling" && jobId && (
          <JobPoller jobId={jobId} onComplete={handleJobComplete} />
        )}

        {phase === "results" && feedbackResult && (
          <div className="flex w-full flex-col gap-6">
            <ScoreDisplay
              score={feedbackResult.score}
              gradeBreakdown={feedbackResult.grade_breakdown}
            />
            <FeedbackPanel critiques={feedbackResult.critiques} />

            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/choreography/${choreographyId}`)}
              >
                Again
              </Button>
              <Button type="button" onClick={() => router.push("/")}>
                Home
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
