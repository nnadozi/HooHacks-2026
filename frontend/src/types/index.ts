export type Keypoint = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

export type Move = {
  id: string;
  keypoints: Keypoint[][];
  duration_ms: number;
  bpm_range: [number, number];
  difficulty: "easy" | "medium" | "hard";
};

export type Choreography = {
  id: string;
  song_uri: string;
  bpm: number;
  difficulty: "easy" | "medium" | "hard";
  seed: number;
  move_sequence: string[];
};

export type ChoreographyPreview = {
  id: string;
  bpm: number;
  difficulty: "easy" | "medium" | "hard";
  song_uri: string;
  moves: {
    id: string;
    keypoints: Keypoint[][];
    duration_ms: number;
    source_video_uri?: string;
  }[];
};

export type GenerateResponse = {
  id: string;
  bpm: number;
  difficulty: string;
  seed: number;
  move_count: number;
};

export type GradeTier = "perfect" | "good" | "ok" | "miss";

export type Critique = {
  timestamp_ms: number;
  text: string;
};

export type GradeBreakdown = Record<GradeTier, number>;

export type FeedbackResult = {
  id: string;
  choreography_id: string;
  score: number;
  grade_breakdown: GradeBreakdown;
  critiques: Critique[];
  created_at?: string;
};

export type JobStatus = {
  job_id: string;
  status: "pending" | "processing" | "done" | "failed";
  result_id?: string;
};

export type ApiError = {
  error: string;
  code: string;
};
