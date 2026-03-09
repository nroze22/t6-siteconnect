import { describe, it, expect } from "vitest";
import {
  generateFeasibilityNarrative,
  generateEnrollmentNarrative,
  generateDiversityNarrative,
  generatePerformanceNarrative,
  generateReadinessNarrative,
  generateCohortNarrative,
} from "./narrative-engine";
import type { NarrativeInsight } from "./narrative-engine";

function expectValidInsights(insights: NarrativeInsight[]) {
  expect(Array.isArray(insights)).toBe(true);
  expect(insights.length).toBeLessThanOrEqual(5);
  for (const insight of insights) {
    expect(insight.id).toBeTruthy();
    expect(insight.title).toBeTruthy();
    expect(insight.body).toBeTruthy();
    expect(["positive", "warning", "neutral", "opportunity"]).toContain(insight.type);
    expect(typeof insight.priority).toBe("number");
  }
}

function expectSortedByTypePriority(insights: NarrativeInsight[]) {
  const typeOrder: Record<string, number> = { warning: 0, opportunity: 1, positive: 2, neutral: 3 };
  for (let i = 1; i < insights.length; i++) {
    const prev = insights[i - 1];
    const curr = insights[i];
    if (prev && curr) {
      const prevOrder = typeOrder[prev.type] ?? 99;
      const currOrder = typeOrder[curr.type] ?? 99;
      if (prevOrder !== currOrder) {
        expect(prevOrder).toBeLessThanOrEqual(currOrder);
      }
    }
  }
}

// ============================================================
// TC-NAR-001: Feasibility Narrative
// ============================================================

describe("generateFeasibilityNarrative", () => {
  it("TC-NAR-001a: generates insights for a typical feasibility result", () => {
    const insights = generateFeasibilityNarrative(
      1000, 120, 0.12,
      [
        { criterion: "Age 18-75", matchCount: 800, matchRate: 0.8 },
        { criterion: "HbA1c > 7.0", matchCount: 200, matchRate: 0.2 },
      ],
      { avgAge: 58, genderSplit: { male: 70, female: 50, other: 0 } },
    );
    expectValidInsights(insights);
    expect(insights.length).toBeGreaterThan(0);
  });

  it("TC-NAR-001b: warns on very low match rate (<5%)", () => {
    const insights = generateFeasibilityNarrative(
      1000, 30, 0.03, [], { avgAge: 50, genderSplit: { male: 15, female: 15, other: 0 } },
    );
    expect(insights.some((i) => i.type === "warning")).toBe(true);
    expect(insights.some((i) => i.title.includes("Feasibility concern"))).toBe(true);
  });

  it("TC-NAR-001c: flags opportunity when match rate > 25%", () => {
    const insights = generateFeasibilityNarrative(
      100, 30, 0.30, [], { avgAge: 60, genderSplit: { male: 15, female: 15, other: 0 } },
    );
    expect(insights.some((i) => i.type === "opportunity" || i.type === "positive")).toBe(true);
  });

  it("TC-NAR-001d: identifies enrollment blocker from criterion breakdown", () => {
    const insights = generateFeasibilityNarrative(
      500, 50, 0.10,
      [
        { criterion: "eGFR >= 60", matchCount: 100, matchRate: 0.2 },
        { criterion: "Age 18-75", matchCount: 450, matchRate: 0.9 },
      ],
      { avgAge: 55, genderSplit: { male: 25, female: 25, other: 0 } },
    );
    expect(insights.some((i) => i.title.includes("blocker"))).toBe(true);
  });

  it("TC-NAR-001e: warns on gender imbalance (>70% one gender)", () => {
    const insights = generateFeasibilityNarrative(
      200, 40, 0.20, [],
      { avgAge: 55, genderSplit: { male: 35, female: 5, other: 0 } },
    );
    expect(insights.some((i) => i.title.includes("Gender imbalance"))).toBe(true);
  });

  it("TC-NAR-001f: respects 5-insight cap and ordering", () => {
    const insights = generateFeasibilityNarrative(
      1000, 30, 0.03,
      [
        { criterion: "A", matchCount: 100, matchRate: 0.1 },
        { criterion: "B", matchCount: 200, matchRate: 0.2 },
      ],
      { avgAge: 70, genderSplit: { male: 28, female: 2, other: 0 } },
    );
    expect(insights.length).toBeLessThanOrEqual(5);
    expectSortedByTypePriority(insights);
  });
});

