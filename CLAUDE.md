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

**Note:** Celery does not auto-reload. Restart it manually after backend code changes.

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
│   │   │   ├── videos.py         # POST /api/videos/upload, GET /api/videos/serve
│   │   │   ├── jobs.py           # GET /api/jobs/{job_id}
│   │   │   ├── choreography.py   # POST /api/choreography/generate, regenerate; GET preview
│   │   │   ├── feedback.py       # POST /api/feedback/analyze
│   │   │   ├── users.py          # GET /api/users/history, /api/users/feedback/{id}
│   │   │   ├── moves.py          # GET /api/moves, /api/moves/{id}
│   │   │   └── routines.py       # CRUD /api/routines, GET /api/routines/{id}/preview
│   │   ├── tasks/
│   │   │   ├── ingest.py         # Celery task: parse reference video → extract moves
│   │   │   └── feedback.py       # Celery task: compare performance → score → Gemini critiques
│   │   ├── services/
│   │   │   ├── cv.py             # OpenCV + MediaPipe keypoint extraction, WebM→MP4 conversion
│   │   │   ├── audio.py          # librosa BPM detection (supports audio and video files)
│   │   │   ├── storage.py        # GCS upload/download helpers (uses GCS_PROJECT_ID)
│   │   │   ├── choreography.py   # Move sampling + sequence assembly + synthetic move generation
│   │   │   ├── scoring.py        # Pose similarity (Euclidean distance), grade tier logic
│   │   │   └── gemini.py         # Gemini prompt builder + API call + fallback critiques
│   │   └── models/
│   │       ├── move.py           # Move Pydantic models (Keypoint, MoveCreate, MoveDoc)
│   │       ├── choreography.py   # Choreography Pydantic models (ChoreographyCreate, ChoreographyDoc, GenerateRequest)
│   │       ├── feedback.py       # Feedback Pydantic models (GradeTier, Critique, GradeBreakdown, FeedbackCreate, FeedbackDoc)
│   │       └── routine.py        # Routine Pydantic models (RoutineCreate, RoutineDoc, RoutineUpdate)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── AGENTS.md                 # Frontend-specific agent instructions
│   ├── src/
│   │   ├── app/                  # Next.js 15 App Router pages
│   │   │   ├── page.tsx          # Landing / upload (accepts audio + video, difficulty selector, session grid)
│   │   │   ├── choreography/[id]/page.tsx  # 3D model preview + live recording + countdown
│   │   │   ├── feedback/[id]/page.tsx      # Score + critiques + file upload
│   │   │   └── editor/page.tsx             # Move bin + timeline builder + routine save
│   │   ├── components/
│   │   │   ├── SkeletonCanvas.tsx # HTML5 Canvas skeleton overlay renderer
│   │   │   ├── Recorder.tsx      # getUserMedia / MediaRecorder recording UI with external control
│   │   │   ├── StickFigure3D.tsx  # THREE.js 3D stick figure renderer
│   │   │   ├── FeedbackPanel.tsx  # Timestamped critique display
│   │   │   ├── ScoreDisplay.tsx   # Perfect/Good/OK/Miss breakdown + aggregate score
│   │   │   ├── JobPoller.tsx      # Job polling UI component
│   │   │   ├── SongCard.tsx       # Song display card component
│   │   │   ├── SongList.tsx       # Song list/grid component with tabs
│   │   │   ├── AppHeader.tsx      # Navigation header with theme toggle
│   │   │   ├── ThemeToggle.tsx    # Dark/light theme toggle
│   │   │   └── providers.tsx      # QueryClientProvider + ThemeProvider wrapper
│   │   ├── store/
│   │   │   └── index.ts          # Zustand store (choreography, feedback, session state)
│   │   ├── hooks/
│   │   │   ├── useJobPoller.ts   # React Query hook for polling /api/jobs/{job_id}
│   │   │   ├── usePoseDetection.ts # MediaPipe pose detection hook for in-browser tracking
│   │   │   └── useRecorder.ts    # getUserMedia + MediaRecorder lifecycle hook
│   │   ├── lib/
│   │   │   ├── api.ts            # Typed API client functions (no auth)
│   │   │   └── utils.ts          # Shared utility functions (cn helper, etc.)
│   │   └── types/
│   │       ├── index.ts          # Shared TypeScript types (Keypoint, Move, Feedback, Routine, etc.)
│   │       └── mediapipe.d.ts    # MediaPipe type declarations
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
- One router file per resource group (videos, jobs, choreography, feedback, users, moves, routines).
- Services are plain functions or classes — no business logic in routers or tasks.
- Tasks call services; routers enqueue tasks or call lightweight services.
- Use `motor` (async MongoDB driver) for all DB operations in FastAPI routes. Use `pymongo` (sync) in Celery tasks.
- Validate all request bodies with Pydantic models. Never trust raw dicts from request payloads.
- No authentication currently — all routes use `DEV_USER_ID = "dev-user"` as a hardcoded user ID. Auth0 can be re-enabled via `app/auth.py`.
- Video upload size enforced at the FastAPI handler level (100MB max).
- Accepted upload formats: MP4, MOV, WebM (video) and MP3, WAV, OGG, FLAC (audio). Validate MIME type on upload.
- WebM files from browser recording are converted to MP4 via ffmpeg before OpenCV processing.
- All routers and tasks include structured logging via Python's `logging` module.
- Global exception handler in `main.py` catches unhandled errors and returns consistent error JSON.
- Request logging middleware logs method, path, and status code for every request.

