/**
 * Population Analytics Engine
 * Derives operational insights from parsed patient data.
 * All computations are local — no data leaves the device.
 */

import type { ParsedPatient } from "./epic-demo-data";

// ============================================================
// 1. PROTOCOL FEASIBILITY CALCULATOR
// ============================================================

export interface FeasibilityQuery {
  id: string;
  name: string;
  criteria: FeasibilityCriterion[];
}

export interface FeasibilityCriterion {
  type: "diagnosis" | "age_range" | "lab_range" | "medication" | "bmi_range" | "sex";
  field: string;
  operator: "contains" | "equals" | "gte" | "lte" | "between" | "not_contains";
  value: string;
  valueTo?: string; // for "between"
}

export interface FeasibilityResult {
  queryName: string;
  totalPatients: number;
  matchingPatients: number;
  matchRate: number;
  criterionBreakdown: { criterion: string; matchCount: number; matchRate: number }[];
  matchedPatientIds: string[];
  demographics: {
    avgAge: number;
    genderSplit: { male: number; female: number; other: number };
    raceSplit: Record<string, number>;
  };
}

export function runFeasibilityQuery(
  patients: ParsedPatient[],
  query: FeasibilityQuery,
): FeasibilityResult {
  const criterionMatches: Map<number, Set<string>> = new Map();
  query.criteria.forEach((_, i) => criterionMatches.set(i, new Set()));

  const matchedAll = new Set<string>();

  for (const p of patients) {
    const age = calculateAge(p.dob);
    let allMatch = true;

    for (let i = 0; i < query.criteria.length; i++) {
      const c = query.criteria[i]!;
      const matches = evaluateCriterion(p, c, age);
      if (matches) {
        criterionMatches.get(i)!.add(p.mrn);
      } else {
        allMatch = false;
      }
    }

    if (allMatch) matchedAll.add(p.mrn);
  }

  const matchedPatients = patients.filter((p) => matchedAll.has(p.mrn));

  return {
    queryName: query.name,
    totalPatients: patients.length,
    matchingPatients: matchedAll.size,
    matchRate: patients.length > 0 ? matchedAll.size / patients.length : 0,
    criterionBreakdown: query.criteria.map((c, i) => ({
      criterion: describeCriterion(c),
      matchCount: criterionMatches.get(i)!.size,
      matchRate: patients.length > 0 ? criterionMatches.get(i)!.size / patients.length : 0,
    })),
    matchedPatientIds: Array.from(matchedAll),
    demographics: computeDemographics(matchedPatients),
  };
}

function evaluateCriterion(p: ParsedPatient, c: FeasibilityCriterion, age: number): boolean {
  switch (c.type) {
    case "diagnosis": {
      const search = c.value.toUpperCase();
      if (c.operator === "contains") {
        return p.diagnoses.some((d) => d.icd10.toUpperCase().startsWith(search) || d.name.toUpperCase().includes(search));
      }
      if (c.operator === "not_contains") {
        return !p.diagnoses.some((d) => d.icd10.toUpperCase().startsWith(search) || d.name.toUpperCase().includes(search));
      }
      return false;
    }
    case "age_range": {
      const min = parseFloat(c.value);
      const max = c.valueTo ? parseFloat(c.valueTo) : Infinity;
      return age >= min && age <= max;
    }
    case "lab_range": {
      const lab = p.labs.find((l) => l.test.toUpperCase().includes(c.field.toUpperCase()));
      if (!lab) return false;
      const val = parseFloat(lab.value);
      if (isNaN(val)) return false;
      if (c.operator === "gte") return val >= parseFloat(c.value);
      if (c.operator === "lte") return val <= parseFloat(c.value);
      if (c.operator === "between") return val >= parseFloat(c.value) && val <= parseFloat(c.valueTo ?? c.value);
      return false;
    }
    case "medication": {
      const search = c.value.toUpperCase();
      if (c.operator === "contains") {
        return p.medications.some((m) => m.name.toUpperCase().includes(search) && m.status.toUpperCase() === "ACTIVE");
      }
      if (c.operator === "not_contains") {
        return !p.medications.some((m) => m.name.toUpperCase().includes(search) && m.status.toUpperCase() === "ACTIVE");
      }
      return false;
    }
    case "bmi_range": {
      if (c.operator === "gte") return p.vitals.bmi >= parseFloat(c.value);
      if (c.operator === "lte") return p.vitals.bmi <= parseFloat(c.value);
      if (c.operator === "between") return p.vitals.bmi >= parseFloat(c.value) && p.vitals.bmi <= parseFloat(c.valueTo ?? c.value);
      return false;
    }
    case "sex": {
      return p.sex.toUpperCase() === c.value.toUpperCase();
    }
    default:
      return false;
  }
}

