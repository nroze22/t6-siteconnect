/**
 * Statistical Analytics Engine for Clinical Trial Site Intelligence
 *
 * Provides Monte Carlo enrollment forecasting, descriptive statistics,
 * distribution analysis, correlation, anomaly detection, trend analysis,
 * and cohort comparison. All functions are pure with no side effects.
 *
 * All computations are local — no data leaves the device.
 */

// ============================================================
// SEEDED PRNG — Mulberry32
// ============================================================

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// 1. MONTE CARLO ENROLLMENT FORECASTING
// ============================================================

export interface MonteCarloConfig {
  eligiblePool: number;
  screenFailureRate: number; // 0-1
  consentRate: number; // 0-1
  dropoutRate: number; // 0-1, monthly
  monthlyCapacity: number; // max screens per month
  targetEnrollment: number;
  months: number;
  simulations: number; // default 1000
}

export interface MonteCarloTimelinePoint {
  month: number;
  p10: number;
  p25: number;
  p50: number; // median
  p75: number;
  p90: number;
  mean: number;
}

export interface MonteCarloResult {
  timeline: MonteCarloTimelinePoint[];
  medianTimeToTarget: number | null; // months, null if not reached
  probabilityOfSuccess: number; // % of sims reaching target
  expectedEnrolled: number; // mean final enrollment
  confidenceInterval: [number, number]; // 80% CI for final enrollment
}

export function runMonteCarloForecast(
  config: MonteCarloConfig,
  seed: number = 42,
): MonteCarloResult {
  const {
    eligiblePool,
    screenFailureRate,
    consentRate,
    dropoutRate,
    monthlyCapacity,
    targetEnrollment,
    months,
    simulations,
  } = config;

  const rng = mulberry32(seed);
  const successProb = (1 - screenFailureRate) * consentRate;

  // Use Float64Arrays for the simulation matrix: simulations x months
  // Each entry stores cumulative enrollment at that month for that sim
  const matrix = new Float64Array(simulations * months);

  const timeToTarget = new Float64Array(simulations);
  timeToTarget.fill(-1); // -1 means not reached

  for (let s = 0; s < simulations; s++) {
    let enrolled = 0;
    let remainingPool = eligiblePool;
    const simOffset = s * months;

    for (let m = 0; m < months; m++) {
      // How many can we screen this month
      const canScreen = Math.min(remainingPool, monthlyCapacity);

      // Bernoulli trials for screening+consent (batch using normal approx
      // for large canScreen, exact for small)
      let newEnrolled = 0;
      if (canScreen > 0) {
        if (canScreen <= 30) {
          // Exact Bernoulli
          for (let i = 0; i < canScreen; i++) {
            if (rng() < successProb) {
              newEnrolled++;
            }
          }
        } else {
          // Normal approximation to binomial for performance
          const mu = canScreen * successProb;
          const sigma = Math.sqrt(canScreen * successProb * (1 - successProb));
          // Box-Muller transform
          const u1 = rng();
          const u2 = rng();
          const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-15))) * Math.cos(2 * Math.PI * u2);
          newEnrolled = Math.max(0, Math.round(mu + sigma * z));
        }
      }

      remainingPool -= canScreen;
      enrolled += newEnrolled;

      // Apply dropout to currently enrolled (binomial)
      if (enrolled > 0 && dropoutRate > 0) {
        let dropouts = 0;
        if (enrolled <= 30) {
          for (let i = 0; i < enrolled; i++) {
            if (rng() < dropoutRate) {
              dropouts++;
            }
          }
        } else {
          const mu = enrolled * dropoutRate;
          const sigma = Math.sqrt(enrolled * dropoutRate * (1 - dropoutRate));
          const u1 = rng();
          const u2 = rng();
          const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-15))) * Math.cos(2 * Math.PI * u2);
          dropouts = Math.max(0, Math.round(mu + sigma * z));
        }
        enrolled = Math.max(0, enrolled - dropouts);
      }

      matrix[simOffset + m] = enrolled;

      if (enrolled >= targetEnrollment && timeToTarget[s] === -1) {
        timeToTarget[s] = m + 1; // 1-indexed month
      }
    }
  }

  // Compute percentiles across simulations for each month
  const timeline: MonteCarloTimelinePoint[] = [];
  const columnBuffer = new Float64Array(simulations);

  for (let m = 0; m < months; m++) {
    // Extract column
    for (let s = 0; s < simulations; s++) {
      columnBuffer[s] = matrix[s * months + m]!;
    }
    // Sort for percentile computation
    columnBuffer.sort();

    let sum = 0;
    for (let s = 0; s < simulations; s++) {
      sum += columnBuffer[s]!;
    }

    timeline.push({
      month: m + 1,
      p10: percentile(columnBuffer, 0.1),
      p25: percentile(columnBuffer, 0.25),
      p50: percentile(columnBuffer, 0.5),
      p75: percentile(columnBuffer, 0.75),
      p90: percentile(columnBuffer, 0.9),
      mean: Math.round((sum / simulations) * 100) / 100,
    });
  }

  // Compute summary statistics
  let successCount = 0;
  const reachedTimes: number[] = [];
  for (let s = 0; s < simulations; s++) {
    const tt = timeToTarget[s]!;
    if (tt > 0) {
      successCount++;
      reachedTimes.push(tt);
    }
  }

  reachedTimes.sort((a, b) => a - b);
  const medianTimeToTarget =
    reachedTimes.length > 0
      ? reachedTimes[Math.floor(reachedTimes.length / 2)] ?? null
      : null;

  // Final enrollment across sims
  const finalEnrollments = new Float64Array(simulations);
  for (let s = 0; s < simulations; s++) {
    finalEnrollments[s] = matrix[s * months + (months - 1)]!;
  }
  finalEnrollments.sort();

  let finalSum = 0;
  for (let s = 0; s < simulations; s++) {
    finalSum += finalEnrollments[s]!;
  }

  return {
    timeline,
    medianTimeToTarget,
    probabilityOfSuccess: (successCount / simulations) * 100,
    expectedEnrolled: Math.round((finalSum / simulations) * 100) / 100,
    confidenceInterval: [
      percentile(finalEnrollments, 0.1),
      percentile(finalEnrollments, 0.9),
    ],
  };
}