### Frontend (TypeScript / Next.js)
- Next.js 15 with App Router. TypeScript strict mode. No `any` types.
- Use shadcn/ui components for all UI. Reference: https://ui.shadcn.com/blocks
- Zustand for client-side state (current choreography, recording state, session score).
- TanStack Query (React Query) for all server state — fetching, caching, polling.
- Skeleton animation rendered on `<canvas>` via `SkeletonCanvas` component, or in 3D via `StickFigure3D` (THREE.js).
- In-browser recording uses `getUserMedia` + `MediaRecorder`. Do not use third-party recording libraries.
- All API calls go through `src/lib/api.ts` — no inline `fetch` calls in components.
- No Auth0 currently — `api.ts` sends requests without authorization headers.
- `next-themes` for dark/light theme toggling.

---

## Context

You MUST read PRD.md before implementing any feature. It is the authoritative source for all product decisions, data models, and architecture.

For backend work, also read `backend/AGENTS.md`. For frontend work, also read `frontend/AGENTS.md`. These files contain domain-specific conventions that override general rules in this file where they conflict.

---

## Styling

- Use the shadcn/ui library for all UI components. Reference: https://ui.shadcn.com/blocks or access via the `@` operator.
- The visual style should feel game-like and energetic, consistent with a Just Dance aesthetic.
- Dark theme preferred as the default (togglable via ThemeToggle).

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/videos/upload` | Upload reference or performance video; returns `job_id` |
| GET | `/api/videos/serve` | Serve a video file from GCS by URI |
| GET | `/api/jobs/{job_id}` | Poll async processing job status |
| POST | `/api/choreography/generate` | Generate choreography from song or video (accepts `difficulty`, optional `seed`) |
| POST | `/api/choreography/{id}/regenerate` | Regenerate with new sample or same seed |
| GET | `/api/choreography/{id}/preview` | Fetch keypoint sequence for Canvas skeleton preview |
| POST | `/api/feedback/analyze` | Submit performance video against choreography; returns `job_id` for async scoring |
| GET | `/api/users/history` | Fetch user's past sessions and scores |
| GET | `/api/users/feedback/{id}` | Fetch a specific feedback result by ID |
| GET | `/api/moves` | List moves with optional filtering (difficulty, genre) and pagination |
| GET | `/api/moves/{id}` | Fetch a single move with full keypoints |
| GET | `/api/routines` | List user's saved routines |
| POST | `/api/routines` | Create a new routine (name + move_sequence) |
| GET | `/api/routines/{id}` | Get routine metadata |
| PUT | `/api/routines/{id}` | Update routine name/move_sequence |
| GET | `/api/routines/{id}/preview` | Fetch routine preview with all move keypoints and total duration |
| GET | `/api/health` | Health check — unauthenticated |

---

## Choreography Generation

The `/api/choreography/generate` endpoint accepts both **video** and **audio** uploads:

- **Video uploads** (MP4, MOV, WebM): Extracts real pose keypoints from the video using MediaPipe. WebM files are converted to MP4 via ffmpeg first. Before storing, performs duplicate detection by sampling 10 frames and comparing against all existing moves using cosine similarity — if ≥ 95% similar to an existing move, the existing move is silently reused instead of creating a duplicate. Otherwise, stores the keypoints as a new move in MongoDB. Creates a choreography referencing the move. The skeleton preview shows the actual poses from the uploaded dance video.
- **Audio uploads** (MP3, WAV, etc.): Detects BPM via librosa, then samples existing moves from the MongoDB pool that match the BPM range and difficulty level. If no moves exist, generates synthetic placeholder moves.

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
  "source_video_uri": "gs://bucket/video.mp4",
  "created_at": "2026-03-22T00:00:00Z"
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
  "user_id": "dev-user",
  "created_at": "2026-03-22T00:00:00Z"
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
  "critiques": [{"timestamp_ms": 14000, "text": "Left arm should be raised higher"}],
  "created_at": "2026-03-22T00:00:00Z"
}
```

