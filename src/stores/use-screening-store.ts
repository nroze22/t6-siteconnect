import { create } from "zustand";
import type {
  PatientSummary,
  ScreeningResult,
  CriterionResult,
  ScreeningStatus,
  ReviewStatus,
} from "@/types";
import { usePipelineStore } from "./use-pipeline-store";
import type { PipelinePatient } from "./use-pipeline-store";

type StatusFilter = ScreeningStatus | "all";

const STORAGE_KEY = "siteconnect-screening";

const STUDY_NAMES: Record<string, string> = {
  "study-1": "KEYNOTE-789",
  "study-2": "DELIVER",
  "study-3": "STEP-5",
  "study-4": "Lecanemab AD",
  "study-5": "Risankizumab CD",
  "study-6": "Dupilumab AD",
};

const STAFF = ["Sarah Chen, CRC", "James Wright, CRC", "Maria Lopez, CRC", "Kevin Park, RN"];

// ============================================================
// Serialization helpers for Map<string, T>
// ============================================================

interface PersistedScreeningData {
  patients: PatientSummary[];
  screeningResults: [string, ScreeningResult][];
  criteriaResults: [string, CriterionResult[]][];
  selectedStudyId: string | null;
}

function persistToStorage(state: {
  patients: PatientSummary[];
  screeningResults: Map<string, ScreeningResult>;
  criteriaResults: Map<string, CriterionResult[]>;
  selectedStudyId: string | null;
}) {
  try {
    const data: PersistedScreeningData = {
      patients: state.patients,
      screeningResults: Array.from(state.screeningResults.entries()),
      criteriaResults: Array.from(state.criteriaResults.entries()),
      selectedStudyId: state.selectedStudyId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable
  }
}

function loadFromStorage(): Partial<{
  patients: PatientSummary[];
  screeningResults: Map<string, ScreeningResult>;
  criteriaResults: Map<string, CriterionResult[]>;
  selectedStudyId: string | null;
}> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: PersistedScreeningData = JSON.parse(raw);
    return {
      patients: data.patients,
      screeningResults: new Map(data.screeningResults),
      criteriaResults: new Map(data.criteriaResults),
      selectedStudyId: data.selectedStudyId,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Store
// ============================================================

interface ScreeningStore {
  // Selection
  selectedPatientId: string | null;
  selectedStudyId: string | null;
  selectedCriterionId: string | null;

  // Data
  patients: PatientSummary[];
  screeningResults: Map<string, ScreeningResult>;
  criteriaResults: Map<string, CriterionResult[]>;

  // Filters
  statusFilter: StatusFilter;
  scoreRange: [number, number];
  searchQuery: string;

  // Highlighting (right panel)
  highlightedTab: string | null;
  highlightedRecordIds: string[];

  // UI state
  isStudyDetailOpen: boolean;
  isOverrideModalOpen: boolean;
  overrideCriterionId: string | null;

  // Actions
  selectPatient: (id: string | null) => void;
  selectStudy: (id: string) => void;
  selectCriterion: (id: string | null) => void;

  setPatients: (patients: PatientSummary[]) => void;
  setScreeningResult: (patientId: string, result: ScreeningResult) => void;
  setCriteriaResults: (screeningResultId: string, results: CriterionResult[]) => void;

  setStatusFilter: (filter: StatusFilter) => void;
  setScoreRange: (range: [number, number]) => void;
  setSearchQuery: (query: string) => void;

  setHighlight: (tab: string, recordIds: string[]) => void;
  clearHighlights: () => void;

  setStudyDetailOpen: (open: boolean) => void;
  openOverrideModal: (criterionId: string) => void;
  closeOverrideModal: () => void;
  reviewPatient: (patientId: string, status: ReviewStatus) => void;

  // Persistence
  hydrateFromStorage: () => void;

  // Computed
  filteredPatients: () => PatientSummary[];
  statusCounts: () => Record<ScreeningStatus | "total", number>;
}

// Eagerly hydrate from localStorage (synchronous) so data is available before first render
const _hydrated = loadFromStorage();

export const useScreeningStore = create<ScreeningStore>((set, get) => ({
  selectedPatientId: null,
  selectedStudyId: _hydrated?.selectedStudyId ?? null,
  selectedCriterionId: null,

  patients: _hydrated?.patients ?? [],
  screeningResults: _hydrated?.screeningResults ?? new Map(),
  criteriaResults: _hydrated?.criteriaResults ?? new Map(),

  statusFilter: "all",
  scoreRange: [0, 100],
  searchQuery: "",

  highlightedTab: null,
  highlightedRecordIds: [],

  isStudyDetailOpen: false,
  isOverrideModalOpen: false,
  overrideCriterionId: null,

  selectPatient: (id) =>
    set({
      selectedPatientId: id,
      selectedCriterionId: null,
      highlightedTab: null,
      highlightedRecordIds: [],
    }),

  selectStudy: (id) => {
    set({ selectedStudyId: id });
    // Persist study selection
    const state = get();
    persistToStorage(state);
  },

  selectCriterion: (id) => set({ selectedCriterionId: id }),

  setPatients: (patients) => {
    set({ patients });
    const state = get();
    persistToStorage({ ...state, patients });
  },

  setScreeningResult: (patientId, result) =>
    set((state) => {
      const next = new Map(state.screeningResults);
      next.set(patientId, result);
      persistToStorage({ ...state, screeningResults: next });
      return { screeningResults: next };
    }),

  setCriteriaResults: (screeningResultId, results) =>
    set((state) => {
      const next = new Map(state.criteriaResults);
      next.set(screeningResultId, results);
      persistToStorage({ ...state, criteriaResults: next });
      return { criteriaResults: next };
    }),

  setStatusFilter: (filter) => set({ statusFilter: filter }),
  setScoreRange: (range) => set({ scoreRange: range }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  setHighlight: (tab, recordIds) =>
    set({ highlightedTab: tab, highlightedRecordIds: recordIds }),

  clearHighlights: () =>
    set({ highlightedTab: null, highlightedRecordIds: [] }),

  setStudyDetailOpen: (open) => set({ isStudyDetailOpen: open }),

  openOverrideModal: (criterionId) =>
    set({ isOverrideModalOpen: true, overrideCriterionId: criterionId }),

  closeOverrideModal: () =>
    set({ isOverrideModalOpen: false, overrideCriterionId: null }),

  reviewPatient: (patientId, status) =>
    set((state) => {
      const updated = state.patients.map((p) =>
        p.id === patientId ? { ...p, reviewStatus: status } : p,
      );
      // Also update the screening result review status
      const screening = state.screeningResults.get(patientId);
      const nextResults = new Map(state.screeningResults);
      if (screening) {
        nextResults.set(patientId, { ...screening, reviewStatus: status });
      }
      persistToStorage({ ...state, patients: updated, screeningResults: nextResults });

      // Sync with pipeline store
      const patient = state.patients.find((p) => p.id === patientId);
      if (patient && status === "accepted") {
        const studyId = state.selectedStudyId ?? "study-1";
        const pipelinePatient: PipelinePatient = {
          id: `pipe-${patientId}`,
          mrn: patient.sitePatientId,
          name: patient.sitePatientId,
          age: patient.age,
          gender: patient.gender,
          diagnosis: patient.primaryDiagnosis ?? "Unknown",
          stage: "identified",
          score: patient.score,
          studyId,
          studyName: STUDY_NAMES[studyId] ?? studyId,
          daysInStage: 0,
          lastContact: null,
          contactAttempts: 0,
          notes: "Accepted from screening review",
          nextAction: "Schedule initial outreach call",
          assignedTo: STAFF[Math.floor(Math.random() * STAFF.length)]!,
          addedAt: new Date().toISOString(),
        };
        usePipelineStore.getState().addPatient(pipelinePatient);
      } else if (patient && (status === "rejected" || status === "pending")) {
        // Remove from pipeline if rejecting or undoing
        usePipelineStore.getState().removePatient(`pipe-${patientId}`);
      }

      return { patients: updated, screeningResults: nextResults };
    }),

  hydrateFromStorage: () => {
    const stored = loadFromStorage();
    if (stored) {
      set(stored);
    }
  },

  filteredPatients: () => {
    const { patients, statusFilter, scoreRange, searchQuery } = get();
    return patients.filter((p) => {
      if (statusFilter !== "all" && p.overallStatus !== statusFilter) return false;
      if (p.score < scoreRange[0] || p.score > scoreRange[1]) return false;
      if (searchQuery && !p.sitePatientId.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    });
  },

  statusCounts: () => {
    const { patients } = get();
    const counts: Record<string, number> = {
      eligible: 0,
      potentially_eligible: 0,
      ineligible: 0,
      needs_review: 0,
      total: patients.length,
    };
    for (const p of patients) {
      counts[p.overallStatus] = (counts[p.overallStatus] ?? 0) + 1;
    }
    return counts as Record<ScreeningStatus | "total", number>;
  },
}));
