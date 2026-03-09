import { describe, it, expect } from "vitest";
import {
  detectArchetype,
  getArchetype,
  getAllArchetypes,
  getProcedure,
  getAllProcedures,
  modelStudyFinancials,
  formatRangeCurrency,
  burdenColor,
  confidenceColor,
  riskColor,
  DEFAULT_SITE_ASSUMPTIONS,
} from "./financial-engine";

describe("financial-engine", () => {
  // TC-FIN-001: Archetype detection
  describe("detectArchetype", () => {
    it("detects oncology immunotherapy study", () => {
      const result = detectArchetype({
        therapeuticArea: "Oncology",
        phase: "Phase 3",
        indication: "NSCLC pembrolizumab immunotherapy",
        studyType: "interventional",
      });
      expect(result).toContain("oncology");
    });

    it("detects cardiovascular study", () => {
      const result = detectArchetype({
        therapeuticArea: "Cardiology",
        phase: "Phase 3",
        indication: "Heart failure SGLT2 inhibitor",
        studyType: "interventional",
      });
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns a valid archetype id", () => {
      const id = detectArchetype({
        therapeuticArea: "Endocrinology",
        phase: "Phase 3",
        indication: "Type 2 diabetes GLP-1",
        studyType: "interventional",
      });
      const archetype = getArchetype(id);
      expect(archetype).toBeDefined();
      expect(archetype.label).toBeTruthy();
    });
  });

  // TC-FIN-002: Archetype catalog
  describe("archetype catalog", () => {
    it("returns all archetypes", () => {
      const all = getAllArchetypes();
      expect(all.length).toBeGreaterThan(10);
    });

    it("each archetype has required fields", () => {
      const all = getAllArchetypes();
      for (const a of all) {
        expect(a.id).toBeTruthy();
        expect(a.label).toBeTruthy();
        expect(a.revenuePerPatientRange).toBeDefined();
        expect(a.revenuePerPatientRange.baseCents).toBeGreaterThan(0);
        expect(a.defaultVisits).toBeDefined();
      }
    });
  });

  // TC-FIN-003: Procedure catalog
  describe("procedure catalog", () => {
    it("returns all procedures", () => {
      const procs = getAllProcedures();
      expect(procs.length).toBeGreaterThan(5);
    });

    it("looks up a specific procedure", () => {
      const procs = getAllProcedures();
      if (procs[0]) {
        const found = getProcedure(procs[0].id);
        expect(found).toBeDefined();
        expect(found?.label).toBe(procs[0].label);
      }
    });

    it("returns undefined for non-existent procedure", () => {
      expect(getProcedure("non_existent_proc")).toBeUndefined();
    });
  });

  // TC-FIN-004: Financial modeling
  describe("modelStudyFinancials", () => {
    const mockStudy = {
      id: "study-test",
      therapeuticArea: "Oncology",
      indication: "NSCLC pembrolizumab immunotherapy",
      phase: "Phase 3",
      studyType: "interventional",
    };

    it("generates a complete financial model", () => {
      const model = modelStudyFinancials(mockStudy);
      expect(model).toBeDefined();
      expect(model.scenarioOutputs).toBeDefined();
      expect(model.scenarioOutputs.base).toBeDefined();
      expect(model.scenarioOutputs.conservative).toBeDefined();
      expect(model.scenarioOutputs.optimistic).toBeDefined();
    });

    it("uses integer cents for all currency values", () => {
      const model = modelStudyFinancials(mockStudy);
      const base = model.scenarioOutputs.base;
      expect(Number.isInteger(base.perPatientGrossCents)).toBe(true);
      expect(Number.isInteger(base.totalGrossRevenueCents)).toBe(true);
    });

    it("conservative < base < optimistic revenue", () => {
      const model = modelStudyFinancials(mockStudy);
      expect(model.scenarioOutputs.conservative.totalGrossRevenueCents).toBeLessThanOrEqual(
        model.scenarioOutputs.base.totalGrossRevenueCents
      );
      expect(model.scenarioOutputs.base.totalGrossRevenueCents).toBeLessThanOrEqual(
        model.scenarioOutputs.optimistic.totalGrossRevenueCents
      );
    });

    it("accepts custom assumptions", () => {
      const model = modelStudyFinancials(mockStudy, {
        ...DEFAULT_SITE_ASSUMPTIONS,
        enrollmentTarget: 50,
      });
      expect(model.scenarioOutputs.base.enrollmentCount).toBeLessThanOrEqual(50);
    });
  });

  // TC-FIN-006: Currency formatting
  describe("formatRangeCurrency", () => {
    it("formats a value range as currency", () => {
      const result = formatRangeCurrency({
        lowCents: 500000,
        baseCents: 750000,
        highCents: 1000000,
      });
      expect(result).toContain("$");
      expect(typeof result).toBe("string");
    });
  });

  // TC-FIN-007: Color helpers
  describe("color helpers", () => {
    it("returns colors for burden levels", () => {
      expect(burdenColor("low")).toBeTruthy();
      expect(burdenColor("medium")).toBeTruthy();
      expect(burdenColor("high")).toBeTruthy();
      expect(burdenColor("very_high")).toBeTruthy();
    });

    it("returns colors for confidence levels", () => {
      expect(confidenceColor("low")).toBeTruthy();
      expect(confidenceColor("medium")).toBeTruthy();
      expect(confidenceColor("high")).toBeTruthy();
    });

    it("returns colors for risk levels", () => {
      expect(riskColor("low")).toBeTruthy();
      expect(riskColor("medium")).toBeTruthy();
      expect(riskColor("high")).toBeTruthy();
    });
  });

  // TC-FIN-008: Default assumptions
  describe("DEFAULT_SITE_ASSUMPTIONS", () => {
    it("has reasonable defaults", () => {
      expect(DEFAULT_SITE_ASSUMPTIONS.overheadPercent).toBeGreaterThan(0);
      expect(DEFAULT_SITE_ASSUMPTIONS.screenFailRatePercent).toBeGreaterThan(0);
      expect(DEFAULT_SITE_ASSUMPTIONS.enrollmentTarget).toBeGreaterThan(0);
    });

    it("uses integer cents for rate fields", () => {
      expect(Number.isInteger(DEFAULT_SITE_ASSUMPTIONS.coordinatorHourlyRateCents)).toBe(true);
      expect(Number.isInteger(DEFAULT_SITE_ASSUMPTIONS.piHourlyRateCents)).toBe(true);
    });
  });

  // TC-FIN-009: Archetype-based revenue ranges
  describe("archetype revenue ranges", () => {
    it("all archetypes have positive base revenue", () => {
      const all = getAllArchetypes();
      for (const a of all) {
        expect(a.revenuePerPatientRange.baseCents).toBeGreaterThan(0);
        expect(a.revenuePerPatientRange.lowCents).toBeLessThanOrEqual(
          a.revenuePerPatientRange.baseCents
        );
        expect(a.revenuePerPatientRange.baseCents).toBeLessThanOrEqual(
          a.revenuePerPatientRange.highCents
        );
      }
    });
  });
});