### Routine (MongoDB)
```json
{
  "_id": "objectid",
  "name": "My Custom Routine",
  "move_sequence": ["move_id_1", "move_id_2"],
  "user_id": "dev-user",
  "created_at": "2026-03-22T00:00:00Z",
  "updated_at": null
}
```

---

## Scoring & Pose Comparison

- Keypoints are normalized using uniform scaling (preserves aspect ratio) and centered at the origin before comparison (scale/position invariant, proportion-preserving).
- Primary similarity metric: mean per-joint Euclidean distance converted to a 0–1 similarity score (distance divisor: 0.85). Cosine similarity is also available for duplicate detection.
- Grade tiers (configurable via env var `SCORE_THRESHOLDS`):
  - **Perfect**: ≥ 0.60
  - **Good**: ≥ 0.45
  - **OK**: ≥ 0.25
  - **Miss**: < 0.25
- Only frames graded **Miss** or **OK** are sent to Gemini. Do not send Perfect or Good frames.
- Up to 20 frames are sampled (evenly spaced) for Gemini critique generation.
- Gemini rate limit: 10 feedback analyses per user per day, enforced server-side.
- If Gemini is unavailable, fallback critiques are auto-generated using body group tips (arms, legs, head, core, hands) instead of raw joint names.
- Similar consecutive critiques are merged — the earliest timestamp is kept and duplicates removed.

---

## Gemini Prompt Contract

Gemini generates **high-level dance coaching** feedback, not joint-specific critiques:

1. Frame timestamp (ms) and joint delta data are sent to Gemini
2. Gemini returns fun, encouraging critiques about **body groups** (arms, legs, head, core, hands) — e.g., "Put more power into your legs!", "Sharpen up your hand movements!"
3. Do NOT mention specific joint names (left_index, right_wrist) or coordinate numbers in critiques
4. Similar consecutive critiques are **merged** — the earliest timestamp is kept and duplicates are removed
5. Fallback critiques (when Gemini is unavailable) use body group tips instead of raw joint deltas
6. Max 8 critiques per feedback session

Do not send raw keypoint arrays to Gemini — convert to human-readable joint names and deltas first.

---

## Environment Variables

All config is managed via `pydantic-settings` in `backend/app/config.py`. Required variables:

