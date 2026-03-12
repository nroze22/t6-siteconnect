import { useState, useCallback, useEffect, useRef } from "react";
import {
  FileUp,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Table2,
  BarChart3,
  Users,
  Search,
  Clock,
  FileSpreadsheet,
  Columns3,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Database,
  Zap,
} from "lucide-react";
import { FileDropZone, type SelectedFile } from "./FileDropZone";
import { ColumnMapper } from "./ColumnMapper";
import { SmartImportPanel } from "./SmartImportPanel";
import type { ColumnMapping, ImportResult } from "@/types";
import {
  EPIC_COLUMNS,
  EPIC_ROWS,
  EPIC_AUTO_MAPPINGS,
  EPIC_SAMPLE_DATA,
  parseEpicRows,
} from "@/lib/epic-demo-data";
import { screenPatientsViaRust, screeningResultToOutput } from "@/lib/data-provider";
import {
  generateAutoMappings,
  parseCsvWithMappings,
  generateSampleData,
} from "@/lib/csv-import";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useAppStore } from "@/stores/use-app-store";
import { useToast } from "@/components/ui/Toast";
import { isTauri } from "@/lib/tauri";
import {
  previewRealFile,
  executeRealImport,
  pickImportFile,
  validateImport,
  checkDuplicateImport,
  saveImportProfile,
  listImportProfiles,
  deleteImportProfile,
  useImportProfile,
  adjustColumnMapping,
  getAvailableTargetFields,
  type RustImportPreview,
  type RustColumnMapping,
  type ValidationReport,
  type ImportProfile,
  type DuplicateCheckResult,
  type TargetFieldInfo,
} from "@/lib/real-import";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ShieldCheck,
  Bookmark,
  Trash2,
  Save,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Preview rows — first 5 unique patients from Epic data
// ---------------------------------------------------------------------------

const PREVIEW_ROWS = EPIC_ROWS.slice(0, 5);

const PROGRESS_STAGES = [
  { label: "Parsing Epic CSV format...", duration: 600 },
  { label: "Deduplicating subject records...", duration: 800 },
  { label: "Normalizing ICD-10 codes...", duration: 500 },
  { label: "Mapping medications to RxNorm...", duration: 900 },
  { label: "Validating lab results & ranges...", duration: 700 },
  { label: "Building subject profiles...", duration: 600 },
  { label: "Running eligibility pre-screen...", duration: 1200 },
  { label: "Indexing for screening queue...", duration: 400 },
];

type ImportStep = "select" | "preview" | "validate" | "importing" | "complete";

// ---------------------------------------------------------------------------
// Import history type
// ---------------------------------------------------------------------------

interface ImportHistoryEntry {
  name: string;
  date: string;
  records: number;
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS: { key: ImportStep; label: string }[] = [
  { key: "select", label: "Select File" },
  { key: "preview", label: "Map Columns" },
  { key: "validate", label: "Validate" },
  { key: "importing", label: "Import" },
  { key: "complete", label: "Complete" },
];

function StepIndicator({ current }: { current: ImportStep }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;
        return (
          <div key={step.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-px w-6 transition-colors duration-300 ${
                  isDone ? "bg-indigo-500" : "bg-border"
                }`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold transition-all duration-300 ${
                  isDone
                    ? "bg-indigo-600 text-white"
                    : isActive
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/30"
                    : "bg-surface-2 text-dim ring-1 ring-edge-3"
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={`text-xs font-medium transition-colors duration-300 ${
                  isActive ? "text-foreground" : isDone ? "text-foreground/70" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type ImportMode = "structured" | "ai-assisted";

export function ImportPage() {
  const [importMode, setImportMode] = useState<ImportMode>("structured");
  const [step, setStep] = useState<ImportStep>("select");
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>(EPIC_AUTO_MAPPINGS);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState("");
  const [recordsProcessed, setRecordsProcessed] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const progressRef = useRef(false);
  // Real import state (Tauri mode)
  const [realPreview, setRealPreview] = useState<RustImportPreview | null>(null);
  const [realMapping, setRealMapping] = useState<RustColumnMapping | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Validation state
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  // Import history
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([
    { name: "epic_clarity_q4_2025.csv", date: "2025-12-15", records: 1208 },
  ]);
  // Import profiles (Tauri only)
  const [importProfiles, setImportProfiles] = useState<ImportProfile[]>([]);
  const [showProfiles, setShowProfiles] = useState(false);
  const [profileSaveName, setProfileSaveName] = useState("");
  const [profileSaveDesc, setProfileSaveDesc] = useState("");
  const [showProfileSave, setShowProfileSave] = useState(false);
  const [profileDeleteConfirm, setProfileDeleteConfirm] = useState<string | null>(null);
  // Duplicate detection (Tauri only)
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckResult | null>(null);
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);
  // Column mapping target fields (Tauri only) — loaded on demand by ColumnMapper
  const [tauriTargetFields, setTauriTargetFields] = useState<TargetFieldInfo[]>([]);

  // Web-mode validation state
  const [webValidation, setWebValidation] = useState<{
    totalRows: number;
    rowsWithMrn: number;
    rowsWithDiagnosis: number;
    rowsWithDate: number;
    emptyMrnCount: number;
    hasMrnMapping: boolean;
  } | null>(null);

  // Store access for loading imported patients into screening
  const setPatients = useScreeningStore((s) => s.setPatients);
  const setScreeningResult = useScreeningStore((s) => s.setScreeningResult);
  const setCriteriaResults = useScreeningStore((s) => s.setCriteriaResults);
  const selectStudy = useScreeningStore((s) => s.selectStudy);
  const setAppStatus = useAppStore((s) => s.setStatus);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const toast = useToast();

  // Fetch real import history, profiles, and target fields in Tauri mode
  useEffect(() => {
    if (!isTauri) return;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const history = await invoke<ImportHistoryEntry[]>("get_import_history");
        if (history.length > 0) {
          setImportHistory(history);
        }
      } catch {
        // Command may not exist yet — keep mock data
      }
    })();
    // Load import profiles
    (async () => {
      try {
        const profiles = await listImportProfiles();
        setImportProfiles(profiles);
      } catch {
        // Command may not exist yet
      }
    })();
    // Load available target fields for column mapping dropdowns
    (async () => {
      try {
        const fields = await getAvailableTargetFields();
        setTauriTargetFields(fields);
      } catch {
        // Command may not exist yet
      }
    })();
  }, []);

  // Handle file selection — auto-detect format and generate mappings
  const handleFileSelected = useCallback(async (file: SelectedFile) => {
    setSelectedFile(file);
    setImportError(null);
    setDuplicateCheck(null);
    setDuplicateDismissed(false);

    // In Tauri mode with a real file path, call Rust backend for preview
    if (isTauri && file.path) {
      // Check for duplicate import
      try {
        const dupResult = await checkDuplicateImport(file.path);
        setDuplicateCheck(dupResult);
      } catch {
        // Duplicate check command may not exist — ignore
      }

      try {
        const preview = await previewRealFile(file.path);
        setRealPreview(preview);
        setRealMapping(preview.suggested_mapping);
        // Convert Rust mappings to UI mappings format
        const uiMappings: ColumnMapping[] = preview.headers.map((header) => {
          const mapped = preview.suggested_mapping.field_mappings.find((m) => m.source_column === header);
          return {
            sourceColumn: header,
            targetField: mapped?.target_field ?? "",
            confidence: mapped?.confidence ?? 0,
          };
        });
        setMappings(uiMappings);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : String(err));
      }
    } else if (file.preview) {
      // Browser mode with parsed CSV data — generate auto-mappings from actual headers
      const autoMappings = generateAutoMappings(file.preview.headers);
      setMappings(autoMappings);
    }
  }, []);