function describeCriterion(c: FeasibilityCriterion): string {
  switch (c.type) {
    case "diagnosis":
      return `${c.operator === "not_contains" ? "No " : ""}Diagnosis: ${c.value}`;
    case "age_range":
      return `Age ${c.value}${c.valueTo ? `-${c.valueTo}` : "+"}`;
    case "lab_range":
      if (c.operator === "between") return `${c.field} ${c.value}-${c.valueTo}`;
      return `${c.field} ${c.operator === "gte" ? "≥" : "≤"} ${c.value}`;
    case "medication":
      return `${c.operator === "not_contains" ? "Not on " : "On "}${c.value}`;
    case "bmi_range":
      if (c.operator === "between") return `BMI ${c.value}-${c.valueTo}`;
      return `BMI ${c.operator === "gte" ? "≥" : "≤"} ${c.value}`;
    case "sex":
      return `Sex: ${c.value}`;
    default:
      return "Unknown";
  }
}

// ============================================================
// 2. ENROLLMENT FORECASTING
// ============================================================

export interface EnrollmentForecast {
  studyName: string;
  eligibleCount: number;
  monthlyNewPatients: number;
  estimatedMonthlyEnrollment: number;
  projectedMonths: number;
  projectedTimeline: { month: string; cumulative: number; target: number }[];
  screenFailureRate: number;
  consentRate: number;
}

export function forecastEnrollment(
  patients: ParsedPatient[],
  eligibleCount: number,
  studyName: string,
  targetEnrollment: number,
  options?: {
    consentRate?: number;
    screenFailureRate?: number;
    monthlyNewPatientRate?: number;
  },
): EnrollmentForecast {
  const consentRate = options?.consentRate ?? 0.45;
  const screenFailureRate = options?.screenFailureRate ?? 0.30;
  const monthlyNew = options?.monthlyNewPatientRate ?? Math.round(patients.length * 0.08);

  const monthlyEligibleFromNew = Math.round(monthlyNew * (eligibleCount / Math.max(patients.length, 1)));
  const monthlyScreened = Math.round((eligibleCount * 0.15) + monthlyEligibleFromNew);
  const monthlyPassed = Math.round(monthlyScreened * (1 - screenFailureRate));
  const monthlyEnrolled = Math.max(1, Math.round(monthlyPassed * consentRate));

  const projectedMonths = Math.ceil(targetEnrollment / monthlyEnrolled);

  const timeline: { month: string; cumulative: number; target: number }[] = [];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const startMonth = 2; // March 2026
  const startYear = 2026;

  for (let i = 0; i < Math.min(projectedMonths + 2, 18); i++) {
    const mIdx = (startMonth + i) % 12;
    const year = startYear + Math.floor((startMonth + i) / 12);
    timeline.push({
      month: `${months[mIdx]} ${year.toString().slice(2)}`,
      cumulative: Math.min(i * monthlyEnrolled, targetEnrollment),
      target: targetEnrollment,
    });
  }

  return {
    studyName,
    eligibleCount,
    monthlyNewPatients: monthlyNew,
    estimatedMonthlyEnrollment: monthlyEnrolled,
    projectedMonths,
    projectedTimeline: timeline,
    screenFailureRate,
    consentRate,
  };
}

// ============================================================
// 3. LAB TRAJECTORY — PATIENTS BECOMING ELIGIBLE
// ============================================================

export interface LabTrajectoryPatient {
  mrn: string;
  name: string;
  currentValue: number;
  unit: string;
  threshold: number;
  direction: "rising" | "falling";
  distanceToThreshold: number;
  percentToThreshold: number;
  estimatedWeeksToThreshold: number | null;
  labName: string;
  lastDate: string;
}

export interface LabTrajectoryGroup {
  labName: string;
  threshold: number;
  unit: string;
  direction: "above" | "below";
  description: string;
  patients: LabTrajectoryPatient[];
}

