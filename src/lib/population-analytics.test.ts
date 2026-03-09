import { describe, it, expect } from "vitest";
import {
  runFeasibilityQuery,
  forecastEnrollment,
  computeDiversityProfile,
  PRESET_QUERIES,
  LAB_THRESHOLD_PRESETS,
} from "./population-analytics";
import type { ParsedPatient } from "./epic-demo-data";

// Match the actual ParsedPatient interface from epic-demo-data.ts
function makeMockPatient(overrides: Partial<ParsedPatient> = {}): ParsedPatient {
  return {
    mrn: "TEST-001",
    lastName: "Doe",
    firstName: "John",
    dob: "1960-03-15",
    sex: "Male",
    race: "White",
    ethnicity: "Not Hispanic or Latino",
    insurance: "Medicare",
    diagnoses: [
      { icd10: "C34.1", name: "NSCLC, upper lobe", onset: "2024-01-15" },
    ],
    medications: [
      { name: "Pembrolizumab", dose: "200mg", route: "IV", status: "Active" },
    ],
    labs: [
      { test: "HbA1c", value: "6.2", unit: "%", date: "2024-01-10", ref: "4.0-5.6", abnormal: true },
    ],
    vitals: { systolic: 125, diastolic: 80, pulse: 72, weight: 82, height: 175, bmi: 26.8 },
    lastEncounter: "2024-01-10",
    department: "Oncology",
    provider: "Dr. Smith",
    ...overrides,
  };
}

function makeMockPopulation(): ParsedPatient[] {
  return [
    makeMockPatient({ mrn: "P-001", sex: "Male", race: "White" }),
    makeMockPatient({
      mrn: "P-002",
      sex: "Female",
      race: "Black or African American",
      insurance: "Medicaid",
      diagnoses: [{ icd10: "E11.9", name: "Type 2 diabetes", onset: "2020-01-01" }],
      labs: [{ test: "HbA1c", value: "8.5", unit: "%", date: "2024-01-10", ref: "4.0-5.6", abnormal: true }],
    }),
    makeMockPatient({
      mrn: "P-003",
      sex: "Male",
      race: "Asian",
      insurance: "Blue Cross PPO",
      diagnoses: [{ icd10: "I50.9", name: "Heart failure", onset: "2023-06-01" }],
    }),
    makeMockPatient({
      mrn: "P-004",
      sex: "Female",
      race: "White",
      ethnicity: "Hispanic or Latino",
      insurance: "Aetna HMO",
      diagnoses: [{ icd10: "C34.9", name: "NSCLC", onset: "2024-03-01" }],
    }),
    makeMockPatient({
      mrn: "P-005",
      sex: "Male",
      race: "White",
      insurance: "UnitedHealth",
      diagnoses: [{ icd10: "E11.65", name: "Type 2 diabetes with hyperglycemia", onset: "2019-01-01" }],
    }),
  ];
}