// ============================================================
// TC-NAR-002: Enrollment Forecast Narrative
// ============================================================

describe("generateEnrollmentNarrative", () => {
  it("TC-NAR-002a: generates insights for forecast results", () => {
    const insights = generateEnrollmentNarrative(
      { targetEnrollment: 50, months: 12, eligiblePool: 100 },
      { medianTimeToTarget: 8, probabilityOfSuccess: 65, expectedEnrolled: 45, timeline: [] },
    );
    expectValidInsights(insights);
    expect(insights.length).toBeGreaterThan(0);
  });

  it("TC-NAR-002b: warns when probability < 50%", () => {
    const insights = generateEnrollmentNarrative(
      { targetEnrollment: 100, months: 6, eligiblePool: 50 },
      { medianTimeToTarget: null, probabilityOfSuccess: 25, expectedEnrolled: 15, timeline: [] },
    );
    expect(insights.some((i) => i.type === "warning")).toBe(true);
    expect(insights.some((i) => i.title.toLowerCase().includes("at risk") || i.title.toLowerCase().includes("enrollment"))).toBe(true);
  });

  it("TC-NAR-002c: positive when probability >= 85%", () => {
    const insights = generateEnrollmentNarrative(
      { targetEnrollment: 20, months: 12, eligiblePool: 200 },
      { medianTimeToTarget: 4, probabilityOfSuccess: 92, expectedEnrolled: 25, timeline: [] },
    );
    expect(insights.some((i) => i.type === "positive")).toBe(true);
  });

  it("TC-NAR-002d: warns on thin eligible pool (ratio < 2x)", () => {
    const insights = generateEnrollmentNarrative(
      { targetEnrollment: 80, months: 12, eligiblePool: 100 },
      { medianTimeToTarget: null, probabilityOfSuccess: 40, expectedEnrolled: 30, timeline: [] },
    );
    expect(insights.some((i) => i.title.includes("Thin eligible pool"))).toBe(true);
  });

  it("TC-NAR-002e: includes median time to target when available", () => {
    const insights = generateEnrollmentNarrative(
      { targetEnrollment: 30, months: 12, eligiblePool: 100 },
      { medianTimeToTarget: 6.5, probabilityOfSuccess: 70, expectedEnrolled: 32, timeline: [] },
    );
    expect(insights.some((i) => i.title.includes("Median time"))).toBe(true);
  });
});

// ============================================================
// TC-NAR-003: Diversity Narrative
// ============================================================

describe("generateDiversityNarrative", () => {
  it("TC-NAR-003a: handles zero patients", () => {
    const insights = generateDiversityNarrative(0, {}, {}, {}, 0);
    expect(insights.length).toBe(1);
    expect(insights[0]?.title).toContain("No patient data");
  });

  it("TC-NAR-003b: generates score-based insight", () => {
    const insights = generateDiversityNarrative(
      75,
      { Male: 50, Female: 50 },
      { White: 60, "Black or African American": 20, Asian: 10, "Hispanic or Latino": 10 },
      { "18-44": 30, "45-64": 40, "65+": 30 },
      100,
    );
    expectValidInsights(insights);
    expect(insights.some((i) => i.title.includes("Diversity score"))).toBe(true);
  });

  it("TC-NAR-003c: warns on Hispanic/Latino underrepresentation (<10%)", () => {
    const insights = generateDiversityNarrative(
      50,
      { Male: 50, Female: 50 },
      { White: 80, "Black or African American": 15, Asian: 5 },
      { "18-64": 80, "65+": 20 },
      100,
    );
    expect(insights.some((i) => i.title.includes("Hispanic/Latino"))).toBe(true);
  });

  it("TC-NAR-003d: positive for balanced gender (40-60%)", () => {
    const insights = generateDiversityNarrative(
      80,
      { Male: 48, Female: 52 },
      { White: 70, "Black or African American": 15, Asian: 10, "Hispanic or Latino": 5 },
      { "18-64": 70, "65+": 30 },
      100,
    );
    expect(insights.some((i) => i.title.includes("Balanced gender"))).toBe(true);
  });

  it("TC-NAR-003e: warns on gender imbalance", () => {
    const insights = generateDiversityNarrative(
      40,
      { Male: 85, Female: 15 },
      { White: 90 },
      { "18-64": 100 },
      100,
    );
    expect(insights.some((i) => i.title.includes("Gender imbalance"))).toBe(true);
  });
});

