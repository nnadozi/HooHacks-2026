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

### Frontend (React)
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
│   │   ├── main.py               # FastAPI app, middleware, router registration
│   │   ├── config.py             # pydantic-settings config (all env vars)
│   │   ├── worker.py             # Celery app definition
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
│   │   │   ├── audio.py          # librosa BPM detection
│   │   │   ├── storage.py        # GCS/S3 upload/download helpers
│   │   │   ├── choreography.py   # Move sampling + sequence assembly
│   │   │   ├── scoring.py        # Cosine similarity, grade tier logic
│   │   │   └── gemini.py         # Gemini prompt builder + API call
│   │   ├── models/
│   │   │   ├── move.py           # Move Pydantic model
│   │   │   ├── choreography.py   # Choreography Pydantic model
│   │   │   └── feedback.py       # Feedback Pydantic model
│   │   └── db.py                 # MongoDB client + collection accessors
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/                  # Next.js app router or React routes
│   │   ├── components/
│   │   │   ├── SkeletonCanvas.tsx # HTML5 Canvas skeleton overlay renderer
│   │   │   ├── Recorder.tsx      # getUserMedia / MediaRecorder recording UI
│   │   │   ├── FeedbackPanel.tsx # Timestamped critique display
│   │   │   └── ScoreDisplay.tsx  # Perfect/Good/OK/Miss breakdown + aggregate score
│   │   ├── store/
│   │   │   └── index.ts          # Zustand store (choreography, feedback, session state)
│   │   ├── hooks/
│   │   │   └── useJobPoller.ts   # React Query hook for polling /api/jobs/{job_id}
│   │   ├── lib/
│   │   │   └── api.ts            # Typed API client functions
│   │   └── types/
│   │       └── index.ts          # Shared TypeScript types (Keypoint, Move, Feedback, etc.)
│   ├── AGENTS.md                 # Frontend-specific agent instructions
│   ├── package.json
│   └── Dockerfile
└── docker-compose.yml
```

---

## Code Style

### General
- Never hardcode secrets, API keys, DB URIs, or bucket names. All config via `pydantic-settings` on the backend and environment variables on the frontend.
- No raw video bytes in MongoDB. Store GCS/S3 URIs only.
- All heavy processing (CV pipeline, Gemini calls) runs in Celery tasks, never in FastAPI route handlers directly.

### Backend (Python)
- Python 3.11+. Use type hints everywhere.
- One router file per resource group (videos, jobs, choreography, feedback, users).
- Services are plain functions or classes — no business logic in routers or tasks.
- Tasks call services; routers enqueue tasks or call lightweight services.
- Use `motor` (async MongoDB driver) for all DB operations in the API. Use `pymongo` (sync) in Celery tasks.
- Validate all request bodies with Pydantic models. Never trust raw dicts from request payloads.
- Auth0 JWT validation happens once in middleware (`app/main.py`), not per-route.
- Video upload size enforced at the FastAPI handler level (100MB max).
- Accepted video formats: MP4, MOV, WebM — validate MIME type on upload.

### Frontend (TypeScript / React)
- TypeScript strict mode. No `any` types.
- Use shadcn/ui components for all UI. Reference: https://ui.shadcn.com/blocks
- Zustand for client-side state (current choreography, recording state, session score).
- TanStack Query (React Query) for all server state — fetching, caching, polling.
- Skeleton animation rendered exclusively on `<canvas>` via the `SkeletonCanvas` component.
- In-browser recording uses `getUserMedia` + `MediaRecorder`. Do not use third-party recording libraries.
- All API calls go through `src/lib/api.ts` — no inline `fetch` calls in components.

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
| POST | `/api/choreography/generate` | Generate choreography for a song (accepts `difficulty`, optional `seed`) |
| POST | `/api/choreography/{id}/regenerate` | Regenerate with new sample or same seed |
| GET | `/api/choreography/{id}/preview` | Fetch keypoint sequence for Canvas skeleton preview |
| POST | `/api/feedback/analyze` | Submit performance video against choreography; returns score + critiques |
| GET | `/api/users/history` | Fetch user's past sessions and scores |
| GET | `/api/health` | Health check — unauthenticated |

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
  "genre_tags": ["hiphop"],
  "source_video_uri": "gs://bucket/video.mp4",
  "created_at": "ISO8601"
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
  "user_id": "auth0|...",
  "created_at": "ISO8601"
}
```

### Feedback (MongoDB)
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

## Scoring & Pose Comparison

- Keypoints are normalized to a unit bounding box before comparison (scale/position invariant).
- Similarity metric: cosine similarity on the flattened normalized keypoint vector per frame.
- Grade tiers (configurable via env var `SCORE_THRESHOLDS`):
  - **Perfect**: ≥ 0.92
  - **Good**: ≥ 0.85
  - **OK**: ≥ 0.70
  - **Miss**: < 0.70
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
MONGO_URI
REDIS_URL
GCS_BUCKET_NAME (or AWS_S3_BUCKET_NAME)
GOOGLE_API_KEY           # Gemini
AUTH0_DOMAIN
AUTH0_AUDIENCE
SCORE_THRESHOLDS         # JSON: {"perfect": 0.92, "good": 0.85, "ok": 0.70}
MAX_UPLOAD_SIZE_MB       # Default: 100
GEMINI_DAILY_LIMIT       # Default: 10
ALLOWED_ORIGINS          # Comma-separated list of allowed CORS origins
```

---

## Constraints

- Max video upload: 100MB. Enforce in FastAPI `UploadFile` handler, not just client-side.
- Accepted video formats: MP4, MOV, WebM. Validate MIME type server-side.
- Choreography cache TTL: 1 hour in Redis, keyed by `{seed}:{difficulty}:{bpm}`.
- No business logic in route handlers — delegate to services or enqueue Celery tasks.
- Do not implement stretch goals (user-submitted move pool, real-time overlay, leaderboard) until core features are complete and tested.

---

## Error Response Contract

All API errors must return a consistent JSON shape:
```json
{ "error": "Human-readable message", "code": "SNAKE_CASE_ERROR_CODE" }
```
Example error codes: `UPLOAD_TOO_LARGE`, `INVALID_FORMAT`, `JOB_NOT_FOUND`, `GEMINI_LIMIT_EXCEEDED`, `UNAUTHORIZED`.
Never expose internal stack traces or raw exception messages in error responses.

---

## Frontend ↔ Backend Connection

- The frontend reads the backend URL from the `NEXT_PUBLIC_API_URL` environment variable.
- Default for local dev: `http://localhost:8000`.
- FastAPI must configure CORS middleware in `main.py` to allow `http://localhost:3000` in development and the production origin in production (read from `settings.ALLOWED_ORIGINS`).
- Add `ALLOWED_ORIGINS` to the environment variables list in `backend/app/config.py`.

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
2. **Choreography Generation** — BPM detection, move sampling, skeleton preview on Canvas
3. **Performance Feedback** — in-browser recording, pose comparison, scoring, Gemini critiques

Stretch goals (leaderboard, real-time overlay, user-submitted moves) come only after phase 3 is complete.
