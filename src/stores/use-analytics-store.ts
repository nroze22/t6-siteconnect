import { useMemo } from "react";
import { create } from "zustand";
import { calculateAge } from "@/lib/formatters";
import type { ParsedPatient } from "@/lib/epic-demo-data";

// ============================================================
// Filter Dimensions
// ============================================================

export interface AnalyticsFilters {
  // Demographic filters
  ageRange: [number, number] | null;
  sex: string | null;
  race: string | null;
  ethnicity: string | null;

  // Clinical filters
  diagnosisCode: string | null;
  medicationClass: string | null;
  labName: string | null;

  // Study filters
  studyId: string | null;
  eligibilityStatus: string | null;

  // Time filters
  timeRange: { start: Date; end: Date } | null;
}

// ============================================================
// Drill-Down Target
// ============================================================

export interface DrillDownTarget {
  type: "patients" | "study" | "criterion" | "demographic";
  title: string;
  description: string;
  patientIds: string[];
  sourceChart: string;
  sourceValue: string;
  metadata: Record<string, unknown>;
}

// ============================================================
// Analytics Snapshot (trend tracking)
// ============================================================

export interface AnalyticsSnapshot {
  id: string;
  timestamp: number;
  label: string;
  metrics: {
    totalSubjects: number;
    eligibleByStudy: Record<string, number>;
    avgPassRate: number;
    diversityScore: number;
    projectedRevenueCents: number;
  };
}

// ============================================================
// Store Interface
// ============================================================

interface AnalyticsState {
  // Cross-filter state
  filters: AnalyticsFilters;
  setFilter: <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => void;
  clearFilter: (key: keyof AnalyticsFilters) => void;
  clearAllFilters: () => void;
  activeFilterCount: () => number;

  // Drill-down state
  drillDown: DrillDownTarget | null;
  openDrillDown: (target: DrillDownTarget) => void;
  closeDrillDown: () => void;

  // Saved snapshots for trend tracking
  snapshots: AnalyticsSnapshot[];
  saveSnapshot: (snapshot: AnalyticsSnapshot) => void;
  clearSnapshots: () => void;

  // Comparison mode
  compareMode: boolean;
  comparisonScenario: string | null;
  setCompareMode: (on: boolean) => void;
  setComparisonScenario: (id: string | null) => void;
}

// ============================================================
// Default Filters (all null = no filters active)
// ============================================================

const DEFAULT_FILTERS: AnalyticsFilters = {
  ageRange: null,
  sex: null,
  race: null,
  ethnicity: null,
  diagnosisCode: null,
  medicationClass: null,
  labName: null,
  studyId: null,
  eligibilityStatus: null,
  timeRange: null,
};

// ============================================================
// Persistence (snapshots only — filters are transient)
// ============================================================

const SNAPSHOT_KEY = "siteconnect-analytics-snapshots";

function persistSnapshots(snapshots: AnalyticsSnapshot[]) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots));
  } catch {
    // Storage full or unavailable
  }
}

function loadSnapshots(): AnalyticsSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ============================================================
// Store
// ============================================================

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  // Cross-filter state
  filters: { ...DEFAULT_FILTERS },

  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),

  clearFilter: (key) =>
    set((state) => ({
      filters: { ...state.filters, [key]: null },
    })),

  clearAllFilters: () =>
    set({ filters: { ...DEFAULT_FILTERS } }),

  activeFilterCount: () => {
    const { filters } = get();
    return Object.values(filters).filter((v) => v !== null).length;
  },

  // Drill-down state
  drillDown: null,

  openDrillDown: (target) =>
    set({ drillDown: target }),

  closeDrillDown: () =>
    set({ drillDown: null }),

  // Snapshots (persisted)
  snapshots: loadSnapshots(),

  saveSnapshot: (snapshot) =>
    set((state) => {
      const next = [...state.snapshots, snapshot];
      persistSnapshots(next);
      return { snapshots: next };
    }),

  clearSnapshots: () => {
    persistSnapshots([]);
    set({ snapshots: [] });
  },

  // Comparison mode
  compareMode: false,
  comparisonScenario: null,

  setCompareMode: (on) =>
    set({ compareMode: on }),

  setComparisonScenario: (id) =>
    set({ comparisonScenario: id }),
}));

// ============================================================
// Helper Hook: useFilteredPatients
// Cross-filters a patient array against the current filter state.
// ============================================================

export function useFilteredPatients(patients: ParsedPatient[]): ParsedPatient[] {
  const filters = useAnalyticsStore((s) => s.filters);

  return useMemo(() => {
    return patients.filter((p) => {
      // Age range filter
      if (filters.ageRange) {
        const age = calculateAge(p.dob);
        if (age < filters.ageRange[0] || age > filters.ageRange[1]) return false;
      }

      // Sex filter
      if (filters.sex && p.sex !== filters.sex) return false;

      // Race filter
      if (filters.race && p.race !== filters.race) return false;

      // Ethnicity filter
      if (filters.ethnicity && p.ethnicity !== filters.ethnicity) return false;

      // Diagnosis code filter (ICD-10 prefix match)
      if (filters.diagnosisCode) {
        const prefix = filters.diagnosisCode;
        const hasDx = p.diagnoses.some((d) => d.icd10.startsWith(prefix));
        if (!hasDx) return false;
      }

      // Medication class filter (case-insensitive substring match)
      if (filters.medicationClass) {
        const search = filters.medicationClass.toLowerCase();
        const hasMed = p.medications.some((m) =>
          m.name.toLowerCase().includes(search),
        );
        if (!hasMed) return false;
      }

      // Lab name filter (patient must have a matching lab)
      if (filters.labName) {
        const search = filters.labName.toUpperCase();
        const hasLab = p.labs.some((l) =>
          l.test.toUpperCase().includes(search),
        );
        if (!hasLab) return false;
      }

      return true;
    });
  }, [patients, filters]);
}
