import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./use-app-store";

describe("useAppStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.setState({
      currentPage: "screening",
      isLocked: false,
      theme: "dark",
      status: {
        llmStatus: "not_configured",
        llmModel: null,
        llmBackend: "none",
        databaseReady: false,
        patientCount: 0,
        studyCount: 0,
        lastImport: null,
      },
    });
    localStorage.clear();
  });

  // TC-UI-001: Navigation state management
  describe("navigation", () => {
    it("defaults to screening page", () => {
      expect(useAppStore.getState().currentPage).toBe("screening");
    });

    it("navigates to a different page", () => {
      useAppStore.getState().setCurrentPage("analytics");
      expect(useAppStore.getState().currentPage).toBe("analytics");
    });

    it("navigates through all pages", () => {
      const pages = [
        "screening",
        "import",
        "trials",
        "review",
        "analytics",
        "pipeline",
        "performance",
        "cohort",
        "intelligence",
        "settings",
      ] as const;

      for (const page of pages) {
        useAppStore.getState().setCurrentPage(page);
        expect(useAppStore.getState().currentPage).toBe(page);
      }
    });
  });

  // TC-SEC-001: Session lock/unlock
  describe("session lock", () => {
    it("starts unlocked", () => {
      expect(useAppStore.getState().isLocked).toBe(false);
    });

    it("locks the session", () => {
      useAppStore.getState().lock();
      expect(useAppStore.getState().isLocked).toBe(true);
    });

    it("unlocks the session", () => {
      useAppStore.getState().lock();
      useAppStore.getState().unlock();
      expect(useAppStore.getState().isLocked).toBe(false);
    });
  });

  // TC-UI-002: Theme management
  describe("theme", () => {
    it("defaults to dark theme", () => {
      expect(useAppStore.getState().theme).toBe("dark");
    });

    it("sets theme to light", () => {
      useAppStore.getState().setTheme("light");
      expect(useAppStore.getState().theme).toBe("light");
    });

    it("persists theme to localStorage", () => {
      useAppStore.getState().setTheme("light");
      expect(localStorage.getItem("siteconnect-theme")).toBe("light");
    });

    it("toggles theme from dark to light", () => {
      useAppStore.getState().toggleTheme();
      expect(useAppStore.getState().theme).toBe("light");
    });

    it("toggles theme from light to dark", () => {
      useAppStore.getState().setTheme("light");
      useAppStore.getState().toggleTheme();
      expect(useAppStore.getState().theme).toBe("dark");
    });

    it("applies light class to document", () => {
      useAppStore.getState().setTheme("light");
      expect(document.documentElement.classList.contains("light")).toBe(true);
    });

    it("removes light class when switching to dark", () => {
      useAppStore.getState().setTheme("light");
      useAppStore.getState().setTheme("dark");
      expect(document.documentElement.classList.contains("light")).toBe(false);
    });
  });

  // TC-UI-003: App status management
  describe("status", () => {
    it("has correct initial status", () => {
      const status = useAppStore.getState().status;
      expect(status.llmStatus).toBe("not_configured");
      expect(status.databaseReady).toBe(false);
      expect(status.patientCount).toBe(0);
      expect(status.studyCount).toBe(0);
      expect(status.lastImport).toBeNull();
    });

    it("partially updates status", () => {
      useAppStore.getState().setStatus({ patientCount: 42, databaseReady: true });
      const status = useAppStore.getState().status;
      expect(status.patientCount).toBe(42);
      expect(status.databaseReady).toBe(true);
      // Other fields unchanged
      expect(status.llmStatus).toBe("not_configured");
    });

    it("sets LLM status with model", () => {
      useAppStore.getState().setLlmStatus("running", "BioMistral-7B");
      const status = useAppStore.getState().status;
      expect(status.llmStatus).toBe("running");
      expect(status.llmModel).toBe("BioMistral-7B");
    });

    it("preserves existing model when not provided", () => {
      useAppStore.getState().setLlmStatus("running", "BioMistral-7B");
      useAppStore.getState().setLlmStatus("error");
      expect(useAppStore.getState().status.llmModel).toBe("BioMistral-7B");
    });
  });
});
