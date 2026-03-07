import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileSpreadsheet,
  FileJson,
  FileCode,
  FileText,
  X,
} from "lucide-react";

export interface SelectedFile {
  name: string;
  size: number;
  format: "csv" | "excel" | "fhir_json" | "ccda_xml" | "unknown";
  /** Full file path — only available in Tauri mode */
  path?: string;
}

const FORMAT_META: Record<
  SelectedFile["format"],
  { label: string; color: string; bgColor: string }
> = {
  csv: { label: "CSV", color: "text-blue-400", bgColor: "bg-blue-500/10 ring-1 ring-blue-500/20" },
  excel: { label: "Excel", color: "text-emerald-400", bgColor: "bg-emerald-500/10 ring-1 ring-emerald-500/20" },
  fhir_json: { label: "FHIR JSON", color: "text-violet-400", bgColor: "bg-violet-500/10 ring-1 ring-violet-500/20" },
  ccda_xml: { label: "C-CDA XML", color: "text-amber-400", bgColor: "bg-amber-500/10 ring-1 ring-amber-500/20" },
  unknown: { label: "Unknown", color: "text-slate-400", bgColor: "bg-white/[0.04] ring-1 ring-white/[0.08]" },
};

function detectFormat(name: string): SelectedFile["format"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return "csv";
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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (name: string, size: number) => {
      const format = detectFormat(name);
      onFileSelected({ name, size, format });
    },
    [onFileSelected]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file.name, file.size);
  }, [handleFile]);
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file.name, file.size);
  }, [handleFile]);

  if (selectedFile) {
    const meta = FORMAT_META[selectedFile.format];
    return (
      <div className="rounded-xl border border-white/[0.06] bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${meta.bgColor} ${meta.color}`}>
              {FORMAT_ICON[selectedFile.format]}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-slate-200">{selectedFile.name}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[11px] text-slate-500">{formatFileSize(selectedFile.size)}</span>
                <span className="text-slate-700">|</span>
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${meta.bgColor} ${meta.color}`}>
                  {meta.label}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClear} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`group cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all duration-200 ${
          isDragOver ? "border-indigo-500/40 bg-indigo-500/5" : "border-white/[0.08] hover:border-indigo-500/20 hover:bg-white/[0.02]"
        }`}
      >
        <input ref={inputRef} type="file" className="hidden" accept=".csv,.tsv,.xlsx,.xls,.json,.xml" onChange={handleInputChange} />
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl transition-colors duration-200 ${
          isDragOver ? "bg-indigo-500/15 text-indigo-400" : "bg-white/[0.04] text-slate-500 group-hover:bg-indigo-500/10 group-hover:text-indigo-400"
        }`}>
          <Upload className="h-7 w-7" />
        </div>
        <p className="mt-4 text-[13px] font-semibold text-slate-200">
          {isDragOver ? "Drop file to import" : "Drop files here or click to browse"}
        </p>
        <p className="mt-1.5 text-[11px] text-slate-500">Import patient records from your EMR exports</p>
        <div className="mt-6 flex items-center justify-center gap-2">
          {([
            { label: "CSV", color: "text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/20" },
            { label: "Excel", color: "text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20" },
            { label: "FHIR JSON", color: "text-violet-400 bg-violet-500/10 ring-1 ring-violet-500/20" },
            { label: "C-CDA XML", color: "text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/20" },
          ] as const).map((fmt) => (
            <span key={fmt.label} className={`rounded-md px-2.5 py-1 text-[10px] font-semibold ${fmt.color}`}>{fmt.label}</span>
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-center">
        <button onClick={() => inputRef.current?.click()} className="rounded-lg bg-indigo-600 px-6 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500">
          Select File to Import
        </button>
      </div>
    </div>
  );
}