// ============================================================
// TC-NAR-004: Performance Narrative
// ============================================================

describe("generatePerformanceNarrative", () => {
  it("TC-NAR-004a: handles no studies", () => {
    const insights = generatePerformanceNarrative([], 0, 0);
    expect(insights.length).toBe(1);
    expect(insights[0]?.title).toContain("No active studies");
  });

  it("TC-NAR-004b: generates pass rate insight", () => {
    const insights = generatePerformanceNarrative(
      [
        { name: "Study A", passRate: 0.25, eligible: 20, revenue: 500000 },
        { name: "Study B", passRate: 0.10, eligible: 8, revenue: 200000 },
      ],
      100, 28,
    );
    expectValidInsights(insights);
    expect(insights.some((i) => i.title.includes("pass rate"))).toBe(true);
  });

  it("TC-NAR-004c: identifies highest-value study", () => {
    const insights = generatePerformanceNarrative(
      [
        { name: "Low Value", passRate: 0.30, eligible: 30, revenue: 100000 },
        { name: "High Value", passRate: 0.20, eligible: 15, revenue: 900000 },
      ],
      100, 45,
    );
    expect(insights.some((i) => i.title.includes("High Value"))).toBe(true);
  });

  it("TC-NAR-004d: warns on high screen failure rate", () => {
    const insights = generatePerformanceNarrative(
      [
        { name: "Good", passRate: 0.30, eligible: 30, revenue: 300000 },
        { name: "Bad", passRate: 0.05, eligible: 5, revenue: 50000 },
      ],
      100, 35,
    );
    expect(insights.some((i) => i.title.includes("screen failure"))).toBe(true);
  });

  it("TC-NAR-004e: warns when multiple studies underperform", () => {
    const insights = generatePerformanceNarrative(
      [
        { name: "A", passRate: 0.08, eligible: 8, revenue: 80000 },
        { name: "B", passRate: 0.05, eligible: 5, revenue: 50000 },
        { name: "C", passRate: 0.25, eligible: 25, revenue: 250000 },
      ],
      100, 38,
    );
    expect(insights.some((i) => i.title.includes("below 10%"))).toBe(true);
  });
});

// ============================================================
// TC-NAR-005: Site Readiness Narrative
// ============================================================

describe("generateReadinessNarrative", () => {
  it("TC-NAR-005a: high score is positive", () => {
    const insights = generateReadinessNarrative(
      88,
      [
        { name: "Infrastructure", score: 90, weight: 0.3 },
        { name: "Experience", score: 85, weight: 0.3 },
        { name: "Population", score: 88, weight: 0.4 },
      ],
      500,
    );
    expectValidInsights(insights);
    expect(insights.some((i) => i.type === "positive")).toBe(true);
  });

  it("TC-NAR-005b: low score warns", () => {
    const insights = generateReadinessNarrative(
      40,
      [{ name: "Infrastructure", score: 40, weight: 1.0 }],
      50,
    );
    expect(insights.some((i) => i.type === "warning")).toBe(true);
  });

  it("TC-NAR-005c: identifies weakest sub-score", () => {
    const insights = generateReadinessNarrative(
      70,
      [
        { name: "Infrastructure", score: 90, weight: 0.5 },
        { name: "Staffing", score: 45, weight: 0.5 },
      ],
      200,
    );
    expect(insights.some((i) => i.title.includes("Staffing"))).toBe(true);
  });

  it("TC-NAR-005d: flags consistently high sub-scores as opportunity", () => {
    const insights = generateReadinessNarrative(
      90,
      [
        { name: "A", score: 85, weight: 0.33 },
        { name: "B", score: 90, weight: 0.33 },
        { name: "C", score: 95, weight: 0.34 },
      ],
      300,
    );
    expect(insights.some((i) => i.title.includes("Consistently high"))).toBe(true);
  });
});

