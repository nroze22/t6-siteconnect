import { describe, it, expect } from "vitest";
import {
  runMonteCarloForecast,
  computeDescriptiveStats,
  computeHistogram,
  computeCorrelation,
  detectAnomalies,
  analyzeTrend,
  compareCohorts,
} from "./statistical-engine";
import type { MonteCarloConfig } from "./statistical-engine";

// ============================================================
// TC-STAT-001: Monte Carlo Enrollment Forecasting
// ============================================================

describe("runMonteCarloForecast", () => {
  const baseConfig: MonteCarloConfig = {
    eligiblePool: 100,
    screenFailureRate: 0.3,
    consentRate: 0.7,
    dropoutRate: 0.05,
    monthlyCapacity: 15,
    targetEnrollment: 30,
    months: 12,
    simulations: 500,
  };

  it("TC-STAT-001a: returns timeline with correct number of months", () => {
    const result = runMonteCarloForecast(baseConfig, 42);
    expect(result.timeline).toHaveLength(baseConfig.months);
    expect(result.timeline[0]?.month).toBe(1);
    expect(result.timeline[11]?.month).toBe(12);
  });

  it("TC-STAT-001b: timeline mean enrollment generally increases (with dropout possible)", () => {
    // With dropout, median can occasionally decrease, so check mean trend instead
    const result = runMonteCarloForecast({ ...baseConfig, dropoutRate: 0 }, 42);
    for (let i = 1; i < result.timeline.length; i++) {
      const prev = result.timeline[i - 1];
      const curr = result.timeline[i];
      if (prev && curr) {
        // Without dropout, enrollment should be non-decreasing
        expect(curr.mean).toBeGreaterThanOrEqual(prev.mean);
      }
    }
  });

  it("TC-STAT-001c: percentile ordering p10 <= p25 <= p50 <= p75 <= p90", () => {
    const result = runMonteCarloForecast(baseConfig, 42);
    for (const point of result.timeline) {
      expect(point.p10).toBeLessThanOrEqual(point.p25);
      expect(point.p25).toBeLessThanOrEqual(point.p50);
      expect(point.p50).toBeLessThanOrEqual(point.p75);
      expect(point.p75).toBeLessThanOrEqual(point.p90);
    }
  });

  it("TC-STAT-001d: deterministic with same seed", () => {
    const a = runMonteCarloForecast(baseConfig, 42);
    const b = runMonteCarloForecast(baseConfig, 42);
    expect(a.expectedEnrolled).toBe(b.expectedEnrolled);
    expect(a.probabilityOfSuccess).toBe(b.probabilityOfSuccess);
    expect(a.timeline).toEqual(b.timeline);
  });

  it("TC-STAT-001e: different seed produces different results", () => {
    const a = runMonteCarloForecast(baseConfig, 42);
    const b = runMonteCarloForecast(baseConfig, 999);
    expect(a.expectedEnrolled).not.toBe(b.expectedEnrolled);
  });

  it("TC-STAT-001f: probability of success is 0-100%", () => {
    const result = runMonteCarloForecast(baseConfig, 42);
    expect(result.probabilityOfSuccess).toBeGreaterThanOrEqual(0);
    expect(result.probabilityOfSuccess).toBeLessThanOrEqual(100);
  });

  it("TC-STAT-001g: confidence interval is [low, high]", () => {
    const result = runMonteCarloForecast(baseConfig, 42);
    expect(result.confidenceInterval[0]).toBeLessThanOrEqual(result.confidenceInterval[1]);
  });

  it("TC-STAT-001h: zero eligible pool yields zero enrollment", () => {
    const result = runMonteCarloForecast({ ...baseConfig, eligiblePool: 0 }, 42);
    expect(result.expectedEnrolled).toBe(0);
    expect(result.probabilityOfSuccess).toBe(0);
  });

  it("TC-STAT-001i: high success scenario with large pool", () => {
    const result = runMonteCarloForecast(
      { ...baseConfig, eligiblePool: 1000, targetEnrollment: 5, consentRate: 0.95, screenFailureRate: 0.05 },
      42,
    );
    expect(result.probabilityOfSuccess).toBeGreaterThan(90);
  });

  it("TC-STAT-001j: medianTimeToTarget is null when target unreachable", () => {
    const result = runMonteCarloForecast(
      { ...baseConfig, eligiblePool: 5, targetEnrollment: 500, months: 3 },
      42,
    );
    expect(result.medianTimeToTarget).toBeNull();
    expect(result.probabilityOfSuccess).toBe(0);
  });
});

// ============================================================
// TC-STAT-002: Descriptive Statistics
// ============================================================