/** Compute a percentile from a sorted Float64Array using linear interpolation */
function percentile(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0]!;

  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;

  const loVal = sorted[lo] ?? 0;
  const hiVal = sorted[hi] ?? 0;

  return Math.round((loVal + frac * (hiVal - loVal)) * 100) / 100;
}

// ============================================================
// 2. DESCRIPTIVE STATISTICS
// ============================================================

export interface DescriptiveStats {
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  iqr: number;
  skewness: number;
  outlierThresholdLow: number; // Q1 - 1.5*IQR
  outlierThresholdHigh: number; // Q3 + 1.5*IQR
}

export function computeDescriptiveStats(values: number[]): DescriptiveStats {
  const n = values.length;
  if (n === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      skewness: 0,
      outlierThresholdLow: 0,
      outlierThresholdHigh: 0,
    };
  }

  const sorted = Float64Array.from(values).sort();
  const sortedArr = sorted;

  // Mean
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += sortedArr[i]!;
  }
  const mean = sum / n;

  // Variance, skewness (single pass over data)
  let m2 = 0;
  let m3 = 0;
  for (let i = 0; i < n; i++) {
    const d = sortedArr[i]! - mean;
    m2 += d * d;
    m3 += d * d * d;
  }
  const variance = n > 1 ? m2 / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const skewness = n > 2 && stdDev > 0
    ? (m3 / n) / (stdDev * stdDev * stdDev)
    : 0;

  const median = percentile(sortedArr, 0.5);
  const q1 = percentile(sortedArr, 0.25);
  const q3 = percentile(sortedArr, 0.75);
  const iqr = q3 - q1;

  return {
    count: n,
    mean: round6(mean),
    median,
    stdDev: round6(stdDev),
    min: sortedArr[0]!,
    max: sortedArr[n - 1]!,
    q1,
    q3,
    iqr: round6(iqr),
    skewness: round6(skewness),
    outlierThresholdLow: round6(q1 - 1.5 * iqr),
    outlierThresholdHigh: round6(q3 + 1.5 * iqr),
  };
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