describe("population-analytics", () => {
  const population = makeMockPopulation();

  // TC-ANL-010: Feasibility query execution
  describe("runFeasibilityQuery", () => {
    it("runs a query and returns results", () => {
      const query = {
        id: "test-1",
        name: "NSCLC patients",
        criteria: [
          { type: "diagnosis" as const, field: "icd10", operator: "contains" as const, value: "C34" },
        ],
      };
      const result = runFeasibilityQuery(population, query);
      expect(result.queryName).toBe("NSCLC patients");
      expect(result.totalPatients).toBe(population.length);
      expect(result.matchingPatients).toBeGreaterThan(0);
      expect(result.matchRate).toBeGreaterThan(0);
      expect(result.matchRate).toBeLessThanOrEqual(1);
    });

    it("returns zero matches for impossible criteria", () => {
      const query = {
        id: "test-2",
        name: "Impossible",
        criteria: [
          { type: "age" as const, field: "age", operator: "greaterThan" as const, value: "200" },
        ],
      };
      const result = runFeasibilityQuery(population, query);
      expect(result.matchingPatients).toBe(0);
    });

    it("returns matched patient IDs", () => {
      const query = {
        id: "test-3",
        name: "Male patients",
        criteria: [
          { type: "demographic" as const, field: "sex", operator: "equals" as const, value: "Male" },
        ],
      };
      const result = runFeasibilityQuery(population, query);
      expect(result.matchedPatientIds.length).toBe(result.matchingPatients);
    });
  });

  // TC-ANL-011: Enrollment forecasting
  describe("forecastEnrollment", () => {
    it("generates a timeline projection", () => {
      const forecast = forecastEnrollment(population, 3, "Test Study", 10);
      expect(forecast.studyName).toBe("Test Study");
      expect(forecast.eligibleCount).toBe(3);
      expect(forecast.projectedTimeline.length).toBeGreaterThan(0);
    });

    it("projects cumulative enrollment over months", () => {
      const forecast = forecastEnrollment(population, 5, "Test Study", 20);
      const timeline = forecast.projectedTimeline;
      // Each month should have >= previous cumulative
      for (let i = 1; i < timeline.length; i++) {
        const prev = timeline[i - 1];
        const curr = timeline[i];
        if (prev && curr) {
          expect(curr.cumulative).toBeGreaterThanOrEqual(prev.cumulative);
        }
      }
    });

    it("respects custom consent rate", () => {
      const high = forecastEnrollment(population, 5, "High", 10, { consentRate: 0.9 });
      const low = forecastEnrollment(population, 5, "Low", 10, { consentRate: 0.3 });
      expect(high.estimatedMonthlyEnrollment).toBeGreaterThanOrEqual(
        low.estimatedMonthlyEnrollment
      );
    });
  });

  // TC-ANL-012: Diversity profile computation
  describe("computeDiversityProfile", () => {
    it("computes diversity breakdown", () => {
      const profile = computeDiversityProfile(population);
      expect(profile.totalPatients).toBe(population.length);
      expect(profile.genderBreakdown.length).toBeGreaterThan(0);
      expect(profile.raceBreakdown.length).toBeGreaterThan(0);
    });

    it("includes diversity score", () => {
      const profile = computeDiversityProfile(population);
      expect(profile.diversityScore).toBeGreaterThanOrEqual(0);
      expect(profile.diversityScore).toBeLessThanOrEqual(100);
    });

    it("generates FDA compliance notes", () => {
      const profile = computeDiversityProfile(population);
      expect(Array.isArray(profile.fdaComplianceNotes)).toBe(true);
    });

    it("computes age breakdown", () => {
      const profile = computeDiversityProfile(population);
      expect(profile.ageBreakdown.length).toBeGreaterThan(0);
      const totalInBreakdown = profile.ageBreakdown.reduce(
        (sum, b) => sum + b.count,
        0
      );
      expect(totalInBreakdown).toBe(population.length);
    });
  });

  // TC-ANL-013: Preset queries validation
  describe("PRESET_QUERIES", () => {
    it("has multiple preset queries", () => {
      expect(PRESET_QUERIES.length).toBeGreaterThanOrEqual(5);
    });

    it("each preset has id, name, and criteria", () => {
      for (const q of PRESET_QUERIES) {
        expect(q.id).toBeTruthy();
        expect(q.name).toBeTruthy();
        expect(q.criteria.length).toBeGreaterThan(0);
      }
    });
  });

  // TC-ANL-014: Lab threshold presets
  describe("LAB_THRESHOLD_PRESETS", () => {
    it("has multiple presets", () => {
      expect(LAB_THRESHOLD_PRESETS.length).toBeGreaterThanOrEqual(3);
    });

    it("each preset has required fields", () => {
      for (const p of LAB_THRESHOLD_PRESETS) {
        expect(p.id).toBeTruthy();
        expect(p.labName).toBeTruthy();
        expect(typeof p.threshold).toBe("number");
        expect(["above", "below"]).toContain(p.direction);
      }
    });
  });
});
