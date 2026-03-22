# CLAUDE.md
## AI-Powered Just Dance Web Application

Refer to PRD.md for full product context and architecture. This file defines how to build and maintain this codebase.

---

## Setup Commands

### Local Dev (Docker Compose)
```bash
docker compose up --build          # Start all services: api, worker, redis, mongo
docker compose up api              # Start only the FastAPI server
docker compose up worker           # Start only the Celery worker
```

### Backend (Python)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload      # Dev server on :8000
celery -A app.worker worker --loglevel=info  # Run worker separately
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev                        # Dev server on :3000
npm run build && npm run start     # Production build
```

---

## Project Structure

```
/
├── CLAUDE.md                     # Project-wide rules (this file)
├── PRD.md                        # Product source of truth — read before implementing any feature
├── backend/
│   ├── AGENTS.md                 # Backend-specific agent instructions
│   ├── app/
│   │   ├── main.py               # FastAPI app, CORS, global exception handler, request logging middleware
│   │   ├── config.py             # pydantic-settings config (all env vars)
│   │   ├── auth.py               # Auth0 JWT validation (currently unused — kept for future use)
│   │   ├── worker.py             # Celery app definition
│   │   ├── db.py                 # MongoDB clients: motor (async for FastAPI) + pymongo (sync for Celery)
│   │   ├── routers/
│   │   │   ├── videos.py         # POST /api/videos/upload
│   │   │   ├── jobs.py           # GET /api/jobs/{job_id}
│   │   │   ├── choreography.py   # POST /api/choreography/generate, regenerate, preview
│   │   │   ├── feedback.py       # POST /api/feedback/analyze
│   │   │   └── users.py          # GET /api/users/history
│   │   ├── tasks/
│   │   │   ├── ingest.py         # Celery task: parse reference video → extract moves
│   │   │   └── feedback.py       # Celery task: compare performance → call Gemini
│   │   ├── services/
│   │   │   ├── cv.py             # OpenCV + MediaPipe keypoint extraction
│   │   │   ├── audio.py          # librosa BPM detection (supports audio and video files)
│   │   │   ├── storage.py        # GCS upload/download helpers (uses GCS_PROJECT_ID)
│   │   │   ├── choreography.py   # Move sampling + sequence assembly
│   │   │   ├── scoring.py        # Cosine similarity, grade tier logic
│   │   │   └── gemini.py         # Gemini prompt builder + API call
│   │   └── models/
│   │       ├── move.py           # Move Pydantic model
│   │       ├── choreography.py   # Choreography Pydantic model
│   │       └── feedback.py       # Feedback Pydantic model
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── AGENTS.md                 # Frontend-specific agent instructions
│   ├── src/
│   │   ├── app/                  # Next.js 15 App Router pages
│   │   │   ├── page.tsx          # Landing / upload (accepts audio + video)
│   │   │   ├── choreography/[id]/page.tsx  # Skeleton preview + record
│   │   │   └── feedback/[id]/page.tsx      # Score + critiques display
│   │   ├── components/
│   │   │   ├── SkeletonCanvas.tsx # HTML5 Canvas skeleton overlay renderer
│   │   │   ├── Recorder.tsx      # getUserMedia / MediaRecorder recording UI
│   │   │   ├── FeedbackPanel.tsx  # Timestamped critique display
│   │   │   ├── ScoreDisplay.tsx   # Perfect/Good/OK/Miss breakdown + aggregate score
│   │   │   └── providers.tsx      # QueryClientProvider wrapper
│   │   ├── store/
│   │   │   └── index.ts          # Zustand store (choreography, feedback, session state)
│   │   ├── hooks/
│   │   │   ├── useJobPoller.ts   # React Query hook for polling /api/jobs/{job_id}
│   │   │   └── useRecorder.ts    # getUserMedia + MediaRecorder lifecycle hook
│   │   ├── lib/
│   │   │   └── api.ts            # Typed API client functions (no auth)
│   │   └── types/
│   │       └── index.ts          # Shared TypeScript types (Keypoint, Move, Feedback, etc.)
│   ├── package.json
│   └── Dockerfile
└── docker-compose.yml
```

---

## Code Style

### General
- Never hardcode secrets, API keys, DB URIs, or bucket names. All config via `pydantic-settings` on the backend and environment variables on the frontend.
- No raw video bytes in MongoDB. Store GCS URIs only.
- All heavy processing (CV pipeline, Gemini calls) runs in Celery tasks, never in FastAPI route handlers directly.
- Exception: the `/api/choreography/generate` endpoint extracts keypoints synchronously for video uploads since this is the primary user flow and needs immediate results.

### Backend (Python)
- Python 3.11+. Use type hints everywhere.
- One router file per resource group (videos, jobs, choreography, feedback, users).
- Services are plain functions or classes — no business logic in routers or tasks.
- Tasks call services; routers enqueue tasks or call lightweight services.
- Use `motor` (async MongoDB driver) for all DB operations in FastAPI routes. Use `pymongo` (sync) in Celery tasks.
- Validate all request bodies with Pydantic models. Never trust raw dicts from request payloads.
- No authentication currently — all routes use `DEV_USER_ID = "dev-user"` as a hardcoded user ID. Auth0 can be re-enabled via `app/auth.py`.
- Video upload size enforced at the FastAPI handler level (100MB max).
- Accepted upload formats: MP4, MOV, WebM (video) and MP3, WAV, OGG, FLAC (audio). Validate MIME type on upload.
- All routers and tasks include structured logging via Python's `logging` module.
- Global exception handler in `main.py` catches unhandled errors and returns consistent error JSON.
- Request logging middleware logs method, path, and status code for every request.

### Frontend (TypeScript / Next.js)
- Next.js 15 with App Router. TypeScript strict mode. No `any` types.
- Use shadcn/ui components for all UI. Reference: https://ui.shadcn.com/blocks
- Zustand for client-side state (current choreography, recording state, session score).
- TanStack Query (React Query) for all server state — fetching, caching, polling.
- Skeleton animation rendered exclusively on `<canvas>` via the `SkeletonCanvas` component.
- In-browser recording uses `getUserMedia` + `MediaRecorder`. Do not use third-party recording libraries.
- All API calls go through `src/lib/api.ts` — no inline `fetch` calls in components.
- No Auth0 currently — `api.ts` sends requests without authorization headers.

---

## Context

You MUST read PRD.md before implementing any feature. It is the authoritative source for all product decisions, data models, and architecture.

For backend work, also read `backend/AGENTS.md`. For frontend work, also read `frontend/AGENTS.md`. These files contain domain-specific conventions that override general rules in this file where they conflict.

---

## Styling

- Use the shadcn/ui library for all UI components. Reference: https://ui.shadcn.com/blocks or access via the `@` operator.
- The visual style should feel game-like and energetic, consistent with a Just Dance aesthetic.
- Dark theme preferred as the default.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/videos/upload` | Upload reference or performance video; returns `job_id` |
| GET | `/api/jobs/{job_id}` | Poll async processing job status |
| POST | `/api/choreography/generate` | Generate choreography from song or video (accepts `difficulty`, optional `seed`) |
| POST | `/api/choreography/{id}/regenerate` | Regenerate with new sample or same seed |
| GET | `/api/choreography/{id}/preview` | Fetch keypoint sequence for Canvas skeleton preview |
| POST | `/api/feedback/analyze` | Submit performance video against choreography; returns `job_id` for async scoring |
| GET | `/api/users/history` | Fetch user's past sessions and scores |
| GET | `/api/health` | Health check — unauthenticated |