describe("computeDescriptiveStats", () => {
  it("TC-STAT-002a: empty array returns zeros", () => {
    const result = computeDescriptiveStats([]);
    expect(result.count).toBe(0);
    expect(result.mean).toBe(0);
    expect(result.stdDev).toBe(0);
  });

  it("TC-STAT-002b: single value returns that value for mean/median/min/max", () => {
    const result = computeDescriptiveStats([42]);
    expect(result.count).toBe(1);
    expect(result.mean).toBe(42);
    expect(result.median).toBe(42);
    expect(result.min).toBe(42);
    expect(result.max).toBe(42);
    expect(result.stdDev).toBe(0);
  });

  it("TC-STAT-002c: correct mean and median for known dataset", () => {
    const result = computeDescriptiveStats([1, 2, 3, 4, 5]);
    expect(result.mean).toBe(3);
    expect(result.median).toBe(3);
    expect(result.min).toBe(1);
    expect(result.max).toBe(5);
    expect(result.count).toBe(5);
  });

  it("TC-STAT-002d: stdDev is correct for known variance", () => {
    const result = computeDescriptiveStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result.mean).toBe(5);
    expect(result.stdDev).toBeCloseTo(2, 0);
  });

  it("TC-STAT-002e: IQR and quartiles computed correctly", () => {
    const result = computeDescriptiveStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.q1).toBeLessThan(result.median);
    expect(result.q3).toBeGreaterThan(result.median);
    expect(result.iqr).toBe(result.q3 - result.q1);
  });

  it("TC-STAT-002f: outlier thresholds are Q1-1.5*IQR and Q3+1.5*IQR", () => {
    const result = computeDescriptiveStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.outlierThresholdLow).toBeCloseTo(result.q1 - 1.5 * result.iqr, 4);
    expect(result.outlierThresholdHigh).toBeCloseTo(result.q3 + 1.5 * result.iqr, 4);
  });

  it("TC-STAT-002g: positive skew for right-skewed data", () => {
    const result = computeDescriptiveStats([1, 1, 1, 2, 2, 3, 10, 50]);
    expect(result.skewness).toBeGreaterThan(0);
  });
});

// ============================================================
// TC-STAT-003: Histogram / Distribution Analysis
// ============================================================

describe("computeHistogram", () => {
  it("TC-STAT-003a: empty array returns empty bins", () => {
    expect(computeHistogram([])).toEqual([]);
  });

  it("TC-STAT-003b: identical values produce single bin", () => {
    const bins = computeHistogram([5, 5, 5, 5]);
    expect(bins).toHaveLength(1);
    expect(bins[0]?.count).toBe(4);
    expect(bins[0]?.percentage).toBe(100);
  });

  it("TC-STAT-003c: respects custom bin count", () => {
    const bins = computeHistogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(bins).toHaveLength(5);
  });

  it("TC-STAT-003d: total count across bins equals input length", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 50];
    const bins = computeHistogram(data);
    const totalCount = bins.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(data.length);
  });

  it("TC-STAT-003e: percentages sum to ~100", () => {
    const bins = computeHistogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const totalPct = bins.reduce((s, b) => s + b.percentage, 0);
    expect(totalPct).toBeCloseTo(100, 0);
  });

  it("TC-STAT-003f: uses Sturges rule for auto bin count", () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const bins = computeHistogram(data);
    expect(bins).toHaveLength(8);
  });
});

// ============================================================
// TC-STAT-004: Correlation Analysis
// ============================================================

describe("computeCorrelation", () => {
  it("TC-STAT-004a: insufficient data returns defaults", () => {
    const result = computeCorrelation([1], [2]);
    expect(result.r).toBe(0);
    expect(result.significant).toBe(false);
    expect(result.interpretation).toBe("insufficient data");
  });

  it("TC-STAT-004b: perfect positive correlation", () => {
    const result = computeCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(result.r).toBeCloseTo(1, 4);
    expect(result.rSquared).toBeCloseTo(1, 4);
    expect(result.interpretation).toContain("strong positive");
  });

  it("TC-STAT-004c: perfect negative correlation", () => {
    const result = computeCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
    expect(result.r).toBeCloseTo(-1, 4);
    expect(result.interpretation).toContain("strong negative");
  });

  it("TC-STAT-004d: no correlation for random-looking data", () => {
    const result = computeCorrelation([1, 2, 3, 4, 5], [5, 1, 4, 2, 3]);
    expect(Math.abs(result.r)).toBeLessThan(0.5);
  });

  it("TC-STAT-004e: r is bounded [-1, 1]", () => {
    const result = computeCorrelation([10, 20, 30, 40, 50, 60], [15, 25, 30, 45, 55, 65]);
    expect(result.r).toBeGreaterThanOrEqual(-1);
    expect(result.r).toBeLessThanOrEqual(1);
  });

  it("TC-STAT-004f: rSquared = r^2", () => {
    const result = computeCorrelation([1, 3, 5, 7], [2, 5, 8, 11]);
    expect(result.rSquared).toBeCloseTo(result.r * result.r, 4);
  });
});

// ============================================================
// TC-STAT-005: Anomaly Detection
// ============================================================

