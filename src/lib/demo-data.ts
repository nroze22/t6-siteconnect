import type {
  PatientSummary,
  ScreeningResult,
  CriterionResult,
  Diagnosis,
  Medication,
  LabResult,
  VitalSign,
} from "@/types";

// ============================================================
// Demo Patient Data for the KEYNOTE-789 NSCLC Study
// ============================================================

const STUDY_ID = "study-1";

// Per-patient clinical data
export interface PatientClinicalData {
  diagnoses: Diagnosis[];
  medications: Medication[];
  labs: LabResult[];
  vitals: VitalSign[];
}

// 25 patients with realistic clinical data
const rawPatients: {
  id: string;
  mrn: string;
  age: number;
  gender: "male" | "female";
  primaryDx: string;
  score: number;
  status: PatientSummary["overallStatus"];
  reviewStatus: PatientSummary["reviewStatus"];
  incMet: number;
  incTotal: number;
  exclTriggered: number;
  exclTotal: number;
  missing: number;
}[] = [
  { id: "p1", mrn: "PT-10042", age: 62, gender: "male", primaryDx: "NSCLC (C34.1)", score: 94, status: "eligible", reviewStatus: "pending", incMet: 9, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 0 },
  { id: "p2", mrn: "PT-10088", age: 58, gender: "female", primaryDx: "NSCLC (C34.9)", score: 91, status: "eligible", reviewStatus: "pending", incMet: 9, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 1 },
  { id: "p3", mrn: "PT-10103", age: 67, gender: "male", primaryDx: "NSCLC (C34.3)", score: 89, status: "eligible", reviewStatus: "pending", incMet: 8, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 1 },
  { id: "p4", mrn: "PT-10217", age: 54, gender: "female", primaryDx: "NSCLC (C34.1)", score: 87, status: "eligible", reviewStatus: "pending", incMet: 8, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 1 },
  { id: "p5", mrn: "PT-10305", age: 71, gender: "male", primaryDx: "NSCLC (C34.9)", score: 85, status: "eligible", reviewStatus: "pending", incMet: 8, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 0 },
  { id: "p6", mrn: "PT-10412", age: 60, gender: "female", primaryDx: "NSCLC (C34.2)", score: 83, status: "eligible", reviewStatus: "pending", incMet: 8, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 1 },
  { id: "p7", mrn: "PT-10098", age: 65, gender: "male", primaryDx: "NSCLC (C34.1)", score: 81, status: "eligible", reviewStatus: "pending", incMet: 7, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 2 },
  { id: "p8", mrn: "PT-10556", age: 49, gender: "female", primaryDx: "NSCLC (C34.9)", score: 80, status: "eligible", reviewStatus: "pending", incMet: 7, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 2 },
  { id: "p9", mrn: "PT-10623", age: 73, gender: "male", primaryDx: "NSCLC (C34.1)", score: 72, status: "potentially_eligible", reviewStatus: "pending", incMet: 7, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 3 },
  { id: "p10", mrn: "PT-10701", age: 56, gender: "female", primaryDx: "NSCLC (C34.3)", score: 68, status: "potentially_eligible", reviewStatus: "pending", incMet: 6, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 3 },
  { id: "p11", mrn: "PT-10789", age: 64, gender: "male", primaryDx: "NSCLC (C34.9)", score: 65, status: "potentially_eligible", reviewStatus: "pending", incMet: 6, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 4 },
  { id: "p12", mrn: "PT-10834", age: 69, gender: "female", primaryDx: "NSCLC (C34.1)", score: 58, status: "potentially_eligible", reviewStatus: "pending", incMet: 5, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 4 },
  { id: "p13", mrn: "PT-10901", age: 52, gender: "male", primaryDx: "NSCLC (C34.2)", score: 55, status: "potentially_eligible", reviewStatus: "pending", incMet: 5, incTotal: 10, exclTriggered: 1, exclTotal: 6, missing: 3 },
  { id: "p14", mrn: "PT-10445", age: 76, gender: "male", primaryDx: "NSCLC (C34.9)", score: 52, status: "potentially_eligible", reviewStatus: "pending", incMet: 5, incTotal: 10, exclTriggered: 1, exclTotal: 6, missing: 2 },
  { id: "p15", mrn: "PT-11023", age: 45, gender: "female", primaryDx: "Breast Ca (C50.9)", score: 22, status: "ineligible", reviewStatus: "pending", incMet: 2, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 1 },
  { id: "p16", mrn: "PT-11067", age: 61, gender: "male", primaryDx: "CRC (C18.9)", score: 18, status: "ineligible", reviewStatus: "pending", incMet: 2, incTotal: 10, exclTriggered: 1, exclTotal: 6, missing: 0 },
  { id: "p17", mrn: "PT-11109", age: 55, gender: "female", primaryDx: "HTN (I10)", score: 12, status: "ineligible", reviewStatus: "pending", incMet: 1, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 0 },
  { id: "p18", mrn: "PT-11234", age: 70, gender: "male", primaryDx: "T2DM (E11.9)", score: 10, status: "ineligible", reviewStatus: "pending", incMet: 1, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 0 },
  { id: "p19", mrn: "PT-11301", age: 48, gender: "female", primaryDx: "Asthma (J45.20)", score: 8, status: "ineligible", reviewStatus: "pending", incMet: 1, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 0 },
  { id: "p20", mrn: "PT-11378", age: 63, gender: "male", primaryDx: "NSCLC (C34.1)", score: 35, status: "ineligible", reviewStatus: "pending", incMet: 4, incTotal: 10, exclTriggered: 3, exclTotal: 6, missing: 0 },
  { id: "p21", mrn: "PT-11456", age: 59, gender: "female", primaryDx: "NSCLC (C34.9)", score: 28, status: "ineligible", reviewStatus: "pending", incMet: 4, incTotal: 10, exclTriggered: 2, exclTotal: 6, missing: 1 },
  { id: "p22", mrn: "PT-11523", age: 66, gender: "male", primaryDx: "NSCLC (C34.1)", score: 48, status: "needs_review", reviewStatus: "pending", incMet: 5, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 5 },
  { id: "p23", mrn: "PT-11601", age: 57, gender: "female", primaryDx: "NSCLC (C34.3)", score: 45, status: "needs_review", reviewStatus: "pending", incMet: 4, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 5 },
  { id: "p24", mrn: "PT-11678", age: 74, gender: "male", primaryDx: "NSCLC (C34.9)", score: 42, status: "needs_review", reviewStatus: "pending", incMet: 4, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 6 },
  { id: "p25", mrn: "PT-11745", age: 51, gender: "female", primaryDx: "NSCLC (C34.1)", score: 40, status: "needs_review", reviewStatus: "pending", incMet: 3, incTotal: 10, exclTriggered: 0, exclTotal: 6, missing: 6 },
];