---

## Choreography Generation

The `/api/choreography/generate` endpoint accepts both **video** and **audio** uploads:

- **Video uploads** (MP4, MOV, WebM): Extracts real pose keypoints from the video using MediaPipe. Before storing, performs duplicate detection by sampling 10 frames and comparing against all existing moves using cosine similarity — if ≥ 95% similar to an existing move, the existing move is silently reused instead of creating a duplicate. Otherwise, stores the keypoints as a new move in MongoDB. Creates a choreography referencing the move. The skeleton preview shows the actual poses from the uploaded dance video.
- **Audio uploads** (MP3, WAV, etc.): Detects BPM via librosa, then samples existing moves from the MongoDB pool that match the BPM range and difficulty level.

---

## Data Models

### Move (MongoDB)
```json
{
  "_id": "objectid",
  "keypoints": [[{"x": 0.5, "y": 0.3, "z": 0.0, "visibility": 0.99}]],
  "duration_ms": 2400,
  "bpm_range": [110, 130],
  "difficulty": "medium",
  "genre_tags": ["uploaded"],
  "source_video_uri": "gs://bucket/video.mp4"
}
```

### Choreography (MongoDB)
```json
{
  "_id": "objectid",
  "song_uri": "gs://bucket/song.mp3",
  "bpm": 124,
  "difficulty": "medium",
  "seed": 42,
  "move_sequence": ["move_id_1", "move_id_2"],
  "user_id": "dev-user"
}
```

