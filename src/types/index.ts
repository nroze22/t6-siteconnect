// ==========================================
// Core Domain Types for TalOS SiteConnect
// ==========================================

// --- Patient Data ---

export interface Patient {
  id: string;
  sitePatientId: string;
  dateOfBirth: string;
  gender: "male" | "female" | "other" | "unknown";
  race: string | null;
  ethnicity: string | null;
  insuranceType: string | null;
  importedAt: string;
  importSource: string;
  lastUpdated: string;
}

export interface Diagnosis {
  id: string;
  patientId: string;
  icd10Code: string | null;
  description: string;
  onsetDate: string | null;
  status: "active" | "resolved" | "historical";
  source: "structured" | "extracted_ner" | "extracted_llm";
  confidence: number;
  rawText: string | null;
}

export interface Medication {
  id: string;
  patientId: string;
  rxnormCode: string | null;
  drugName: string;
  dose: string | null;
  frequency: string | null;
  startDate: string | null;
  endDate: string | null;
  status: "active" | "discontinued" | "historical";
  source: "structured" | "extracted_ner" | "extracted_llm";
  confidence: number;
}

export interface LabResult {
  id: string;
  patientId: string;
  loincCode: string | null;
  testName: string;
  value: number | null;
  unit: string | null;
  referenceRange: string | null;
  resultDate: string | null;
  abnormalFlag: string | null;
  source: string;
}

export interface VitalSign {
  id: string;
  patientId: string;
  measurementType: "height" | "weight" | "bmi" | "bp_systolic" | "bp_diastolic" | "hr" | "temp";
  value: number;
  unit: string;
  measurementDate: string | null;
}

export interface ClinicalNote {
  id: string;
  patientId: string;
  noteType: string;
  noteText: string;
  noteDate: string | null;
  entitiesExtracted: boolean;
}

// --- Studies ---

export interface Study {
  id: string;
  nctNumber: string | null;
  title: string;
  shortTitle: string | null;
  sponsor: string;
  phase: "Phase 1" | "Phase 2" | "Phase 3" | "Phase 4" | "Phase 1/2" | "Phase 2/3";
  status: "recruiting" | "not_yet_recruiting" | "active_not_recruiting" | "completed" | "suspended";
  therapeuticArea: string;
  indication: string;
  studyType: "interventional" | "observational";
  summary: string | null;
  source: "curated" | "talos_network" | "custom";
  lastSynced: string | null;
  // Financial (integer cents)
  estimatedPerPatientValueCents: number | null;
  estimatedSiteStartupCents: number | null;
  currency: string;
  paymentModel: "per_visit" | "per_patient" | "milestone" | "hybrid" | "unknown";
  financialDetails: string | null; // JSON blob
}

export interface StudyCriterion {
  id: string;
  studyId: string;
  type: "inclusion" | "exclusion";
  criterionNumber: number;
  criterionText: string;
  structuredRule: string | null; // JSON
  ruleType: "structured" | "llm_required";
}

// --- Screening ---

export type ScreeningStatus = "eligible" | "potentially_eligible" | "ineligible" | "needs_review";
export type CriterionResultType = "met" | "not_met" | "unknown" | "needs_review";
export type ReviewStatus = "pending" | "accepted" | "rejected" | "deferred";

export interface ScreeningResult {
  id: string;
  patientId: string;
  studyId: string;
  overallStatus: ScreeningStatus;
  inclusionMet: number;
  inclusionTotal: number;
  exclusionTriggered: number;
  exclusionTotal: number;
  missingDataCount: number;
  score: number; // 0-100
  screenedAt: string;
  reviewedBy: string | null;
  reviewStatus: ReviewStatus;
  reviewNotes: string | null;
}

export interface CriterionResult {
  id: string;
  screeningResultId: string;
  criterionId: string;
  criterionType: "inclusion" | "exclusion";
  criterionText: string;
  result: CriterionResultType;
  evidence: string | null;
  evidenceSource: string | null;
  confidence: number;
  reasoning: string | null;
  aiDetermined: boolean;
  humanVerified: boolean;
  humanOverride: string | null;
}

// --- Patient Summary (for list view) ---

export interface PatientSummary {
  id: string;
  sitePatientId: string;
  age: number;
  gender: string;
  primaryDiagnosis: string | null;
  score: number;
  overallStatus: ScreeningStatus;
  reviewStatus: ReviewStatus;
  inclusionMet: number;
  inclusionTotal: number;
  exclusionTriggered: number;
  exclusionTotal: number;
  missingDataCount: number;
}

// --- Import ---

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number;
}

export interface ImportResult {
  fileName: string;
  format: string;
  recordsImported: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: string[];
}

// --- Financial ---

export interface FinancialOpportunity {
  studyId: string;
  studyTitle: string;
  eligibleCount: number;
  estimatedPerPatientCents: number;
  enrollmentRatePercent: number;
  screenFailureRatePercent: number;
  retentionRatePercent: number;
  projectedEnrollment: number;
  projectedRevenueCents: number;
}

// --- App State ---

export type LlmStatus = "not_configured" | "starting" | "ready" | "error" | "disabled";

export interface AppStatus {
  llmStatus: LlmStatus;
  llmModel: string | null;
  databaseReady: boolean;
  patientCount: number;
  studyCount: number;
  lastImport: string | null;
}

export type NavigationPage =
  | "screening"
  | "import"
  | "trials"
  | "review"
  | "analytics"
  | "pipeline"
  | "performance"
  | "settings";
