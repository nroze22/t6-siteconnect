/**
 * Typed Tauri invoke wrappers.
 * All communication with the Rust backend goes through these functions.
 * In development/web mode, these fall back to mock implementations.
 */

import type { AppStatus, ImportResult, ColumnMapping } from "@/types";

// Check if running inside Tauri
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
  }
  // Fallback for web development
  console.warn(`Tauri invoke '${cmd}' called outside Tauri runtime, using mock`);
  throw new Error(`Command '${cmd}' not available outside Tauri`);
}

// --- Database Commands ---

export async function checkDatabaseExists(): Promise<boolean> {
  try {
    return await invoke<boolean>("check_database_exists");
  } catch {
    return false;
  }
}

export async function initializeDatabase(passphrase: string): Promise<void> {
  if (!isTauri) {
    // Web mode: simulate success
    console.info("Web mode: simulating database initialization");
    return;
  }
  return invoke<void>("init_database", { passphrase });
}

export async function unlockDatabase(passphrase: string): Promise<void> {
  if (!isTauri) {
    // Web mode: simulate success
    console.info("Web mode: simulating database unlock");
    return;
  }
  return invoke<void>("unlock_database", { passphrase });
}

// --- App Commands ---

export async function getAppStatus(): Promise<AppStatus> {
  try {
    return await invoke<AppStatus>("get_app_status");
  } catch {
    return {
      llmStatus: "not_configured",
      llmModel: null,
      llmBackend: "none",
      databaseReady: false,
      patientCount: 0,
      studyCount: 0,
      lastImport: null,
    };
  }
}

export async function greet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}

// --- Import Commands ---

export interface FileFormatInfo {
  format: "csv" | "xlsx" | "fhir_json" | "cda_xml" | "hl7v2" | "unknown";
  rowCount: number | null;
  columnCount: number | null;
  headers: string[];
  sampleRows: string[][];
}

export interface ImportPreview {
  format: FileFormatInfo;
  suggestedMappings: ColumnMapping[];
}

export async function detectFileFormat(path: string): Promise<FileFormatInfo> {
  return invoke<FileFormatInfo>("detect_file_format", { path });
}

export async function previewImport(path: string): Promise<ImportPreview> {
  return invoke<ImportPreview>("preview_import", { path });
}

export async function executeImport(
  path: string,
  mappings: ColumnMapping[]
): Promise<ImportResult> {
  return invoke<ImportResult>("execute_import", { path, mappings });
}

// --- Study Commands ---

export async function getStudies(): Promise<unknown[]> {
  return invoke<unknown[]>("get_studies");
}

export async function getStudyCriteria(studyId: string): Promise<unknown[]> {
  return invoke<unknown[]>("get_study_criteria", { studyId });
}

// --- Custom Study Creation ---

export interface ParsedProtocol {
  title: string | null;
  short_title: string | null;
  nct_number: string | null;
  sponsor: string | null;
  phase: string | null;
  therapeutic_area: string | null;
  indication: string | null;
  summary: string | null;
  inclusion_criteria: string[];
  exclusion_criteria: string[];
  warnings: string[];
}

export interface CreateCustomStudyInput {
  title: string;
  short_title?: string | null;
  nct_number?: string | null;
  sponsor: string;
  phase?: string | null;
  status?: string | null;
  therapeutic_area?: string | null;
  indication?: string | null;
  summary?: string | null;
  estimated_per_patient_value_cents?: number | null;
  estimated_site_startup_cents?: number | null;
  payment_model?: string | null;
  inclusion_criteria: string[];
  exclusion_criteria: string[];
  /** Parallel to inclusion_criteria. Each entry: JSON-encoded StructuredRule, or null. */
  inclusion_structured_rules?: (string | null)[] | null;
  /** Parallel to exclusion_criteria. Each entry: JSON-encoded StructuredRule, or null. */
  exclusion_structured_rules?: (string | null)[] | null;
}

