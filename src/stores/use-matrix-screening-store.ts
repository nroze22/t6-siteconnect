import { create } from "zustand";
import type {
  MatrixCell,
  PatientBestMatches,
  ScreeningProgress,
  ScreeningStatus,
} from "@/types";

type ViewMode = "matrix" | "best-match";

interface MatrixScreeningStore {
  // Study selection
  selectedStudyIds: string[];
  studyNames: Record<string, string>;

  // Results
  matrixResults: Map<string, Map<string, MatrixCell>>; // patientId → studyId → cell
  isScreening: boolean;
  progress: ScreeningProgress | null;
  lastBatchId: string | null;

  // UI
  viewMode: ViewMode;
  selectedCellPatientId: string | null;
  selectedCellStudyId: string | null;
  statusFilter: ScreeningStatus | "all";

  // Actions
  setSelectedStudyIds: (ids: string[]) => void;
  setStudyNames: (names: Record<string, string>) => void;
  setViewMode: (mode: ViewMode) => void;
  setIsScreening: (v: boolean) => void;
  setProgress: (p: ScreeningProgress | null) => void;
  selectCell: (patientId: string | null, studyId: string | null) => void;
  setStatusFilter: (f: ScreeningStatus | "all") => void;

  // Data population
  populateFromResults: (
    results: Array<{
      patientId: string;
      studyId: string;
      sitePatientId: string;
      age: number | null;
      gender: string | null;
      primaryDiagnosis: string | null;
      overallStatus: string;
      score: number;
      inclusionMet: number;
      inclusionTotal: number;
      exclusionTriggered: number;
    }>,
    batchId: string
  ) => void;

  clearResults: () => void;

  // Computed
  getPatientIds: () => string[];
  getBestMatches: () => PatientBestMatches[];
  getMatrixRow: (patientId: string) => Map<string, MatrixCell> | undefined;
}

export const useMatrixScreeningStore = create<MatrixScreeningStore>((set, get) => ({
  selectedStudyIds: [],
  studyNames: {},
  matrixResults: new Map(),
  isScreening: false,
  progress: null,
  lastBatchId: null,
  viewMode: "matrix",
  selectedCellPatientId: null,
  selectedCellStudyId: null,
  statusFilter: "all",

  setSelectedStudyIds: (ids) => set({ selectedStudyIds: ids }),
  setStudyNames: (names) => set({ studyNames: names }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setIsScreening: (v) => set({ isScreening: v }),
  setProgress: (p) => set({ progress: p }),
  selectCell: (patientId, studyId) =>
    set({ selectedCellPatientId: patientId, selectedCellStudyId: studyId }),
  setStatusFilter: (f) => set({ statusFilter: f }),

  populateFromResults: (results, batchId) => {
    const matrix = new Map<string, Map<string, MatrixCell>>();

    for (const r of results) {
      if (!matrix.has(r.patientId)) {
        matrix.set(r.patientId, new Map());
      }
      matrix.get(r.patientId)!.set(r.studyId, {
        patientId: r.patientId,
        studyId: r.studyId,
        score: r.score,
        status: r.overallStatus as ScreeningStatus,
        inclusionMet: r.inclusionMet,
        inclusionTotal: r.inclusionTotal,
        exclusionTriggered: r.exclusionTriggered,
      });
    }

    set({ matrixResults: matrix, lastBatchId: batchId, isScreening: false });
  },

  clearResults: () =>
    set({ matrixResults: new Map(), lastBatchId: null, progress: null }),

  getPatientIds: () => {
    return Array.from(get().matrixResults.keys());
  },

  getBestMatches: () => {
    const { matrixResults, studyNames, statusFilter } = get();
    const matches: PatientBestMatches[] = [];

    for (const [patientId, studyMap] of matrixResults) {
      const cells = Array.from(studyMap.values());
      // Get the first cell for patient metadata
      const first = cells[0];
      if (!first) continue;

      const sorted = cells
        .filter((c) => statusFilter === "all" || c.status === statusFilter)
        .sort((a, b) => b.score - a.score);

      if (sorted.length === 0) continue;

      matches.push({
        patientId,
        sitePatientId: first.patientId, // will be enriched by UI
        age: null,
        gender: null,
        primaryDiagnosis: null,
        matches: sorted.map((c) => ({
          studyId: c.studyId,
          studyTitle: studyNames[c.studyId] || c.studyId,
          score: c.score,
          status: c.status,
        })),
      });
    }

    // Sort by number of eligible/potentially_eligible matches desc, then best score
    matches.sort((a, b) => {
      const aEligible = a.matches.filter(
        (m) => m.status === "eligible" || m.status === "potentially_eligible"
      ).length;
      const bEligible = b.matches.filter(
        (m) => m.status === "eligible" || m.status === "potentially_eligible"
      ).length;
      if (bEligible !== aEligible) return bEligible - aEligible;
      return (b.matches[0]?.score ?? 0) - (a.matches[0]?.score ?? 0);
    });

    return matches;
  },

  getMatrixRow: (patientId) => {
    return get().matrixResults.get(patientId);
  },
}));
