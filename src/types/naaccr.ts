// ─── NAACCR Tumor Registry Types ───
// Types for mandated cancer case reporting and registry automation

export type AbstractStatus = "draft" | "in_progress" | "complete" | "submitted" | "accepted";

export interface ReportableCase {
  id: string;
  patientId: string;
  sitePatientId: string;
  detectedAt: string;
  detectionMethod: "auto" | "manual";
  abstractStatus: AbstractStatus;
  // Primary site / histology
  primarySiteIcdo3: string | null;
  histologyIcdo3: string | null;
  behaviorCode: string | null;
  grade: string | null;
  laterality: string | null;
  dateOfDiagnosis: string | null;
  diagnosticConfirmation: string | null;
  // Staging
  clinicalStageGroup: string | null;
  pathologicStageGroup: string | null;
  tnmClinicalT: string | null;
  tnmClinicalN: string | null;
  tnmClinicalM: string | null;
  tnmPathologicT: string | null;
  tnmPathologicN: string | null;
  tnmPathologicM: string | null;
  // Treatment first course
  treatmentSurgery: string;
  treatmentRadiation: string;
  treatmentChemo: string;
  treatmentHormone: string;
  treatmentImmuno: string;
  treatmentOther: string;
  dateFirstTreatment: string | null;
  // Follow-up
  vitalStatus: string;
  dateOfLastContact: string | null;
  // Quality
  completenessScore: number;
  validationErrors: ValidationError[];
  // Submission
  stateRegistry: string | null;
  submittedAt: string | null;
  abstractedBy: string | null;
}

export interface ValidationError {
  ruleCode: string;
  ruleName: string;
  level: "error" | "warning" | "info";
  message: string;
  fields: string[];
}

export interface NaacrField {
  fieldName: string;
  naaccrItemNumber: number;
  value: string | null;
  source: "auto" | "manual" | "llm" | null;
  confidence: number;
  required: boolean;
}

export interface StateRegistryProfile {
  id: string;
  stateCode: string;
  stateName: string;
  requiredFields: number[];
  submissionFormat: string;
  submissionUrl: string | null;
  reportingDeadlineDays: number;
  notes: string | null;
}

export interface NaacrDashboard {
  totalCases: number;
  byStatus: Record<AbstractStatus, number>;
  avgCompleteness: number;
  casesNearingDeadline: number;
  recentDetections: number;
}