// ============================================================
// TC-NAR-006: Cohort Narrative
// ============================================================

describe("generateCohortNarrative", () => {
  it("TC-NAR-006a: handles zero population", () => {
    const insights = generateCohortNarrative(0, 0, 0, null, { avgAge: 0, malePercent: 0, topRace: "", topRacePercent: 0 });
    expect(insights.length).toBe(1);
    expect(insights[0]?.title).toContain("No population data");
  });

  it("TC-NAR-006b: generates cohort summary", () => {
    const insights = generateCohortNarrative(
      500, 75, 8, "eGFR >= 60",
      { avgAge: 58, malePercent: 55, topRace: "White", topRacePercent: 65 },
    );
    expectValidInsights(insights);
    expect(insights.some((i) => i.title.includes("75 of 500"))).toBe(true);
  });

  it("TC-NAR-006c: includes top blocker when provided", () => {
    const insights = generateCohortNarrative(
      200, 30, 5, "HbA1c threshold",
      { avgAge: 60, malePercent: 50, topRace: "White", topRacePercent: 70 },
    );
    expect(insights.some((i) => i.title.includes("HbA1c threshold"))).toBe(true);
  });

  it("TC-NAR-006d: warns on very small cohort (<10)", () => {
    const insights = generateCohortNarrative(
      500, 5, 10, null,
      { avgAge: 55, malePercent: 60, topRace: "White", topRacePercent: 80 },
    );
    expect(insights.some((i) => i.title.includes("Very small"))).toBe(true);
  });

  it("TC-NAR-006e: warns when dominant race > 80%", () => {
    const insights = generateCohortNarrative(
      100, 50, 5, null,
      { avgAge: 60, malePercent: 55, topRace: "White", topRacePercent: 90 },
    );
    expect(insights.some((i) => i.type === "warning" && i.title.includes("White"))).toBe(true);
  });
});

// ============================================================
// TC-NAR-007: Cross-cutting — insight ordering and caps
// ============================================================

describe("insight ordering and caps", () => {
  it("TC-NAR-007a: warnings appear before neutral insights", () => {
    const insights = generateFeasibilityNarrative(
      1000, 20, 0.02,
      [{ criterion: "Lab X", matchCount: 50, matchRate: 0.05 }],
      { avgAge: 55, genderSplit: { male: 10, female: 10, other: 0 } },
    );
    expectSortedByTypePriority(insights);
  });

  it("TC-NAR-007b: all generators return <= 5 insights", () => {
    const all = [
      generateFeasibilityNarrative(1000, 30, 0.03, [{ criterion: "A", matchCount: 100, matchRate: 0.1 }], { avgAge: 70, genderSplit: { male: 28, female: 2, other: 0 } }),
      generateEnrollmentNarrative({ targetEnrollment: 100, months: 12, eligiblePool: 80 }, { medianTimeToTarget: 10, probabilityOfSuccess: 30, expectedEnrolled: 20, timeline: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, p50: i * 2 })) }),
      generateDiversityNarrative(30, { Male: 80, Female: 20 }, { White: 95 }, { "18-64": 100 }, 100),
      generatePerformanceNarrative([{ name: "A", passRate: 0.05, eligible: 5, revenue: 50000 }, { name: "B", passRate: 0.08, eligible: 8, revenue: 80000 }, { name: "C", passRate: 0.30, eligible: 30, revenue: 300000 }], 100, 43),
      generateReadinessNarrative(45, [{ name: "X", score: 30, weight: 0.5 }, { name: "Y", score: 60, weight: 0.5 }], 50),
      generateCohortNarrative(500, 5, 10, "eGFR", { avgAge: 55, malePercent: 60, topRace: "White", topRacePercent: 90 }),
    ];
    for (const insights of all) {
      expect(insights.length).toBeLessThanOrEqual(5);
    }
  });
});
