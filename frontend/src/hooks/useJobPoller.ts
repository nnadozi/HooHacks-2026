import { useQuery } from "@tanstack/react-query";

import { getJobStatus } from "@/lib/api";
import type { JobStatus } from "@/types";

interface UseJobPollerOptions {
  jobId: string | null;
  onComplete?: (result: JobStatus) => void;
}

export function useJobPoller({ jobId, onComplete }: UseJobPollerOptions) {
  return useQuery<JobStatus>({
    queryKey: ["job", jobId],
    queryFn: () => getJobStatus(jobId!),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "done" || data?.status === "failed") {
        if (data.status === "done" && onComplete) {
          onComplete(data);
        }
        return false;
      }
      return 1000;
    },
  });
}
