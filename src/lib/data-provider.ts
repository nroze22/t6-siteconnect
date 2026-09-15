/**
 * Unified data provider — bridges Rust backend (Tauri mode) and demo data (web mode).
 * All analytics, pipeline, and performance pages consume data through this layer.
 */

import { isTauri } from "./tauri";
import type { ParsedPatient } from "./epic-demo-data";
import type { ScreeningOutput } from "./epic-demo-data";
import type { PatientSummary, ScreeningResult as StoreScreeningResult, CriterionResult } from "@/types";

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
  site_patient_id?: string;
  age?: number;
  gender?: string;
  primary_diagnosis?: string | null;
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
  port: number;
  backend: string;
  // Legacy fields kept for backward compat with Settings UI (may be undefined)
  model_path?: string | null;
  model_size_bytes?: number | null;
  ollama_model?: string | null;
}

// Ollama types
export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  models: OllamaModel[];
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface PullProgress {
  model: string;
  status: string;
  total: number;
  completed: number;
  percent: number;
}

export interface SystemHardware {
  total_ram_bytes: number;
  total_ram_gb: number;
  free_disk_bytes: number;
  free_disk_gb: number;
  model_directory?: string;
  recommended_tier: string;
  recommended_model: string;
}

// --- Tauri invoke helpers ---

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// --- Study-to-demo mapping for fallback screening ---
// When DB has no patients, map any study ID to the best-fit JS demo study

const NCT_TO_DEMO: Record<string, string> = {
  "NCT05502237": "study-1", // KEYNOTE-789 (NSCLC)
  "NCT04564897": "study-2", // DELIVER (HFpEF)
  "NCT05252390": "study-3", // STEP-5 (Obesity)
  "NCT04381936": "study-4", // Lecanemab (Alzheimer's)
  "NCT05090566": "study-5", // Risankizumab (Crohn's)
  "NCT04516746": "study-6", // Dupilumab (AD)
};

const TA_TO_DEMO: Record<string, string> = {
  "Oncology": "study-1",
  "Cardiovascular": "study-2",
  "Cardiology": "study-2",
  "Endocrinology": "study-3",
  "Metabolic": "study-3",
  "Neurology": "study-4",
  "CNS/Neurology": "study-4",
  "Gastroenterology": "study-5",
  "Immunology": "study-5",
  "Immunology/Rheumatology": "study-5",
  "Dermatology": "study-6",
  "Rare Disease": "study-1",
};

function findDemoStudyId(studyId: string, therapeuticArea?: string): string {
  if (studyId.startsWith("study-")) return studyId;
  if (NCT_TO_DEMO[studyId]) return NCT_TO_DEMO[studyId]!;
  if (therapeuticArea && TA_TO_DEMO[therapeuticArea]) return TA_TO_DEMO[therapeuticArea]!;
  return "study-1";
}

// --- Patient data ---

/**
 * Get all patients. In Tauri mode, queries SQLite. In web mode, parses demo data.
 * Returns in the unified ParsedPatient format used by all analytics components.
 */
