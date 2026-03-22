# ReMix

AI-powered "Just Dance" style web application that generates dance choreographies from uploaded videos and provides feedback on your performance.

Upload a dance video, see the skeleton choreography preview, record yourself performing it, and get AI-powered feedback on your moves.

## Features

- **Choreography Extraction** — Upload a dance video and the app extracts pose keypoints using MediaPipe, creating a skeleton choreography
- **Skeleton Preview** — View the extracted choreography as an animated skeleton overlay on an HTML5 Canvas
- **Routine Editor** — Build custom routines by dragging stored moves into a timeline (Premiere-style bin + timeline + stick-figure preview)
- **In-Browser Recording** — Record your performance directly in the browser using your webcam
- **AI Feedback** — Get timestamped critiques from Google Gemini on frames where your pose differs from the reference
- **Scoring** — Per-frame grading (Perfect/Good/OK/Miss) with an aggregate score

## Tech Stack

**Backend:** Python 3.11+, FastAPI, Celery, Redis, MongoDB, OpenCV, MediaPipe, librosa, Google Gemini

**Frontend:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Zustand, TanStack Query

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **MongoDB** — `brew install mongodb/brew/mongodb-community`
- **Redis** — `brew install redis`
- **ffmpeg** — `brew install ffmpeg` (required by librosa for audio extraction)
- **Google Cloud account** — for Cloud Storage and Gemini API
- **gcloud CLI** — `brew install google-cloud-sdk`

## Setup

### 1. Clone the repo

```bash
git clone <repo-url>
cd HooHacks-2026
```

### 2. Start MongoDB and Redis

```bash
brew services start mongodb/brew/mongodb-community
brew services start redis
```

### 3. Google Cloud setup

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project <your-project-id>
```

Create a Cloud Storage bucket in the [Google Cloud Console](https://console.cloud.google.com/storage/browser).

Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

### 4. Backend

```bash
cd backend
cp .env.example .env
```

Fill in `backend/.env`:
```
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=justdance
REDIS_URL=redis://localhost:6379/0
GCS_PROJECT_ID=<your-gcp-project-id>
GCS_BUCKET_NAME=<your-bucket-name>
GOOGLE_API_KEY=<your-gemini-api-key>
SCORE_THRESHOLDS={"perfect": 0.92, "good": 0.85, "ok": 0.70}
MAX_UPLOAD_SIZE_MB=100
GEMINI_DAILY_LIMIT=10
ALLOWED_ORIGINS=http://localhost:3000
```

Install and run:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```
python -m celery -A app.worker worker --loglevel=info

### 5. Frontend

```bash
cd frontend
cp .env.local.example .env.local
```

Fill in `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Install and run:
```bash
npm install
npm run dev
```

### 6. Open the app

Go to [http://localhost:3000](http://localhost:3000)

## Usage

1. **Upload a dance video** (MP4, MOV, or WebM) on the landing page
2. **Select difficulty** and click "Generate Choreography"
3. **Preview** the skeleton animation — click Play to see the extracted poses
4. **Record your performance** using your webcam or upload a video
5. **View your score** and AI-generated feedback on where to improve

### Routine Editor

- Open `http://localhost:3000/editor`
- Drag moves from the **Move Bin** into the **Timeline**, then click **Play** to preview the full routine.
- If the move bin is empty, generate a choreography from a video first (this seeds the move pool in MongoDB).

## Running with Docker (alternative)

```bash
docker compose up --build
```

This starts all services: API (port 8000), Celery worker, Redis (port 6379), and MongoDB (port 27017).

You still need to run the frontend separately:
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, error handling, logging
│   │   ├── config.py          # pydantic-settings config
│   │   ├── db.py              # MongoDB clients (async + sync)
│   │   ├── worker.py          # Celery app
│   │   ├── routers/           # API endpoints
│   │   ├── services/          # CV, audio, storage, scoring, Gemini
│   │   ├── tasks/             # Celery tasks (ingest, feedback)
│   │   └── models/            # Pydantic models
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/               # Next.js pages
│   │   ├── components/        # SkeletonCanvas, Recorder, ScoreDisplay, etc.
│   │   ├── hooks/             # useJobPoller, useRecorder
│   │   ├── lib/api.ts         # Typed API client
│   │   ├── store/             # Zustand store
│   │   └── types/             # TypeScript types
│   └── package.json
└── docker-compose.yml
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/videos/upload` | Upload a reference video |
| GET | `/api/jobs/{job_id}` | Poll job status |
| POST | `/api/choreography/generate` | Generate choreography from song/video |
| POST | `/api/choreography/{id}/regenerate` | Regenerate choreography |
| GET | `/api/choreography/{id}/preview` | Get keypoints for skeleton preview |
| POST | `/api/feedback/analyze` | Analyze performance video |
| GET | `/api/users/history` | Get past session scores |
| GET | `/api/health` | Health check |

## Sources
Humanoid 3D Model: https://sketchfab.com/3d-models/low-poly-stick-figure-rigged-47e49c8f24d14fb7a3d477640e3d0cf2

## Built With

Built at HooHacks 2026.