// ============================================================
// 3. DISTRIBUTION ANALYSIS (HISTOGRAM)
// ============================================================

export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export function computeHistogram(
  values: number[],
  binCount?: number,
): HistogramBin[] {
  const n = values.length;
  if (n === 0) return [];

  // Sturges' rule for auto bin count
  const effectiveBinCount = binCount ?? Math.ceil(1 + 3.322 * Math.log10(n));

  let min = values[0]!;
  let max = values[0]!;
  for (let i = 1; i < n; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  // Handle case where all values are identical
  if (min === max) {
    return [{ min, max, count: n, percentage: 100 }];
  }

  const binWidth = (max - min) / effectiveBinCount;
  const bins: HistogramBin[] = [];

  for (let i = 0; i < effectiveBinCount; i++) {
    bins.push({
      min: round6(min + i * binWidth),
      max: round6(min + (i + 1) * binWidth),
      count: 0,
      percentage: 0,
    });
  }

  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    let idx = Math.floor((v - min) / binWidth);
    // Clamp the max value into the last bin
    if (idx >= effectiveBinCount) idx = effectiveBinCount - 1;
    const bin = bins[idx];
    if (bin) {
      bin.count++;
    }
  }

  for (const bin of bins) {
    bin.percentage = round6((bin.count / n) * 100);
  }

  return bins;
}

// ============================================================
// 4. CORRELATION ANALYSIS
// ============================================================

export interface CorrelationResult {
  r: number; // Pearson correlation coefficient
  rSquared: number; // Coefficient of determination
  pValue: number; // Approximate p-value (t-distribution approximation)
  significant: boolean; // p < 0.05
  interpretation: string; // "strong positive", "weak negative", etc.
}

export function computeCorrelation(
  x: number[],
  y: number[],
): CorrelationResult {
  const n = Math.min(x.length, y.length);
  if (n < 3) {
    return {
      r: 0,
      rSquared: 0,
      pValue: 1,
      significant: false,
      interpretation: "insufficient data",
    };
  }

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i]!;
    sumY += y[i]!;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let ssXX = 0;
  let ssYY = 0;
  let ssXY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - meanX;
    const dy = y[i]! - meanY;
    ssXX += dx * dx;
    ssYY += dy * dy;
    ssXY += dx * dy;
  }

  const denom = Math.sqrt(ssXX * ssYY);
  const r = denom > 0 ? ssXY / denom : 0;
  const rSquared = r * r;

  // t-statistic for significance testing
  const t = r * Math.sqrt((n - 2) / (1 - rSquared + 1e-15));
  // Approximate p-value using the t-distribution
  // Use a simple approximation for the two-tailed p-value
  const pValue = approximateTwoTailedPValue(Math.abs(t), n - 2);

  const absR = Math.abs(r);
  let interpretation: string;
  const direction = r >= 0 ? "positive" : "negative";
  if (absR >= 0.8) {
    interpretation = `strong ${direction}`;
  } else if (absR >= 0.6) {
    interpretation = `moderate ${direction}`;
  } else if (absR >= 0.4) {
    interpretation = `weak ${direction}`;
  } else if (absR >= 0.2) {
    interpretation = `very weak ${direction}`;
  } else {
    interpretation = "negligible";
  }

  return {
    r: round6(r),
    rSquared: round6(rSquared),
    pValue: round6(pValue),
    significant: pValue < 0.05,
    interpretation,
  };
}