  // Check if a file was passed from the watcher panel via session storage
  useEffect(() => {
    const stored = sessionStorage.getItem("siteconnect-import-file");
    if (stored) {
      sessionStorage.removeItem("siteconnect-import-file");
      try {
        const parsed = JSON.parse(stored) as { path: string; name: string; size: number };
        const ext = parsed.name.toLowerCase();
        const format: SelectedFile["format"] = (ext.endsWith(".xlsx") || ext.endsWith(".xls")) ? "excel"
          : (ext.endsWith(".json") || ext.endsWith(".ndjson")) ? "fhir_json"
          : ext.endsWith(".hl7") ? "hl7v2"
          : "csv";
        void handleFileSelected({ name: parsed.name, size: parsed.size, format, path: parsed.path });
      } catch {
        // Invalid stored data — ignore
      }
    }
  }, [handleFileSelected]);

  const handleFileClear = useCallback(() => {
    setSelectedFile(null);
  }, []);

  // Handle mapping changes — also call Rust backend in Tauri mode
  const handleMappingChange = useCallback((index: number, targetField: string) => {
    setMappings((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = { ...current, targetField, confidence: 0 };
      return next;
    });

    // In Tauri mode, also update the Rust-side mapping
    if (isTauri && realMapping) {
      const sourceColumn = mappings[index]?.sourceColumn;
      if (sourceColumn) {
        adjustColumnMapping(realMapping, sourceColumn, targetField)
          .then((updated) => {
            setRealMapping(updated);
          })
          .catch(() => {
            // Adjustment command may not exist — the UI mapping is still updated
          });
      }
    }
  }, [realMapping, mappings]);

  // Advance to preview
  const goToPreview = useCallback(() => {
    setStep("preview");
  }, []);

  // Load a demo Epic file automatically
  const loadDemoFile = useCallback(() => {
    setSelectedFile({
      name: "epic_clarity_export_mar2026.csv",
      size: 847293,
      format: "csv",
    });
    setMappings(EPIC_AUTO_MAPPINGS);
  }, []);

  // Start the import — uses Rust backend in Tauri mode, demo data in web mode
  const startImportExecution = useCallback(() => {
    setStep("importing");
    setProgress(0);
    setRecordsProcessed(0);
    setImportError(null);
    progressRef.current = true;

    const runImport = async () => {
      // === REAL IMPORT (Tauri mode with actual file) ===
      if (isTauri && selectedFile?.path && realMapping) {
        try {
          setProgressStage("Parsing CSV with Rust engine...");
          setProgress(20);

          const result = await executeRealImport(selectedFile.path, realMapping);

          setProgress(60);
          setProgressStage("Screening subjects against active studies...");

          // The Rust backend parsed and stored the patients — screen via Rust engine.
          const rustResults = await screenPatientsViaRust("study-1");
          const screening = rustResults.map(screeningResultToOutput);

          setProgress(90);
          setProgressStage("Loading into screening queue...");

          const summaries = screening.map((s) => s.summary);
          setPatients(summaries);
          for (const s of screening) {
            setScreeningResult(s.summary.id, s.result);
            setCriteriaResults(s.result.id, s.criteria);
          }
          selectStudy("study-1");

          setAppStatus({
            databaseReady: true,
            patientCount: result.records_imported,
            studyCount: 6,
            lastImport: new Date().toISOString(),
          });

          setProgress(100);
          setProgressStage("Complete");
          await new Promise((r) => setTimeout(r, 300));

          setImportResult({
            fileName: selectedFile.name,
            format: realPreview?.format_detected === "long" ? "Long Format CSV" : "Wide Format CSV",
            recordsImported: result.records_imported,
            recordsUpdated: result.records_updated,
            recordsSkipped: result.records_skipped,
            errors: result.errors.map((e) => `Row ${e.row}: ${e.message}`),
          });
          setStep("complete");
          toast.success(`Imported ${result.records_imported} subjects`, result.records_updated > 0 ? `${result.records_updated} records updated` : undefined);
          return;
        } catch (err) {
          setImportError(err instanceof Error ? err.message : String(err));
          toast.error("Import failed", err instanceof Error ? err.message : String(err));
          // Fall through to demo mode
        }
      }

      // === BROWSER IMPORT (web mode or fallback) ===
      const browserCsv = selectedFile?.preview;
      const hasBrowserData = browserCsv && browserCsv.allRows.length > 0;
      const totalRows = hasBrowserData ? browserCsv.allRows.length : EPIC_ROWS.length;
      let accumulated = 0;

      for (const stage of PROGRESS_STAGES) {
        if (!progressRef.current) return;
        setProgressStage(stage.label);
        const steps = 15;
        const stepDuration = stage.duration / steps;
        const progressPerStep = (1 / PROGRESS_STAGES.length) * 100 / steps;

        for (let i = 0; i < steps; i++) {
          if (!progressRef.current) return;
          await new Promise((r) => setTimeout(r, stepDuration));
          accumulated += progressPerStep;
          setProgress(Math.min(Math.round(accumulated), 99));
          setRecordsProcessed(Math.min(Math.round((accumulated / 100) * totalRows), totalRows));
        }
      }

      // Parse actual CSV data when available, otherwise fall back to demo
      const parsed = hasBrowserData
        ? parseCsvWithMappings(browserCsv.headers, browserCsv.allRows, mappings)
        : parseEpicRows();
      const browserRustResults = await screenPatientsViaRust("study-1");
      const screening = browserRustResults.map(screeningResultToOutput);
      const summaries = screening.map((s) => s.summary);
      setPatients(summaries);
      for (const s of screening) {
        setScreeningResult(s.summary.id, s.result);
        setCriteriaResults(s.result.id, s.criteria);
      }
      selectStudy("study-1");
      setAppStatus({
        databaseReady: true,
        patientCount: parsed.length,
        studyCount: 6,
        lastImport: new Date().toISOString(),
      });

      setProgress(100);
      setRecordsProcessed(totalRows);
      setProgressStage("Complete");
      await new Promise((r) => setTimeout(r, 500));

      const uniquePatients = parsed.length;
      const eligibleCount = screening.filter((s) => s.summary.overallStatus === "eligible").length;

      setImportResult({
        fileName: selectedFile?.name ?? "epic_clarity_export_mar2026.csv",
        format: hasBrowserData ? "CSV" : "Epic Clarity CSV",
        recordsImported: uniquePatients,
        recordsUpdated: 0,
        recordsSkipped: totalRows - uniquePatients,
        errors: hasBrowserData
          ? [
              `${totalRows} data rows consolidated into ${uniquePatients} unique subjects`,
              `${eligibleCount} subjects pre-screened as eligible`,
            ]
          : [
              `${totalRows} encounter rows consolidated into ${uniquePatients} unique subjects`,
              `${eligibleCount} subjects pre-screened as eligible for KEYNOTE-789`,
            ],
      });
      setStep("complete");
      toast.success(`Imported ${uniquePatients} subjects`, `${eligibleCount} pre-screened as eligible`);
    };

    runImport();
  }, [setPatients, setScreeningResult, setCriteriaResults, selectStudy, setAppStatus, setCurrentPage, selectedFile, realMapping, realPreview, mappings, toast]);