export const demoPatients: PatientSummary[] = rawPatients
  .map((p) => ({
    id: p.id,
    sitePatientId: p.mrn,
    age: p.age,
    gender: p.gender,
    primaryDiagnosis: p.primaryDx,
    score: p.score,
    overallStatus: p.status,
    reviewStatus: p.reviewStatus,
    inclusionMet: p.incMet,
    inclusionTotal: p.incTotal,
    exclusionTriggered: p.exclTriggered,
    exclusionTotal: p.exclTotal,
    missingDataCount: p.missing,
  }))
  .sort((a, b) => b.score - a.score);

// Screening results for each patient
export const demoScreeningResults = new Map<string, ScreeningResult>(
  rawPatients.map((p) => [
    p.id,
    {
      id: `sr-${p.id}`,
      patientId: p.id,
      studyId: STUDY_ID,
      overallStatus: p.status,
      inclusionMet: p.incMet,
      inclusionTotal: p.incTotal,
      exclusionTriggered: p.exclTriggered,
      exclusionTotal: p.exclTotal,
      missingDataCount: p.missing,
      score: p.score,
      screenedAt: "2026-03-05T14:30:00Z",
      reviewedBy: null,
      reviewStatus: p.reviewStatus,
      reviewNotes: null,
    },
  ])
);