export interface InferredRule {
  /** JSON-encoded StructuredRule, or null if no deterministic rule applies. */
  rule_json: string | null;
  /** Short human label, e.g. "Age ≥ 18". */
  summary: string | null;
  /** 0..1 confidence emitted by the LLM. */
  confidence: number;
}

export interface CreateCustomStudyResult {
  study_id: string;
  criteria_count: number;
}

export async function parseProtocolText(text: string): Promise<ParsedProtocol> {
  return invoke<ParsedProtocol>("parse_protocol_text", { text });
}

export async function createCustomStudy(
  input: CreateCustomStudyInput,
): Promise<CreateCustomStudyResult> {
  return invoke<CreateCustomStudyResult>("create_custom_study", { input });
}

export async function inferStructuredRules(
  criteria: string[],
): Promise<InferredRule[]> {
  return invoke<InferredRule[]>("infer_structured_rules", { criteria });
}

// --- Epic / FHIR connection profiles ---

export interface EpicConnection {
  id: string;
  site_label: string;
  fhir_base_url: string;
  authorize_url: string | null;
  token_url: string | null;
  client_id: string | null;
  scopes: string | null;
  auth_mode: string;
  jwk_thumbprint: string | null;
  jwk_public_path: string | null;
  status: string;
  last_tested_at: string | null;
  last_test_error: string | null;
  last_sync_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertEpicConnectionInput {
  id?: string | null;
  site_label: string;
  fhir_base_url: string;
  authorize_url?: string | null;
  token_url?: string | null;
  client_id?: string | null;
  scopes?: string | null;
  auth_mode?: string | null;
  notes?: string | null;
}

export interface EpicConnectionTestResult {
  ok: boolean;
  status: string;
  message: string;
  fhir_version: string | null;
  software: string | null;
  supported_resources: string[];
}

export interface EpicConnectResult {
  authorize_url: string;
  redirect_uri: string;
  status: string;
  message: string;
  fhir_version: string | null;
  software: string | null;
  supported_resources: string[];
}

export async function listEpicConnections(): Promise<EpicConnection[]> {
  return invoke<EpicConnection[]>("list_epic_connections");
}

export async function upsertEpicConnection(
  input: UpsertEpicConnectionInput,
): Promise<EpicConnection> {
  return invoke<EpicConnection>("upsert_epic_connection", { input });
}

export async function deleteEpicConnection(id: string): Promise<void> {
  return invoke<void>("delete_epic_connection", { id });
}

export async function testEpicConnection(
  id: string,
): Promise<EpicConnectionTestResult> {
  return invoke<EpicConnectionTestResult>("test_epic_connection", { id });
}

export async function connectEpicConnection(
  id: string,
): Promise<EpicConnectResult> {
  return invoke<EpicConnectResult>("connect_epic_connection", { id });
}

export async function disconnectEpicConnection(id: string): Promise<void> {
  return invoke<void>("disconnect_epic_connection", { id });
}

export async function generateEpicKeypair(id: string): Promise<unknown> {
  return invoke<unknown>("generate_epic_keypair", { id });
}

export async function getEpicPublicJwk(id: string): Promise<unknown | null> {
  return invoke<unknown | null>("get_epic_public_jwk", { id });
}

export async function connectEpicBackendServices(
  id: string,
): Promise<EpicConnectResult> {
  return invoke<EpicConnectResult>("connect_epic_backend_services", { id });
}

// --- Bulk cohort pull ---

export type CohortPullScope = "system" | "patient" | "group";

export interface CohortPullInput {
  connection_id: string;
  scope?: CohortPullScope;
  group_id?: string | null;
  resource_types?: string[] | null;
}

export interface CohortPullPartial {
  patients: number;
  diagnoses: number;
  medications: number;
  labs: number;
  vitals: number;
}

export interface CohortPullProgress {
  connection_id: string;
  /** "kickoff" | "polling" | "importing" | "done" */
  phase: string;
  message: string;
  elapsed_seconds: number;
  stats: CohortPullPartial | null;
}

export interface CohortPullSummary {
  connection_id: string;
  patients_inserted: number;
  patients_updated: number;
  diagnoses_inserted: number;
  medications_inserted: number;
  labs_inserted: number;
  vitals_inserted: number;
  skipped: number;
  elapsed_seconds: number;
}

export async function pullEpicCohort(
  input: CohortPullInput,
): Promise<CohortPullSummary> {
  return invoke<CohortPullSummary>("pull_epic_cohort", { input });
}

// --- Screening Commands ---

export async function screenPatients(
  studyId: string,
  patientIds: string[]
): Promise<unknown> {
  return invoke<unknown>("screen_patients", { studyId, patientIds });
}

export async function overrideCriterion(
  criterionResultId: string,
  newResult: string,
  reason: string
): Promise<void> {
  return invoke<void>("override_criterion", {
    criterionResultId,
    newResult,
    reason,
  });
}

export async function reviewPatient(
  screeningResultId: string,
  action: "accepted" | "rejected" | "deferred",
  notes: string
): Promise<void> {
  return invoke<void>("review_patient", {
    screeningResultId,
    action,
    notes,
  });
}

// --- Folder Watcher Commands ---

export interface WatcherStatus {
  active: boolean;
  path: string | null;
}

export interface FileDetectedEvent {
  path: string;
  file_name: string;
  size_bytes: number;
}

export async function startFolderWatcher(path: string): Promise<WatcherStatus> {
  return invoke<WatcherStatus>("start_folder_watcher", { path });
}

export async function stopFolderWatcher(): Promise<WatcherStatus> {
  return invoke<WatcherStatus>("stop_folder_watcher");
}

export async function getWatcherStatus(): Promise<WatcherStatus> {
  try {
    return await invoke<WatcherStatus>("get_watcher_status");
  } catch {
    return { active: false, path: null };
  }
}

export async function pickWatchFolder(): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ directory: true, title: "Select EMR Export Folder" });
  if (typeof result === "string") return result;
  return null;
}