export function findPatientsApproachingThreshold(
  patients: ParsedPatient[],
  labName: string,
  threshold: number,
  direction: "above" | "below", // patients need to go above or below threshold
  windowPercent: number = 15, // how close (% of threshold) to include
): LabTrajectoryGroup {
  const result: LabTrajectoryPatient[] = [];
  const window = threshold * (windowPercent / 100);

  for (const p of patients) {
    const lab = p.labs.find((l) => l.test.toUpperCase().includes(labName.toUpperCase()));
    if (!lab) continue;
    const val = parseFloat(lab.value);
    if (isNaN(val)) continue;

    if (direction === "above") {
      // Patient needs to cross above threshold — look for values just below
      if (val < threshold && val >= threshold - window) {
        const distance = threshold - val;
        result.push({
          mrn: p.mrn,
          name: `${p.lastName}, ${p.firstName}`,
          currentValue: val,
          unit: lab.unit,
          threshold,
          direction: "rising",
          distanceToThreshold: distance,
          percentToThreshold: (val / threshold) * 100,
          estimatedWeeksToThreshold: estimateWeeks(distance, threshold),
          labName: lab.test,
          lastDate: lab.date,
        });
      }
    } else {
      // Patient needs to cross below threshold — look for values just above
      if (val > threshold && val <= threshold + window) {
        const distance = val - threshold;
        result.push({
          mrn: p.mrn,
          name: `${p.lastName}, ${p.firstName}`,
          currentValue: val,
          unit: lab.unit,
          threshold,
          direction: "falling",
          distanceToThreshold: distance,
          percentToThreshold: (threshold / val) * 100,
          estimatedWeeksToThreshold: estimateWeeks(distance, threshold),
          labName: lab.test,
          lastDate: lab.date,
        });
      }
    }
  }

  result.sort((a, b) => a.distanceToThreshold - b.distanceToThreshold);

  return {
    labName,
    threshold,
    unit: result[0]?.unit ?? "",
    direction,
    description: direction === "above"
      ? `Patients approaching ${labName} ≥ ${threshold}`
      : `Patients approaching ${labName} ≤ ${threshold}`,
    patients: result,
  };
}

function estimateWeeks(distance: number, threshold: number): number | null {
  // Simple heuristic: assume typical rate of change
  const rate = threshold * 0.02; // 2% per month typical drift
  if (rate <= 0) return null;
  const months = distance / rate;
  return Math.round(months * 4.3); // weeks
}

// ============================================================
// 4. DIVERSITY DASHBOARD
// ============================================================

export interface DiversityProfile {
  totalPatients: number;
  genderBreakdown: { label: string; count: number; percent: number; color: string }[];
  raceBreakdown: { label: string; count: number; percent: number; color: string }[];
  ethnicityBreakdown: { label: string; count: number; percent: number; color: string }[];
  ageBreakdown: { range: string; count: number; percent: number }[];
  insuranceBreakdown: { label: string; count: number; percent: number; color: string }[];
  diversityScore: number; // 0-100
  fdaComplianceNotes: string[];
}

const RACE_COLORS: Record<string, string> = {
  "White": "#3b82f6",
  "Black or African American": "#10b981",
  "Asian": "#f59e0b",
  "Hispanic or Latino": "#ec4899",
  "American Indian or Alaska Native": "#8b5cf6",
  "Native Hawaiian or Other Pacific Islander": "#06b6d4",
  "Other": "#6b7280",
  "Unknown": "#374151",
};

const GENDER_COLORS: Record<string, string> = {
  "Female": "#ec4899",
  "Male": "#3b82f6",
  "Other": "#a78bfa",
};

const INSURANCE_COLORS: Record<string, string> = {
  "Commercial": "#3b82f6",
  "Medicare": "#10b981",
  "Medicaid": "#f59e0b",
  "Uninsured": "#ef4444",
};

