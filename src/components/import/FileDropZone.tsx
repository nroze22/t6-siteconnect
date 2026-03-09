import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  FileJson,
  FileCode,
  FileText,
  X,
  Columns3,
  Rows3,
  HardDrive,
  CheckCircle2,
} from "lucide-react";

export interface CsvPreview {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export interface SelectedFile {
  name: string;
  size: number;
  format: "csv" | "excel" | "fhir_json" | "ccda_xml" | "unknown";
  /** Full file path — only available in Tauri mode */
  path?: string;
  /** Parsed CSV preview — only available when a real file is dropped/selected in the browser */
  preview?: CsvPreview;
}

const FORMAT_META: Record<
  SelectedFile["format"],
  { label: string; color: string; bgColor: string }
> = {
  csv: { label: "CSV", color: "text-blue-400", bgColor: "bg-blue-500/10 ring-1 ring-blue-500/20" },
  excel: { label: "Excel", color: "text-emerald-400", bgColor: "bg-emerald-500/10 ring-1 ring-emerald-500/20" },
  fhir_json: { label: "FHIR JSON", color: "text-violet-400", bgColor: "bg-violet-500/10 ring-1 ring-violet-500/20" },
  ccda_xml: { label: "C-CDA XML", color: "text-amber-400", bgColor: "bg-amber-500/10 ring-1 ring-amber-500/20" },
  unknown: { label: "Unknown", color: "text-dim", bgColor: "bg-surface-2 ring-1 ring-edge-3" },
};

function detectFormat(name: string): SelectedFile["format"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".pip") || lower.endsWith(".dat")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (lower.endsWith(".json")) return "fhir_json";
  if (lower.endsWith(".xml")) return "ccda_xml";
  return "unknown";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Parse CSV text into headers and preview rows.
 * Basic comma-splitting — does not handle quoted fields.
 */
function parseCsvPreview(text: string, maxRows: number = 5): CsvPreview | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headerLine = lines[0];
  if (!headerLine) return null;

  const headers = headerLine.split(",").map((h) => h.trim());
  const dataLines = lines.slice(1);
  const rows = dataLines.slice(0, maxRows).map((line) =>
    line.split(",").map((cell) => cell.trim())
  );

  return { headers, rows, totalRows: dataLines.length };
}

/**
 * Read a browser File object and parse CSV contents for preview.
 */
function readAndParseCsv(file: File): Promise<CsvPreview | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      if (typeof text !== "string") {
        resolve(null);
        return;
      }
      resolve(parseCsvPreview(text));
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

const FORMAT_ICON: Record<SelectedFile["format"], React.ReactNode> = {
  csv: <FileSpreadsheet className="h-5 w-5" />,
  excel: <FileSpreadsheet className="h-5 w-5" />,
  fhir_json: <FileJson className="h-5 w-5" />,
  ccda_xml: <FileCode className="h-5 w-5" />,
  unknown: <FileText className="h-5 w-5" />,
};

interface FileDropZoneProps {
  onFileSelected: (file: SelectedFile) => void;
  selectedFile: SelectedFile | null;
  onClear: () => void;
}

