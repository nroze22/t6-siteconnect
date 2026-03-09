import { describe, it, expect, beforeEach } from "vitest";
import { useAnalyticsStore } from "./use-analytics-store";

describe("useAnalyticsStore", () => {
  beforeEach(() => {
    useAnalyticsStore.setState({
      filters: {
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
      },
      drillDown: null,
      snapshots: [],
      compareMode: false,
      comparisonScenario: null,
    });
  });

  // TC-ANL-001: Filter management
  describe("filters", () => {
    it("sets a single filter", () => {
      useAnalyticsStore.getState().setFilter("sex", "male");
      expect(useAnalyticsStore.getState().filters.sex).toBe("male");
    });

    it("sets age range filter", () => {
      useAnalyticsStore
        .getState()
        .setFilter("ageRange", [18, 65] as [number, number]);
      expect(useAnalyticsStore.getState().filters.ageRange).toEqual([18, 65]);
    });

    it("clears a specific filter", () => {
      useAnalyticsStore.getState().setFilter("sex", "female");
      useAnalyticsStore.getState().clearFilter("sex");
      expect(useAnalyticsStore.getState().filters.sex).toBeNull();
    });

    it("clears all filters", () => {
      useAnalyticsStore.getState().setFilter("sex", "male");
      useAnalyticsStore.getState().setFilter("race", "White");
      useAnalyticsStore.getState().clearAllFilters();
      const { filters } = useAnalyticsStore.getState();
      expect(filters.sex).toBeNull();
      expect(filters.race).toBeNull();
    });

    it("counts active filters", () => {
      useAnalyticsStore.getState().setFilter("sex", "male");
      useAnalyticsStore.getState().setFilter("race", "Asian");
      expect(useAnalyticsStore.getState().activeFilterCount()).toBe(2);
    });

    it("returns 0 when no filters active", () => {
      expect(useAnalyticsStore.getState().activeFilterCount()).toBe(0);
    });
  });

  // TC-ANL-002: Drill-down navigation
  describe("drill-down", () => {
    it("opens drill-down with target", () => {
      const target = {
        type: "patients" as const,
        title: "Eligible NSCLC",
        description: "Patients eligible for KEYNOTE-789",
        patientIds: ["p1", "p2"],
        sourceChart: "eligibility-pie",
        sourceValue: "eligible",
        metadata: {},
      };
      useAnalyticsStore.getState().openDrillDown(target);
      expect(useAnalyticsStore.getState().drillDown).toEqual(target);
    });

    it("closes drill-down", () => {
      useAnalyticsStore.getState().openDrillDown({
        type: "patients",
        title: "Test",
        description: "",
        patientIds: [],
        sourceChart: "",
        sourceValue: "",
        metadata: {},
      });
      useAnalyticsStore.getState().closeDrillDown();
      expect(useAnalyticsStore.getState().drillDown).toBeNull();
    });
  });

  // TC-ANL-003: Snapshot management
  describe("snapshots", () => {
    it("saves a snapshot", () => {
      const snapshot = {
        id: "snap-1",
        timestamp: Date.now(),
        label: "Baseline",
        metrics: {
          totalSubjects: 100,
          eligibleByStudy: { "study-1": 25 },
          avgPassRate: 0.68,
          diversityScore: 72,
          projectedRevenueCents: 8470000,
        },
      };
      useAnalyticsStore.getState().saveSnapshot(snapshot);
      expect(useAnalyticsStore.getState().snapshots).toHaveLength(1);
      expect(useAnalyticsStore.getState().snapshots[0]?.id).toBe("snap-1");
    });

    it("clears all snapshots", () => {
      useAnalyticsStore.getState().saveSnapshot({
        id: "s1",
        timestamp: Date.now(),
        label: "Test",
        metrics: {
          totalSubjects: 50,
          eligibleByStudy: {},
          avgPassRate: 0.5,
          diversityScore: 60,
          projectedRevenueCents: 5000000,
        },
      });
      useAnalyticsStore.getState().clearSnapshots();
      expect(useAnalyticsStore.getState().snapshots).toHaveLength(0);
    });
  });

  // TC-ANL-004: Compare mode
  describe("compare mode", () => {
    it("enables compare mode", () => {
      useAnalyticsStore.getState().setCompareMode(true);
      expect(useAnalyticsStore.getState().compareMode).toBe(true);
    });

    it("sets comparison scenario", () => {
      useAnalyticsStore.getState().setComparisonScenario("snap-1");
      expect(useAnalyticsStore.getState().comparisonScenario).toBe("snap-1");
    });
  });
});