export function computeDiversityProfile(patients: ParsedPatient[]): DiversityProfile {
  const total = patients.length;
  if (total === 0) {
    return {
      totalPatients: 0,
      genderBreakdown: [],
      raceBreakdown: [],
      ethnicityBreakdown: [],
      ageBreakdown: [],
      insuranceBreakdown: [],
      diversityScore: 0,
      fdaComplianceNotes: [],
    };
  }

  // Gender
  const genderCounts = countBy(patients, (p) => p.sex);
  const genderBreakdown = Object.entries(genderCounts)
    .map(([label, count]) => ({
      label,
      count,
      percent: (count / total) * 100,
      color: GENDER_COLORS[label] ?? "#6b7280",
    }))
    .sort((a, b) => b.count - a.count);

  // Race
  const raceCounts = countBy(patients, (p) => p.race || "Unknown");
  const raceBreakdown = Object.entries(raceCounts)
    .map(([label, count]) => ({
      label,
      count,
      percent: (count / total) * 100,
      color: RACE_COLORS[label] ?? "#6b7280",
    }))
    .sort((a, b) => b.count - a.count);

  // Ethnicity
  const ethCounts = countBy(patients, (p) => p.ethnicity || "Unknown");
  const ethnicityBreakdown = Object.entries(ethCounts)
    .map(([label, count]) => ({
      label,
      count,
      percent: (count / total) * 100,
      color: label.includes("Hispanic") ? "#ec4899" : "#3b82f6",
    }))
    .sort((a, b) => b.count - a.count);

  // Age
  const ageBuckets = [
    { range: "18-30", min: 18, max: 30 },
    { range: "31-40", min: 31, max: 40 },
    { range: "41-50", min: 41, max: 50 },
    { range: "51-60", min: 51, max: 60 },
    { range: "61-70", min: 61, max: 70 },
    { range: "71-80", min: 71, max: 80 },
    { range: "80+", min: 81, max: 200 },
  ];
  const ageBreakdown = ageBuckets.map((b) => {
    const count = patients.filter((p) => {
      const age = calculateAge(p.dob);
      return age >= b.min && age <= b.max;
    }).length;
    return { range: b.range, count, percent: (count / total) * 100 };
  });

  // Insurance
  const insCounts = countBy(patients, (p) => {
    const ins = p.insurance.toUpperCase();
    if (ins.includes("MEDICARE")) return "Medicare";
    if (ins.includes("MEDICAID")) return "Medicaid";
    if (!ins || ins === "NONE" || ins === "SELF-PAY") return "Uninsured";
    return "Commercial";
  });
  const insuranceBreakdown = Object.entries(insCounts)
    .map(([label, count]) => ({
      label,
      count,
      percent: (count / total) * 100,
      color: INSURANCE_COLORS[label] ?? "#6b7280",
    }))
    .sort((a, b) => b.count - a.count);

  // Diversity score (Simpson's diversity index adapted)
  const raceProportions = Object.values(raceCounts).map((c) => c / total);
  const simpsonD = 1 - raceProportions.reduce((sum, p) => sum + p * p, 0);
  const diversityScore = Math.round(simpsonD * 100);

  // FDA compliance notes
  const fdaComplianceNotes: string[] = [];
  const blackPct = (raceCounts["Black or African American"] ?? 0) / total * 100;
  const hispanicPct = ethnicityBreakdown.find((e) => e.label.includes("Hispanic"))?.percent ?? 0;
  const asianPct = (raceCounts["Asian"] ?? 0) / total * 100;
  const femalePct = (genderCounts["Female"] ?? 0) / total * 100;

  if (blackPct >= 13) {
    fdaComplianceNotes.push(`Strong Black/African American representation (${blackPct.toFixed(0)}%) — exceeds US census proportion (13.6%)`);
  } else if (blackPct >= 8) {
    fdaComplianceNotes.push(`Moderate Black/African American representation (${blackPct.toFixed(0)}%) — approaching US census proportion`);
  } else {
    fdaComplianceNotes.push(`Low Black/African American representation (${blackPct.toFixed(0)}%) — below US census proportion (13.6%)`);
  }

  if (hispanicPct >= 10) {
    fdaComplianceNotes.push(`Good Hispanic/Latino representation (${hispanicPct.toFixed(0)}%)`);
  }

  if (asianPct >= 5) {
    fdaComplianceNotes.push(`Asian population well represented (${asianPct.toFixed(0)}%)`);
  }

  if (femalePct >= 40 && femalePct <= 60) {
    fdaComplianceNotes.push(`Balanced gender distribution (${femalePct.toFixed(0)}% female)`);
  }

  const over65 = patients.filter((p) => calculateAge(p.dob) >= 65).length;
  const elderlyPct = (over65 / total) * 100;
  if (elderlyPct >= 20) {
    fdaComplianceNotes.push(`Strong elderly representation (${elderlyPct.toFixed(0)}% aged 65+) — supports geriatric subgroup analysis`);
  }

  return {
    totalPatients: total,
    genderBreakdown,
    raceBreakdown,
    ethnicityBreakdown,
    ageBreakdown,
    insuranceBreakdown,
    diversityScore,
    fdaComplianceNotes,
  };
}

// ============================================================
// PRESET FEASIBILITY QUERIES (common sponsor requests)
// ============================================================

