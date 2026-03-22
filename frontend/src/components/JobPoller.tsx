"use client";

import { Loader2 } from "lucide-react";

import { useJobPoller } from "@/hooks/useJobPoller";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { JobStatus } from "@/types";

interface JobPollerProps {
  jobId: string;
  onComplete: (result: JobStatus) => void;
}

export default function JobPoller({ jobId, onComplete }: JobPollerProps) {
  const { data } = useJobPoller({ jobId, onComplete });

  const status = data?.status || "pending";

  const label =
    status === "pending"
      ? "Queued"
      : status === "processing"
        ? "Processing"
        : status === "done"
          ? "Done"
          : "Failed";

  return (
    <Card className="w-full max-w-md border-border shadow-sm">
      <CardHeader className="gap-3 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" aria-hidden />
        <CardTitle className="text-base font-medium">{label}</CardTitle>
        <CardDescription className="font-mono text-[11px]">
          {jobId}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-8">
        <div className="mx-auto h-1 max-w-xs overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      </CardContent>
    </Card>
  );
}
