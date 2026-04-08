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
export type ReviewStatus = "pending" | "accepted" | "rejected" | "deferred" | "needs_pi_review";

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

export type LlmStatus = "not_configured" | "model_downloading" | "model_ready" | "starting" | "running" | "error" | "stopped";
export type LlmBackend = "none" | "ollama" | "llama_server";

export interface AppStatus {
  llmStatus: LlmStatus;
  llmModel: string | null;
  llmBackend: LlmBackend;
  databaseReady: boolean;
  patientCount: number;
  studyCount: number;
  lastImport: string | null;
}

export type NavigationPage =
  | "dashboard"
  | "screening"
  | "import"
  | "trials"
  | "review"
  | "analytics"
  | "pipeline"
  | "performance"
  | "intelligence"
  | "registry"
  | "naaccr"
  | "settings";

// --- Multi-Protocol Screening ---

export interface MultiScreenRequest {
  studyIds: string[];
  patientIds?: string[];
}

export interface MultiScreenBatchResponse {
  batchId: string;
  results: ScreeningResultResponse[];
  studyCount: number;
  patientCount: number;
}

export interface ScreeningResultResponse {
  screeningId: string;
  patientId: string;
  studyId: string;
  sitePatientId: string;
  age: number | null;
  gender: string | null;
  primaryDiagnosis: string | null;
  overallStatus: ScreeningStatus;
  score: number;
  inclusionMet: number;
  inclusionTotal: number;
  exclusionTriggered: number;
  exclusionTotal: number;
  missingDataCount: number;
}

export interface ScreeningProgress {
  batchId: string;
  studiesCompleted: number;
  studiesTotal: number;
  currentStudyName: string;
}

export interface MatrixCell {
  patientId: string;
  studyId: string;
  score: number;
  status: ScreeningStatus;
  inclusionMet: number;
  inclusionTotal: number;
  exclusionTriggered: number;
}

export interface PatientBestMatches {
  patientId: string;
  sitePatientId: string;
  age: number | null;
  gender: string | null;
  primaryDiagnosis: string | null;
  matches: Array<{
    studyId: string;
    studyTitle: string;
    score: number;
    status: ScreeningStatus;
  }>;
}

// --- Patient Registry ---

export type ConsentType = "general_research" | "condition_specific" | "full_record" | "healthy_volunteer";
export type ConsentStatus = "active" | "withdrawn" | "expired";
export type RegistryAvailability = "available" | "enrolled" | "washout" | "unavailable";

export interface PatientConsent {
  id: string;
  patientId: string;
  consentType: ConsentType;
  conditionScope: string | null;
  status: ConsentStatus;
  grantedDate: string;
  expiryDate: string | null;
  withdrawnDate: string | null;
  withdrawalReason: string | null;
  documentedBy: string | null;
  notes: string | null;
}

export interface PatientRegistryStatus {
  patientId: string;
  registryStatus: "active" | "inactive" | "deceased" | "withdrawn";
  availability: RegistryAvailability;
  washoutUntil: string | null;
  totalStudiesParticipated: number;
  lastStudyEndDate: string | null;
  maxConcurrentStudies: number;
  compensationTotalCents: number;
  annualCompensationLimitCents: number | null;
}

export interface RegistryDashboard {
  totalPatients: number;
  byConsentTier: Record<ConsentType, number>;
  byAvailability: Record<RegistryAvailability, number>;
  topConditions: Array<{ icd10Prefix: string; description: string; count: number }>;
  recentUpdates: Array<{ patientId: string; action: string; timestamp: string }>;
}

export interface AutoMatchNotification {
  id: string;
  patientId: string;
  studyId: string;
  score: number;
  status: ScreeningStatus;
  notifiedAt: string;
  dismissed: boolean;
  actioned: boolean;
}
