# Backend Agent
## AI-Powered Just Dance — FastAPI + Celery

Refer to the root PRD.md and CLAUDE.md for full product context and project-wide rules. This file covers backend-specific conventions.

---

## Stack
- Python 3.11+, FastAPI, Celery, Redis, MongoDB (motor async / pymongo sync)
- OpenCV, MediaPipe — server-side pose extraction only
- librosa — BPM and beat detection from audio and video files
- Google GenAI SDK — Gemini feedback generation
- pydantic-settings — all environment config
- No authentication currently — all routes use `DEV_USER_ID = "dev-user"`. Auth0 JWT validation is in `app/auth.py` but not wired up.

---

## File Structure
```
backend/
├── app/
│   ├── main.py               # FastAPI app, CORS, global exception handler, request logging middleware
│   ├── config.py             # pydantic-settings Settings class; single source of env vars
│   ├── auth.py               # Auth0 JWT validation (currently unused — kept for future use)
│   ├── db.py                 # Motor (async) + pymongo (sync) clients, collection accessors
│   ├── worker.py             # Celery app definition (broker=redis)
│   ├── routers/
│   │   ├── videos.py         # POST /api/videos/upload
│   │   ├── jobs.py           # GET /api/jobs/{job_id}
│   │   ├── choreography.py   # generate (video+audio), regenerate, preview
│   │   ├── feedback.py       # POST /api/feedback/analyze
│   │   └── users.py          # GET /api/users/history
│   ├── tasks/
│   │   ├── ingest.py         # Celery task: download video → extract moves → save to Mongo
│   │   └── feedback.py       # Celery task: compare keypoints → call Gemini → save feedback
│   ├── services/
│   │   ├── cv.py             # OpenCV + MediaPipe keypoint extraction (33 landmarks per frame)
│   │   ├── audio.py          # librosa BPM detection (supports audio + video file extensions)
│   │   ├── storage.py        # GCS upload + download helpers (uses GCS_PROJECT_ID)
│   │   ├── choreography.py   # Move pool sampling + sequence assembly
│   │   ├── scoring.py        # Cosine similarity, normalize keypoints, grade tier logic
│   │   └── gemini.py         # Prompt builder + Gemini 2.0 Flash API call
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
- For any operation involving Gemini or async video processing: enqueue a Celery task and return a `job_id` immediately. Never block the request.
- **Exception**: `/api/choreography/generate` extracts keypoints synchronously for video uploads since this is the primary user flow and needs immediate results.
- For lightweight reads (fetch choreography, fetch history): call services directly.
- All routes use `DEV_USER_ID = "dev-user"` as the user ID. No authentication middleware.
- All routers include structured logging via Python's `logging` module.

### Tasks
- Tasks live in `app/tasks/`. Each task downloads required assets from GCS, calls services, and writes results to MongoDB.
- Tasks use `pymongo` (sync). Do not use `motor` inside Celery tasks.
- Tasks update a job status document in MongoDB (`pending` → `processing` → `done` | `failed`).
- Gemini failures in the feedback task are logged but do not crash the job — the score is still saved without critiques.

### Services
- Services are stateless functions. No FastAPI or Celery imports inside service files.
- `cv.py`: takes a local file path, returns a list of keypoint frame arrays. Shape: `list[list[dict]]` where each dict is `{x, y, z, visibility}`. Uses MediaPipe Pose with 33 landmarks.
- `audio.py`: detects BPM from audio or video files. Determines file type from filename/content_type via `_guess_suffix()` and uses the appropriate suffix for the temp file so librosa can decode it.
- `scoring.py`: normalizes keypoints to a unit bounding box, computes cosine similarity per frame, returns grade tier and similarity score.
- `gemini.py`: converts keypoint deltas to human-readable joint names, builds a structured prompt, calls Gemini 2.0 Flash. Returns a list of `{timestamp_ms, text}` critique dicts. Never passes raw keypoint arrays to Gemini.
- `storage.py`: uses `gcs.Client(project=settings.GCS_PROJECT_ID)` for all GCS operations. Provides `upload_bytes()` (async) and `download_to_temp()` (sync) helpers.

### Error Handling & Logging
- Global exception handler in `main.py` catches unhandled errors and returns `{"error": "...", "code": "INTERNAL_ERROR"}`.
- Request logging middleware logs method, path, and status code for every request.
- All routers log at INFO level for normal operations and WARNING/ERROR for failures.
- Celery tasks log progress at each step and include `exc_info=True` on errors.

---

## Choreography Generation Flow

The `/api/choreography/generate` endpoint handles two file types differently:

**Video uploads** (MP4, MOV, WebM):
1. Upload file to GCS
2. Detect BPM via librosa
3. Extract real pose keypoints from the video using MediaPipe
4. Filter out empty frames (frames where no person was detected)
5. Store as a move document in MongoDB with `genre_tags: ["uploaded"]`
6. Create choreography referencing that single move

**Audio uploads** (MP3, WAV, OGG, FLAC, etc.):
1. Upload file to GCS
2. Detect BPM via librosa
3. Sample existing moves from MongoDB pool matching BPM range and difficulty
4. Create choreography referencing the sampled moves

---

## Pose Comparison Rules
- Normalize keypoints to a unit bounding box before any comparison (scale/position invariant).
- Similarity metric: cosine similarity on the flattened normalized keypoint vector.
- Grade tiers (read from `settings.SCORE_THRESHOLDS`):
  - Perfect ≥ 0.92, Good ≥ 0.85, OK ≥ 0.70, Miss < 0.70
- Only send Miss and OK frames to Gemini. Skip Perfect and Good to control API cost.
- Limit to 20 frames per Gemini call to avoid excessive API usage.
- Enforce Gemini daily limit (`settings.GEMINI_DAILY_LIMIT`, default 10) per user via a counter in Redis.

---

## Video Upload Rules
- Max size: `settings.MAX_UPLOAD_SIZE_MB` (default 100). Enforce in the FastAPI handler with an explicit size check before saving.
- Accepted video MIME types: `video/mp4`, `video/quicktime`, `video/webm`. Reject others with 400.
- Save to GCS immediately on upload. Store only the URI in MongoDB — never raw bytes.

---

## Config / Secrets
All config via `pydantic-settings`. Required env vars:
```
MONGO_URI              # Default: mongodb://localhost:27017
MONGO_DB_NAME          # Default: justdance
REDIS_URL              # Default: redis://localhost:6379/0
GCS_PROJECT_ID         # Google Cloud project ID (required)
GCS_BUCKET_NAME        # GCS bucket name (required)
GOOGLE_API_KEY         # Gemini API key (required)
SCORE_THRESHOLDS       # JSON string: {"perfect": 0.92, "good": 0.85, "ok": 0.70}
MAX_UPLOAD_SIZE_MB     # Default: 100
GEMINI_DAILY_LIMIT     # Default: 10
ALLOWED_ORIGINS        # Default: http://localhost:3000
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