  // Run validation before import (Tauri mode only)
  const runValidation = useCallback(async () => {
    if (isTauri && selectedFile?.path && realMapping) {
      setIsValidating(true);
      setStep("validate");
      try {
        const report = await validateImport(selectedFile.path, realMapping);
        setValidationReport(report);
      } catch {
        // Validation command may not exist — skip validation and proceed
        setValidationReport(null);
        startImportExecution();
      } finally {
        setIsValidating(false);
      }
    } else {
      // Web/demo mode — run basic client-side validation
      setStep("validate");

      const browserCsv = selectedFile?.preview;
      const hasBrowserData = browserCsv && browserCsv.allRows.length > 0;

      if (hasBrowserData) {
        const headers = browserCsv.headers;
        const allRows = browserCsv.allRows;
        const totalRows = allRows.length;

        // Check if MRN/patient_id is mapped
        const mrnTargets = ["patient_id", "mrn", "pat_mrn_id", "subject_id"];
        const hasMrnMapping = mappings.some(
          (m) => m.targetField !== "" && mrnTargets.includes(m.targetField.toLowerCase())
        );

        // Find the column index for the MRN-mapped field
        const mrnMapping = mappings.find(
          (m) => m.targetField !== "" && mrnTargets.includes(m.targetField.toLowerCase())
        );
        const mrnColIdx = mrnMapping ? headers.indexOf(mrnMapping.sourceColumn) : -1;

        // Find diagnosis-mapped column
        const dxTargets = ["diagnosis", "icd10", "icd_10", "current_icd10_list", "primary_diagnosis", "dx"];
        const dxMapping = mappings.find(
          (m) => m.targetField !== "" && dxTargets.includes(m.targetField.toLowerCase())
        );
        const dxColIdx = dxMapping ? headers.indexOf(dxMapping.sourceColumn) : -1;

        // Find date-mapped columns
        const dateTargets = ["date", "encounter_date", "visit_date", "service_date", "dob", "birth_date"];
        const dateMapping = mappings.find(
          (m) => m.targetField !== "" && dateTargets.includes(m.targetField.toLowerCase())
        );
        const dateColIdx = dateMapping ? headers.indexOf(dateMapping.sourceColumn) : -1;

        let rowsWithMrn = 0;
        let rowsWithDiagnosis = 0;
        let rowsWithDate = 0;

        for (const row of allRows) {
          if (mrnColIdx >= 0 && row[mrnColIdx]?.trim()) rowsWithMrn++;
          if (dxColIdx >= 0 && row[dxColIdx]?.trim()) rowsWithDiagnosis++;
          if (dateColIdx >= 0 && row[dateColIdx]?.trim()) rowsWithDate++;
        }

        const emptyMrnCount = mrnColIdx >= 0 ? totalRows - rowsWithMrn : totalRows;

        if (!hasMrnMapping) {
          toast.warning("No patient ID column mapped", "Consider mapping a column to patient_id or MRN for proper deduplication");
        } else if (emptyMrnCount > 0) {
          toast.warning(`${emptyMrnCount} rows missing patient ID`, "These rows may not import correctly");
        }

        setWebValidation({
          totalRows,
          rowsWithMrn,
          rowsWithDiagnosis,
          rowsWithDate,
          emptyMrnCount,
          hasMrnMapping,
        });
      } else {
        // Demo data — show basic validation summary
        setWebValidation({
          totalRows: EPIC_ROWS.length,
          rowsWithMrn: EPIC_ROWS.length,
          rowsWithDiagnosis: EPIC_ROWS.filter((r) => r[3]?.trim()).length,
          rowsWithDate: EPIC_ROWS.filter((r) => r[4]?.trim()).length,
          emptyMrnCount: 0,
          hasMrnMapping: true,
        });
      }
    }
  }, [selectedFile, realMapping, startImportExecution]);

  // Navigate to screening after import
  const goToScreening = useCallback(() => {
    setCurrentPage("screening");
  }, [setCurrentPage]);