/**
 * Approximate two-tailed p-value from a t-distribution.
 * Uses the approximation: p ≈ 2 * (1 - Φ(|t| * (1 - 1/(4*df))))
 * which is reasonable for df > 3.
 */
function approximateTwoTailedPValue(t: number, df: number): number {
  if (df <= 0) return 1;
  // For large df, t-distribution approaches normal
  // Use a correction factor for smaller df
  const correctedT = t * Math.sqrt((df - 1.5) / df);
  // Standard normal CDF approximation (Abramowitz & Stegun 26.2.17)
  const z = Math.abs(correctedT);
  const p = normalCdfComplement(z);
  return Math.min(1, 2 * p);
}

/** Complement of the standard normal CDF: P(Z > z) */
function normalCdfComplement(z: number): number {
  if (z < 0) return 1 - normalCdfComplement(-z);
  // Rational approximation (Abramowitz & Stegun 26.2.17)
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const t = 1 / (1 + p * z);
  const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  return phi * t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
}

// ============================================================
// 5. ANOMALY DETECTION (Modified Z-Score / MAD-based)
// ============================================================

export interface Anomaly {
  index: number;
  value: number;
  zScore: number;
  type: "high" | "low";
  severity: "mild" | "moderate" | "extreme"; // 2σ, 3σ, 4σ+
}

export function detectAnomalies(values: number[]): Anomaly[] {
  const n = values.length;
  if (n < 3) return [];

  // Compute median
  const sorted = Float64Array.from(values).sort();
  const median = percentile(sorted, 0.5);

  // Compute MAD (Median Absolute Deviation)
  const absDeviations = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    absDeviations[i] = Math.abs(values[i]! - median);
  }
  absDeviations.sort();
  const mad = percentile(absDeviations, 0.5);

  // Modified z-score: 0.6745 is the 0.75th percentile of the standard normal
  // distribution. Modified z-score = 0.6745 * (x - median) / MAD
  const anomalies: Anomaly[] = [];

  if (mad === 0) {
    // All values are (nearly) identical — flag any that differ
    for (let i = 0; i < n; i++) {
      const v = values[i]!;
      if (v !== median) {
        anomalies.push({
          index: i,
          value: v,
          zScore: v > median ? Infinity : -Infinity,
          type: v > median ? "high" : "low",
          severity: "extreme",
        });
      }
    }
    return anomalies;
  }

  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    const modifiedZ = (0.6745 * (v - median)) / mad;
    const absZ = Math.abs(modifiedZ);

    if (absZ >= 2) {
      let severity: "mild" | "moderate" | "extreme";
      if (absZ >= 4) {
        severity = "extreme";
      } else if (absZ >= 3) {
        severity = "moderate";
      } else {
        severity = "mild";
      }

      anomalies.push({
        index: i,
        value: v,
        zScore: round6(modifiedZ),
        type: v > median ? "high" : "low",
        severity,
      });
    }
  }

  // Sort by absolute z-score descending (most anomalous first)
  anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

  return anomalies;
}

// ============================================================
// 6. TREND ANALYSIS (Linear Regression)
// ============================================================

export interface TrendResult {
  slope: number; // units per period
  intercept: number;
  rSquared: number;
  direction: "increasing" | "decreasing" | "stable";
  changePercent: number; // % change over the data range
  projected: number[]; // next N periods forecast
  residuals: number[]; // actual - predicted for each point
}

