/**
 * Real import pipeline — calls Rust backend for actual CSV parsing.
 * Falls back to demo data when not running in Tauri.
 */

import { isTauri } from "./tauri";

// Types matching Rust backend
export interface RustImportPreview {
  headers: string[];
  sample_rows: string[][];
  total_rows: number;
  suggested_mapping: RustColumnMapping;
  format_detected: "wide" | "long";
  sheets?: SheetInfo[];
  header_row_index?: number;
}

export interface RustColumnMapping {
  field_mappings: RustMappedField[];
}

export interface RustMappedField {
  source_column: string;
  target_field: string;
  confidence: number;
  auto_detected: boolean;
}

export interface RustImportResult {
  records_imported: number;
  records_updated: number;
  records_skipped: number;
  errors: { row: number; message: string }[];
  import_log_id: string;
}

export interface RustPatientRecord {
  site_patient_id: string;
  date_of_birth: string | null;
  gender: string | null;
  race: string | null;
  ethnicity: string | null;
  insurance_type: string | null;
  diagnoses: { icd10_code: string | null; description: string; onset_date: string | null; status: string | null }[];
  medications: { drug_name: string; dose: string | null; status: string | null }[];
  lab_results: { test_name: string; value: number | null; unit: string | null; result_date: string | null; reference_range: string | null; abnormal_flag: string | null }[];
}

/**
 * Call Rust backend to preview a CSV file — get headers, sample rows, and auto-mapped columns.
 */
export async function previewRealFile(filePath: string): Promise<RustImportPreview> {
  if (!isTauri) throw new Error("Real import only available in Tauri mode");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<RustImportPreview>("preview_import", { path: filePath });
}

/**
 * Call Rust backend to execute a real CSV import with the given column mapping.
 */
export async function executeRealImport(filePath: string, mapping: RustColumnMapping): Promise<RustImportResult> {
  if (!isTauri) throw new Error("Real import only available in Tauri mode");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<RustImportResult>("execute_import", { path: filePath, mapping });
}

/**
 * Convert Rust PatientRecords into the frontend's ParsedPatient format
 * so the existing screening engine can process them.
 */
export function rustPatientsToScreeningFormat(patients: RustPatientRecord[]): import("@/lib/epic-demo-data").ParsedPatient[] {
  return patients.map((p) => {
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
      vitals: { systolic: 0, diastolic: 0, pulse: 0, weight: 0, height: 0, bmi: 0 },
      lastEncounter: "",
      department: "",
      provider: "",
    };
  });
}

// ---------------------------------------------------------------------------
// Import profile types
// ---------------------------------------------------------------------------

export interface ImportProfile {
  id: string;
  name: string;
  description?: string;
  emr_system?: string;
  file_format: string;
  column_mapping: RustColumnMapping;
  header_row_index: number;
  created_at: string;
  last_used_at?: string;
  use_count: number;
}

export interface DuplicateCheckResult {
  is_duplicate: boolean;
  previous_import_date?: string;
  previous_record_count?: number;
  file_hash: string;
}

export interface TargetFieldInfo {
  field: string;
  label: string;
  required: boolean;
  category: string;
}

export interface SheetInfo {
  name: string;
  headers: string[];
  row_count: number;
  detected_type: string;
  patient_id_column?: string;
}

// ---------------------------------------------------------------------------
// Import profile commands
// ---------------------------------------------------------------------------

export async function saveImportProfile(
  name: string,
  description: string | null,
  emrSystem: string | null,
  fileFormat: string,
  mapping: RustColumnMapping,
  headerRowIndex: number,
): Promise<ImportProfile> {
  if (!isTauri) throw new Error("Import profiles only available in Tauri mode");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ImportProfile>("save_import_profile", {
    name,
    description,
    emrSystem,
    fileFormat,
    mapping,
    headerRowIndex,
  });
}

export async function listImportProfiles(): Promise<ImportProfile[]> {
  if (!isTauri) throw new Error("Import profiles only available in Tauri mode");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ImportProfile[]>("list_import_profiles");
}

export async function deleteImportProfile(profileId: string): Promise<void> {
  if (!isTauri) throw new Error("Import profiles only available in Tauri mode");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<void>("delete_import_profile", { profileId });
}

export async function useImportProfile(profileId: string): Promise<ImportProfile> {
  if (!isTauri) throw new Error("Import profiles only available in Tauri mode");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ImportProfile>("use_import_profile", { profileId });
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export async function checkDuplicateImport(path: string): Promise<DuplicateCheckResult> {
  if (!isTauri) throw new Error("Duplicate detection only available in Tauri mode");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DuplicateCheckResult>("check_duplicate_import", { path });
}

// ---------------------------------------------------------------------------
// Column mapping adjustment
// ---------------------------------------------------------------------------

export async function adjustColumnMapping(
  currentMapping: RustColumnMapping,
  sourceColumn: string,
  newTargetField: string,
): Promise<RustColumnMapping> {
  if (!isTauri) throw new Error("Column mapping adjustment only available in Tauri mode");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<RustColumnMapping>("adjust_column_mapping", {
    currentMapping,
    sourceColumn,
    newTargetField,
  });
}

export async function getAvailableTargetFields(): Promise<TargetFieldInfo[]> {
  if (!isTauri) throw new Error("Target fields only available in Tauri mode");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TargetFieldInfo[]>("get_available_target_fields");
}

// ---------------------------------------------------------------------------
// Validation types matching Rust backend
// ---------------------------------------------------------------------------

export interface ValidationReport {
  total_records: number;
  valid_records: number;
  warnings: ValidationWarning[];
  errors: ValidationError[];
  field_coverage: FieldCoverage[];
  duplicate_patient_ids: string[];
}

export interface ValidationWarning {
  patient_id: string;
  field: string;
  message: string;
}

export interface ValidationError {
  patient_id: string;
  field: string;
  message: string;
}

export interface FieldCoverage {
  field_name: string;
  populated_count: number;
  total_count: number;
  coverage_percent: number;
}

/**
 * Call Rust backend to validate an import before executing it.
 */
export async function validateImport(path: string, mapping: RustColumnMapping): Promise<ValidationReport> {
  if (!isTauri) throw new Error("Validation only available in Tauri mode");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ValidationReport>("validate_import", { path, mapping });
}

/**
 * Open a file dialog to select a patient data file (Tauri only).
 */
export async function pickImportFile(): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({
    title: "Select Patient Data File",
    filters: [
      { name: "All Supported Formats", extensions: ["csv", "tsv", "xlsx", "xls", "pip", "dat", "json", "ndjson", "hl7"] },
      { name: "CSV / TSV", extensions: ["csv", "tsv", "pip", "dat"] },
      { name: "Excel", extensions: ["xlsx", "xls"] },
      { name: "FHIR R4 JSON", extensions: ["json", "ndjson"] },
      { name: "HL7 v2 Messages", extensions: ["hl7"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (typeof result === "string") return result;
  return null;
}
