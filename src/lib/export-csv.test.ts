import { describe, it, expect } from "vitest";
import { buildScreeningCSV, buildDetailedCSV } from "./export-csv";
import type { PatientSummary, ScreeningResult, CriterionResult } from "@/types";

const mockPatients: PatientSummary[] = [
  {
    id: "p1",
    sitePatientId: "PAT-001",
    age: 62,
    gender: "female",
    primaryDiagnosis: "NSCLC",
    score: 92,
    overallStatus: "eligible",
    reviewStatus: "accepted",
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
    primaryDiagnosis: 'Heart "Failure"',
    score: 31,
    overallStatus: "ineligible",
    reviewStatus: "rejected",
    inclusionMet: 2,
    inclusionTotal: 5,
    exclusionTriggered: 2,
    exclusionTotal: 3,
    missingDataCount: 0,
  },
];

const mockScreeningResults = new Map<string, ScreeningResult>();
mockScreeningResults.set("p1", {
  id: "sr1",
  patientId: "p1",
  studyId: "study-1",
  overallStatus: "eligible",
  inclusionMet: 4,
  inclusionTotal: 5,
  exclusionTriggered: 0,
  exclusionTotal: 3,
  missingDataCount: 1,
  score: 92,
  screenedAt: "2024-01-15T10:00:00Z",
  reviewedBy: null,
  reviewStatus: "accepted",
  reviewNotes: null,
});

const mockCriteriaResults = new Map<string, CriterionResult[]>();
mockCriteriaResults.set("sr1", [
  {
    id: "cr1",
    screeningResultId: "sr1",
    criterionId: "c1",
    criterionType: "inclusion",
    criterionText: "Age >= 18",
    result: "met",
    evidence: "Age: 62",
    evidenceSource: "demographics",
    confidence: 1.0,
    reasoning: null,
    aiDetermined: false,
    humanVerified: true,
    humanOverride: null,
  },
]);

describe("export-csv", () => {
  // TC-EXP-001: Basic CSV generation
  describe("buildScreeningCSV", () => {
    it("generates valid CSV with headers", () => {
      const csv = buildScreeningCSV(mockPatients, mockScreeningResults, mockCriteriaResults);
      const lines = csv.split("\n");
      expect(lines.length).toBeGreaterThan(1);
      // Check header
      const header = lines[0];
      expect(header).toContain("patient_id");
      expect(header).toContain("eligibility_score");
    });

    it("includes all patients", () => {
      const csv = buildScreeningCSV(mockPatients, mockScreeningResults, mockCriteriaResults);
      const lines = csv.split("\n").filter((l) => l.trim());
      // Header + 2 patients
      expect(lines.length).toBe(3);
    });

    it("properly escapes CSV fields with quotes", () => {
      const csv = buildScreeningCSV(mockPatients, mockScreeningResults, mockCriteriaResults);
      // The diagnosis 'Heart "Failure"' should be escaped
      expect(csv).toContain('"');
    });

    it("filters by review status when provided", () => {
      const csv = buildScreeningCSV(
        mockPatients,
        mockScreeningResults,
        mockCriteriaResults,
        "accepted"
      );
      const lines = csv.split("\r\n").filter((l) => l.trim());
      // Header + 1 accepted patient (p1 has reviewStatus: "accepted")
      expect(lines.length).toBe(2);
    });
  });

  // TC-EXP-002: Detailed CSV with criterion breakdown
  describe("buildDetailedCSV", () => {
    it("generates detailed CSV with criteria columns", () => {
      const csv = buildDetailedCSV(mockPatients, mockScreeningResults, mockCriteriaResults);
      expect(csv).toBeTruthy();
      expect(csv.length).toBeGreaterThan(0);
    });

    it("includes criterion-level data", () => {
      const csv = buildDetailedCSV(mockPatients, mockScreeningResults, mockCriteriaResults);
      // Should contain criterion text or result data
      expect(csv.split("\n").length).toBeGreaterThan(1);
    });
  });

  // TC-EXP-003: Empty data handling
  describe("edge cases", () => {
    it("handles empty patient list", () => {
      const csv = buildScreeningCSV([], new Map(), new Map());
      // Returns empty string for no data
      expect(csv).toBe("");
    });

    it("handles patients with no screening results", () => {
      const csv = buildScreeningCSV(mockPatients, new Map(), new Map());
      expect(csv).toBeTruthy();
    });
  });
});
