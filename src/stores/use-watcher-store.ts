import { create } from "zustand";
import type { FileDetectedEvent } from "@/lib/tauri";

export interface DetectedFile {
  path: string;
  fileName: string;
  sizeBytes: number;
  detectedAt: number;
  previewStatus: "pending" | "loading" | "ready" | "error";
  dismissed: boolean;
}

interface WatcherStore {
  detectedFiles: DetectedFile[];
  unreadCount: number;
  addDetectedFile: (event: FileDetectedEvent) => void;
  dismissFile: (path: string) => void;
  dismissAll: () => void;
  setPreviewStatus: (path: string, status: DetectedFile["previewStatus"]) => void;
  markAllRead: () => void;
}

export const useWatcherStore = create<WatcherStore>((set) => ({
  detectedFiles: [],
  unreadCount: 0,

  addDetectedFile: (event) =>
    set((state) => {
      // Deduplicate by path
      if (state.detectedFiles.some((f) => f.path === event.path)) return state;
      const file: DetectedFile = {
        path: event.path,
        fileName: event.file_name,
        sizeBytes: event.size_bytes,
        detectedAt: Date.now(),
        previewStatus: "pending",
        dismissed: false,
      };
      const updated = [file, ...state.detectedFiles].slice(0, 50);
      return {
        detectedFiles: updated,
        unreadCount: state.unreadCount + 1,
      };
    }),

  dismissFile: (path) =>
    set((state) => ({
      detectedFiles: state.detectedFiles.map((f) =>
        f.path === path ? { ...f, dismissed: true } : f
      ),
    })),

  dismissAll: () =>
    set((state) => ({
      detectedFiles: state.detectedFiles.map((f) => ({ ...f, dismissed: true })),
    })),

  setPreviewStatus: (path, status) =>
    set((state) => ({
      detectedFiles: state.detectedFiles.map((f) =>
        f.path === path ? { ...f, previewStatus: status } : f
      ),
    })),

  markAllRead: () => set({ unreadCount: 0 }),
}));
