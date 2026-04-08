import { create } from "zustand";
import type { WorkspaceMode } from "@/lib/workspace-modes";
import { WORKSPACE_MODES } from "@/lib/workspace-modes";

const STORAGE_KEY = "siteconnect-workspace-mode";

interface PersistedState {
  mode: WorkspaceMode;
  hasChosen: boolean;
}

function loadFromStorage(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: "admin", hasChosen: false };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const valid = WORKSPACE_MODES.some((m) => m.id === parsed.mode);
    return {
      mode: valid ? (parsed.mode as WorkspaceMode) : "admin",
      hasChosen: parsed.hasChosen === true,
    };
  } catch {
    return { mode: "admin", hasChosen: false };
  }
}

function saveToStorage(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be disabled — degrade silently.
  }
}

interface ModeStore {
  currentMode: WorkspaceMode;
  hasChosenMode: boolean;
  setMode: (mode: WorkspaceMode) => void;
  /** Dismiss the first-run picker without committing (defaults to admin). */
  skipModeSelection: () => void;
}

const initial = loadFromStorage();

export const useModeStore = create<ModeStore>((set) => ({
  currentMode: initial.mode,
  hasChosenMode: initial.hasChosen,
  setMode: (mode) => {
    saveToStorage({ mode, hasChosen: true });
    set({ currentMode: mode, hasChosenMode: true });
  },
  skipModeSelection: () => {
    saveToStorage({ mode: "admin", hasChosen: true });
    set({ currentMode: "admin", hasChosenMode: true });
  },
}));
