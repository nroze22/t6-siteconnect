import { create } from "zustand";
import type { AppStatus, LlmStatus, NavigationPage } from "@/types";

interface AppStore {
  // Navigation
  currentPage: NavigationPage;
  setCurrentPage: (page: NavigationPage) => void;

  // App status
  status: AppStatus;
  setStatus: (status: Partial<AppStatus>) => void;
  setLlmStatus: (status: LlmStatus, model?: string | null) => void;

  // Session
  isLocked: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  currentPage: "screening",
  setCurrentPage: (page) => set({ currentPage: page }),

  status: {
    llmStatus: "not_configured",
    llmModel: null,
    databaseReady: false,
    patientCount: 0,
    studyCount: 0,
    lastImport: null,
  },
  setStatus: (partial) =>
    set((state) => ({ status: { ...state.status, ...partial } })),
  setLlmStatus: (llmStatus, llmModel) =>
    set((state) => ({
      status: { ...state.status, llmStatus, llmModel: llmModel ?? state.status.llmModel },
    })),

  isLocked: false,
  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),
}));
