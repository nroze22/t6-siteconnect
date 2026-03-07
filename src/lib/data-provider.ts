/**
 * Unified data provider — bridges Rust backend (Tauri mode) and demo data (web mode).
 * All analytics, pipeline, and performance pages consume data through this layer.
 */

import { isTauri } from "./tauri";
import type { ParsedPatient } from "./epic-demo-data";

// Types matching Rust analytics commands
export interface AnalyticsPatient {
  id: string;
  site_patient_id: string;
  date_of_birth: string | null;
  gender: string | null;
  race: string | null;
  ethnicity: string | null;
  insurance_type: string | null;
  imported_at: string;
  diagnoses: { icd10_code: string | null; description: string; onset_date: string | null; status: string | null }[];
  medications: { drug_name: string; dose: string | null; status: string | null }[];
  lab_results: { test_name: string; value: number | null; unit: string | null; result_date: string | null; reference_range: string | null; abnormal_flag: string | null }[];
  vitals: { measurement_type: string; value: number; unit: string; measurement_date: string | null }[];
}

export interface AnalyticsStudy {
  id: string;
  nct_number: string | null;
  title: string;
  short_title: string | null;
  sponsor: string;
  phase: string | null;
  status: string | null;
  therapeutic_area: string | null;
  indication: string | null;
  estimated_per_patient_value: number | null;
  criteria_count: number;
}

export interface AnalyticsSummary {
  patient_count: number;
  study_count: number;
  total_diagnoses: number;
  total_labs: number;
  total_medications: number;
  last_import: string | null;
  imports_count: number;
}

export interface ScreeningResult {
  screening_id: string;
  patient_id: string;
  study_id: string;
  overall_status: string;
  score: number;
  inclusion_met: number;
  inclusion_total: number;
  exclusion_triggered: number;
  exclusion_total: number;
  missing_data_count: number;
  criteria_results: {
    criterion_id: string;
    criterion_type: string;
    criterion_text: string;
    result: string;
    evidence: string | null;
    evidence_source: string | null;
    confidence: number;
    ai_determined: boolean;
  }[];
}

// LLM types
export interface LlmStatus {
  status: "not_configured" | "model_downloading" | "model_ready" | "starting" | "running" | "error" | "stopped";
  model_name: string | null;
  model_path: string | null;
  port: number;
  model_size_bytes: number | null;
}

// --- Tauri invoke helpers ---

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// --- Patient data ---

/**
 * Get all patients. In Tauri mode, queries SQLite. In web mode, parses demo data.
 * Returns in the unified ParsedPatient format used by all analytics components.
 */
export async function getPatients(): Promise<ParsedPatient[]> {
  if (isTauri) {
    try {
      const patients = await tauriInvoke<AnalyticsPatient[]>("get_analytics_patients");
      if (patients.length > 0) {
        return patients.map(analyticsPatientToParsed);
      }
    } catch (e) {
      console.warn("Failed to load patients from DB, falling back to demo data:", e);
    }
  }

  // Fallback: demo data
  const { parseEpicRows } = await import("./epic-demo-data");
  return parseEpicRows();
}

/**
 * Get database summary. In web mode returns demo stats.
 */
export async function getSummary(): Promise<AnalyticsSummary> {
  if (isTauri) {
    try {
      return await tauriInvoke<AnalyticsSummary>("get_analytics_summary");
    } catch {
      // DB not initialized yet
    }
  }

  const { parseEpicRows } = await import("./epic-demo-data");
  const patients = parseEpicRows();
  return {
    patient_count: patients.length,
    study_count: 6,
    total_diagnoses: patients.reduce((sum, p) => sum + p.diagnoses.length, 0),
    total_labs: patients.reduce((sum, p) => sum + p.labs.length, 0),
    total_medications: patients.reduce((sum, p) => sum + p.medications.length, 0),
    last_import: null,
    imports_count: 0,
  };
}

/**
 * Get studies. In Tauri mode, queries SQLite. In web mode, returns demo study data.
 */