```
MONGO_URI                # Default: (empty — set in .env)
MONGO_DB_NAME            # Default: justdance
REDIS_URL                # Default: redis://localhost:6379/0
GCS_PROJECT_ID           # Google Cloud project ID (required for GCS client)
GCS_BUCKET_NAME          # GCS bucket for video/audio uploads
GOOGLE_API_KEY           # Gemini API key
VERTEX_PROJECT_ID        # Vertex AI project ID (optional)
VERTEX_AI_LOCATION       # Default: us-central1
SCORE_THRESHOLDS         # JSON: {"perfect": 0.60, "good": 0.45, "ok": 0.25}
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
- Do not implement stretch goals (real-time overlay, leaderboard) until core features are complete and tested.

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

## Live Recording Flow

The choreography page (`/choreography/[id]`) supports live webcam recording:

1. User clicks **"Record"** on the preview page
2. A **5-second countdown** plays on both the 3D model preview and webcam panels
3. 3D model playback and `MediaRecorder` start simultaneously
4. Side-by-side layout: 3D stick figure model (left) + webcam with pose detection overlay (right)
5. Recording **auto-stops** when the choreography duration elapses, or the user clicks **"Stop & Submit"**
6. The recorded blob is submitted to `/api/feedback/analyze` and the user is routed to the feedback page
7. Camera is turned off after the recording blob is captured, and also on component unmount

The feedback page (`/feedback/[id]`) supports file upload. The "Again" button routes back to the choreography page for another recording.

---

## Routine Editor

The editor page (`/editor`) allows users to build custom routines:

1. **Move Bin**: Searchable, filterable list of all available moves (by difficulty, genre)
2. **Timeline Builder**: Drag-and-drop move ordering with reordering support
3. **3D Preview**: THREE.js stick figure previewer (`StickFigure3D.tsx`) for selected moves
4. **Save**: Saves routine via `POST /api/routines` with name and move sequence

---

## MVP Build Order

Build and validate features in this order. Do not start the next phase until the current one is working end-to-end.

1. **Choreography Ingestion** — video upload endpoint, CV pipeline (OpenCV + MediaPipe), move storage in MongoDB
2. **Choreography Generation** — BPM detection, move sampling (audio) or real keypoint extraction (video), skeleton preview on Canvas
3. **Performance Feedback** — in-browser recording, pose comparison, scoring, Gemini critiques
4. **Routine Editor** — move browsing, custom routine building, 3D preview

Stretch goals (leaderboard, real-time overlay) come only after phase 4 is complete.

---

## Backend Agent Instructions

*(From `backend/AGENTS.md`)*

### Stack
- Python 3.11+, FastAPI, Celery, Redis, MongoDB (motor async / pymongo sync)
- OpenCV, MediaPipe — server-side pose extraction only
- librosa — BPM and beat detection from audio and video files
- Google GenAI SDK — Gemini feedback generation
- pydantic-settings — all environment config
- ffmpeg — WebM→MP4 conversion for browser-recorded videos

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
- `feedback.py` samples up to 20 evenly-spaced frames for Gemini critique generation via `_spread_sample()`.

**Services:**
- Services are stateless functions. No FastAPI or Celery imports inside service files.
- `cv.py`: takes a local file path, returns a list of keypoint frame arrays. Shape: `list[list[dict]]` where each dict is `{x, y, z, visibility}`. Handles WebM→MP4 conversion and FPS detection with fallbacks.
- `audio.py`: detects BPM from audio or video files. Determines file type from filename/content_type and uses appropriate suffix for temp file.
- `scoring.py`: normalizes keypoints using uniform scaling (centered, proportion-preserving), computes pose similarity via mean per-joint Euclidean distance (divisor: 0.85), returns grade tier and similarity score. Also provides cosine similarity for duplicate detection.
- `gemini.py`: accepts a list of `{timestamp_ms, ref_keypoints, perf_keypoints}` dicts, returns a list of `{timestamp_ms, text}` critique dicts. Generates high-level dance coaching (body groups, not specific joints). Merges similar consecutive critiques. Includes body-group-based fallback critique generation if Gemini call fails.
- `choreography.py`: assembles move sequences from the MongoDB pool, also generates synthetic placeholder moves when no real moves are available.
- `storage.py`: uses `gcs.Client(project=settings.GCS_PROJECT_ID)` for GCS operations.

### Pose Comparison Rules
- Normalize keypoints using uniform scaling and center at origin before any comparison (scale/position invariant, proportion-preserving).
- Similarity metric: mean per-joint Euclidean distance converted to 0–1 score (divisor: 0.85). Cosine similarity used for duplicate detection.
- Grade tiers (read from `settings.SCORE_THRESHOLDS`):
  - Perfect ≥ 0.60, Good ≥ 0.45, OK ≥ 0.25, Miss < 0.25
- Only send Miss and OK frames to Gemini. Skip Perfect and Good to control API cost.
- Enforce Gemini daily limit (`settings.GEMINI_DAILY_LIMIT`, default 10) per user via a counter in Redis.

### Video Upload Rules
- Max size: `settings.MAX_UPLOAD_SIZE_MB` (default 100). Enforce in the FastAPI handler with an explicit size check before saving.
- Accepted MIME types: `video/mp4`, `video/quicktime`, `video/webm`. Reject others with 400.
- Save to GCS immediately on upload. Store only the URI in MongoDB — never raw bytes.
- **WebM handling**: Browser-recorded WebM files are converted to MP4 via ffmpeg before OpenCV processing.
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
SCORE_THRESHOLDS       # JSON string: {"perfect": 0.60, "good": 0.45, "ok": 0.25}
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
- THREE.js — 3D stick figure rendering (StickFigure3D)
- getUserMedia / MediaRecorder — in-browser video recording
- next-themes — dark/light theme toggling
- MediaPipe Tasks Vision — in-browser pose detection overlay

### Architecture Rules

**API Calls:**
- All API calls go through `src/lib/api.ts`. No inline `fetch` or `axios` calls in components or hooks.
- No auth token attached — requests are sent without authorization headers.
- API functions return typed responses matching the data models in `src/types/index.ts`.

**State Management:**
- **Zustand** (`src/store/index.ts`) owns client state: current choreography, recording state, session score, active job ID.
- **TanStack Query** owns all server state: fetching choreography previews, polling job status, fetching feedback results, fetching user history, fetching moves/routines.
- Do not duplicate server data in Zustand. If it comes from the API, it lives in React Query's cache.

**Skeleton / 3D Model Rendering:**
- The choreography preview and recording pages use `StickFigure3D.tsx` — a THREE.js rigged 3D stick figure model driven by keypoint data.
- `StickFigure3D` accepts `frames: Keypoint[][]`, `fps`, `isPlaying`, `width`, `height`, optional `className` and `modelUrl`.
- Uses a GLTF model (`/models/low_poly_stick_figure_rigged/scene.gltf`) with bone drivers mapped to MediaPipe keypoint indices.
- The recording view uses a `ResizeObserver` to dynamically size the 3D renderer to fill its container.
- `SkeletonCanvas.tsx` (2D canvas renderer) is still available but no longer used on the choreography page.
- Use `requestAnimationFrame` for animation loops. Do not use `setInterval`.

**Recording:**
- `Recorder.tsx` uses `getUserMedia` to access the webcam and `MediaRecorder` to capture video.
- Supports **external control** via `externalControl`, `shouldStart`, `shouldStop` props for synchronized recording.
- On stop, produces a `Blob` in `video/webm` format and passes it up via an `onRecordingComplete(blob: Blob)` callback.
- Camera is turned off after the recording blob is captured, and also on component unmount (cleanup effect).
- `useRecorder.ts` encapsulates the `getUserMedia` / `MediaRecorder` lifecycle.
- `usePoseDetection.ts` overlays a real-time skeleton on the webcam feed using MediaPipe.
- Do not use any third-party recording libraries.

**Job Polling:**
- After any video upload, store the returned `job_id` in Zustand.
- `useJobPoller` polls `GET /api/jobs/{job_id}` every 2 seconds using React Query's `refetchInterval`.
- Stop polling when status is `done` or `failed`.

### TypeScript Types
All shared types in `src/types/index.ts`:
```ts
type Keypoint = { x: number; y: number; z: number; visibility: number }
type Move = { id: string; keypoints: Keypoint[][]; duration_ms: number; bpm_range: [number, number]; difficulty: string; genre_tags?: string[]; source_video_uri?: string; created_at?: string }
type MoveSummary = Omit<Move, 'keypoints'> & { keypoints?: never }
type Choreography = { id: string; song_uri: string; bpm: number; difficulty: string; seed: number; move_sequence: string[] }
type ChoreographyPreview = { id: string; bpm: number; difficulty: string; song_uri: string; moves: { id: string; keypoints: Keypoint[][]; duration_ms: number; source_video_uri?: string }[] }
type GradeTier = 'perfect' | 'good' | 'ok' | 'miss'
type Critique = { timestamp_ms: number; text: string }
type GradeBreakdown = Record<GradeTier, number>
type FeedbackResult = { id: string; choreography_id: string; score: number; grade_breakdown: GradeBreakdown; critiques: Critique[]; created_at?: string }
type JobStatus = { job_id: string; status: 'pending' | 'processing' | 'done' | 'failed'; result_id?: string }
type ApiError = { error: string; code: string }
type Routine = { id: string; name: string; move_sequence: string[]; created_at?: string; updated_at?: string | null }
type RoutinePreview = { id: string; name: string; moves: { id: string; keypoints: Keypoint[][]; duration_ms: number }[]; total_duration_ms: number }
```

### Styling
- Use shadcn/ui components for all UI.
- Dark theme as default (togglable). Game-like, energetic aesthetic.
- Use Tailwind utility classes for layout and spacing.
- Score display color coding: Perfect = green, Good = blue, OK = yellow, Miss = red.
