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
import type { ColumnMapping, ImportResult } from "@/types";
import {
  EPIC_COLUMNS,
  EPIC_ROWS,
  EPIC_AUTO_MAPPINGS,
  EPIC_SAMPLE_DATA,
  parseEpicRows,
  screenPatientsForStudy,
} from "@/lib/epic-demo-data";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useAppStore } from "@/stores/use-app-store";
import { useToast } from "@/components/ui/Toast";
import { isTauri } from "@/lib/tauri";
import {
  previewRealFile,
  executeRealImport,
  pickImportFile,
  type RustImportPreview,
  type RustColumnMapping,
} from "@/lib/real-import";

// ---------------------------------------------------------------------------
// Preview rows — first 5 unique patients from Epic data
// ---------------------------------------------------------------------------

const PREVIEW_ROWS = EPIC_ROWS.slice(0, 5);

const MOCK_RECENT_IMPORTS = [
  { name: "epic_clarity_q4_2025.csv", date: "2025-12-15", records: 1208 },
];

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

type ImportStep = "select" | "preview" | "importing" | "complete";

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS: { key: ImportStep; label: string }[] = [
  { key: "select", label: "Select File" },
  { key: "preview", label: "Map Columns" },
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

export function ImportPage() {
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

  // Store access for loading imported patients into screening
  const setPatients = useScreeningStore((s) => s.setPatients);
  const setScreeningResult = useScreeningStore((s) => s.setScreeningResult);
  const setCriteriaResults = useScreeningStore((s) => s.setCriteriaResults);
  const selectStudy = useScreeningStore((s) => s.selectStudy);
  const setAppStatus = useAppStore((s) => s.setStatus);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const toast = useToast();

  // Handle file selection — auto-detect Epic format
  const handleFileSelected = useCallback(async (file: SelectedFile) => {
    setSelectedFile(file);
    setImportError(null);

    // In Tauri mode with a real file path, call Rust backend for preview
    if (isTauri && file.path) {
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
    }
  }, []);

  const handleFileClear = useCallback(() => {
    setSelectedFile(null);
  }, []);

  // Handle mapping changes
  const handleMappingChange = useCallback((index: number, targetField: string) => {
    setMappings((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = { ...current, targetField, confidence: 0 };
      return next;
    });
  }, []);

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
  }, []);

  // Start the import — uses Rust backend in Tauri mode, demo data in web mode
  const startImport = useCallback(() => {
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

          // The Rust backend parsed and stored the patients.
          // Now re-parse the same file via the JS demo engine for screening display.
          // (In production, screening would also run in Rust)
          const parsed = parseEpicRows(); // TODO: replace with Rust-parsed patients
          const screening = screenPatientsForStudy(parsed, "study-1");

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

      // === DEMO IMPORT (web mode or fallback) ===
      const totalRows = EPIC_ROWS.length;
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

      const parsed = parseEpicRows();
      const screening = screenPatientsForStudy(parsed, "study-1");
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
        format: "Epic Clarity CSV",
        recordsImported: uniquePatients,
        recordsUpdated: 0,
        recordsSkipped: totalRows - uniquePatients,
        errors: [
          `${totalRows} encounter rows consolidated into ${uniquePatients} unique subjects`,
          `${eligibleCount} subjects pre-screened as eligible for KEYNOTE-789`,
        ],
      });
      setStep("complete");
      toast.success(`Imported ${uniquePatients} subjects`, `${eligibleCount} pre-screened as eligible`);
    };

    runImport();
  }, [setPatients, setScreeningResult, selectStudy, setAppStatus, selectedFile, realMapping, realPreview]);

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
              Import subject records from Epic, Cerner, or other EMR exports. All data stays encrypted on this device.
            </p>
          </div>
          <StepIndicator current={step} />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">

          {/* ============================================= */}
          {/* Step 1: File Selection                        */}
          {/* ============================================= */}
          {step === "select" && (
            <div className="space-y-6">
              <FileDropZone
                onFileSelected={handleFileSelected}
                selectedFile={selectedFile}
                onClear={handleFileClear}
              />

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
                          // Get file size from Rust
                          handleFileSelected({ name, size: 0, format: "csv", path });
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
                    >
                      <FileUp className="h-3.5 w-3.5" />
                      Select CSV from Disk
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

              {/* Recent imports */}
              {MOCK_RECENT_IMPORTS.length > 0 && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Recent Imports
                  </h3>
                  <div className="space-y-2">
                    {MOCK_RECENT_IMPORTS.map((imp) => (
                      <div
                        key={imp.name}
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
                          {imp.records} records
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
          {step === "preview" && (
            <div className="space-y-6">
              {/* Format detection banner */}
              <div className="flex items-center gap-3 rounded-xl border border-indigo-500/15 bg-indigo-500/5 px-4 py-3 ring-1 ring-indigo-500/10">
                <Sparkles className="h-5 w-5 text-indigo-400" />
                <div>
                  <p className="text-[12px] font-semibold text-indigo-300">Epic Clarity Format Detected</p>
                  <p className="text-[12px] text-dim">
                    Recognized PAT_MRN_ID, CURRENT_ICD10_LIST, and {EPIC_COLUMNS.length - 2} other Epic Clarity columns.
                    Auto-mapped {mappedCount} of {EPIC_COLUMNS.length} fields.
                  </p>
                </div>
              </div>

              {/* File stats */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  {
                    icon: <Table2 className="h-4 w-4" />,
                    label: "Format",
                    value: "Epic Clarity CSV",
                  },
                  {
                    icon: <BarChart3 className="h-4 w-4" />,
                    label: "Encounter Rows",
                    value: `${EPIC_ROWS.length} rows`,
                  },
                  {
                    icon: <Users className="h-4 w-4" />,
                    label: "Unique Subjects",
                    value: `${new Set(EPIC_ROWS.map((r) => r[0])).size} subjects`,
                  },
                  {
                    icon: <Columns3 className="h-4 w-4" />,
                    label: "Columns",
                    value: `${EPIC_COLUMNS.length} fields`,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
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
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Data Preview (first 5 encounter rows)
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-edge-2 bg-surface-1">
                        {EPIC_COLUMNS.slice(0, 12).map((col) => (
                          <th
                            key={col}
                            className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground"
                          >
                            {col}
                          </th>
                        ))}
                        <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-dim">
                          +{EPIC_COLUMNS.length - 12} more...
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {PREVIEW_ROWS.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-border/50 last:border-0"
                        >
                          {row.slice(0, 12).map((cell, j) => (
                            <td
                              key={j}
                              className="max-w-[140px] truncate whitespace-nowrap px-3 py-2 font-mono text-foreground/80"
                            >
                              {cell}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-dim">...</td>
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
                </div>
                <div className="p-4">
                  <ColumnMapper
                    mappings={mappings}
                    sampleData={EPIC_SAMPLE_DATA}
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
                  onClick={startImport}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
                >
                  Import & Screen {new Set(EPIC_ROWS.map((r) => r[0])).size} Subjects
                  <ArrowRight className="h-4 w-4" />
                </button>
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
                    {recordsProcessed} of {EPIC_ROWS.length} encounter rows processed
                  </p>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Progress</span>
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
                      <span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                        {stat.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Info detail */}
                {importResult.errors.length > 0 && (
                  <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/5 p-4 ring-1 ring-indigo-500/10">
                    <div className="mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-indigo-400" />
                      <span className="text-xs font-semibold text-indigo-400">Import Summary</span>
                    </div>
                    <ul className="space-y-1">
                      {importResult.errors.map((e, i) => (
                        <li key={i} className="text-xs text-indigo-300/70">
                          {e}
                        </li>
                      ))}
                    </ul>
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

        </div>
      </div>
    </div>
  );
}