export async function getStudies(): Promise<AnalyticsStudy[]> {
  if (isTauri) {
    try {
      const studies = await tauriInvoke<AnalyticsStudy[]>("get_analytics_studies");
      if (studies.length > 0) return studies;
    } catch {
      // DB not initialized
    }
  }

  // Fallback: demo studies with static metadata
  const { STUDY_SCREENING_DEFS } = await import("./epic-demo-data");
  const studyMeta: Record<string, { title: string; sponsor: string; phase: string; area: string; indication: string; value: number }> = {
    "study-1": { title: "KEYNOTE-789: Pembrolizumab + Chemo in NSCLC", sponsor: "Merck", phase: "Phase 3", area: "Oncology", indication: "NSCLC", value: 42000 },
    "study-2": { title: "DELIVER: Dapagliflozin in HFpEF", sponsor: "AstraZeneca", phase: "Phase 3", area: "Cardiology", indication: "Heart Failure", value: 28000 },
    "study-3": { title: "STEP-5: Semaglutide Weight Management", sponsor: "Novo Nordisk", phase: "Phase 3", area: "Endocrinology", indication: "Obesity", value: 18000 },
    "study-4": { title: "Lecanemab Early Alzheimer's Disease", sponsor: "Eisai/Biogen", phase: "Phase 3", area: "Neurology", indication: "Alzheimer's", value: 65000 },
    "study-5": { title: "Risankizumab in Crohn's Disease", sponsor: "AbbVie", phase: "Phase 3", area: "Gastroenterology", indication: "Crohn's Disease", value: 35000 },
    "study-6": { title: "Dupilumab in Atopic Dermatitis", sponsor: "Regeneron/Sanofi", phase: "Phase 3", area: "Dermatology", indication: "Atopic Dermatitis", value: 22000 },
  };

  return STUDY_SCREENING_DEFS.map((s) => {
    const meta = studyMeta[s.studyId];
    return {
      id: s.studyId,
      nct_number: null,
      title: meta?.title ?? s.studyId,
      short_title: null,
      sponsor: meta?.sponsor ?? "Unknown",
      phase: meta?.phase ?? null,
      status: "recruiting",
      therapeutic_area: meta?.area ?? null,
      indication: meta?.indication ?? null,
      estimated_per_patient_value: meta?.value ?? null,
      criteria_count: s.criteria.length,
    };
  });
}

/**
 * Screen patients against a study using the Rust engine.
 * Falls back to the JS screening engine in web mode.
 */
export async function screenPatientsViaRust(studyId: string): Promise<ScreeningResult[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<ScreeningResult[]>("screen_patients_for_study", { studyId });
    } catch {
      // DB not initialized or no patients
    }
  }

  // Fallback: use JS screening
  const { parseEpicRows, screenPatientsForStudy: jsScreen } = await import("./epic-demo-data");
  const patients = parseEpicRows();
  const results = jsScreen(patients, studyId);

  return results.map((r) => ({
    screening_id: r.summary.id,
    patient_id: r.summary.sitePatientId,
    study_id: studyId,
    overall_status: r.summary.overallStatus,
    score: r.summary.score,
    inclusion_met: r.summary.inclusionMet,
    inclusion_total: r.summary.inclusionTotal,
    exclusion_triggered: r.criteria.filter((c) => c.criterionType === "exclusion" && c.result === "met").length,
    exclusion_total: r.criteria.filter((c) => c.criterionType === "exclusion").length,
    missing_data_count: r.summary.missingDataCount,
    criteria_results: r.criteria.map((c) => ({
      criterion_id: c.criterionId,
      criterion_type: c.criterionType,
      criterion_text: c.criterionText,
      result: c.result,
      evidence: c.evidence,
      evidence_source: c.evidenceSource,
      confidence: c.confidence,
      ai_determined: c.aiDetermined,
    })),
  }));
}

// --- LLM commands ---

export async function getLlmStatus(): Promise<LlmStatus> {
  if (!isTauri) {
    return { status: "not_configured", model_name: null, model_path: null, port: 8384, model_size_bytes: null };
  }
  try {
    return await tauriInvoke<LlmStatus>("get_llm_status");
  } catch {
    return { status: "not_configured", model_name: null, model_path: null, port: 8384, model_size_bytes: null };
  }
}

export async function setLlmModel(modelPath: string): Promise<LlmStatus> {
  return tauriInvoke<LlmStatus>("set_llm_model", { modelPath });
}

export async function startLlmServer(): Promise<LlmStatus> {
  return tauriInvoke<LlmStatus>("start_llm_server");
}

export async function stopLlmServer(): Promise<LlmStatus> {
  return tauriInvoke<LlmStatus>("stop_llm_server");
}

export async function checkLlmHealth(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    return await tauriInvoke<boolean>("check_llm_health");
  } catch {
    return false;
  }
}

// --- Audit Trail ---

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string | null;
  checksum: string;
}

export interface AuditExport {
  entries: AuditEntry[];
  total_entries: number;
  chain_valid: boolean;
  chain_error: string | null;
  exported_at: string;
  app_version: string;
}