export function analyzeTrend(
  values: number[],
  projectPeriods: number = 3,
): TrendResult {
  const n = values.length;
  if (n === 0) {
    return {
      slope: 0,
      intercept: 0,
      rSquared: 0,
      direction: "stable",
      changePercent: 0,
      projected: [],
      residuals: [],
    };
  }

  if (n === 1) {
    const v = values[0]!;
    return {
      slope: 0,
      intercept: v,
      rSquared: 1,
      direction: "stable",
      changePercent: 0,
      projected: new Array(projectPeriods).fill(v) as number[],
      residuals: [0],
    };
  }

  // Least squares linear regression: y = slope * x + intercept
  // where x = 0, 1, 2, ..., n-1
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const y = values[i]!;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;

  const denom = sumXX - n * meanX * meanX;
  const slope = denom !== 0 ? (sumXY - n * meanX * meanY) / denom : 0;
  const intercept = meanY - slope * meanX;

  // R-squared
  let ssTot = 0;
  let ssRes = 0;
  const residuals: number[] = [];

  for (let i = 0; i < n; i++) {
    const y = values[i]!;
    const predicted = slope * i + intercept;
    const residual = y - predicted;
    residuals.push(round6(residual));
    ssRes += residual * residual;
    ssTot += (y - meanY) * (y - meanY);
  }

  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : (ssRes === 0 ? 1 : 0);

  // Determine direction — use a threshold relative to the data range
  const dataRange = Math.abs(values[n - 1]! - values[0]!) || 1;
  const totalChange = slope * (n - 1);
  const changePercent =
    intercept !== 0 ? (totalChange / Math.abs(intercept)) * 100 : 0;

  let direction: "increasing" | "decreasing" | "stable";
  // Consider "stable" if the total change is less than 5% of the range
  if (Math.abs(totalChange) < dataRange * 0.05 && rSquared < 0.1) {
    direction = "stable";
  } else if (slope > 0) {
    direction = "increasing";
  } else if (slope < 0) {
    direction = "decreasing";
  } else {
    direction = "stable";
  }

  // Project future values
  const projected: number[] = [];
  for (let i = 0; i < projectPeriods; i++) {
    projected.push(round6(slope * (n + i) + intercept));
  }

  return {
    slope: round6(slope),
    intercept: round6(intercept),
    rSquared: round6(rSquared),
    direction,
    changePercent: round6(changePercent),
    projected,
    residuals,
  };
}

// ============================================================
// 7. COHORT COMPARISON
// ============================================================

export interface CohortComparison {
  cohortA: DescriptiveStats;
  cohortB: DescriptiveStats;
  effectSize: number; // Cohen's d
  effectInterpretation: string; // "negligible", "small", "medium", "large"
  meanDifference: number;
  percentDifference: number;
}

export function compareCohorts(
  a: number[],
  b: number[],
): CohortComparison {
  const cohortA = computeDescriptiveStats(a);
  const cohortB = computeDescriptiveStats(b);

  const meanDifference = cohortA.mean - cohortB.mean;

  // Pooled standard deviation for Cohen's d
  const nA = cohortA.count;
  const nB = cohortB.count;
  const pooledVar =
    nA + nB > 2
      ? ((nA - 1) * cohortA.stdDev * cohortA.stdDev +
          (nB - 1) * cohortB.stdDev * cohortB.stdDev) /
        (nA + nB - 2)
      : 0;
  const pooledSD = Math.sqrt(pooledVar);

  const effectSize = pooledSD > 0 ? Math.abs(meanDifference) / pooledSD : 0;

  let effectInterpretation: string;
  if (effectSize >= 0.8) {
    effectInterpretation = "large";
  } else if (effectSize >= 0.5) {
    effectInterpretation = "medium";
  } else if (effectSize >= 0.2) {
    effectInterpretation = "small";
  } else {
    effectInterpretation = "negligible";
  }

  const avgMean = (Math.abs(cohortA.mean) + Math.abs(cohortB.mean)) / 2;
  const percentDifference =
    avgMean > 0 ? (Math.abs(meanDifference) / avgMean) * 100 : 0;

  return {
    cohortA,
    cohortB,
    effectSize: round6(effectSize),
    effectInterpretation,
    meanDifference: round6(meanDifference),
    percentDifference: round6(percentDifference),
  };
}