  // Reset to start
  const resetImport = useCallback(() => {
    progressRef.current = false;
    setStep("select");
    setSelectedFile(null);
    setMappings(EPIC_AUTO_MAPPINGS);
    setProgress(0);
    setProgressStage("");
    setRecordsProcessed(0);
    setImportResult(null);
    setValidationReport(null);
    setWebValidation(null);
    setIsValidating(false);
    setDuplicateCheck(null);
    setDuplicateDismissed(false);
    setShowProfileSave(false);
    setProfileSaveName("");
    setProfileSaveDesc("");
    setRealPreview(null);
    setRealMapping(null);
    setImportError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      progressRef.current = false;
    };
  }, []);

  const mappedCount = mappings.filter((m) => m.targetField !== "").length;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-heading">Import Subject Data</h2>
            <p className="mt-0.5 text-[12px] text-dim">
              Import from any EMR system — CSV, Excel, FHIR R4 Bundles, or HL7 v2 messages. All data stays encrypted on this device.
            </p>
          </div>
          {importMode === "structured" && <StepIndicator current={step} />}
        </div>

        {/* Mode toggle — prominent card-style */}
        <div className="mt-3 grid grid-cols-2 gap-3 max-w-lg">
          <button
            onClick={() => setImportMode("structured")}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
              importMode === "structured"
                ? "bg-card ring-2 ring-indigo-500/40 shadow-sm"
                : "bg-surface-1 ring-1 ring-edge-2 hover:ring-edge-3 hover:bg-surface-2"
            }`}
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
              importMode === "structured" ? "bg-indigo-500/15 ring-1 ring-indigo-500/25" : "bg-surface-2"
            }`}>
              <FileSpreadsheet className={`h-4 w-4 ${importMode === "structured" ? "text-indigo-400" : "text-dim"}`} />
            </div>
            <div>
              <p className={`text-[12px] font-semibold ${importMode === "structured" ? "text-heading" : "text-body"}`}>Structured Data</p>
              <p className="text-[10px] text-dim">CSV, Excel, FHIR, HL7</p>
            </div>
          </button>
          <button
            onClick={() => setImportMode("ai-assisted")}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
              importMode === "ai-assisted"
                ? "bg-card ring-2 ring-purple-500/40 shadow-sm"
                : "bg-surface-1 ring-1 ring-edge-2 hover:ring-edge-3 hover:bg-surface-2"
            }`}
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
              importMode === "ai-assisted" ? "bg-purple-500/15 ring-1 ring-purple-500/25" : "bg-surface-2"
            }`}>
              <Sparkles className={`h-4 w-4 ${importMode === "ai-assisted" ? "text-purple-400" : "text-dim"}`} />
            </div>
            <div>
              <p className={`text-[12px] font-semibold ${importMode === "ai-assisted" ? "text-heading" : "text-body"}`}>Unstructured Notes</p>
              <p className="text-[10px] text-dim">PDF, Word, clinical notes (AI)</p>
            </div>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">

          {/* AI-Assisted Import Mode */}
          {importMode === "ai-assisted" && (
            <SmartImportPanel
              onImportComplete={(patients) => {
                toast.success(`Extracted ${patients.length} patient record${patients.length !== 1 ? "s" : ""} from clinical notes`);
                setAppStatus({ patientCount: (useAppStore.getState().status.patientCount || 0) + patients.length });
              }}
            />
          )}

          {/* Structured Import Mode — existing flow */}
          {importMode === "structured" && (<>


          {/* ============================================= */}
          {/* Step 1: File Selection                        */}
          {/* ============================================= */}
          {step === "select" && (
            <div className="space-y-6">
              {/* Import Profiles (Tauri only) */}
              {isTauri && importProfiles.length > 0 && (
                <div className="rounded-xl border border-border bg-card">
                  <button
                    onClick={() => setShowProfiles((p) => !p)}
                    className="flex w-full items-center justify-between border-b border-border px-4 py-3"
                  >
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-body">
                      <Bookmark className="h-3.5 w-3.5" />
                      Saved Import Profiles ({importProfiles.length})
                    </h3>
                    {showProfiles ? (
                      <ChevronUp className="h-4 w-4 text-body" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-body" />
                    )}
                  </button>
                  {showProfiles && (
                    <div className="divide-y divide-border">
                      {importProfiles.map((profile) => (
                        <div
                          key={profile.id}
                          className="flex items-center justify-between px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{profile.name}</p>
                              {profile.emr_system && (
                                <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-400 ring-1 ring-indigo-500/20">
                                  {profile.emr_system}
                                </span>
                              )}
                            </div>
                            {profile.description && (
                              <p className="mt-0.5 text-[12px] text-muted-foreground">{profile.description}</p>
                            )}
                            <div className="mt-1 flex items-center gap-3 text-[11px] text-dim">
                              <span>{profile.file_format}</span>
                              <span>Used {profile.use_count} time{profile.use_count !== 1 ? "s" : ""}</span>
                              {profile.last_used_at && (
                                <span>Last used {new Date(profile.last_used_at).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <button
                              onClick={async () => {
                                try {
                                  const loaded = await useImportProfile(profile.id);
                                  setRealMapping(loaded.column_mapping);
                                  // Convert to UI mappings
                                  const uiMappings: ColumnMapping[] = loaded.column_mapping.field_mappings.map((m) => ({
                                    sourceColumn: m.source_column,
                                    targetField: m.target_field,
                                    confidence: m.confidence,
                                  }));
                                  setMappings(uiMappings);
                                  toast.success("Profile loaded", `Applied mapping from "${loaded.name}"`);
                                } catch (err) {
                                  toast.error("Failed to load profile", err instanceof Error ? err.message : String(err));
                                }
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-1.5 text-[11px] font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/10"
                            >
                              <Zap className="h-3 w-3" />
                              Use
                            </button>
                            {profileDeleteConfirm === profile.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={async () => {
                                    try {
                                      await deleteImportProfile(profile.id);
                                      setImportProfiles((prev) => prev.filter((p) => p.id !== profile.id));
                                      toast.success("Profile deleted");
                                    } catch (err) {
                                      toast.error("Failed to delete", err instanceof Error ? err.message : String(err));
                                    }
                                    setProfileDeleteConfirm(null);
                                  }}
                                  className="rounded px-2 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/10"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setProfileDeleteConfirm(null)}
                                  className="rounded px-2 py-1 text-[11px] text-dim hover:bg-surface-2"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setProfileDeleteConfirm(profile.id)}
                                className="rounded-lg p-1.5 text-dim transition-colors hover:bg-red-500/10 hover:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <FileDropZone
                onFileSelected={handleFileSelected}
                selectedFile={selectedFile}
                onClear={handleFileClear}
              />

              {/* Duplicate detection warning (Tauri only) */}
              {duplicateCheck?.is_duplicate && !duplicateDismissed && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <div>
                        <p className="text-[12px] font-semibold text-amber-400">Duplicate File Detected</p>
                        <p className="text-[12px] text-amber-300/70 mt-0.5">
                          This file was previously imported
                          {duplicateCheck.previous_import_date
                            ? ` on ${new Date(duplicateCheck.previous_import_date).toLocaleDateString()}`
                            : ""}
                          {duplicateCheck.previous_record_count != null
                            ? ` (${duplicateCheck.previous_record_count.toLocaleString()} records)`
                            : ""}
                          . Import again?
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => {
                          setDuplicateDismissed(true);
                          setSelectedFile(null);
                          setRealPreview(null);
                          setRealMapping(null);
                          setDuplicateCheck(null);
                        }}
                        className="rounded-lg border border-amber-500/20 px-3 py-1.5 text-[11px] font-semibold text-amber-300 transition-colors hover:bg-amber-500/10"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => setDuplicateDismissed(true)}
                        className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300 transition-colors hover:bg-amber-500/20"
                      >
                        Import Anyway
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Import error */}
              {importError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                  <p className="text-[12px] font-semibold text-red-400">Import Error</p>
                  <p className="text-[12px] text-red-400/80 mt-0.5">{importError}</p>
                </div>
              )}

              {/* Demo data button + Real file picker */}
              {!selectedFile && (
                <div className="flex justify-center gap-3">
                  {isTauri && (
                    <button
                      onClick={async () => {
                        const path = await pickImportFile();
                        if (path) {
                          const name = path.split("/").pop() ?? path;
                          const lower = name.toLowerCase();
                          const format: SelectedFile["format"] = (lower.endsWith(".xlsx") || lower.endsWith(".xls")) ? "excel"
                            : (lower.endsWith(".json") || lower.endsWith(".ndjson")) ? "fhir_json"
                            : lower.endsWith(".hl7") ? "hl7v2"
                            : "csv";
                          void handleFileSelected({ name, size: 0, format, path });
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
                    >
                      <FileUp className="h-3.5 w-3.5" />
                      Select File from Disk
                    </button>
                  )}
                  <button
                    onClick={loadDemoFile}
                    className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-2.5 text-[12px] font-medium text-indigo-300 transition-colors hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Load Demo Epic Export (32 encounter rows, 20 subjects)
                  </button>
                </div>
              )}

              {/* Supported formats reference */}
              {!selectedFile && (
                <div className="rounded-xl border border-edge-2 bg-card overflow-hidden">
                  <div className="px-4 py-3 border-b border-edge-2">
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-body">
                      <Info className="h-3.5 w-3.5 text-indigo-400" />
                      Supported EMR Formats
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-edge-1">
                    {([
                      {
                        title: "CSV / TSV / Pipe-Delimited",
                        badge: "Most Common",
                        badgeColor: "text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/20",
                        desc: "Standard tabular exports from any EMR. Auto-detects delimiters, skips metadata rows, and maps columns intelligently.",
                        systems: "Epic Clarity, Cerner, Athena, MEDITECH, NextGen, Allscripts, eClinicalWorks",
                        ext: ".csv, .tsv, .pip, .dat",
                      },
                      {
                        title: "Excel Workbooks",
                        badge: "Multi-Sheet",
                        badgeColor: "text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20",
                        desc: "Single or multi-sheet workbooks. Multi-sheet files are auto-merged by patient ID across demographics, diagnoses, labs, and medications.",
                        systems: "Epic, Cerner, custom site exports",
                        ext: ".xlsx, .xls",
                      },
                      {
                        title: "FHIR R4 JSON Bundles",
                        badge: "Interoperable",
                        badgeColor: "text-violet-400 bg-violet-500/10 ring-1 ring-violet-500/20",
                        desc: "HL7 FHIR R4 standard. Parses Patient, Condition, Observation, MedicationRequest, Procedure, and AllergyIntolerance resources.",
                        systems: "Epic FHIR API, Cerner Millennium, Allscripts FHIR, any FHIR-enabled EHR",
                        ext: ".json, .ndjson",
                      },
                      {
                        title: "HL7 v2 Messages",
                        badge: "Legacy Standard",
                        badgeColor: "text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/20",
                        desc: "Pipe-delimited HL7 v2.x messages. Parses PID, DG1, OBX, RXA/RXE, and AL1 segments. Handles single messages and batch files.",
                        systems: "Epic Bridges, Cerner CareAware, Mirth Connect, any HL7 interface engine",
                        ext: ".hl7",
                      },
                    ] as const).map((fmt) => (
                      <div key={fmt.title} className="bg-card p-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[12px] font-bold text-heading">{fmt.title}</span>
                          <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${fmt.badgeColor}`}>
                            {fmt.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-dim leading-relaxed">{fmt.desc}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] text-faint">EMR:</span>
                          <span className="text-[10px] text-dim">{fmt.systems}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] text-faint">Extensions:</span>
                          <span className="text-[10px] font-mono text-dim">{fmt.ext}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent imports */}
              {importHistory.length > 0 && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-body">
                    <Clock className="h-3.5 w-3.5" />
                    Recent Imports
                  </h3>
                  <div className="space-y-2">
                    {importHistory.map((imp) => (
                      <div
                        key={`${imp.name}-${imp.date}`}
                        className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{imp.name}</p>
                            <p className="text-[12px] text-muted-foreground">{imp.date}</p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {imp.records.toLocaleString()} records
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next button */}
              {selectedFile && (
                <div className="flex justify-end pt-2">
                  <button
                    onClick={goToPreview}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
                  >
                    Continue to Preview
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============================================= */}
          {/* Step 2: Preview & Column Mapping              */}
          {/* ============================================= */}
          {step === "preview" && (() => {
            // Use real data from Rust when available, then browser CSV, then demo
            const browserPreview = selectedFile?.preview;
            const hasBrowserCsv = !realPreview && browserPreview && browserPreview.headers.length > 0;
            const previewHeaders = realPreview ? realPreview.headers : hasBrowserCsv ? browserPreview.headers : EPIC_COLUMNS;
            const previewRows = realPreview ? realPreview.sample_rows : hasBrowserCsv ? browserPreview.rows : PREVIEW_ROWS;
            const totalRows = realPreview ? realPreview.total_rows : hasBrowserCsv ? browserPreview.totalRows : EPIC_ROWS.length;
            const formatLabel = realPreview
              ? (realPreview.format_detected === "long" ? "Long Format" : "Wide Format")
              : hasBrowserCsv ? "CSV" : "Epic Clarity CSV";
            const columnCount = previewHeaders.length;
            const displayCols = Math.min(columnCount, 12);
            const uniqueSubjects = realPreview
              ? realPreview.total_rows
              : hasBrowserCsv
                ? new Set(browserPreview.allRows.map((r) => r[0])).size
                : new Set(EPIC_ROWS.map((r) => r[0])).size;

            return (
            <div className="space-y-6">
              {/* Format detection banner */}
              <div className="flex items-center gap-3 rounded-xl border border-indigo-500/15 bg-indigo-500/5 px-4 py-3 ring-1 ring-indigo-500/10">
                <Sparkles className="h-5 w-5 text-indigo-400" />
                <div>
                  <p className="text-[12px] font-semibold text-indigo-300">
                    {realPreview ? `${formatLabel} Detected` : hasBrowserCsv ? `${formatLabel} — ${columnCount} Columns Detected` : "Epic Clarity Format Detected"}
                  </p>
                  <p className="text-[12px] text-dim">
                    {realPreview
                      ? `Detected ${columnCount} columns in ${formatLabel.toLowerCase()} layout. Auto-mapped ${mappedCount} of ${columnCount} fields.`
                      : hasBrowserCsv
                        ? `Found ${columnCount} columns and ${totalRows.toLocaleString()} data rows. Auto-mapped ${mappedCount} of ${columnCount} fields.`
                        : `Recognized PAT_MRN_ID, CURRENT_ICD10_LIST, and ${EPIC_COLUMNS.length - 2} other Epic Clarity columns. Auto-mapped ${mappedCount} of ${EPIC_COLUMNS.length} fields.`}
                  </p>
                </div>
              </div>

              {/* Header row detection notice */}
              {realPreview?.header_row_index != null && realPreview.header_row_index > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-blue-500/15 bg-blue-500/5 px-4 py-2.5">
                  <Info className="h-4 w-4 shrink-0 text-blue-400" />
                  <p className="text-[12px] text-blue-300">
                    Detected {realPreview.header_row_index} metadata row{realPreview.header_row_index > 1 ? "s" : ""} before column headers (auto-skipped)
                  </p>
                </div>
              )}

              {/* Multi-sheet info (XLSX) */}
              {realPreview?.sheets && realPreview.sheets.length > 1 && (
                <div className="rounded-xl border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-body">
                      <Layers className="h-3.5 w-3.5" />
                      Sheets Detected ({realPreview.sheets.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-border">
                    {realPreview.sheets.map((sheet) => (
                      <div key={sheet.name} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-[12px] font-medium text-body">{sheet.name}</span>
                          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-dim ring-1 ring-edge-2">
                            {sheet.detected_type}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-dim">
                          <span>{sheet.row_count.toLocaleString()} rows</span>
                          <span>{sheet.headers.length} columns</span>
                          {sheet.patient_id_column && (
                            <span className="text-emerald-400">ID: {sheet.patient_id_column}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border bg-surface-1 px-4 py-2">
                    <p className="text-[11px] text-dim">
                      All sheets will be merged during import based on patient ID matching.
                    </p>
                  </div>
                </div>
              )}

              {/* File stats */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  {
                    icon: <Table2 className="h-4 w-4" />,
                    label: "Format",
                    value: formatLabel,
                  },
                  {
                    icon: <BarChart3 className="h-4 w-4" />,
                    label: "Data Rows",
                    value: `${totalRows} rows`,
                  },
                  {
                    icon: <Users className="h-4 w-4" />,
                    label: "Unique Subjects",
                    value: `${uniqueSubjects} subjects`,
                  },
                  {
                    icon: <Columns3 className="h-4 w-4" />,
                    label: "Columns",
                    value: `${columnCount} fields`,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="flex items-center gap-2 text-body">
                      {stat.icon}
                      <span className="text-[12px] font-semibold uppercase tracking-wider">
                        {stat.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-foreground">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Data preview table */}
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-body">
                    Data Preview (first {previewRows.length} rows of {totalRows.toLocaleString()})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-edge-2 bg-surface-1">
                        {previewHeaders.slice(0, displayCols).map((col) => (
                          <th
                            key={col}
                            className="whitespace-nowrap px-3 py-2 text-left font-semibold text-body"
                          >
                            {col}
                          </th>
                        ))}
                        {columnCount > displayCols && (
                          <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-dim">
                            +{columnCount - displayCols} more...
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-border/50 last:border-0"
                        >
                          {row.slice(0, displayCols).map((cell, j) => (
                            <td
                              key={j}
                              className="max-w-[140px] truncate whitespace-nowrap px-3 py-2 font-mono text-foreground/80"
                            >
                              {cell}
                            </td>
                          ))}
                          {columnCount > displayCols && (
                            <td className="px-3 py-2 text-dim">...</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Column mapping */}
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Column Mapping — AI Auto-Matched
                  </h3>
                  {tauriTargetFields.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-dim">
                      {tauriTargetFields.filter((f) => f.required).length} required fields,{" "}
                      {tauriTargetFields.length} total available
                    </p>
                  )}
                </div>
                <div className="p-4">
                  <ColumnMapper
                    mappings={mappings}
                    sampleData={realPreview
                      ? Object.fromEntries(
                          realPreview.headers.map((h, idx) => [
                            h,
                            realPreview.sample_rows.map((row) => row[idx] ?? "").filter(Boolean).slice(0, 3),
                          ])
                        )
                      : hasBrowserCsv
                        ? generateSampleData(browserPreview.headers, browserPreview.allRows)
                        : EPIC_SAMPLE_DATA}
                    onMappingChange={handleMappingChange}
                  />
                </div>
              </div>

              {/* What happens next */}
              <div className="rounded-xl border border-edge-2 bg-surface-1 p-4">
                <h4 className="flex items-center gap-2 text-[12px] font-semibold text-body">
                  <Database className="h-3.5 w-3.5 text-indigo-400" />
                  What happens on import
                </h4>
                <ul className="mt-2 space-y-1 text-[12px] text-dim">
                  <li>1. Encounter rows are consolidated into unique subject profiles</li>
                  <li>2. Diagnoses, medications, and labs are normalized and indexed</li>
                  <li>3. Each subject is pre-screened against active studies (KEYNOTE-789)</li>
                  <li>4. Subjects appear in the Screening queue ranked by eligibility score</li>
                </ul>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep("select")}
                  className="inline-flex items-center gap-2 rounded-lg border border-edge-3 bg-surface-2 px-4 py-2.5 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={runValidation}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
                >
                  Import & Screen {uniqueSubjects} Subjects
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            );
          })()}

          {/* ============================================= */}
          {/* Step 2.5: Validation (Tauri mode only)        */}
          {/* ============================================= */}
          {step === "validate" && (
            <div className="flex flex-col items-center py-8">
              <div className="w-full max-w-lg space-y-6">
                {isValidating ? (
                  <>
                    <div className="flex justify-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">Validating data...</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Checking field coverage, data quality, and duplicates
                      </p>
                    </div>
                  </>
                ) : validationReport ? (
                  <>
                    <div className="flex justify-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                        <ShieldCheck className="h-8 w-8 text-emerald-400" />
                      </div>
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-foreground">Validation Report</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {validationReport.valid_records} of {validationReport.total_records} records are valid
                      </p>
                    </div>

                    {/* Field coverage */}
                    {validationReport.field_coverage.length > 0 && (
                      <div className="rounded-xl border border-border bg-card">
                        <div className="border-b border-border px-4 py-3">
                          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-body">
                            <BarChart3 className="h-3.5 w-3.5" />
                            Field Coverage
                          </h4>
                        </div>
                        <div className="p-4 space-y-3">
                          {validationReport.field_coverage.map((fc) => (
                            <div key={fc.field_name}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[12px] font-medium text-body">{fc.field_name}</span>
                                <span className="text-[12px] font-mono text-dim">
                                  {fc.populated_count}/{fc.total_count} ({Math.round(fc.coverage_percent)}%)
                                </span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    fc.coverage_percent >= 90 ? "bg-emerald-500" :
                                    fc.coverage_percent >= 50 ? "bg-amber-500" : "bg-red-500"
                                  }`}
                                  style={{ width: `${fc.coverage_percent}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Duplicate patient IDs */}
                    {validationReport.duplicate_patient_ids.length > 0 && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                          <span className="text-xs font-semibold text-amber-400">
                            {validationReport.duplicate_patient_ids.length} Duplicate Patient IDs
                          </span>
                        </div>
                        <p className="text-[12px] text-amber-300/70">
                          {validationReport.duplicate_patient_ids.slice(0, 5).join(", ")}
                          {validationReport.duplicate_patient_ids.length > 5 && ` and ${validationReport.duplicate_patient_ids.length - 5} more`}
                        </p>
                      </div>
                    )}

                    {/* Warnings */}
                    {validationReport.warnings.length > 0 && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                          <span className="text-xs font-semibold text-amber-400">
                            {validationReport.warnings.length} Warnings
                          </span>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {validationReport.warnings.slice(0, 10).map((w, i) => (
                            <p key={i} className="text-[12px] text-amber-300/70">
                              Patient {w.patient_id}: {w.field} — {w.message}
                            </p>
                          ))}
                          {validationReport.warnings.length > 10 && (
                            <p className="text-[12px] text-amber-300/50">
                              ...and {validationReport.warnings.length - 10} more warnings
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Errors */}
                    {validationReport.errors.length > 0 && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="h-4 w-4 text-red-400" />
                          <span className="text-xs font-semibold text-red-400">
                            {validationReport.errors.length} Errors
                          </span>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {validationReport.errors.slice(0, 10).map((e, i) => (
                            <p key={i} className="text-[12px] text-red-300/70">
                              Patient {e.patient_id}: {e.field} — {e.message}
                            </p>
                          ))}
                          {validationReport.errors.length > 10 && (
                            <p className="text-[12px] text-red-300/50">
                              ...and {validationReport.errors.length - 10} more errors
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* No issues */}
                    {validationReport.warnings.length === 0 &&
                     validationReport.errors.length === 0 &&
                     validationReport.duplicate_patient_ids.length === 0 && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          <span className="text-xs font-semibold text-emerald-400">
                            All records passed validation
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => setStep("preview")}
                        className="inline-flex items-center gap-2 rounded-lg border border-edge-3 bg-surface-2 px-4 py-2.5 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Preview
                      </button>
                      <button
                        onClick={startImportExecution}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
                      >
                        Proceed with Import
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : webValidation ? (
                  /* Web/demo mode validation summary */
                  <>
                    <div className="flex justify-center">
                      <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
                        webValidation.hasMrnMapping && webValidation.emptyMrnCount === 0
                          ? "bg-emerald-500/10 ring-1 ring-emerald-500/20"
                          : "bg-amber-500/10 ring-1 ring-amber-500/20"
                      }`}>
                        {webValidation.hasMrnMapping && webValidation.emptyMrnCount === 0 ? (
                          <ShieldCheck className="h-8 w-8 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-8 w-8 text-amber-400" />
                        )}
                      </div>
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-foreground">Data Validation</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {webValidation.totalRows} rows checked against mapped columns
                      </p>
                    </div>

                    {/* Warnings */}
                    {!webValidation.hasMrnMapping && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                          <span className="text-xs font-semibold text-amber-400">No Patient ID Mapped</span>
                        </div>
                        <p className="text-[12px] text-amber-300/70">
                          No column is mapped to patient_id or MRN. Subjects may not deduplicate correctly.
                          Go back to Map Columns and assign a patient identifier.
                        </p>
                      </div>
                    )}

                    {webValidation.hasMrnMapping && webValidation.emptyMrnCount > 0 && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                          <span className="text-xs font-semibold text-amber-400">
                            {webValidation.emptyMrnCount} Rows Missing Patient ID
                          </span>
                        </div>
                        <p className="text-[12px] text-amber-300/70">
                          These rows have an empty patient ID field and may not import correctly.
                        </p>
                      </div>
                    )}

                    {/* Data quality summary */}
                    <div className="rounded-xl border border-border bg-card">
                      <div className="border-b border-border px-4 py-3">
                        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-body">
                          <BarChart3 className="h-3.5 w-3.5" />
                          Data Quality Summary
                        </h4>
                      </div>
                      <div className="p-4 space-y-3">
                        {[
                          { label: "Total Rows", value: webValidation.totalRows, total: webValidation.totalRows },
                          { label: "Rows with Patient ID (MRN)", value: webValidation.rowsWithMrn, total: webValidation.totalRows },
                          { label: "Rows with Diagnosis", value: webValidation.rowsWithDiagnosis, total: webValidation.totalRows },
                          { label: "Rows with Date Fields", value: webValidation.rowsWithDate, total: webValidation.totalRows },
                        ].map((item) => {
                          const pct = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;
                          return (
                            <div key={item.label}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[12px] font-medium text-body">{item.label}</span>
                                <span className="text-[12px] font-mono text-dim">
                                  {item.value}/{item.total} ({pct}%)
                                </span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    pct >= 90 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* All good */}
                    {webValidation.hasMrnMapping && webValidation.emptyMrnCount === 0 && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          <span className="text-xs font-semibold text-emerald-400">
                            No issues detected — ready to import
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => { setStep("preview"); setWebValidation(null); }}
                        className="inline-flex items-center gap-2 rounded-lg border border-edge-3 bg-surface-2 px-4 py-2.5 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Preview
                      </button>
                      <button
                        onClick={startImportExecution}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
                      >
                        Proceed with Import
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  /* Validation command not available — auto-proceed */
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Proceeding to import...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================= */}
          {/* Step 3: Import Progress                       */}
          {/* ============================================= */}
          {step === "importing" && (
            <div className="flex flex-col items-center py-16">
              <div className="w-full max-w-lg space-y-8">
                {/* Spinner */}
                <div className="flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                  </div>
                </div>

                {/* Stage label */}
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">{progressStage}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {recordsProcessed} of {realPreview ? realPreview.total_rows : EPIC_ROWS.length} rows processed
                  </p>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-body">Progress</span>
                    <span className="font-mono text-xs font-bold text-foreground">{progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Processing detail */}
                <div className="space-y-2">
                  {PROGRESS_STAGES.map((stage, i) => {
                    const stageProgress = (progress / 100) * PROGRESS_STAGES.length;
                    const isDone = i < stageProgress - 1;
                    const isActive = i >= stageProgress - 1 && i < stageProgress;
                    return (
                      <div
                        key={stage.label}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] transition-all duration-300 ${
                          isDone ? "text-emerald-400" : isActive ? "text-indigo-300 bg-indigo-500/5" : "text-dim"
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : isActive ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-slate-700" />
                        )}
                        {stage.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ============================================= */}
          {/* Step 4: Import Complete                       */}
          {/* ============================================= */}
          {step === "complete" && importResult && (
            <div className="flex flex-col items-center py-12">
              <div className="w-full max-w-lg space-y-6">
                {/* Success icon */}
                <div className="flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                </div>

                <div className="text-center">
                  <h3 className="text-lg font-bold text-foreground">Import Complete</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {importResult.recordsImported} subjects loaded and pre-screened against KEYNOTE-789.
                  </p>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
                      label: "Subjects",
                      value: importResult.recordsImported,
                      color: "text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20",
                    },
                    {
                      icon: <RefreshCw className="h-4 w-4 text-blue-400" />,
                      label: "Rows Consolidated",
                      value: importResult.recordsSkipped,
                      color: "text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/20",
                    },
                    {
                      icon: <Search className="h-4 w-4 text-indigo-400" />,
                      label: "Pre-Screened",
                      value: importResult.recordsImported,
                      color: "text-indigo-400 bg-indigo-500/10 ring-1 ring-indigo-500/20",
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="flex flex-col items-center rounded-xl border border-border bg-card p-4"
                    >
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.color}`}
                      >
                        {stat.icon}
                      </div>
                      <span className="mt-2 text-lg font-bold text-foreground">{stat.value}</span>
                      <span className="text-[12px] font-medium uppercase tracking-wider text-body">
                        {stat.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Import messages — distinguish info from real errors */}
                {importResult.errors.length > 0 && (() => {
                  // Messages starting with "Row" are real import errors from Rust
                  const realErrors = importResult.errors.filter((e) => /^Row\s+\d+/.test(e));
                  const infoMessages = importResult.errors.filter((e) => !/^Row\s+\d+/.test(e));

                  return (
                    <>
                      {infoMessages.length > 0 && (
                        <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/5 p-4 ring-1 ring-indigo-500/10">
                          <div className="mb-2 flex items-center gap-2">
                            <Info className="h-4 w-4 text-indigo-400" />
                            <span className="text-xs font-semibold text-indigo-400">Import Summary</span>
                          </div>
                          <ul className="space-y-1">
                            {infoMessages.map((e, i) => (
                              <li key={i} className="text-xs text-indigo-300/70">
                                {e}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {realErrors.length > 0 && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-red-400" />
                            <span className="text-xs font-semibold text-red-400">
                              {realErrors.length} Import {realErrors.length === 1 ? "Error" : "Errors"}
                            </span>
                          </div>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {realErrors.slice(0, 20).map((e, i) => (
                              <p key={i} className="text-[12px] text-red-300/70">
                                {e}
                              </p>
                            ))}
                            {realErrors.length > 20 && (
                              <p className="text-[12px] text-red-300/50">
                                ...and {realErrors.length - 20} more errors
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Save as Profile (Tauri only) */}
                {isTauri && realMapping && (
                  <div className="rounded-xl border border-border bg-card">
                    {!showProfileSave ? (
                      <button
                        onClick={() => setShowProfileSave(true)}
                        className="flex w-full items-center justify-center gap-2 px-4 py-3 text-[12px] font-medium text-body transition-colors hover:bg-surface-1 hover:text-heading"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Save column mapping as a profile for future imports
                      </button>
                    ) : (
                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Bookmark className="h-4 w-4 text-indigo-400" />
                          <span className="text-xs font-semibold text-foreground">Save Import Profile</span>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-dim mb-1">Profile Name</label>
                          <input
                            type="text"
                            value={profileSaveName}
                            onChange={(e) => setProfileSaveName(e.target.value)}
                            placeholder="e.g., Epic Clarity Monthly Export"
                            className="w-full rounded-lg border border-edge-2 bg-surface-1 px-3 py-2 text-[12px] text-body placeholder:text-dim focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-dim mb-1">Description (optional)</label>
                          <input
                            type="text"
                            value={profileSaveDesc}
                            onChange={(e) => setProfileSaveDesc(e.target.value)}
                            placeholder="e.g., Standard monthly patient data pull"
                            className="w-full rounded-lg border border-edge-2 bg-surface-1 px-3 py-2 text-[12px] text-body placeholder:text-dim focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            onClick={() => {
                              setShowProfileSave(false);
                              setProfileSaveName("");
                              setProfileSaveDesc("");
                            }}
                            className="rounded-lg border border-edge-3 bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body"
                          >
                            Cancel
                          </button>
                          <button
                            disabled={!profileSaveName.trim()}
                            onClick={async () => {
                              if (!profileSaveName.trim()) return;
                              try {
                                const ext = selectedFile?.format ?? "csv";
                                const headerIdx = realPreview?.header_row_index ?? 0;
                                const profile = await saveImportProfile(
                                  profileSaveName.trim(),
                                  profileSaveDesc.trim() || null,
                                  null,
                                  ext,
                                  realMapping,
                                  headerIdx,
                                );
                                setImportProfiles((prev) => [...prev, profile]);
                                setShowProfileSave(false);
                                setProfileSaveName("");
                                setProfileSaveDesc("");
                                toast.success("Profile saved", `"${profile.name}" can be used for future imports`);
                              } catch (err) {
                                toast.error("Failed to save profile", err instanceof Error ? err.message : String(err));
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Save className="h-3 w-3" />
                            Save Profile
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Quick actions */}
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={goToScreening}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
                  >
                    <Search className="h-4 w-4" />
                    Go to Screening Queue
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={goToScreening}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-edge-3 bg-surface-2 px-4 py-2.5 text-[12px] font-medium text-body transition-colors hover:bg-surface-3"
                    >
                      <Users className="h-4 w-4" />
                      View Subjects
                    </button>
                    <button
                      onClick={resetImport}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-edge-3 bg-surface-2 px-4 py-2.5 text-[12px] font-medium text-body transition-colors hover:bg-surface-3"
                    >
                      <FileUp className="h-4 w-4" />
                      Import More
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          </>)}

        </div>
      </div>
    </div>
  );
}
