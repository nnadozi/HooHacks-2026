# Product Requirements Document
## AI-Powered Just Dance Web Application

---

## Overview

Build an AI-powered "Just Dance" style web application that generates dance choreographies from uploaded songs and provides natural language feedback on a user's recorded performance. The app combines computer vision, audio analysis, and generative AI to deliver an interactive, game-like experience in the browser.

---

## Core Features

### 1. Choreography Ingestion
- Users upload reference dance videos which are parsed server-side using OpenCV and MediaPipe to extract individual dance moves as pose keypoint sequences.
- BPM is auto-detected from the audio track using `librosa` rather than relying on manual tagging.
- Extracted moves are stored as documents in MongoDB with metadata: `duration`, `keypoints[]`, `bpm_range`, `difficulty` (easy/medium/hard), `genre_tags[]`, and `source_video_uri` (GCS/S3 URI — raw video bytes are never stored in Mongo).
- Move pool can be bootstrapped from a curated set of reference videos provided by the team. User-uploaded reference videos are a stretch goal.

### 2. Choreography Generation
- Given an uploaded song, the app detects BPM via `librosa` and samples moves from the MongoDB pool filtered by matching BPM range and user-selected difficulty.
- Generation is stochastic by default but accepts an optional seed for reproducibility on regeneration.
- The assembled choreography sequence is previewed to the user as a skeleton overlay animation rendered on an HTML5 Canvas.
- Users can accept the choreography or regenerate it (new stochastic sample or same seed for minor variation).

### 3. Performance Feedback
- Users can record a performance attempt directly in-browser via `getUserMedia` / `MediaRecorder`, or upload a pre-recorded video file.
- The uploaded performance video is processed server-side: MediaPipe extracts pose keypoints frame-by-frame and compares them against the generated choreography using cosine similarity on normalized keypoint vectors.
- Each frame is graded on a Just Dance-style tier: **Perfect** (≥0.92), **Good** (≥0.85), **OK** (≥0.70), **Miss** (<0.70). Thresholds are configurable via environment variable.
- An aggregate session score is computed and displayed at the end.
- Frames graded below "Good" are batched and sent to Google Gemini with a structured prompt containing: frame timestamp, diff of keypoint arrays, and human-readable joint names (e.g. "left_elbow", "right_knee").
- Gemini returns timestamped natural language critiques (e.g. "0:14 — left arm should be raised higher") which are surfaced in a feedback panel.
- Users can re-upload for re-analysis or start over with a new choreography.

---

## Tech Stack