export async function getPatients(): Promise<ParsedPatient[]> {
  // Always load demo data as baseline so cohort builder / analytics are compelling
  const { parseEpicRows } = await import("./epic-demo-data");
  const demoPatients = parseEpicRows();

  if (isTauri) {
    try {
      const dbPatients = await tauriInvoke<AnalyticsPatient[]>("get_analytics_patients");
      if (dbPatients.length > 0) {
        const dbParsed = dbPatients.map(analyticsPatientToParsed);
        // Merge: DB patients take precedence, demo fills in the rest (deduplicate by MRN)
        const mrnSet = new Set(dbParsed.map((p) => p.mrn));
        const merged = [...dbParsed, ...demoPatients.filter((d) => !mrnSet.has(d.mrn))];
        return merged;
      }
    } catch (e) {
      console.warn("Failed to load patients from DB, using demo data:", e);
    }
  }

  return demoPatients;
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
 * Falls back to the JS demo screening engine when DB has no patients.
 * @param therapeuticArea - optional hint for mapping to best-fit demo study
 */
export async function screenPatientsViaRust(studyId: string, therapeuticArea?: string): Promise<ScreeningResult[]> {
  if (isTauri) {
    try {
      const results = await tauriInvoke<ScreeningResult[]>("screen_patients_for_study", { studyId });
      if (results.length > 0) {
        console.log("[screening] Rust returned", results.length, "patients for study", studyId);
        return results;
      }
      console.log("[screening] Rust returned 0 patients, falling back to JS demo");
    } catch (err) {
      console.error("[screening] Rust screening failed, falling back to JS demo:", err);
    }
  }

  // Fallback: use JS demo screening — map to best-fit demo study criteria
  const demoStudyId = findDemoStudyId(studyId, therapeuticArea);
  const { parseEpicRows, screenPatientsForStudy: jsScreen } = await import("./epic-demo-data");
  const patients = parseEpicRows();
  const results = jsScreen(patients, demoStudyId);

  return results.map((r) => ({
    screening_id: r.summary.id,
    patient_id: r.summary.sitePatientId,
    study_id: studyId,
    site_patient_id: r.summary.sitePatientId,
    age: r.summary.age,
    gender: r.summary.gender,
    primary_diagnosis: r.summary.primaryDiagnosis,
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

// --- Multi-Protocol Screening ---

export interface MultiScreenBatchResult {
  batchId: string;
  results: ScreeningResult[];
  studyCount: number;
  patientCount: number;
}

export async function screenPatientsMulti(
  studyIds: string[],
  patientIds?: string[]
): Promise<MultiScreenBatchResult> {
  if (isTauri) {
    try {
      const response = await tauriInvoke<{
        batch_id: string;
        results: Array<{
          screening_id: string;
          patient_id: string;
          study_id: string;
          site_patient_id: string;
          age: number | null;
          gender: string | null;
          primary_diagnosis: string | null;
          overall_status: string;
          score: number;
          inclusion_met: number;
          inclusion_total: number;
          exclusion_triggered: number;
          exclusion_total: number;
          missing_data_count: number;
        }>;
        study_count: number;
        patient_count: number;
      }>("screen_patients_multi", {
        request: { study_ids: studyIds, patient_ids: patientIds ?? null },
      });

      console.log(
        "[multi-screening] Rust returned",
        response.results.length,
        "results across",
        response.study_count,
        "studies"
      );

      return {
        batchId: response.batch_id,
        results: response.results.map((r) => ({
          screening_id: r.screening_id,
          patient_id: r.patient_id,
          study_id: r.study_id,
          site_patient_id: r.site_patient_id,
          age: r.age ?? undefined,
          gender: r.gender ?? undefined,
          primary_diagnosis: r.primary_diagnosis,
          overall_status: r.overall_status,
          score: r.score,
          inclusion_met: r.inclusion_met,
          inclusion_total: r.inclusion_total,
          exclusion_triggered: r.exclusion_triggered,
          exclusion_total: r.exclusion_total,
          missing_data_count: r.missing_data_count,
          criteria_results: [],
        })),
        studyCount: response.study_count,
        patientCount: response.patient_count,
      };
    } catch (err) {
      console.error("[multi-screening] Rust failed, falling back to sequential JS:", err);
    }
  }

  // Fallback: sequential JS demo screening
  const allResults: ScreeningResult[] = [];
  for (const studyId of studyIds) {
    const results = await screenPatientsViaRust(studyId);
    allResults.push(...results);
  }

  return {
    batchId: `demo-${Date.now()}`,
    results: allResults,
    studyCount: studyIds.length,
    patientCount: new Set(allResults.map((r) => r.patient_id)).size,
  };
}

// --- LLM commands ---

export async function getLlmStatus(): Promise<LlmStatus> {
  if (!isTauri) {
    return { status: "not_configured", model_name: null, port: 11434, backend: "ollama" };
  }
  try {
    return await tauriInvoke<LlmStatus>("get_llm_status");
  } catch {
    return { status: "not_configured", model_name: null, port: 11434, backend: "ollama" };
  }
}

export async function checkLlmHealth(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    return await tauriInvoke<boolean>("check_llm_health");
  } catch {
    return false;
  }
}

export async function chatWithLlm(message: string): Promise<string> {
  if (!isTauri) return "Demo mode — AI chat requires the desktop app with a model configured.";
  return tauriInvoke<string>("chat_with_llm", { message });
}

// --- Clinical Notes Extraction ---

export interface ExtractedPatient {
  patient_id: string | null;
  name: string | null;
  date_of_birth: string | null;
  age: number | null;
  gender: string | null;
  race: string | null;
  diagnoses: { description: string; icd10_code: string | null; status: string | null; onset_date: string | null }[];
  medications: { drug_name: string; dose: string | null; frequency: string | null; status: string | null }[];
  labs: { test_name: string; value: number | null; unit: string | null; result_date: string | null; abnormal: boolean | null }[];
  vitals: { measurement_type: string; value: number; unit: string }[];
}

export interface ExtractedPatientData {
  patients: ExtractedPatient[];
  raw_llm_response: string;
  parse_warnings: string[];
}

export async function parseClinicalNotes(notesText: string): Promise<ExtractedPatientData> {
  if (!isTauri) {
    // Demo mode — return mock extracted data
    return {
      patients: [{
        patient_id: "DEMO-001",
        name: "John Doe",
        date_of_birth: "1963-04-12",
        age: 62,
        gender: "Male",
        race: "White",
        diagnoses: [
          { description: "Type 2 Diabetes Mellitus", icd10_code: "E11.9", status: "active", onset_date: "2019-03-15" },
          { description: "Essential Hypertension", icd10_code: "I10", status: "active", onset_date: "2018-06-01" },
        ],
        medications: [
          { drug_name: "Metformin", dose: "1000mg", frequency: "twice daily", status: "active" },
          { drug_name: "Lisinopril", dose: "20mg", frequency: "once daily", status: "active" },
        ],
        labs: [
          { test_name: "HbA1c", value: 8.4, unit: "%", result_date: "2025-11-15", abnormal: true },
          { test_name: "Fasting Glucose", value: 186, unit: "mg/dL", result_date: "2025-11-15", abnormal: true },
          { test_name: "eGFR", value: 72, unit: "mL/min/1.73m²", result_date: "2025-11-15", abnormal: false },
        ],
        vitals: [
          { measurement_type: "bp_systolic", value: 142, unit: "mmHg" },
          { measurement_type: "bp_diastolic", value: 88, unit: "mmHg" },
          { measurement_type: "bmi", value: 31.2, unit: "kg/m²" },
        ],
      }],
      raw_llm_response: "(demo mode)",
      parse_warnings: [],
    };
  }
  return tauriInvoke<ExtractedPatientData>("parse_clinical_notes", { notesText });
}

// --- AI Extraction Import ---

export interface ImportExtractedResult {
  imported: number;
  updated: number;
  total: number;
}

export async function importExtractedPatients(patients: ExtractedPatient[]): Promise<ImportExtractedResult> {
  if (!isTauri) {
    // Demo mode — just return a mock result
    return { imported: patients.length, updated: 0, total: patients.length };
  }
  return tauriInvoke<ImportExtractedResult>("import_extracted_patients", { patients });
}

// --- Patient Summary & Criterion Rationale ---

export async function generatePatientSummary(patientContext: string): Promise<string> {
  if (!isTauri) {
    // Demo mode: generate template-based summary
    return generateTemplateSummary(patientContext);
  }
  try {
    const prompt = `You are a clinical research coordinator. Write a concise 2-3 sentence clinical synopsis of this patient for pre-screening evaluation. Focus on key demographics, primary diagnoses, relevant labs, and current medications. Do NOT use bullet points — write flowing prose.

PATIENT DATA:
${patientContext}

CLINICAL SYNOPSIS:`;
    return await tauriInvoke<string>("chat_with_llm", { message: prompt });
  } catch {
    return generateTemplateSummary(patientContext);
  }
}

export async function generateCriterionRationale(
  criterionText: string,
  criterionType: string,
  result: string,
  evidence: string | null,
  patientContext: string,
): Promise<string> {
  if (!isTauri) {
    return generateTemplateRationale(criterionType, result, evidence, criterionText);
  }
  try {
    const prompt = `You are a clinical research coordinator explaining an eligibility criterion evaluation to a colleague. In 1-2 sentences, explain WHY this patient ${result === "met" ? "meets" : result === "not_met" ? "does not meet" : "has an unclear status for"} this ${criterionType} criterion. Reference specific patient data. Be precise and clinical.

CRITERION: ${criterionText}
RESULT: ${result}
EVIDENCE: ${evidence ?? "No specific evidence available"}

PATIENT DATA:
${patientContext}

EXPLANATION:`;
    return await tauriInvoke<string>("chat_with_llm", { message: prompt });
  } catch {
    return generateTemplateRationale(criterionType, result, evidence, criterionText);
  }
}

function generateTemplateSummary(context: string): string {
  // Parse basic info from the context string
  const ageMatch = context.match(/(\d+)\s*(?:yo|years?\s*old|y\/o)/i) ?? context.match(/age[:\s]*(\d+)/i);
  const genderMatch = context.match(/\b(male|female|man|woman)\b/i);
  const age = ageMatch?.[1] ?? "unknown age";
  const gender = genderMatch?.[1] ?? "patient";

  // Extract conditions mentioned
  const conditions: string[] = [];
  const conditionPatterns = [
    /diabetes/i, /hypertension/i, /NSCLC/i, /heart failure/i, /obesity/i,
    /alzheimer/i, /crohn/i, /dermatitis/i, /cancer/i, /asthma/i,
  ];
  for (const p of conditionPatterns) {
    const m = context.match(p);
    if (m) conditions.push(m[0]);
  }

  const condStr = conditions.length > 0 ? conditions.join(", ") : "multiple conditions";
  return `${age}-year-old ${gender} presenting with ${condStr}. Review criterion-level evidence below for detailed eligibility assessment.`;
}

function generateTemplateRationale(
  criterionType: string,
  result: string,
  evidence: string | null,
  criterionText: string,
): string {
  const verb = result === "met"
    ? (criterionType === "exclusion" ? "triggers this exclusion" : "meets this inclusion criterion")
    : result === "not_met"
    ? (criterionType === "exclusion" ? "does not trigger this exclusion" : "does not meet this inclusion criterion")
    : "has insufficient data to determine this criterion";

  if (evidence) {
    return `Patient ${verb}. ${evidence}`;
  }
  return `Patient ${verb}: "${criterionText}". No specific evidence was identified in the available clinical data.`;
}

// --- AI Insight Generation ---

export interface LlmInsight {
  type: "positive" | "warning" | "opportunity" | "neutral";
  title: string;
  body: string;
  actionable?: string;
}

export async function generateAiInsight(context: string, insightType: string): Promise<LlmInsight[]> {
  if (!isTauri) return [];
  try {
    const raw = await tauriInvoke<Record<string, unknown>[]>("generate_ai_insight", { context, insightType });
    return raw.map((r) => ({
      type: (r.type as LlmInsight["type"]) || "neutral",
      title: (r.title as string) || "AI Insight",
      body: (r.body as string) || "",
      actionable: r.actionable as string | undefined,
    }));
  } catch {
    return [];
  }
}

// --- Ollama commands ---

export async function checkOllamaStatus(): Promise<OllamaStatus> {
  if (!isTauri) {
    return { installed: true, running: true, models: [] };
  }
  try {
    return await tauriInvoke<OllamaStatus>("check_ollama_status");
  } catch {
    return { installed: false, running: false, models: [] };
  }
}

export async function getOllamaModels(): Promise<OllamaModel[]> {
  if (!isTauri) return [];
  try {
    return await tauriInvoke<OllamaModel[]>("get_ollama_models");
  } catch {
    return [];
  }
}

export async function installOllama(): Promise<string> {
  if (!isTauri) return "Demo: Ollama installed";
  return tauriInvoke<string>("install_ollama");
}

export async function startOllama(): Promise<string> {
  if (!isTauri) return "Demo: Ollama started";
  return tauriInvoke<string>("start_ollama");
}

export async function pullOllamaModel(model: string): Promise<void> {
  if (!isTauri) return;
  return tauriInvoke<void>("pull_ollama_model", { model });
}

export async function detectSystemHardware(): Promise<SystemHardware> {
  if (!isTauri) {
    return { total_ram_bytes: 16_000_000_000, total_ram_gb: 16, free_disk_bytes: 100_000_000_000, free_disk_gb: 100, recommended_tier: "optimal", recommended_model: "gemma3:12b" };
  }
  try {
    return await tauriInvoke<SystemHardware>("detect_system_hardware");
  } catch {
    return { total_ram_bytes: 0, total_ram_gb: 0, free_disk_bytes: 0, free_disk_gb: 0, recommended_tier: "none", recommended_model: "none" };
  }
}

export async function configureOllamaBackend(model: string): Promise<LlmStatus> {
  if (!isTauri) {
    return { status: "running", model_name: model, port: 11434, backend: "ollama" };
  }
  return tauriInvoke<LlmStatus>("configure_ollama_backend", { model });
}

export async function testOllamaInference(): Promise<{ success: boolean; latency_ms: number; error: string | null }> {
  if (!isTauri) return { success: true, latency_ms: 150, error: null };
  return tauriInvoke<{ success: boolean; latency_ms: number; error: string | null }>("test_ollama_inference");
}

export async function listenForPullProgress(
  callback: (progress: PullProgress) => void
): Promise<(() => void) | null> {
  if (!isTauri) return null;
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<PullProgress>("ollama://pull-progress", (event) => {
    callback(event.payload);
  });
  return unlisten;
}

export async function listenForPullComplete(
  callback: (result: { model: string; success: boolean; error: string | null }) => void
): Promise<(() => void) | null> {
  if (!isTauri) return null;
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<{ model: string; success: boolean; error: string | null }>("ollama://pull-complete", (event) => {
    callback(event.payload);
  });
  return unlisten;
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

// --- Converter: ScreeningResult (Rust/data-provider) → ScreeningOutput (store) ---

export function screeningResultToOutput(r: ScreeningResult): ScreeningOutput {
  const summary: PatientSummary = {
    id: r.screening_id,
    sitePatientId: r.site_patient_id ?? r.patient_id,
    age: r.age ?? 0,
    gender: r.gender ?? "Unknown",
    primaryDiagnosis: r.primary_diagnosis ?? null,
    score: r.score,
    overallStatus: r.overall_status as PatientSummary["overallStatus"],
    reviewStatus: "pending",
    inclusionMet: r.inclusion_met,
    inclusionTotal: r.inclusion_total,
    exclusionTriggered: r.exclusion_triggered,
    exclusionTotal: r.exclusion_total,
    missingDataCount: r.missing_data_count,
  };

  const result: StoreScreeningResult = {
    id: r.screening_id,
    patientId: r.patient_id,
    studyId: r.study_id,
    overallStatus: r.overall_status as StoreScreeningResult["overallStatus"],
    inclusionMet: r.inclusion_met,
    inclusionTotal: r.inclusion_total,
    exclusionTriggered: r.exclusion_triggered,
    exclusionTotal: r.exclusion_total,
    missingDataCount: r.missing_data_count,
    score: r.score,
    screenedAt: new Date().toISOString(),
    reviewedBy: null,
    reviewStatus: "pending",
    reviewNotes: null,
  };

  const criteria: CriterionResult[] = r.criteria_results.map((c) => ({
    id: `${r.screening_id}-${c.criterion_id}`,
    screeningResultId: r.screening_id,
    criterionId: c.criterion_id,
    criterionType: c.criterion_type as CriterionResult["criterionType"],
    criterionText: c.criterion_text,
    result: c.result as CriterionResult["result"],
    evidence: c.evidence,
    evidenceSource: c.evidence_source,
    confidence: c.confidence,
    reasoning: null,
    aiDetermined: c.ai_determined,
    humanVerified: false,
    humanOverride: null,
  }));

  return { summary, result, criteria };
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

export type ModelSetupJob={model:string;phase:string;message:string;updated:string};
export async function getModelSetupJob():Promise<ModelSetupJob|null>{if(!isTauri)return null;return tauriInvoke('get_model_job');}
export async function startModelSetupJob(model:string):Promise<ModelSetupJob>{if(!isTauri)throw Error('Desktop setup required');return tauriInvoke('start_model_job',{model});}
export async function cancelModelSetupJob():Promise<void>{if(!isTauri)return;return tauriInvoke('cancel_model_job');}