// Criteria for the first patient (detailed example)
function makeCriteria(patientId: string, p: (typeof rawPatients)[0]): CriterionResult[] {
  const srId = `sr-${patientId}`;
  const isNsclc = p.primaryDx.includes("NSCLC");
  const isEligibleTier = p.score >= 80;

  const inclusion: CriterionResult[] = [
    {
      id: `cr-${patientId}-inc1`, screeningResultId: srId, criterionId: "c-inc1",
      criterionType: "inclusion", criterionText: "Age >= 18 years",
      result: "met", evidence: `Patient age: ${p.age} years`, evidenceSource: "demographics",
      confidence: 1.0, reasoning: "Rule-based: age comparison", aiDetermined: false, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-inc2`, screeningResultId: srId, criterionId: "c-inc2",
      criterionType: "inclusion", criterionText: "Histologically or cytologically confirmed diagnosis of non-small cell lung cancer (NSCLC)",
      result: isNsclc ? "met" : "not_met",
      evidence: isNsclc ? `ICD-10: ${p.primaryDx}` : `Primary diagnosis: ${p.primaryDx} (not NSCLC)`,
      evidenceSource: "diagnoses", confidence: 1.0, reasoning: "Rule-based: ICD-10 code C34.x match",
      aiDetermined: false, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-inc3`, screeningResultId: srId, criterionId: "c-inc3",
      criterionType: "inclusion", criterionText: "Stage IIIB or IV disease not amenable to curative surgery or radiation",
      result: isEligibleTier ? "met" : (isNsclc ? "unknown" : "not_met"),
      evidence: isEligibleTier ? "Clinical notes indicate Stage IV metastatic disease" : null,
      evidenceSource: "diagnoses", confidence: isEligibleTier ? 0.85 : 0.3,
      reasoning: "AI reviewed clinical notes for staging information",
      aiDetermined: true, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-inc4`, screeningResultId: srId, criterionId: "c-inc4",
      criterionType: "inclusion", criterionText: "ECOG performance status 0-1",
      result: isEligibleTier ? "met" : (p.score >= 50 ? "unknown" : "not_met"),
      evidence: isEligibleTier ? "Most recent ECOG score: 1" : null,
      evidenceSource: "vitals", confidence: isEligibleTier ? 0.9 : 0.4,
      reasoning: "AI extracted ECOG status from clinical notes",
      aiDetermined: true, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-inc5`, screeningResultId: srId, criterionId: "c-inc5",
      criterionType: "inclusion", criterionText: "At least one measurable lesion per RECIST v1.1",
      result: isEligibleTier ? "met" : "unknown",
      evidence: isEligibleTier ? "CT scan shows 3.2cm right upper lobe mass" : null,
      evidenceSource: "notes", confidence: isEligibleTier ? 0.82 : 0.0,
      reasoning: isEligibleTier ? "AI identified lesion measurements in imaging report" : "No imaging data available",
      aiDetermined: true, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-inc6`, screeningResultId: srId, criterionId: "c-inc6",
      criterionType: "inclusion", criterionText: "Adequate hematologic function: ANC >= 1500/uL, Platelets >= 100,000/uL, Hemoglobin >= 9.0 g/dL",
      result: isEligibleTier ? "met" : (p.score >= 40 ? "unknown" : "not_met"),
      evidence: isEligibleTier ? "ANC: 3200/uL, PLT: 245,000/uL, Hgb: 12.1 g/dL" : null,
      evidenceSource: "labs", confidence: 1.0,
      reasoning: "Rule-based: lab value comparison against thresholds",
      aiDetermined: false, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-inc7`, screeningResultId: srId, criterionId: "c-inc7",
      criterionType: "inclusion", criterionText: "Adequate renal function: eGFR >= 60 mL/min/1.73m2 or Creatinine <= 1.5x ULN",
      result: isEligibleTier ? "met" : (p.score >= 50 ? "met" : "unknown"),
      evidence: isEligibleTier ? "eGFR: 78 mL/min, Creatinine: 1.0 mg/dL" : (p.score >= 50 ? "eGFR: 65 mL/min" : null),
      evidenceSource: "labs", confidence: 1.0, reasoning: "Rule-based: eGFR >= 60",
      aiDetermined: false, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-inc8`, screeningResultId: srId, criterionId: "c-inc8",
      criterionType: "inclusion", criterionText: "Adequate hepatic function: Total bilirubin <= 1.5x ULN, AST/ALT <= 2.5x ULN",
      result: isEligibleTier ? "met" : (p.score >= 50 ? "met" : "unknown"),
      evidence: isEligibleTier ? "Total Bili: 0.8 mg/dL, AST: 28 U/L, ALT: 32 U/L" : null,
      evidenceSource: "labs", confidence: 1.0, reasoning: "Rule-based: liver function within limits",
      aiDetermined: false, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-inc9`, screeningResultId: srId, criterionId: "c-inc9",
      criterionType: "inclusion", criterionText: "No prior systemic therapy for metastatic NSCLC",
      result: isEligibleTier ? "met" : (p.score >= 50 ? "unknown" : "not_met"),
      evidence: isEligibleTier ? "No prior systemic chemotherapy in medication history" : null,
      evidenceSource: "medications", confidence: isEligibleTier ? 0.88 : 0.5,
      reasoning: "AI reviewed medication history for prior chemotherapy",
      aiDetermined: true, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-inc10`, screeningResultId: srId, criterionId: "c-inc10",
      criterionType: "inclusion", criterionText: "Willing and able to provide written informed consent",
      result: "needs_review", evidence: null, evidenceSource: null,
      confidence: 0.0, reasoning: "Cannot be determined from medical records — requires in-person assessment",
      aiDetermined: false, humanVerified: false, humanOverride: null,
    },
  ];

  const exclusion: CriterionResult[] = [
    {
      id: `cr-${patientId}-exc1`, screeningResultId: srId, criterionId: "c-exc1",
      criterionType: "exclusion", criterionText: "Active autoimmune disease requiring systemic treatment in past 2 years",
      result: p.exclTriggered > 0 && p.score < 40 ? "met" : "not_met",
      evidence: p.exclTriggered > 0 && p.score < 40 ? "Active rheumatoid arthritis on methotrexate" : "No autoimmune conditions in diagnosis history",
      evidenceSource: "diagnoses", confidence: 0.92,
      reasoning: "AI reviewed diagnoses for autoimmune conditions",
      aiDetermined: true, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-exc2`, screeningResultId: srId, criterionId: "c-exc2",
      criterionType: "exclusion", criterionText: "Known active CNS metastases and/or carcinomatous meningitis",
      result: p.exclTriggered >= 2 ? "met" : "not_met",
      evidence: p.exclTriggered >= 2 ? "Brain MRI shows 2 metastatic lesions" : "No CNS metastases documented",
      evidenceSource: "diagnoses", confidence: 0.85,
      reasoning: "AI reviewed imaging and diagnosis records",
      aiDetermined: true, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-exc3`, screeningResultId: srId, criterionId: "c-exc3",
      criterionType: "exclusion", criterionText: "Prior treatment with anti-PD-1, anti-PD-L1, or anti-PD-L2 agent",
      result: p.exclTriggered >= 3 ? "met" : "not_met",
      evidence: p.exclTriggered >= 3 ? "Prior pembrolizumab therapy (2024)" : "No prior immunotherapy in medication history",
      evidenceSource: "medications", confidence: 1.0,
      reasoning: "Rule-based: medication history search for checkpoint inhibitors",
      aiDetermined: false, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-exc4`, screeningResultId: srId, criterionId: "c-exc4",
      criterionType: "exclusion", criterionText: "Active infection requiring systemic therapy",
      result: "not_met", evidence: "No active infections documented",
      evidenceSource: "diagnoses", confidence: 0.9,
      reasoning: "AI reviewed current diagnoses and medications for infection indicators",
      aiDetermined: true, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-exc5`, screeningResultId: srId, criterionId: "c-exc5",
      criterionType: "exclusion", criterionText: "Pregnant or breastfeeding",
      result: p.gender === "male" ? "not_met" : "not_met",
      evidence: p.gender === "male" ? "Male patient — not applicable" : "No pregnancy indicators in records",
      evidenceSource: "demographics", confidence: 1.0,
      reasoning: p.gender === "male" ? "Rule-based: male gender" : "Rule-based: age and gender assessment",
      aiDetermined: false, humanVerified: false, humanOverride: null,
    },
    {
      id: `cr-${patientId}-exc6`, screeningResultId: srId, criterionId: "c-exc6",
      criterionType: "exclusion", criterionText: "Known history of HIV, Hepatitis B, or Hepatitis C",
      result: "not_met", evidence: "No HIV/HBV/HCV in diagnosis history",
      evidenceSource: "diagnoses", confidence: 1.0,
      reasoning: "Rule-based: ICD-10 code search for B20, B18.x, B17.1",
      aiDetermined: false, humanVerified: false, humanOverride: null,
    },
  ];

  return [...inclusion, ...exclusion];
}

export const demoCriteriaResults = new Map<string, CriterionResult[]>(
  rawPatients.map((p) => [`sr-${p.id}`, makeCriteria(p.id, p)])
);

// Clinical data for selected patients
export function getPatientClinicalData(patientId: string): PatientClinicalData {
  const p = rawPatients.find((r) => r.id === patientId);
  if (!p) return { diagnoses: [], medications: [], labs: [], vitals: [] };

  const isNsclc = p.primaryDx.includes("NSCLC");

  const diagnoses: Diagnosis[] = [
    { id: `dx-${patientId}-1`, patientId, icd10Code: isNsclc ? "C34.1" : p.primaryDx.match(/\(([^)]+)\)/)?.[1] ?? "Z00", description: p.primaryDx.split(" (")[0] ?? p.primaryDx, onsetDate: "2024-08-15", status: "active", source: "structured", confidence: 1.0, rawText: null },
    { id: `dx-${patientId}-2`, patientId, icd10Code: "I10", description: "Essential hypertension", onsetDate: "2019-03-10", status: "active", source: "structured", confidence: 1.0, rawText: null },
    { id: `dx-${patientId}-3`, patientId, icd10Code: "E78.5", description: "Hyperlipidemia", onsetDate: "2020-11-22", status: "active", source: "structured", confidence: 1.0, rawText: null },
    { id: `dx-${patientId}-4`, patientId, icd10Code: "J44.1", description: "COPD with acute exacerbation", onsetDate: "2023-06-01", status: "historical", source: "structured", confidence: 1.0, rawText: null },
  ];

  const medications: Medication[] = [
    { id: `med-${patientId}-1`, patientId, rxnormCode: "6918", drugName: "Lisinopril", dose: "10mg", frequency: "QD", startDate: "2019-04-01", endDate: null, status: "active", source: "structured", confidence: 1.0 },
    { id: `med-${patientId}-2`, patientId, rxnormCode: "36567", drugName: "Atorvastatin", dose: "40mg", frequency: "QD", startDate: "2020-12-15", endDate: null, status: "active", source: "structured", confidence: 1.0 },
    { id: `med-${patientId}-3`, patientId, rxnormCode: "7052", drugName: "Metoprolol", dose: "25mg", frequency: "BID", startDate: "2021-05-20", endDate: null, status: "active", source: "structured", confidence: 1.0 },
  ];

  const labs: LabResult[] = [
    { id: `lab-${patientId}-1`, patientId, loincCode: "26464-8", testName: "ANC", value: 3200, unit: "/uL", referenceRange: "1500-8000", resultDate: "2026-02-28", abnormalFlag: null, source: "structured" },
    { id: `lab-${patientId}-2`, patientId, loincCode: "777-3", testName: "Platelets", value: 245000, unit: "/uL", referenceRange: "150000-400000", resultDate: "2026-02-28", abnormalFlag: null, source: "structured" },
    { id: `lab-${patientId}-3`, patientId, loincCode: "718-7", testName: "Hemoglobin", value: 12.1, unit: "g/dL", referenceRange: "12.0-17.5", resultDate: "2026-02-28", abnormalFlag: null, source: "structured" },
    { id: `lab-${patientId}-4`, patientId, loincCode: "33914-3", testName: "eGFR", value: 78, unit: "mL/min/1.73m2", referenceRange: ">60", resultDate: "2026-02-28", abnormalFlag: null, source: "structured" },
    { id: `lab-${patientId}-5`, patientId, loincCode: "2160-0", testName: "Creatinine", value: 1.0, unit: "mg/dL", referenceRange: "0.7-1.3", resultDate: "2026-02-28", abnormalFlag: null, source: "structured" },
    { id: `lab-${patientId}-6`, patientId, loincCode: "1975-2", testName: "Total Bilirubin", value: 0.8, unit: "mg/dL", referenceRange: "0.1-1.2", resultDate: "2026-02-28", abnormalFlag: null, source: "structured" },
    { id: `lab-${patientId}-7`, patientId, loincCode: "1920-8", testName: "AST", value: 28, unit: "U/L", referenceRange: "10-40", resultDate: "2026-02-28", abnormalFlag: null, source: "structured" },
    { id: `lab-${patientId}-8`, patientId, loincCode: "1742-6", testName: "ALT", value: 32, unit: "U/L", referenceRange: "7-56", resultDate: "2026-02-28", abnormalFlag: null, source: "structured" },
    { id: `lab-${patientId}-9`, patientId, loincCode: "6690-2", testName: "WBC", value: 6.8, unit: "10^3/uL", referenceRange: "4.5-11.0", resultDate: "2026-02-28", abnormalFlag: null, source: "structured" },
    { id: `lab-${patientId}-10`, patientId, loincCode: "2093-3", testName: "Total Cholesterol", value: 198, unit: "mg/dL", referenceRange: "<200", resultDate: "2026-02-28", abnormalFlag: null, source: "structured" },
  ];

  const vitals: VitalSign[] = [
    { id: `vit-${patientId}-1`, patientId, measurementType: "bp_systolic", value: 128, unit: "mmHg", measurementDate: "2026-02-28" },
    { id: `vit-${patientId}-2`, patientId, measurementType: "bp_diastolic", value: 82, unit: "mmHg", measurementDate: "2026-02-28" },
    { id: `vit-${patientId}-3`, patientId, measurementType: "hr", value: 72, unit: "bpm", measurementDate: "2026-02-28" },
    { id: `vit-${patientId}-4`, patientId, measurementType: "weight", value: 78.5, unit: "kg", measurementDate: "2026-02-28" },
    { id: `vit-${patientId}-5`, patientId, measurementType: "height", value: 175, unit: "cm", measurementDate: "2026-02-28" },
    { id: `vit-${patientId}-6`, patientId, measurementType: "bmi", value: 25.6, unit: "kg/m2", measurementDate: "2026-02-28" },
  ];

  return { diagnoses, medications, labs, vitals };
}
