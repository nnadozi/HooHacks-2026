import type {
  ChoreographyPreview,
  FeedbackResult,
  GenerateResponse,
  JobStatus,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, init);

  if (!res.ok) {
    const body = await res.json().catch(() => ({
      error: "Request failed",
      code: "UNKNOWN",
    }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res;
}

export async function uploadVideo(file: File): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file);

  const res = await apiFetch("/api/videos/upload", {
    method: "POST",
    body: form,
  });
  return res.json();
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await apiFetch(`/api/jobs/${jobId}`);
  return res.json();
}

export async function generateChoreography(
  file: File,
  difficulty: string,
  seed: number | null
): Promise<GenerateResponse> {
  const form = new FormData();
  form.append("file", file);

  const params = new URLSearchParams({ difficulty });
  if (seed !== null) params.set("seed", seed.toString());

  const res = await apiFetch(`/api/choreography/generate?${params}`, {
    method: "POST",
    body: form,
  });
  return res.json();
}

export async function regenerateChoreography(
  choreoId: string,
  seed: number | null
): Promise<GenerateResponse> {
  const params = seed !== null ? `?seed=${seed}` : "";
  const res = await apiFetch(`/api/choreography/${choreoId}/regenerate${params}`, {
    method: "POST",
  });
  return res.json();
}

export async function getChoreographyPreview(
  choreoId: string
): Promise<ChoreographyPreview> {
  const res = await apiFetch(`/api/choreography/${choreoId}/preview`);
  return res.json();
}

export function getVideoServeUrl(gsUri: string): string {
  return `${API_URL}/api/videos/serve?uri=${encodeURIComponent(gsUri)}`;
}

export async function analyzeFeedback(
  file: File | Blob,
  choreographyId: string
): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file);

  const params = new URLSearchParams({ choreography_id: choreographyId });
  const res = await apiFetch(`/api/feedback/analyze?${params}`, {
    method: "POST",
    body: form,
  });
  return res.json();
}

export async function getUserHistory(): Promise<{ history: FeedbackResult[] }> {
  const res = await apiFetch("/api/users/history");
  return res.json();
}

export async function getFeedbackById(feedbackId: string): Promise<FeedbackResult> {
  const res = await apiFetch(`/api/users/feedback/${feedbackId}`);
  return res.json();
}
