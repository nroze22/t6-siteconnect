import { create } from "zustand";
import type { AppStatus, LlmStatus, LlmBackend, NavigationPage } from "@/types";

type Theme = "dark" | "light";

interface AppStore {
  // Navigation
  currentPage: NavigationPage;
  setCurrentPage: (page: NavigationPage) => void;

  // App status
  status: AppStatus;
  setStatus: (status: Partial<AppStatus>) => void;
  setLlmStatus: (status: LlmStatus, model?: string | null, backend?: LlmBackend) => void;

  // Session
  isLocked: boolean;
  lock: () => void;
  unlock: () => void;

  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function applyThemeClass(theme: Theme) {
  if (theme === "light") {
    document.documentElement.classList.add("light");
  } else {
    document.documentElement.classList.remove("light");
  }
}

export const useAppStore = create<AppStore>((set, get) => ({
  currentPage: "dashboard",
  setCurrentPage: (page) => set({ currentPage: page }),

  status: {
    llmStatus: "not_configured",
    llmModel: null,
    llmBackend: "none",
    databaseReady: false,
    patientCount: 0,
    studyCount: 0,
    lastImport: null,
  },
  setStatus: (partial) =>
    set((state) => ({ status: { ...state.status, ...partial } })),
  setLlmStatus: (llmStatus, llmModel, llmBackend) =>
    set((state) => ({
      status: {
        ...state.status,
        llmStatus,
        llmModel: llmModel ?? state.status.llmModel,
        llmBackend: llmBackend ?? state.status.llmBackend,
      },
    })),

  isLocked: false,
  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),

  theme: (localStorage.getItem("siteconnect-theme") as Theme) ?? "dark",
  setTheme: (theme) => {
    localStorage.setItem("siteconnect-theme", theme);
    applyThemeClass(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem("siteconnect-theme", next);
    applyThemeClass(next);
    set({ theme: next });
  },
}));