export const PRESET_QUERIES: FeasibilityQuery[] = [
  {
    id: "nsclc-2nd-line",
    name: "NSCLC 2nd-Line Immunotherapy",
    criteria: [
      { type: "diagnosis", field: "", operator: "contains", value: "C34" },
      { type: "age_range", field: "", operator: "between", value: "18", valueTo: "80" },
      { type: "lab_range", field: "eGFR", operator: "gte", value: "30" },
    ],
  },
  {
    id: "t2d-glp1",
    name: "Type 2 Diabetes — GLP-1 RA Trial",
    criteria: [
      { type: "diagnosis", field: "", operator: "contains", value: "E11" },
      { type: "lab_range", field: "HbA1c", operator: "gte", value: "7.0" },
      { type: "bmi_range", field: "", operator: "gte", value: "27" },
    ],
  },
  {
    id: "hf-sglt2",
    name: "Heart Failure — SGLT2 Inhibitor",
    criteria: [
      { type: "diagnosis", field: "", operator: "contains", value: "I50" },
      { type: "age_range", field: "", operator: "between", value: "18", valueTo: "85" },
      { type: "lab_range", field: "BNP", operator: "gte", value: "100" },
    ],
  },
  {
    id: "obesity-pharmacotherapy",
    name: "Obesity Pharmacotherapy Trial",
    criteria: [
      { type: "bmi_range", field: "", operator: "gte", value: "30" },
      { type: "age_range", field: "", operator: "between", value: "18", valueTo: "65" },
    ],
  },
  {
    id: "alzheimers-early",
    name: "Early Alzheimer's — Anti-Amyloid",
    criteria: [
      { type: "diagnosis", field: "", operator: "contains", value: "G30" },
      { type: "age_range", field: "", operator: "between", value: "50", valueTo: "85" },
    ],
  },
  {
    id: "crohns-biologic",
    name: "Crohn's Disease — Biologic Therapy",
    criteria: [
      { type: "diagnosis", field: "", operator: "contains", value: "K50" },
      { type: "lab_range", field: "CRP", operator: "gte", value: "5" },
    ],
  },
];

// ============================================================
// LAB TRAJECTORY PRESETS (common eligibility thresholds)
// ============================================================

export interface LabThresholdPreset {
  id: string;
  name: string;
  labName: string;
  threshold: number;
  unit: string;
  direction: "above" | "below";
  trialContext: string;
}

export const LAB_THRESHOLD_PRESETS: LabThresholdPreset[] = [
  { id: "hba1c-7", name: "HbA1c ≥ 7.0%", labName: "HbA1c", threshold: 7.0, unit: "%", direction: "above", trialContext: "T2D / GLP-1 RA studies" },
  { id: "hba1c-8", name: "HbA1c ≥ 8.0%", labName: "HbA1c", threshold: 8.0, unit: "%", direction: "above", trialContext: "Insulin initiation trials" },
  { id: "egfr-60", name: "eGFR < 60", labName: "eGFR", threshold: 60, unit: "mL/min", direction: "below", trialContext: "CKD / nephrology studies" },
  { id: "bnp-100", name: "BNP ≥ 100 pg/mL", labName: "BNP", threshold: 100, unit: "pg/mL", direction: "above", trialContext: "Heart failure studies" },
  { id: "crp-5", name: "CRP ≥ 5 mg/L", labName: "CRP", threshold: 5, unit: "mg/L", direction: "above", trialContext: "Inflammatory / IBD studies" },
  { id: "ldl-130", name: "LDL ≥ 130 mg/dL", labName: "LDL", threshold: 130, unit: "mg/dL", direction: "above", trialContext: "Lipid-lowering studies" },
];

// ============================================================
// HELPERS
// ============================================================

function computeDemographics(patients: ParsedPatient[]) {
  if (patients.length === 0) {
    return { avgAge: 0, genderSplit: { male: 0, female: 0, other: 0 }, raceSplit: {} };
  }
  const ages = patients.map((p) => calculateAge(p.dob));
  const avgAge = Math.round(ages.reduce((s, a) => s + a, 0) / ages.length);
  const genderSplit = { male: 0, female: 0, other: 0 };
  for (const p of patients) {
    if (p.sex.toLowerCase() === "male") genderSplit.male++;
    else if (p.sex.toLowerCase() === "female") genderSplit.female++;
    else genderSplit.other++;
  }
  const raceSplit = countBy(patients, (p) => p.race || "Unknown");
  return { avgAge, genderSplit, raceSplit };
}

function countBy<T>(items: T[], fn: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = fn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