### Backend
| Layer | Technology |
|---|---|
| Framework | Python 3.11+, FastAPI |
| CV Pipeline | OpenCV, MediaPipe (server-side) |
| Audio Analysis | librosa (BPM + beat detection) |
| AI Feedback | Google GenAI SDK (Gemini) |
| Task Queue | Celery + Redis |
| Database | MongoDB (Atlas or self-hosted) |
| File Storage | Google Cloud Storage or AWS S3 |
| Config | pydantic-settings (all env vars) |
| Auth | Auth0 (JWT validation via FastAPI middleware) |

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 18+, TypeScript |
| UI Components | shadcn/ui (https://ui.shadcn.com/blocks) |
| State Management | Zustand (client state), React Query / TanStack Query (server state) |
| Skeleton Rendering | HTML5 Canvas API |
| Recording | getUserMedia / MediaRecorder Web APIs |

### Infrastructure
| Layer | Technology |
|---|---|
| Local Dev | Docker Compose (services: api, worker, redis, mongo) |
| Containerization | Docker |

---

## Architecture

### Backend Services
- **`api`** — FastAPI application serving REST endpoints. All `/api/*` routes are JWT-protected via Auth0 middleware except `/api/health`.
- **`worker`** — Celery worker consuming tasks from Redis. Handles all video processing and CV pipeline work asynchronously.
- **`redis`** — Message broker for Celery; also used for caching processed choreographies.
- **`mongo`** — Stores move documents, choreography sequences, user session history.

### Video Processing Flow
1. Client uploads video → FastAPI saves to GCS/S3, returns an upload URI.
2. FastAPI enqueues a Celery task with the URI.
3. Worker downloads video, runs OpenCV + MediaPipe, extracts keypoints, stores result in Mongo.
4. Client polls `/api/jobs/{job_id}` or receives a Server-Sent Event (SSE) on completion.

### Pose Comparison Contract
- Keypoints are normalized to a unit bounding box before comparison (scale/position invariant).
- Similarity metric: cosine similarity on the flattened normalized keypoint vector per frame.
- Score tiers: Perfect ≥0.92, Good ≥0.85, OK ≥0.70, Miss <0.70 (env-configurable).
- Only frames graded Miss or OK are sent to Gemini to minimize API cost.

### Gemini Prompt Contract
Each Gemini request includes:
- Frame timestamp
- List of joints with expected vs. actual position delta (human-readable names)
- Instruction to return a single concise critique sentence per frame

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/videos/upload` | Upload reference or performance video; returns job_id |
| GET | `/api/jobs/{job_id}` | Poll processing job status |
| POST | `/api/choreography/generate` | Generate choreography for a song; accepts difficulty + optional seed |
| POST | `/api/choreography/{id}/regenerate` | Regenerate with new sample or same seed |
| GET | `/api/choreography/{id}/preview` | Fetch keypoint sequence for skeleton preview |
| POST | `/api/feedback/analyze` | Submit performance video against choreography; returns feedback + score |
| GET | `/api/users/history` | Fetch user's past sessions and scores |

---

## Data Models

### Move Document (MongoDB)
```json
{
  "_id": "objectid",
  "keypoints": [[{x, y, z, visibility}]],
  "duration_ms": 2400,
  "bpm_range": [110, 130],
  "difficulty": "medium",
  "genre_tags": ["hiphop"],
  "source_video_uri": "gs://bucket/video.mp4",
  "created_at": "ISO8601"
}
```

### Choreography Document (MongoDB)
```json
{
  "_id": "objectid",
  "song_uri": "gs://bucket/song.mp3",
  "bpm": 124,
  "difficulty": "medium",
  "seed": 42,
  "move_sequence": ["move_id_1", "move_id_2"],
  "user_id": "auth0|...",
  "created_at": "ISO8601"
}
```

### Feedback Document (MongoDB)
```json
{
  "_id": "objectid",
  "choreography_id": "objectid",
  "user_id": "auth0|...",
  "score": 87,
  "grade_breakdown": {"perfect": 42, "good": 18, "ok": 7, "miss": 3},
  "critiques": [{"timestamp_ms": 14000, "text": "Left arm should be raised higher"}],
  "created_at": "ISO8601"
}
```

---

## Key Decisions

| Decision | Resolution |
|---|---|
| Pose estimation location | Server-side (MediaPipe Python) for simplicity |
| Video storage | GCS or S3 URI in Mongo; never raw bytes in DB |
| BPM detection | Auto via librosa; no manual tagging |
| Choreography generation | Stochastic with optional seed |
| Move pool seeding | Curated reference videos from team; user uploads are stretch goal |
| Move pool tagging | Song-agnostic but tagged by BPM range, difficulty, and genre |
| Pose similarity metric | Cosine similarity on normalized keypoint vectors |
| Gemini call filtering | Only Miss/OK frames sent to Gemini to control cost |
| Async processing | Celery + Redis; HTTP polling or SSE for job status |
| Auth boundary | Auth0 JWT validated in FastAPI middleware; all routes protected except /api/health |

---

## Constraints & Limits

- **Video upload size**: 100MB max per file (enforced in FastAPI `UploadFile` handler).
- **Accepted video formats**: MP4, MOV, WebM.
- **Gemini rate limit**: 10 feedback analyses per user per day (enforced server-side).
- **Choreography cache**: Generated choreographies cached in Redis for 1 hour by seed + difficulty + bpm key.
- **No secrets in code**: All API keys, DB URIs, and bucket names via `pydantic-settings` / `.env`.

---

## Stretch Goals

- User-submitted reference videos to grow the move pool (with moderation).
- Real-time pose overlay during recording (MediaPipe JS / WASM client-side).
- Leaderboard / social score sharing.
- Genre-aware choreography generation using song metadata.
- Mobile-responsive recording flow.
