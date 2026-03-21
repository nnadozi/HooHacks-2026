"use client";

import { useJobPoller } from "@/hooks/useJobPoller";
import type { JobStatus } from "@/types";

interface JobPollerProps {
  jobId: string;
  onComplete: (result: JobStatus) => void;
}

export default function JobPoller({ jobId, onComplete }: JobPollerProps) {
  const { data } = useJobPoller({ jobId, onComplete });

  const status = data?.status || "pending";

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-600 border-t-cyan-400" />

      <p className="text-lg font-medium text-zinc-200">
        {status === "pending" && "Waiting in queue..."}
        {status === "processing" && "Processing your video..."}
        {status === "done" && "Complete!"}
        {status === "failed" && "Processing failed"}
      </p>

      <p className="text-sm text-zinc-500">Job: {jobId}</p>
    </div>
  );
}