export function FileDropZone({ onFileSelected, selectedFile, onClear }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleBrowserFile = useCallback(
    async (browserFile: File) => {
      const format = detectFormat(browserFile.name);
      if (format === "csv") {
        setIsParsing(true);
        const preview = await readAndParseCsv(browserFile);
        setIsParsing(false);
        onFileSelected({
          name: browserFile.name,
          size: browserFile.size,
          format,
          preview: preview ?? undefined,
        });
      } else {
        onFileSelected({ name: browserFile.name, size: browserFile.size, format });
      }
    },
    [onFileSelected]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleBrowserFile(file);
    },
    [handleBrowserFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleBrowserFile(file);
      // Reset so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    },
    [handleBrowserFile]
  );

  // -- File selected: show info card + optional CSV preview --
  if (selectedFile) {
    const meta = FORMAT_META[selectedFile.format];
    const preview = selectedFile.preview;
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="file-info"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-4"
        >
          {/* File info card */}
          <div className="rounded-xl border border-edge-2 bg-card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${meta.bgColor} ${meta.color}`}>
                  {FORMAT_ICON[selectedFile.format]}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-body">{selectedFile.name}</p>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-[12px] text-dim">
                      <HardDrive className="h-3 w-3" />
                      {formatFileSize(selectedFile.size)}
                    </span>
                    <span className="text-faint">|</span>
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-semibold ${meta.bgColor} ${meta.color}`}>
                      {meta.label}
                    </span>
                    {preview && (
                      <>
                        <span className="text-faint">|</span>
                        <span className="flex items-center gap-1.5 text-[12px] text-dim">
                          <Columns3 className="h-3 w-3" />
                          {preview.headers.length} columns
                        </span>
                        <span className="text-faint">|</span>
                        <span className="flex items-center gap-1.5 text-[12px] text-dim">
                          <Rows3 className="h-3 w-3" />
                          {preview.totalRows.toLocaleString()} data rows
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={onClear}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-dim transition-colors hover:bg-surface-2 hover:text-body"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* CSV Preview table */}
          {preview && preview.rows.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              className="rounded-xl border border-edge-2 bg-card"
            >
              <div className="flex items-center justify-between border-b border-edge-2 px-4 py-3">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-body">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Data Preview (first {preview.rows.length} rows of {preview.totalRows.toLocaleString()})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-edge-2 bg-surface-1">
                      {preview.headers.map((header, idx) => (
                        <th
                          key={`${header}-${idx}`}
                          className="whitespace-nowrap px-3 py-2 text-left font-semibold text-body"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className="border-b border-border/50 last:border-0"
                      >
                        {preview.headers.map((_header, colIdx) => {
                          const cell = row[colIdx];
                          return (
                            <td
                              key={colIdx}
                              className="max-w-[180px] truncate whitespace-nowrap px-3 py-2 font-mono text-foreground/80"
                            >
                              {cell ?? ""}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  // -- Empty state: drop zone --
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="drop-zone"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <div
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`group relative cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all duration-200 ${
            isDragOver
              ? "border-indigo-400/50 bg-indigo-500/[0.07] shadow-[0_0_40px_-8px_rgba(99,102,241,0.15)]"
              : "border-edge-3 hover:border-indigo-500/20 hover:bg-surface-1"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".csv,.tsv,.xlsx,.xls,.pip,.dat"
            onChange={handleInputChange}
          />

          {/* Animated glow ring on drag */}
          {isDragOver && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-indigo-500/30"
            />
          )}

          <div
            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-200 ${
              isDragOver
                ? "bg-indigo-500/15 text-indigo-400 scale-110"
                : "bg-surface-2 text-dim group-hover:bg-indigo-500/10 group-hover:text-indigo-400"
            }`}
          >
            <Upload className="h-7 w-7" />
          </div>

          <p className="mt-4 text-[14px] font-semibold text-body">
            {isParsing
              ? "Parsing file..."
              : isDragOver
              ? "Drop your data file here"
              : "Drop your CSV, TSV, pipe-delimited, or Excel file here"}
          </p>
          <p className="mt-1.5 text-[12px] text-dim">
            {isDragOver ? "Release to load and preview" : "Supports CSV, TSV, pipe-delimited, XLSX, and XLS formats"}
          </p>

          <div className="mt-6 flex items-center justify-center gap-2">
            {(
              [
                { label: "CSV / TSV", color: "text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/20" },
                { label: "Excel", color: "text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20" },
                { label: "FHIR Bundle", color: "text-violet-400 bg-violet-500/10 ring-1 ring-violet-500/20" },
                { label: "HL7 v2", color: "text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/20" },
              ] as const
            ).map((fmt) => (
              <span
                key={fmt.label}
                className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${fmt.color}`}
              >
                {fmt.label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            Browse Files
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