const DEMO_AUDIT_ENTRIES: AuditEntry[] = [
  { id: "a001", timestamp: "2026-03-07T08:00:00Z", action: "database_initialized", details: "Database created with SQLCipher AES-256", checksum: "a1b2c3d4..." },
  { id: "a002", timestamp: "2026-03-07T08:00:01Z", action: "study_seeded", details: "Seeded KEYNOTE-789 with 16 criteria", checksum: "e5f6a7b8..." },
  { id: "a003", timestamp: "2026-03-07T08:05:22Z", action: "database_unlocked", details: "Database unlocked", checksum: "c9d0e1f2..." },
  { id: "a004", timestamp: "2026-03-07T08:12:45Z", action: "data_imported", details: "Imported 18 patients from epic_export_2026-03.csv", checksum: "d3e4f5a6..." },
  { id: "a005", timestamp: "2026-03-07T08:13:02Z", action: "screening_executed", details: "Screened 18 patients against KEYNOTE-789", checksum: "b7c8d9e0..." },
  { id: "a006", timestamp: "2026-03-07T09:30:15Z", action: "criterion_overridden", details: "Criterion sc003: unknown → met. Justification: Lab results confirmed via chart review", checksum: "f1a2b3c4..." },
  { id: "a007", timestamp: "2026-03-07T09:45:33Z", action: "patient_reviewed", details: "Patient E10042 accepted for KEYNOTE-789. Notes: Strong candidate, all inclusion met", checksum: "a5b6c7d8..." },
  { id: "a008", timestamp: "2026-03-07T10:02:11Z", action: "data_imported", details: "Imported 5 patients from cardiology_export.csv", checksum: "e9f0a1b2..." },
];

export async function getAuditTrail(): Promise<AuditEntry[]> {
  if (isTauri) {
    try {
      return await tauriInvoke<AuditEntry[]>("get_audit_trail");
    } catch {
      // DB not initialized
    }
  }
  return DEMO_AUDIT_ENTRIES;
}

export async function exportAuditTrail(): Promise<AuditExport> {
  if (isTauri) {
    try {
      return await tauriInvoke<AuditExport>("export_audit_trail");
    } catch {
      // DB not initialized
    }
  }
  return {
    entries: DEMO_AUDIT_ENTRIES,
    total_entries: DEMO_AUDIT_ENTRIES.length,
    chain_valid: true,
    chain_error: null,
    exported_at: new Date().toISOString(),
    app_version: "0.1.0",
  };
}

export async function verifyAuditChain(): Promise<{ valid: boolean; count: number; error?: string }> {
  if (isTauri) {
    try {
      const [valid, count] = await tauriInvoke<[boolean, number]>("verify_audit_chain_cmd");
      return { valid, count };
    } catch (e) {
      return { valid: false, count: 0, error: String(e) };
    }
  }
  return { valid: true, count: DEMO_AUDIT_ENTRIES.length };
}

// --- Converter: AnalyticsPatient → ParsedPatient ---

function analyticsPatientToParsed(p: AnalyticsPatient): ParsedPatient {
  const dob = p.date_of_birth ?? "1970-01-01";
  return {
    mrn: p.site_patient_id,
    lastName: "",
    firstName: "",
    dob,
    sex: p.gender ?? "Unknown",
    race: p.race ?? "Unknown",
    ethnicity: p.ethnicity ?? "Unknown",
    insurance: p.insurance_type ?? "Unknown",
    diagnoses: p.diagnoses.map((d) => ({
      icd10: d.icd10_code ?? "",
      name: d.description,
      onset: d.onset_date ?? "",
    })),
    medications: p.medications.map((m) => ({
      name: m.drug_name,
      dose: m.dose ?? "",
      route: "",
      status: m.status ?? "Active",
    })),
    labs: p.lab_results.map((l) => ({
      test: l.test_name,
      value: l.value != null ? String(l.value) : "",
      unit: l.unit ?? "",
      date: l.result_date ?? "",
      ref: l.reference_range ?? "",
      abnormal: l.abnormal_flag === "Y" || l.abnormal_flag === "true",
    })),
    vitals: {
      systolic: p.vitals.find((v) => v.measurement_type === "bp_systolic")?.value ?? 0,
      diastolic: p.vitals.find((v) => v.measurement_type === "bp_diastolic")?.value ?? 0,
      pulse: p.vitals.find((v) => v.measurement_type === "pulse")?.value ?? 0,
      weight: p.vitals.find((v) => v.measurement_type === "weight")?.value ?? 0,
      height: p.vitals.find((v) => v.measurement_type === "height")?.value ?? 0,
      bmi: p.vitals.find((v) => v.measurement_type === "bmi")?.value ?? 0,
    },
    lastEncounter: "",
    department: "",
    provider: "",
  };
}
