import { create } from "zustand";
import type {
  PatientSummary,
  ScreeningResult,
  CriterionResult,
  ScreeningStatus,
  ReviewStatus,
} from "@/types";

type StatusFilter = ScreeningStatus | "all";

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

  // Computed
  filteredPatients: () => PatientSummary[];
  statusCounts: () => Record<ScreeningStatus | "total", number>;
}

export const useScreeningStore = create<ScreeningStore>((set, get) => ({
  selectedPatientId: null,
  selectedStudyId: null,
  selectedCriterionId: null,

  patients: [],
  screeningResults: new Map(),
  criteriaResults: new Map(),

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

  selectStudy: (id) => set({ selectedStudyId: id }),

  selectCriterion: (id) => set({ selectedCriterionId: id }),

  setPatients: (patients) => set({ patients }),

  setScreeningResult: (patientId, result) =>
    set((state) => {
      const next = new Map(state.screeningResults);
      next.set(patientId, result);
      return { screeningResults: next };
    }),

  setCriteriaResults: (screeningResultId, results) =>
    set((state) => {
      const next = new Map(state.criteriaResults);
      next.set(screeningResultId, results);
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
        p.id === patientId ? { ...p, reviewStatus: status } : p
      );
      // Also update the screening result review status
      const screening = state.screeningResults.get(patientId);
      if (screening) {
        const nextResults = new Map(state.screeningResults);
        nextResults.set(patientId, { ...screening, reviewStatus: status });
        return { patients: updated, screeningResults: nextResults };
      }
      return { patients: updated };
    }),

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