### Feedback (MongoDB)
```json
{
  "_id": "objectid",
  "choreography_id": "objectid",
  "user_id": "dev-user",
  "score": 87,
  "grade_breakdown": {"perfect": 42, "good": 18, "ok": 7, "miss": 3},
  "critiques": [{"timestamp_ms": 14000, "text": "Left arm should be raised higher"}]
}
```

---

## Scoring & Pose Comparison

- Keypoints are normalized using uniform scaling (preserves aspect ratio) and centered at the origin before comparison (scale/position invariant, proportion-preserving).
- Primary similarity metric: mean per-joint Euclidean distance converted to a 0–1 similarity score (distance divisor: 0.60). Cosine similarity is also available for duplicate detection.
- Grade tiers (configurable via env var `SCORE_THRESHOLDS`):
  - **Perfect**: ≥ 0.75
  - **Good**: ≥ 0.60
  - **OK**: ≥ 0.40
  - **Miss**: < 0.40
- Only frames graded **Miss** or **OK** are sent to Gemini. Do not send Perfect or Good frames.
- Gemini rate limit: 10 feedback analyses per user per day, enforced server-side.

---

## Gemini Prompt Contract

Each call to Gemini must include:
1. Frame timestamp (ms)
2. List of joints with expected vs. actual position delta, using human-readable names (`left_elbow`, `right_knee`, etc.)
3. Instruction: return a single concise critique sentence per frame (e.g. "Left arm should be raised higher")

Do not send raw keypoint arrays to Gemini — convert to human-readable joint names and deltas first.

---

## Environment Variables

All config is managed via `pydantic-settings` in `backend/app/config.py`. Required variables:

```
MONGO_URI                # Default: mongodb://localhost:27017
MONGO_DB_NAME            # Default: justdance
REDIS_URL                # Default: redis://localhost:6379/0
GCS_PROJECT_ID           # Google Cloud project ID (required for GCS client)
GCS_BUCKET_NAME          # GCS bucket for video/audio uploads
GOOGLE_API_KEY           # Gemini API key
SCORE_THRESHOLDS         # JSON: {"perfect": 0.75, "good": 0.60, "ok": 0.40}
MAX_UPLOAD_SIZE_MB       # Default: 100
GEMINI_DAILY_LIMIT       # Default: 10
ALLOWED_ORIGINS          # Comma-separated CORS origins (default: http://localhost:3000)
```

