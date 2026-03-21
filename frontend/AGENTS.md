# Frontend Agent
## AI-Powered Just Dance — Next.js + TypeScript

Refer to the root PRD.md and CLAUDE.md for full product context and project-wide rules. This file covers frontend-specific conventions.

---

## Stack
- Next.js 15, App Router, TypeScript (strict mode)
- shadcn/ui — all UI components (https://ui.shadcn.com/blocks)
- Zustand — client-side state
- TanStack Query (React Query) — server state, API caching, polling
- HTML5 Canvas API — skeleton overlay rendering
- getUserMedia / MediaRecorder — in-browser video recording
- No authentication currently — requests sent without auth headers

---

## File Structure
```
frontend/
├── src/
│   ├── app/                      # Next.js 15 App Router pages
│   │   ├── layout.tsx            # Root layout with Providers wrapper
│   │   ├── page.tsx              # Landing / upload (accepts audio + video files)
│   │   ├── choreography/
│   │   │   └── [id]/page.tsx     # Skeleton preview + play/pause + record button
│   │   └── feedback/
│   │       └── [id]/page.tsx     # Recording, upload, score, critique display
│   ├── components/
│   │   ├── SkeletonCanvas.tsx    # Canvas-based skeleton animation renderer (MediaPipe connections)
│   │   ├── Recorder.tsx          # getUserMedia + MediaRecorder recording UI
│   │   ├── FeedbackPanel.tsx     # Timestamped critique list
│   │   ├── ScoreDisplay.tsx      # Grade breakdown + aggregate score
│   │   └── providers.tsx         # QueryClientProvider wrapper (no Auth0)
│   ├── store/
│   │   └── index.ts              # Zustand store
│   ├── hooks/
│   │   ├── useJobPoller.ts       # React Query hook: polls GET /api/jobs/{job_id}
│   │   └── useRecorder.ts        # getUserMedia + MediaRecorder lifecycle hook
│   ├── lib/
│   │   └── api.ts                # All fetch calls — typed, centralized, no auth
│   └── types/
│       └── index.ts              # Shared TypeScript types
├── package.json
└── Dockerfile
```

---

## Architecture Rules

### API Calls
- All API calls go through `src/lib/api.ts`. No inline `fetch` or `axios` calls in components or hooks.
- No auth token attached — requests are sent without authorization headers.
- `api.ts` uses a central `apiFetch` helper that prepends `NEXT_PUBLIC_API_URL` and handles error responses.
- API functions return typed responses matching the data models in `src/types/index.ts`.

### State Management
- **Zustand** (`src/store/index.ts`) owns client state: current choreography, recording state, session score, active job ID.
- **TanStack Query** owns all server state: fetching choreography previews, polling job status, fetching feedback results, fetching user history.
- Do not duplicate server data in Zustand. If it comes from the API, it lives in React Query's cache.

### Skeleton Rendering
- All skeleton animation is rendered on `<canvas>` inside `SkeletonCanvas.tsx`.
- The component accepts a `frames: Keypoint[][]` prop (array of keypoint frames) and an `fps` prop.
- Uses MediaPipe connection pairs to draw anatomically correct skeleton bones (33 landmarks).
- Use `requestAnimationFrame` for the animation loop. Do not use `setInterval`.
- Draw bones as lines between connected joint pairs (cyan). Draw joints as filled circles (rose).
- No third-party canvas/animation libraries — use the Canvas API directly.

### Recording
- `Recorder.tsx` uses `getUserMedia` to access the webcam and `MediaRecorder` to capture video.
- On stop, produce a `Blob` in `video/webm` format and pass it up via an `onRecordingComplete(blob: Blob)` callback.
- `useRecorder.ts` encapsulates the `getUserMedia` / `MediaRecorder` lifecycle.
- Do not use any third-party recording libraries.

### Job Polling
- After any video upload, store the returned `job_id` in Zustand.
- `useJobPoller` polls `GET /api/jobs/{job_id}` every 2 seconds using React Query's `refetchInterval`.
- Stop polling when status is `done` or `failed`.

### Upload
- The landing page accepts both audio and video files: `audio/*,video/mp4,video/quicktime,video/webm`.
- Users can drag-and-drop or click to select files.
- Difficulty selector offers easy/medium/hard options.

---

## TypeScript Types
All shared types in `src/types/index.ts`:

```ts
type Keypoint = { x: number; y: number; z: number; visibility: number }

type Move = {
  id: string
  keypoints: Keypoint[][]
  duration_ms: number
}

type Choreography = {
  id: string
  song_uri: string
  bpm: number
  difficulty: string
  seed: number
  move_sequence: string[]
}

type GradeTier = 'perfect' | 'good' | 'ok' | 'miss'

type Critique = { timestamp_ms: number; text: string }

type FeedbackResult = {
  id: string
  choreography_id: string
  score: number
  grade_breakdown: Record<GradeTier, number>
  critiques: Critique[]
}

type JobStatus = {
  job_id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  result_id?: string
}

type ApiError = {
  error: string
  code: string
}
```

---

## Styling
- Use shadcn/ui components for all UI. Reference: https://ui.shadcn.com/blocks
- Dark theme as default. Game-like, energetic aesthetic.
- Do not write custom CSS for anything shadcn/ui already covers.
- Use Tailwind utility classes for layout and spacing.
- Score display color coding: Perfect = green, Good = blue, OK = yellow, Miss = red.

---

## Setup
```bash
npm install
npm run dev       # Dev server on :3000
npm run build     # Production build
npm run typecheck # tsc --noEmit — run before considering any feature complete
```

TypeScript must compile with zero errors before any feature is considered done. Run `npm run typecheck` after every significant change.
