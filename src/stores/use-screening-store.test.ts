import { describe, it, expect, beforeEach } from "vitest";
import { useScreeningStore } from "./use-screening-store";
import type { PatientSummary } from "@/types";

const mockPatients: PatientSummary[] = [
  {
    id: "p1",
    sitePatientId: "PAT-001",
    age: 62,
    gender: "female",
    primaryDiagnosis: "NSCLC",
    score: 92,
    overallStatus: "eligible",
    reviewStatus: "pending",
    inclusionMet: 4,
    inclusionTotal: 5,
    exclusionTriggered: 0,
    exclusionTotal: 3,
    missingDataCount: 1,
  },
  {
    id: "p2",
    sitePatientId: "PAT-002",
    age: 55,
    gender: "male",
    primaryDiagnosis: "SCLC",
    score: 31,
    overallStatus: "ineligible",
    reviewStatus: "pending",
    inclusionMet: 2,
    inclusionTotal: 5,
    exclusionTriggered: 2,
    exclusionTotal: 3,
    missingDataCount: 0,
  },
  {
    id: "p3",
    sitePatientId: "PAT-003",
    age: 71,
    gender: "male",
    primaryDiagnosis: "Adenocarcinoma",
    score: 74,
    overallStatus: "potentially_eligible",
    reviewStatus: "pending",
    inclusionMet: 3,
    inclusionTotal: 5,
    exclusionTriggered: 0,
    exclusionTotal: 3,
    missingDataCount: 2,
  },
];