Frontend env (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL      # Default: http://localhost:8000
```

---

## Constraints

- Max video upload: 100MB. Enforce in FastAPI `UploadFile` handler, not just client-side.
- Accepted video formats: MP4, MOV, WebM. Validate MIME type server-side.
- No business logic in route handlers — delegate to services or enqueue Celery tasks.
- Do not implement stretch goals (user-submitted move pool, real-time overlay, leaderboard) until core features are complete and tested.

---

## Error Response Contract

All API errors must return a consistent JSON shape:
```json
{ "error": "Human-readable message", "code": "SNAKE_CASE_ERROR_CODE" }
```
Example error codes: `UPLOAD_TOO_LARGE`, `INVALID_FORMAT`, `JOB_NOT_FOUND`, `GEMINI_LIMIT_EXCEEDED`, `NO_POSE_DETECTED`, `BPM_DETECTION_FAILED`, `STORAGE_ERROR`, `INTERNAL_ERROR`, `NO_MATCHING_MOVES`.
Never expose internal stack traces or raw exception messages in error responses.

---

## Frontend ↔ Backend Connection

- The frontend reads the backend URL from the `NEXT_PUBLIC_API_URL` environment variable.
- Default for local dev: `http://localhost:8000`.
- FastAPI configures CORS middleware in `main.py` to allow origins from `settings.ALLOWED_ORIGINS`.

---

## Docker Compose Services

| Service | Port | Description |
|---|---|---|
| `api` | 8000 | FastAPI application |
| `worker` | — | Celery worker (no exposed port) |
| `redis` | 6379 | Celery broker + choreography cache |
| `mongo` | 27017 | MongoDB |

---

## MVP Build Order

Build and validate features in this order. Do not start the next phase until the current one is working end-to-end.

1. **Choreography Ingestion** — video upload endpoint, CV pipeline (OpenCV + MediaPipe), move storage in MongoDB
2. **Choreography Generation** — BPM detection, move sampling (audio) or real keypoint extraction (video), skeleton preview on Canvas
3. **Performance Feedback** — in-browser recording, pose comparison, scoring, Gemini critiques

Stretch goals (leaderboard, real-time overlay, user-submitted moves) come only after phase 3 is complete.

---

## Backend Agent Instructions

*(From `backend/AGENTS.md`)*

### Stack
- Python 3.11+, FastAPI, Celery, Redis, MongoDB (motor async / pymongo sync)
- OpenCV, MediaPipe — server-side pose extraction only
- librosa — BPM and beat detection from audio and video files
- Google GenAI SDK — Gemini feedback generation
- pydantic-settings — all environment config

### Architecture Rules

**Routers:**
- Routers validate input with Pydantic and return responses. No business logic.
- For any operation involving video processing or Gemini: enqueue a Celery task and return a `job_id` immediately. Never block the request.
- Exception: `/api/choreography/generate` extracts keypoints synchronously for video uploads.
- For lightweight reads (fetch choreography, fetch history): call services directly.
- All routes use `DEV_USER_ID = "dev-user"` — no authentication currently.

**Tasks:**
- Tasks live in `app/tasks/`. Each task downloads required assets from GCS, calls services, and writes results to MongoDB.
- Tasks use `pymongo` (sync). Do not use `motor` inside Celery tasks.
- Tasks update a job status document in MongoDB (`pending` → `processing` → `done` | `failed`).

**Services:**
- Services are stateless functions. No FastAPI or Celery imports inside service files.
- `cv.py`: takes a local file path, returns a list of keypoint frame arrays. Shape: `list[list[dict]]` where each dict is `{x, y, z, visibility}`.
- `audio.py`: detects BPM from audio or video files. Determines file type from filename/content_type and uses appropriate suffix for temp file.
- `scoring.py`: normalizes keypoints using uniform scaling (centered, proportion-preserving), computes pose similarity via mean per-joint Euclidean distance, returns grade tier and similarity score. Also provides cosine similarity for duplicate detection.
- `gemini.py`: accepts a list of `{timestamp_ms, joint_deltas: {joint_name: {expected, actual}}}` dicts, returns a list of `{timestamp_ms, text}` critique dicts. Never passes raw keypoint arrays to Gemini.
- `storage.py`: uses `gcs.Client(project=settings.GCS_PROJECT_ID)` for GCS operations.

### Pose Comparison Rules
- Normalize keypoints using uniform scaling and center at origin before any comparison (scale/position invariant, proportion-preserving).
- Similarity metric: mean per-joint Euclidean distance converted to 0–1 score (divisor: 0.60). Cosine similarity used for duplicate detection.
- Grade tiers (read from `settings.SCORE_THRESHOLDS`):
  - Perfect ≥ 0.75, Good ≥ 0.60, OK ≥ 0.40, Miss < 0.40
- Only send Miss and OK frames to Gemini. Skip Perfect and Good to control API cost.
- Enforce Gemini daily limit (`settings.GEMINI_DAILY_LIMIT`, default 10) per user via a counter in Redis.

### Video Upload Rules
- Max size: `settings.MAX_UPLOAD_SIZE_MB` (default 100). Enforce in the FastAPI handler with an explicit size check before saving.
- Accepted MIME types: `video/mp4`, `video/quicktime`, `video/webm`. Reject others with 400.
- Save to GCS immediately on upload. Store only the URI in MongoDB — never raw bytes.
- **Duplicate detection**: After keypoint extraction, sample 10 frames and compare against all existing moves using cosine similarity. If ≥ 95% similar, silently reuse the existing move instead of storing a duplicate. This is a background process — no error is returned to the user.

### Config / Secrets
All config via `pydantic-settings`. Required env vars:
```
MONGO_URI
MONGO_DB_NAME
REDIS_URL
GCS_PROJECT_ID
GCS_BUCKET_NAME
GOOGLE_API_KEY
SCORE_THRESHOLDS       # JSON string: {"perfect": 0.75, "good": 0.60, "ok": 0.40}
MAX_UPLOAD_SIZE_MB     # Default: 100
GEMINI_DAILY_LIMIT     # Default: 10
ALLOWED_ORIGINS        # Default: http://localhost:3000
```
No env var may have a hardcoded default that is a real secret.

---

## Frontend Agent Instructions

*(From `frontend/AGENTS.md`)*

### Stack
- Next.js 15, TypeScript (strict mode)
- shadcn/ui — all UI components (https://ui.shadcn.com/blocks)
- Zustand — client-side state
- TanStack Query (React Query) — server state, API caching, polling
- HTML5 Canvas API — skeleton overlay rendering
- getUserMedia / MediaRecorder — in-browser video recording

### Architecture Rules

**API Calls:**
- All API calls go through `src/lib/api.ts`. No inline `fetch` or `axios` calls in components or hooks.
- No auth token attached — requests are sent without authorization headers.
- API functions return typed responses matching the data models in `src/types/index.ts`.

**State Management:**
- **Zustand** (`src/store/index.ts`) owns client state: current choreography, recording state, session score, active job ID.
- **TanStack Query** owns all server state: fetching choreography previews, polling job status, fetching feedback results, fetching user history.
- Do not duplicate server data in Zustand. If it comes from the API, it lives in React Query's cache.

**Skeleton Rendering:**
- All skeleton animation is rendered on `<canvas>` inside `SkeletonCanvas.tsx`.
- The component accepts a `frames: Keypoint[][]` prop (array of keypoint frames) and an `fps` prop.
- Uses MediaPipe connection pairs to draw anatomically correct skeleton bones.
- Use `requestAnimationFrame` for the animation loop. Do not use `setInterval`.
- Draw bones as lines between connected joint pairs (cyan). Draw joints as filled circles (rose).
- No third-party canvas/animation libraries — use the Canvas API directly.

**Recording:**
- `Recorder.tsx` uses `getUserMedia` to access the webcam and `MediaRecorder` to capture video.
- On stop, produce a `Blob` in `video/webm` format and pass it up via an `onRecordingComplete(blob: Blob)` callback.
- `useRecorder.ts` encapsulates the `getUserMedia` / `MediaRecorder` lifecycle.
- Do not use any third-party recording libraries.

**Job Polling:**
- After any video upload, store the returned `job_id` in Zustand.
- `useJobPoller` polls `GET /api/jobs/{job_id}` every 2 seconds using React Query's `refetchInterval`.
- Stop polling when status is `done` or `failed`.

### TypeScript Types
All shared types in `src/types/index.ts`:
```ts
type Keypoint = { x: number; y: number; z: number; visibility: number }
type Move = { id: string; keypoints: Keypoint[][]; duration_ms: number }
type Choreography = { id: string; song_uri: string; bpm: number; difficulty: string; seed: number; move_sequence: string[] }
type GradeTier = 'perfect' | 'good' | 'ok' | 'miss'
type Critique = { timestamp_ms: number; text: string }
type FeedbackResult = { id: string; choreography_id: string; score: number; grade_breakdown: Record<GradeTier, number>; critiques: Critique[] }
type JobStatus = { job_id: string; status: 'pending' | 'processing' | 'done' | 'failed'; result_id?: string }
type ApiError = { error: string; code: string }
```

### Styling
- Use shadcn/ui components for all UI.
- Dark theme as default. Game-like, energetic aesthetic.
- Use Tailwind utility classes for layout and spacing.
- Score display color coding: Perfect = green, Good = blue, OK = yellow, Miss = red.