describe("detectAnomalies", () => {
  it("TC-STAT-005a: no anomalies for too few data points", () => {
    expect(detectAnomalies([1, 2])).toEqual([]);
  });

  it("TC-STAT-005b: detects obvious outlier", () => {
    const data = [10, 10, 10, 10, 10, 10, 10, 100];
    const anomalies = detectAnomalies(data);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies.some((a) => a.value === 100)).toBe(true);
    expect(anomalies.find((a) => a.value === 100)?.type).toBe("high");
  });

  it("TC-STAT-005c: detects low outlier", () => {
    const data = [50, 50, 50, 50, 50, 50, 50, 1];
    const anomalies = detectAnomalies(data);
    expect(anomalies.some((a) => a.value === 1)).toBe(true);
    expect(anomalies.find((a) => a.value === 1)?.type).toBe("low");
  });

  it("TC-STAT-005d: no anomalies for uniform data", () => {
    const data = [5, 5, 5, 5, 5, 5, 5, 5];
    const anomalies = detectAnomalies(data);
    expect(anomalies).toEqual([]);
  });

  it("TC-STAT-005e: severity classification", () => {
    const data = [10, 10, 10, 10, 10, 10, 10, 10, 10, 1000];
    const anomalies = detectAnomalies(data);
    const extreme = anomalies.find((a) => a.value === 1000);
    expect(extreme).toBeDefined();
    expect(["moderate", "extreme"]).toContain(extreme?.severity);
  });

  it("TC-STAT-005f: sorted by absolute z-score descending", () => {
    const data = [10, 10, 10, 10, 10, 10, 50, 200];
    const anomalies = detectAnomalies(data);
    for (let i = 1; i < anomalies.length; i++) {
      const prev = anomalies[i - 1];
      const curr = anomalies[i];
      if (prev && curr) {
        expect(Math.abs(prev.zScore)).toBeGreaterThanOrEqual(Math.abs(curr.zScore));
      }
    }
  });
});

// ============================================================
// TC-STAT-006: Trend Analysis (Linear Regression)
// ============================================================

describe("analyzeTrend", () => {
  it("TC-STAT-006a: empty data returns stable defaults", () => {
    const result = analyzeTrend([]);
    expect(result.slope).toBe(0);
    expect(result.direction).toBe("stable");
    expect(result.projected).toEqual([]);
    expect(result.residuals).toEqual([]);
  });

  it("TC-STAT-006b: single value returns stable with projections", () => {
    const result = analyzeTrend([42], 3);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(42);
    expect(result.direction).toBe("stable");
    expect(result.projected).toEqual([42, 42, 42]);
  });

  it("TC-STAT-006c: perfectly increasing data", () => {
    const result = analyzeTrend([10, 20, 30, 40, 50]);
    expect(result.slope).toBeCloseTo(10, 4);
    expect(result.direction).toBe("increasing");
    expect(result.rSquared).toBeCloseTo(1, 4);
  });

  it("TC-STAT-006d: perfectly decreasing data", () => {
    const result = analyzeTrend([50, 40, 30, 20, 10]);
    expect(result.slope).toBeCloseTo(-10, 4);
    expect(result.direction).toBe("decreasing");
    expect(result.rSquared).toBeCloseTo(1, 4);
  });

  it("TC-STAT-006e: projects correct number of periods", () => {
    const result = analyzeTrend([1, 2, 3, 4, 5], 5);
    expect(result.projected).toHaveLength(5);
  });

  it("TC-STAT-006f: residuals have same length as input", () => {
    const data = [10, 12, 11, 15, 14, 18];
    const result = analyzeTrend(data);
    expect(result.residuals).toHaveLength(data.length);
  });

  it("TC-STAT-006g: changePercent is computed", () => {
    const result = analyzeTrend([100, 110, 120, 130, 140]);
    expect(result.changePercent).toBeGreaterThan(0);
  });
});

// ============================================================
// TC-STAT-007: Cohort Comparison
// ============================================================

describe("compareCohorts", () => {
  it("TC-STAT-007a: returns stats for both cohorts", () => {
    const result = compareCohorts([1, 2, 3], [4, 5, 6]);
    expect(result.cohortA.count).toBe(3);
    expect(result.cohortB.count).toBe(3);
  });

  it("TC-STAT-007b: identical cohorts have zero effect size", () => {
    const result = compareCohorts([10, 20, 30], [10, 20, 30]);
    expect(result.effectSize).toBeCloseTo(0, 4);
    expect(result.effectInterpretation).toBe("negligible");
    expect(result.meanDifference).toBeCloseTo(0, 4);
  });

  it("TC-STAT-007c: large difference yields large effect size", () => {
    const result = compareCohorts([1, 2, 3, 4, 5], [100, 200, 300, 400, 500]);
    expect(result.effectSize).toBeGreaterThan(0.8);
    expect(result.effectInterpretation).toBe("large");
  });

  it("TC-STAT-007d: meanDifference sign is cohortA - cohortB", () => {
    const result = compareCohorts([10, 20, 30], [40, 50, 60]);
    expect(result.meanDifference).toBeLessThan(0);
  });

  it("TC-STAT-007e: percentDifference is non-negative", () => {
    const result = compareCohorts([5, 10, 15], [20, 25, 30]);
    expect(result.percentDifference).toBeGreaterThanOrEqual(0);
  });

  it("TC-STAT-007f: empty cohorts handled gracefully", () => {
    const result = compareCohorts([], []);
    expect(result.cohortA.count).toBe(0);
    expect(result.cohortB.count).toBe(0);
    expect(result.effectSize).toBe(0);
  });
});