describe("useScreeningStore", () => {
  beforeEach(() => {
    useScreeningStore.setState({
      selectedPatientId: null,
      selectedStudyId: "study-1",
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
    });
  });

  // TC-SCR-001: Patient selection
  describe("patient selection", () => {
    it("selects a patient by id", () => {
      useScreeningStore.getState().selectPatient("p1");
      expect(useScreeningStore.getState().selectedPatientId).toBe("p1");
    });

    it("deselects patient with null", () => {
      useScreeningStore.getState().selectPatient("p1");
      useScreeningStore.getState().selectPatient(null);
      expect(useScreeningStore.getState().selectedPatientId).toBeNull();
    });

    it("clears criterion and highlights on patient select", () => {
      useScreeningStore.setState({
        selectedCriterionId: "c1",
        highlightedTab: "labs",
        highlightedRecordIds: ["r1"],
      });
      useScreeningStore.getState().selectPatient("p1");
      expect(useScreeningStore.getState().selectedCriterionId).toBeNull();
      expect(useScreeningStore.getState().highlightedTab).toBeNull();
    });
  });

  // TC-SCR-002: Patient list management
  describe("patient data", () => {
    it("sets patients list", () => {
      useScreeningStore.getState().setPatients(mockPatients);
      expect(useScreeningStore.getState().patients).toHaveLength(3);
    });
  });

  // TC-SCR-003: Status filtering
  describe("filtering", () => {
    beforeEach(() => {
      useScreeningStore.getState().setPatients(mockPatients);
    });

    it("filters by eligible status", () => {
      useScreeningStore.getState().setStatusFilter("eligible");
      const filtered = useScreeningStore.getState().filteredPatients();
      expect(filtered.every((p) => p.overallStatus === "eligible")).toBe(true);
      expect(filtered).toHaveLength(1);
    });

    it("shows all with 'all' filter", () => {
      useScreeningStore.getState().setStatusFilter("all");
      const filtered = useScreeningStore.getState().filteredPatients();
      expect(filtered).toHaveLength(3);
    });

    it("filters by score range", () => {
      useScreeningStore.getState().setScoreRange([50, 100]);
      const filtered = useScreeningStore.getState().filteredPatients();
      expect(filtered.every((p) => p.score >= 50)).toBe(true);
      expect(filtered).toHaveLength(2); // p1 (92) and p3 (74)
    });

    it("filters by search query on patient id", () => {
      useScreeningStore.getState().setSearchQuery("PAT-001");
      const filtered = useScreeningStore.getState().filteredPatients();
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.sitePatientId).toBe("PAT-001");
    });

    it("search is case-insensitive", () => {
      useScreeningStore.getState().setSearchQuery("pat-002");
      const filtered = useScreeningStore.getState().filteredPatients();
      expect(filtered).toHaveLength(1);
    });
  });

  // TC-SCR-004: Status counts
  describe("status counts", () => {
    it("counts patients by status", () => {
      useScreeningStore.getState().setPatients(mockPatients);
      const counts = useScreeningStore.getState().statusCounts();
      expect(counts.eligible).toBe(1);
      expect(counts.ineligible).toBe(1);
      expect(counts.potentially_eligible).toBe(1);
      expect(counts.total).toBe(3);
    });

    it("returns zeroes for empty list", () => {
      const counts = useScreeningStore.getState().statusCounts();
      expect(counts.total).toBe(0);
      expect(counts.eligible).toBe(0);
    });
  });

  // TC-SCR-005: Review actions
  describe("review actions", () => {
    it("reviews a patient as accepted", () => {
      useScreeningStore.getState().setPatients(mockPatients);
      useScreeningStore.getState().reviewPatient("p1", "accepted");
      const patient = useScreeningStore
        .getState()
        .patients.find((p) => p.id === "p1");
      expect(patient?.reviewStatus).toBe("accepted");
    });

    it("reviews a patient as rejected", () => {
      useScreeningStore.getState().setPatients(mockPatients);
      useScreeningStore.getState().reviewPatient("p2", "rejected");
      const patient = useScreeningStore
        .getState()
        .patients.find((p) => p.id === "p2");
      expect(patient?.reviewStatus).toBe("rejected");
    });

    it("reviews a patient as deferred", () => {
      useScreeningStore.getState().setPatients(mockPatients);
      useScreeningStore.getState().reviewPatient("p3", "deferred");
      const patient = useScreeningStore
        .getState()
        .patients.find((p) => p.id === "p3");
      expect(patient?.reviewStatus).toBe("deferred");
    });
  });

  // TC-SCR-006: Override modal
  describe("override modal", () => {
    it("opens override modal with criterion id", () => {
      useScreeningStore.getState().openOverrideModal("crit-1");
      expect(useScreeningStore.getState().isOverrideModalOpen).toBe(true);
      expect(useScreeningStore.getState().overrideCriterionId).toBe("crit-1");
    });

    it("closes override modal", () => {
      useScreeningStore.getState().openOverrideModal("crit-1");
      useScreeningStore.getState().closeOverrideModal();
      expect(useScreeningStore.getState().isOverrideModalOpen).toBe(false);
      expect(useScreeningStore.getState().overrideCriterionId).toBeNull();
    });
  });

  // TC-SCR-007: Highlights
  describe("highlights", () => {
    it("sets highlights for a tab", () => {
      useScreeningStore.getState().setHighlight("labs", ["lab-1", "lab-2"]);
      expect(useScreeningStore.getState().highlightedTab).toBe("labs");
      expect(useScreeningStore.getState().highlightedRecordIds).toEqual(["lab-1", "lab-2"]);
    });

    it("clears highlights", () => {
      useScreeningStore.getState().setHighlight("labs", ["lab-1"]);
      useScreeningStore.getState().clearHighlights();
      expect(useScreeningStore.getState().highlightedTab).toBeNull();
      expect(useScreeningStore.getState().highlightedRecordIds).toEqual([]);
    });
  });

  // TC-SCR-008: Study selection
  describe("study selection", () => {
    it("selects a study", () => {
      useScreeningStore.getState().selectStudy("study-2");
      expect(useScreeningStore.getState().selectedStudyId).toBe("study-2");
    });
  });

  // TC-SCR-009: Criterion selection
  describe("criterion selection", () => {
    it("selects and deselects a criterion", () => {
      useScreeningStore.getState().selectCriterion("c1");
      expect(useScreeningStore.getState().selectedCriterionId).toBe("c1");
      useScreeningStore.getState().selectCriterion(null);
      expect(useScreeningStore.getState().selectedCriterionId).toBeNull();
    });
  });
});
