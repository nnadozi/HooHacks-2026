import { create } from "zustand";

import type { Choreography, FeedbackResult } from "@/types";

type RecordingState = "idle" | "recording" | "stopped";

interface AppStore {
  currentChoreography: Choreography | null;
  activeJobId: string | null;
  sessionScore: number | null;
  feedbackResult: FeedbackResult | null;
  recordingState: RecordingState;

  setChoreography: (choreo: Choreography | null) => void;
  setActiveJob: (jobId: string | null) => void;
  setScore: (score: number | null) => void;
  setFeedbackResult: (result: FeedbackResult | null) => void;
  setRecordingState: (state: RecordingState) => void;
  reset: () => void;
}

const initialState = {
  currentChoreography: null,
  activeJobId: null,
  sessionScore: null,
  feedbackResult: null,
  recordingState: "idle" as RecordingState,
};

export const useAppStore = create<AppStore>((set) => ({
  ...initialState,

  setChoreography: (choreo) => set({ currentChoreography: choreo }),
  setActiveJob: (jobId) => set({ activeJobId: jobId }),
  setScore: (score) => set({ sessionScore: score }),
  setFeedbackResult: (result) => set({ feedbackResult: result }),
  setRecordingState: (state) => set({ recordingState: state }),
  reset: () => set(initialState),
}));
