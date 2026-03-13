import { create } from "zustand";

export interface CachedSummary {
  text: string;
  isAi: boolean;
}

interface LlmQueueStore {
  // Cached AI results
  summaries: Record<string, CachedSummary>;
  rationales: Record<string, string>;

  // Queue state
  status: "idle" | "processing" | "paused" | "done";
  currentJobPatientId: string | null;
  totalJobs: number;
  completedJobs: number;
  priorityPatientId: string | null;

  // Actions
  setSummary: (patientId: string, summary: CachedSummary) => void;
  setRationale: (criterionId: string, rationale: string) => void;
  setPriorityPatient: (patientId: string | null) => void;
  setQueueStatus: (status: LlmQueueStore["status"]) => void;
  setCurrentJob: (patientId: string | null) => void;
  setProgress: (completed: number, total: number) => void;
  clearAll: () => void;
}

export const useLlmQueueStore = create<LlmQueueStore>((set) => ({
  summaries: {},
  rationales: {},
  status: "idle",
  currentJobPatientId: null,
  totalJobs: 0,
  completedJobs: 0,
  priorityPatientId: null,

  setSummary: (patientId, summary) =>
    set((s) => ({ summaries: { ...s.summaries, [patientId]: summary } })),

  setRationale: (criterionId, rationale) =>
    set((s) => ({ rationales: { ...s.rationales, [criterionId]: rationale } })),

  setPriorityPatient: (patientId) =>
    set({ priorityPatientId: patientId }),

  setQueueStatus: (status) =>
    set({ status }),

  setCurrentJob: (patientId) =>
    set({ currentJobPatientId: patientId }),

  setProgress: (completed, total) =>
    set({ completedJobs: completed, totalJobs: total }),

  clearAll: () =>
    set({
      summaries: {},
      rationales: {},
      status: "idle",
      currentJobPatientId: null,
      totalJobs: 0,
      completedJobs: 0,
    }),
}));
