# Backend Agent
## AI-Powered Just Dance — FastAPI + Celery

Refer to the root PRD.md and CLAUDE.md for full product context and project-wide rules. This file covers backend-specific conventions.

---

## Stack
- Python 3.11+, FastAPI, Celery, Redis, MongoDB (motor async / pymongo sync)
- OpenCV, MediaPipe — server-side pose extraction only
- librosa — BPM and beat detection from audio
- Google GenAI SDK — Gemini feedback generation
- pydantic-settings — all environment config
- Auth0 — JWT validation via FastAPI middleware

---

## File Structure
```
backend/
├── app/
│   ├── main.py               # FastAPI app init, CORS, auth middleware, router registration
│   ├── config.py             # pydantic-settings Settings class; single source of env vars
│   ├── db.py                 # Motor client, collection accessors
│   ├── worker.py             # Celery app definition (broker=redis)
│   ├── routers/
│   │   ├── videos.py         # POST /api/videos/upload
│   │   ├── jobs.py           # GET /api/jobs/{job_id}
│   │   ├── choreography.py   # generate, regenerate, preview
│   │   ├── feedback.py       # POST /api/feedback/analyze
│   │   └── users.py          # GET /api/users/history
│   ├── tasks/
│   │   ├── ingest.py         # Celery task: download video → extract moves → save to Mongo
│   │   └── feedback.py       # Celery task: compare keypoints → call Gemini → save feedback
│   ├── services/
│   │   ├── cv.py             # OpenCV + MediaPipe keypoint extraction helpers
│   │   ├── audio.py          # librosa BPM detection
│   │   ├── storage.py        # GCS/S3 upload + download helpers
│   │   ├── choreography.py   # Move pool sampling + sequence assembly
│   │   ├── scoring.py        # Cosine similarity, normalize keypoints, grade tier logic
│   │   └── gemini.py         # Prompt builder + Gemini API call
│   └── models/
│       ├── move.py
│       ├── choreography.py
│       └── feedback.py
├── requirements.txt
└── Dockerfile
```

---

## Architecture Rules

### Routers
- Routers validate input with Pydantic and return responses. No business logic.
- For any operation involving video processing or Gemini: enqueue a Celery task and return a `job_id` immediately. Never block the request.
- For lightweight reads (fetch choreography, fetch history): call services directly.

### Tasks
- Tasks live in `app/tasks/`. Each task downloads required assets from GCS/S3, calls services, and writes results to MongoDB.
- Tasks use `pymongo` (sync). Do not use `motor` inside Celery tasks.
- Tasks update a job status document in MongoDB (`pending` → `processing` → `done` | `failed`).

### Services
- Services are stateless functions. No FastAPI or Celery imports inside service files.
- `cv.py`: takes a local file path, returns a list of keypoint frame arrays. Shape: `list[list[dict]]` where each dict is `{x, y, z, visibility}`.
- `scoring.py`: normalizes keypoints to a unit bounding box, computes cosine similarity per frame, returns grade tier and similarity score.
- `gemini.py`: accepts a list of `{timestamp_ms, joint_deltas: {joint_name: {expected, actual}}}` dicts, returns a list of `{timestamp_ms, text}` critique dicts. Never passes raw keypoint arrays to Gemini.

### Auth
- Auth0 JWT validation is a single FastAPI `Depends` middleware applied globally in `main.py`.
- `/api/health` is excluded from auth.
- The decoded JWT subject (`sub`) is the `user_id` used in all Mongo documents.

---

## Pose Comparison Rules
- Normalize keypoints to a unit bounding box before any comparison (scale/position invariant).
- Similarity metric: cosine similarity on the flattened normalized keypoint vector.
- Grade tiers (read from `settings.SCORE_THRESHOLDS`):
  - Perfect ≥ 0.92, Good ≥ 0.85, OK ≥ 0.70, Miss < 0.70
- Only send Miss and OK frames to Gemini. Skip Perfect and Good to control API cost.
- Enforce Gemini daily limit (`settings.GEMINI_DAILY_LIMIT`, default 10) per user via a counter in Redis.

---

## Video Upload Rules
- Max size: `settings.MAX_UPLOAD_SIZE_MB` (default 100). Enforce in the FastAPI handler with an explicit size check before saving.
- Accepted MIME types: `video/mp4`, `video/quicktime`, `video/webm`. Reject others with 400.
- Save to GCS/S3 immediately on upload. Store only the URI in MongoDB — never raw bytes.

---

## Config / Secrets
All config via `pydantic-settings`. Required env vars:
```
MONGO_URI
REDIS_URL
GCS_BUCKET_NAME
GOOGLE_API_KEY
AUTH0_DOMAIN
AUTH0_AUDIENCE
SCORE_THRESHOLDS       # JSON string: {"perfect": 0.92, "good": 0.85, "ok": 0.70}
MAX_UPLOAD_SIZE_MB     # Default: 100
GEMINI_DAILY_LIMIT     # Default: 10
```
No env var may have a hardcoded default that is a real secret.

---

## Setup
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
celery -A app.worker worker --loglevel=info
```
