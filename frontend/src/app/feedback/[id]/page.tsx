"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import FeedbackPanel from "@/components/FeedbackPanel";
import JobPoller from "@/components/JobPoller";
import Recorder from "@/components/Recorder";
import ScoreDisplay from "@/components/ScoreDisplay";
import { Button } from "@/components/ui/button";
import { analyzeFeedback, getUserHistory } from "@/lib/api";
import type { FeedbackResult, JobStatus } from "@/types";

export default function FeedbackPage() {
  const { id: choreographyId } = useParams<{ id: string }>();
  const router = useRouter();

  const [phase, setPhase] = useState<"record" | "uploading" | "polling" | "results">("record");
  const [jobId, setJobId] = useState<string | null>(null);
  const [feedbackResult, setFeedbackResult] = useState<FeedbackResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRecordingComplete = useCallback(
    async (blob: Blob) => {
      setPhase("uploading");
      setError(null);

      try {
        const result = await analyzeFeedback(blob, choreographyId);
        setJobId(result.job_id);
        setPhase("polling");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setPhase("record");
      }
    },
    [choreographyId]
  );

  const handleJobComplete = useCallback(
    async (job: JobStatus) => {
      if (job.status === "done" && job.result_id) {
        const data = await getUserHistory();
        const result = data.history?.find(
          (f: FeedbackResult) => f.id === job.result_id
        );
        if (result) {
          setFeedbackResult(result);
        }
        setPhase("results");
      } else {
        setError("Processing failed. Please try again.");
        setPhase("record");
      }
    },
    []
  );

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-8">
      <h1 className="text-3xl font-bold">Performance Feedback</h1>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {phase === "record" && (
        <Recorder onRecordingComplete={handleRecordingComplete} />
      )}

      {phase === "uploading" && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-600 border-t-cyan-400" />
          <p className="text-zinc-300">Uploading performance...</p>
        </div>
      )}

      {phase === "polling" && jobId && (
        <JobPoller
          jobId={jobId}
          onComplete={handleJobComplete}
        />
      )}

      {phase === "results" && feedbackResult && (
        <div className="flex w-full max-w-2xl flex-col gap-6">
          <ScoreDisplay
            score={feedbackResult.score}
            gradeBreakdown={feedbackResult.grade_breakdown}
          />
          <FeedbackPanel critiques={feedbackResult.critiques} />

          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setPhase("record");
                setFeedbackResult(null);
                setJobId(null);
              }}
            >
              Try Again
            </Button>
            <Button onClick={() => router.push("/")}>New Choreography</Button>
          </div>
        </div>
      )}
    </main>
  );
}