/** File extensions accepted by the watcher and import pipeline */
export const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".xlsx", ".xls", ".pip", ".dat", ".json", ".hl7"];

/** Check if a filename has an accepted data file extension */
export function isAcceptedFileExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function listenForFileDetected(
  callback: (event: FileDetectedEvent) => void
): Promise<(() => void) | null> {
  if (!isTauri) return null;
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<FileDetectedEvent>("watcher://file-detected", (event) => {
    // Filter to only accepted file extensions
    if (isAcceptedFileExtension(event.payload.file_name)) {
      callback(event.payload);
    }
  });
  return unlisten;
}

// --- Filesystem Helpers ---

/** Get the full path to the database file */
export async function getDatabasePath(): Promise<string | null> {
  if (!isTauri) return null;
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  const dir = await appDataDir();
  return join(dir, "siteconnect.db");
}

/** Reveal the app data directory in the system file manager (Finder/Explorer) */
export async function revealDatabaseInFileManager(): Promise<void> {
  if (!isTauri) return;
  const { appDataDir } = await import("@tauri-apps/api/path");
  const { open } = await import("@tauri-apps/plugin-shell");
  const dir = await appDataDir();
  await open(dir);
}

/** @deprecated Use revealDatabaseInFileManager instead */
export const revealDatabaseInFinder = revealDatabaseInFileManager;

/** Delete the database file so the user can start fresh */
export async function deleteDatabaseFile(): Promise<void> {
  if (!isTauri) return;
  const { remove } = await import("@tauri-apps/plugin-fs");
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  const dir = await appDataDir();
  const dbPath = await join(dir, "siteconnect.db");
  await remove(dbPath);
}

/** Open a file path with the system's default application */
export async function openFilePath(path: string): Promise<void> {
  if (!isTauri) return;
  const { open } = await import("@tauri-apps/plugin-shell");
  await open(path);
}
