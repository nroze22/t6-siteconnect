import { useState, useRef, useMemo, useEffect } from "react";
import {
  Brain,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Upload,
  Sparkles,
  ClipboardPaste,
  Edit3,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Plus,
  ChevronLeft,
  ChevronRight,
  Files,
  X,
  Clock,
  FileType,
  Pencil,
  Save,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { parseClinicalNotes, importExtractedPatients, type ExtractedPatient, type ExtractedPatientData } from "@/lib/data-provider";
import { useAppStore } from "@/stores/use-app-store";

// ---------------------------------------------------------------------------
// File parsing utilities
// ---------------------------------------------------------------------------

/** Read text from a File object — handles .txt, .pdf, .docx */
async function readFileAsText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") {
    return readPdfFile(file);
  }

  if (ext === "docx" || ext === "doc") {
    return readDocxFile(file);
  }

  // Plain text fallback (.txt, .text, .md, .csv, .rtf, etc.)
  return file.text();
}

/** Extract text from a PDF using pdfjs-dist */
async function readPdfFile(file: File): Promise<string> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    // Use the bundled worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: Record<string, unknown>) => (item as { str: string }).str)
        .join(" ");
      pages.push(pageText);
    }

    return pages.join("\n\n");
  } catch (err) {
    console.warn("PDF parsing failed, trying as text:", err);
    return file.text();
  }
}

/** Extract text from a DOCX using mammoth */
async function readDocxFile(file: File): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (err) {
    console.warn("DOCX parsing failed, trying as text:", err);
    return file.text();
  }
}

/** Estimate processing time based on character count */
function estimateProcessingTime(charCount: number): string {
  // ~3000 chars per chunk, ~30-60s per chunk for a 4B model
  const chunks = Math.max(1, Math.ceil(charCount / 3000));
  const secsPerChunk = 40; // conservative estimate
  const totalSecs = chunks * secsPerChunk;

  if (totalSecs < 60) return `~${totalSecs}s`;
  const mins = Math.ceil(totalSecs / 60);
  return `~${mins} min`;
}

/** Get a human-readable file size */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Get the file type label */
function getFileTypeLabel(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const labels: Record<string, string> = {
    pdf: "PDF", docx: "Word", doc: "Word", txt: "Text",
    text: "Text", md: "Markdown", csv: "CSV", rtf: "RTF",
  };
  return labels[ext] ?? "Text";
}

// ---------------------------------------------------------------------------
// Sample clinical notes for demo
// ---------------------------------------------------------------------------

const SAMPLE_NOTES = `PATIENT: John Doe, MRN: SC-2847
Age: 62 years old, Male, White
DOB: 1963-04-12

ACTIVE DIAGNOSES:
- Type 2 Diabetes Mellitus (E11.9), diagnosed 2019-03-15
- Essential Hypertension (I10), diagnosed 2018-06-01
- Hyperlipidemia (E78.5), diagnosed 2020-01-20
- Obesity, BMI 30-34.9 (E66.01)

CURRENT MEDICATIONS:
- Metformin 1000mg PO BID
- Lisinopril 20mg PO daily
- Atorvastatin 40mg PO daily at bedtime
- Empagliflozin 10mg PO daily

RECENT LAB RESULTS (2025-11-15):
- HbA1c: 8.4% (H) [ref: 4.0-5.6%]
- Fasting Glucose: 186 mg/dL (H) [ref: 70-100]
- eGFR: 72 mL/min/1.73m² [ref: >90]
- Creatinine: 1.1 mg/dL [ref: 0.7-1.3]
- Total Cholesterol: 198 mg/dL [ref: <200]
- LDL: 112 mg/dL (H) [ref: <100]
- HDL: 42 mg/dL (L) [ref: >40]
- Triglycerides: 220 mg/dL (H) [ref: <150]
- ALT: 28 U/L [ref: 7-56]
- AST: 25 U/L [ref: 10-40]

VITALS:
BP: 142/88 mmHg, HR: 78 bpm, BMI: 31.2 kg/m²

ASSESSMENT:
Poorly controlled T2DM with HbA1c 8.4% despite dual therapy.
Hypertension not at goal. Consider adding amlodipine.
Dyslipidemia — LDL above target on statin. May benefit from clinical trial enrollment.`;

const SAMPLE_NOTES_2 = `PATIENT: Maria Garcia, MRN: SC-4192
Age: 48 years old, Female, Hispanic
DOB: 1977-09-03

ACTIVE DIAGNOSES:
- Non-small cell lung cancer, Stage IIIA (C34.1), diagnosed 2025-01-10
- COPD, moderate (J44.1), diagnosed 2021-05-20
- Anemia of chronic disease (D63.8)

CURRENT MEDICATIONS:
- Carboplatin 450mg IV q3w
- Pembrolizumab 200mg IV q3w
- Albuterol 90mcg inhaler PRN
- Ondansetron 8mg PO PRN nausea

RECENT LAB RESULTS (2025-02-28):
- Hemoglobin: 10.2 g/dL (L) [ref: 12.0-16.0]
- WBC: 4.8 x10^3/uL [ref: 4.5-11.0]
- Platelets: 185 x10^3/uL [ref: 150-400]
- Creatinine: 0.9 mg/dL [ref: 0.6-1.2]
- ALT: 22 U/L [ref: 7-56]

VITALS:
BP: 118/72 mmHg, HR: 82 bpm, Weight: 61 kg, BMI: 23.4 kg/m²`;

// ---------------------------------------------------------------------------
// Source text highlighting utilities
// ---------------------------------------------------------------------------

function collectHighlightTerms(patient: ExtractedPatient): string[] {
  const terms: string[] = [];
  if (patient.name) terms.push(patient.name);
  if (patient.patient_id) terms.push(patient.patient_id);
  if (patient.date_of_birth) terms.push(patient.date_of_birth);
  if (patient.age) terms.push(String(patient.age));
  if (patient.gender) terms.push(patient.gender);
  if (patient.race) terms.push(patient.race);
  for (const dx of patient.diagnoses) {
    terms.push(dx.description);
    if (dx.icd10_code) terms.push(dx.icd10_code);
  }
  for (const med of patient.medications) {
    terms.push(med.drug_name);
    if (med.dose) terms.push(med.dose);
  }
  for (const lab of patient.labs) {
    terms.push(lab.test_name);
    if (lab.value != null) terms.push(String(lab.value));
  }
  for (const v of patient.vitals) {
    terms.push(String(v.value));
  }
  return terms.filter((t) => t.length >= 2);
}

type HighlightCategory = "demographic" | "diagnosis" | "medication" | "lab" | "vital";

function getTermCategory(term: string, patient: ExtractedPatient): HighlightCategory {
  if ([patient.name, patient.patient_id, patient.date_of_birth, patient.gender, patient.race].some(
    (v) => v && term.toLowerCase() === v.toLowerCase()
  ) || (patient.age && term === String(patient.age))) return "demographic";
  if (patient.diagnoses.some((dx) => dx.description.toLowerCase().includes(term.toLowerCase()) || dx.icd10_code === term)) return "diagnosis";
  if (patient.medications.some((m) => m.drug_name.toLowerCase().includes(term.toLowerCase()) || m.dose === term)) return "medication";
  if (patient.labs.some((l) => l.test_name.toLowerCase().includes(term.toLowerCase()) || (l.value != null && String(l.value) === term))) return "lab";
  return "vital";
}

const CATEGORY_COLORS: Record<HighlightCategory, { bg: string; border: string; text: string }> = {
  demographic: { bg: "bg-blue-500/15",    border: "border-blue-500/30",    text: "text-blue-300" },
  diagnosis:   { bg: "bg-rose-500/15",    border: "border-rose-500/30",    text: "text-rose-300" },
  medication:  { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-300" },
  lab:         { bg: "bg-indigo-500/15",  border: "border-indigo-500/30",  text: "text-indigo-300" },
  vital:       { bg: "bg-purple-500/15",  border: "border-purple-500/30",  text: "text-purple-300" },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SmartImportPanelProps {
  onImportComplete?: (patients: ExtractedPatient[]) => void;
}

interface QueuedDocument {
  id: string;
  name: string;
  fileType: string;
  fileSize: number;
  sourceText: string;
  extractedData: ExtractedPatientData | null;
  extracting: boolean;
  error: string | null;
  imported: boolean;
  startTime: number | null;
  endTime: number | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SmartImportPanel({ onImportComplete }: SmartImportPanelProps) {
  const [documents, setDocuments] = useState<QueuedDocument[]>([]);
  const [activeDocIdx, setActiveDocIdx] = useState(0);
  const [notesText, setNotesText] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [editingPatientIdx, setEditingPatientIdx] = useState<number>(0);
  const [showSource, setShowSource] = useState(true);
  const [hoveredTerm, setHoveredTerm] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const llmStatus = useAppStore((s) => s.status.llmStatus);

  const isAiReady = llmStatus === "running";
  const activeDoc = documents[activeDocIdx] ?? null;
  const hasQueue = documents.length > 0;

  const activePatient = activeDoc?.extractedData?.patients[editingPatientIdx] ?? null;

  const highlightTerms = useMemo(() => {
    if (!activePatient) return [];
    return collectHighlightTerms(activePatient);
  }, [activePatient]);

  // Elapsed time timer for active extraction
  useEffect(() => {
    const extractingDoc = documents.find((d) => d.extracting);
    if (!extractingDoc?.startTime) {
      setElapsedSecs(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - extractingDoc.startTime!) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [documents]);

  // ---- Document queue management ----

  function addDocumentsToQueue(texts: { name: string; content: string; fileType: string; fileSize: number }[]) {
    const newDocs: QueuedDocument[] = texts.map((t, i) => ({
      id: `doc-${Date.now()}-${i}`,
      name: t.name,
      fileType: t.fileType,
      fileSize: t.fileSize,
      sourceText: t.content,
      extractedData: null,
      extracting: false,
      error: null,
      imported: false,
      startTime: null,
      endTime: null,
    }));
    setDocuments((prev) => [...prev, ...newDocs]);
    if (documents.length === 0) setActiveDocIdx(0);
    if (newDocs[0]) processDocument(newDocs[0], documents.length);
  }

  async function processDocument(doc: QueuedDocument, idx: number) {
    updateDoc(idx, { extracting: true, error: null, startTime: Date.now(), endTime: null });
    try {
      const result = await parseClinicalNotes(doc.sourceText);
      updateDoc(idx, { extractedData: result, extracting: false, endTime: Date.now() });
      if (result.patients.length === 0) {
        updateDoc(idx, { error: "No patient data could be extracted." });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      updateDoc(idx, { error: msg, extracting: false, endTime: Date.now() });
    }
  }

  function updateDoc(idx: number, updates: Partial<QueuedDocument>) {
    setDocuments((prev) => prev.map((d, i) => i === idx ? { ...d, ...updates } : d));
  }

  function removeDoc(idx: number) {
    setDocuments((prev) => prev.filter((_, i) => i !== idx));
    if (activeDocIdx >= documents.length - 1) setActiveDocIdx(Math.max(0, documents.length - 2));
  }

  // ---- Single text input ----

  async function handleExtractSingle() {
    if (!notesText.trim()) return;
    addDocumentsToQueue([{
      name: "Pasted Notes",
      content: notesText,
      fileType: "Text",
      fileSize: new Blob([notesText]).size,
    }]);
    setNotesText("");
    setInputError(null);
  }

  function handleLoadSample() {
    addDocumentsToQueue([
      { name: "John Doe — Progress Notes", content: SAMPLE_NOTES, fileType: "Text", fileSize: SAMPLE_NOTES.length },
      { name: "Maria Garcia — Oncology Notes", content: SAMPLE_NOTES_2, fileType: "Text", fileSize: SAMPLE_NOTES_2.length },
    ]);
  }

  function handlePaste() {
    navigator.clipboard.readText().then((text) => {
      if (text.trim()) {
        setNotesText(text);
        setInputError(null);
      }
    }).catch(() => {});
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const texts: { name: string; content: string; fileType: string; fileSize: number }[] = [];
    for (const file of Array.from(files)) {
      try {
        const content = await readFileAsText(file);
        texts.push({
          name: file.name,
          content,
          fileType: getFileTypeLabel(file.name),
          fileSize: file.size,
        });
      } catch (err) {
        console.error(`Failed to read ${file.name}:`, err);
      }
    }

    if (texts.length > 0) addDocumentsToQueue(texts);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleImportPatient(patient: ExtractedPatient) {
    try {
      await importExtractedPatients([patient]);
    } catch (err) {
      console.error("Failed to persist patient:", err);
    }
    onImportComplete?.([patient]);
    if (activeDoc) {
      const remaining = activeDoc.extractedData?.patients.filter((p) => p !== patient) ?? [];
      if (remaining.length === 0) {
        updateDoc(activeDocIdx, { imported: true });
        const nextIdx = documents.findIndex((d, i) => i > activeDocIdx && !d.imported);
        if (nextIdx >= 0) {
          setActiveDocIdx(nextIdx);
          setEditingPatientIdx(0);
          const nextDoc = documents[nextIdx];
          if (nextDoc && !nextDoc.extractedData && !nextDoc.extracting) processDocument(nextDoc, nextIdx);
        }
      } else {
        updateDoc(activeDocIdx, { extractedData: { ...activeDoc.extractedData!, patients: remaining } });
        setEditingPatientIdx(0);
      }
    }
  }

  async function handleImportAllFromDoc() {
    if (!activeDoc?.extractedData?.patients.length) return;
    try {
      await importExtractedPatients(activeDoc.extractedData.patients);
    } catch (err) {
      console.error("Failed to persist patients:", err);
    }
    onImportComplete?.(activeDoc.extractedData.patients);
    updateDoc(activeDocIdx, { imported: true });
    const nextIdx = documents.findIndex((d, i) => i > activeDocIdx && !d.imported);
    if (nextIdx >= 0) {
      setActiveDocIdx(nextIdx);
      setEditingPatientIdx(0);
      const nextDoc = documents[nextIdx];
      if (nextDoc && !nextDoc.extractedData && !nextDoc.extracting) processDocument(nextDoc, nextIdx);
    }
  }

  function handleClearAll() {
    setDocuments([]);
    setActiveDocIdx(0);
    setEditingPatientIdx(0);
    setNotesText("");
  }

  function removePatient(idx: number) {
    if (!activeDoc?.extractedData) return;
    const updated = { ...activeDoc.extractedData, patients: activeDoc.extractedData.patients.filter((_, i) => i !== idx) };
    updateDoc(activeDocIdx, { extractedData: updated });
    if (editingPatientIdx >= updated.patients.length) setEditingPatientIdx(Math.max(0, updated.patients.length - 1));
  }

  // ---- Patient field editing ----
  function updatePatientField(field: string, value: string) {
    if (!activeDoc?.extractedData || editingPatientIdx < 0) return;
    const patients = activeDoc.extractedData.patients.map((p, i) => {
      if (i !== editingPatientIdx) return p;
      const updated = { ...p } as ExtractedPatient;
      switch (field) {
        case "name": updated.name = value || null; break;
        case "patient_id": updated.patient_id = value || null; break;
        case "date_of_birth": updated.date_of_birth = value || null; break;
        case "age": updated.age = value ? parseInt(value) || null : null; break;
        case "gender": updated.gender = value || null; break;
        case "race": updated.race = value || null; break;
      }
      return updated;
    });
    updateDoc(activeDocIdx, { extractedData: { ...activeDoc.extractedData, patients } });
    setEditingField(null);
  }

  // ---- Summary stats ----
  const totalDocs = documents.length;
  const processedDocs = documents.filter((d) => d.extractedData && !d.extracting).length;
  const importedDocs = documents.filter((d) => d.imported).length;
  const totalPatients = documents.reduce((sum, d) => sum + (d.extractedData?.patients.length ?? 0), 0);

  // ---- Input Phase ----
  if (!hasQueue) {
    return (
      <div className="space-y-4">
        {!isAiReady && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-heading">AI model required</p>
              <p className="text-xs text-dim mt-0.5">Set up a local AI model in Settings to extract data from clinical notes. Demo mode will show sample data.</p>
            </div>
            <button onClick={() => useAppStore.getState().setCurrentPage("settings")} className="rounded-lg bg-amber-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors">
              Set Up AI
            </button>
          </div>
        )}

        <div className="rounded-xl border border-edge-2 bg-card p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 ring-1 ring-purple-500/20">
              <Brain className="h-4.5 w-4.5 text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-heading">AI-Powered Unstructured Data Import</h3>
              <p className="text-xs text-dim mt-0.5">Paste clinical notes or upload files (PDF, Word, text). The AI model extracts structured patient data for screening.</p>
            </div>
          </div>

          {/* Upload zone */}
          <div className="mb-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.text,.md,.csv,.rtf,.pdf,.docx,.doc"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-lg border-2 border-dashed border-edge-2 bg-surface-1/50 p-6 text-center hover:border-purple-500/30 hover:bg-purple-500/5 transition-all group"
            >
              <Upload className="h-6 w-6 text-dim group-hover:text-purple-400 mx-auto mb-2 transition-colors" />
              <p className="text-[13px] font-medium text-body group-hover:text-heading transition-colors">
                Drop files or click to upload
              </p>
              <p className="text-[11px] text-dim mt-1">
                Supports <span className="text-body font-medium">PDF</span>, <span className="text-body font-medium">Word (.docx)</span>, <span className="text-body font-medium">Text</span>, and <span className="text-body font-medium">CSV</span> files — upload multiple at once
              </p>
            </button>
          </div>

          <div className="relative flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-edge-2" />
            <span className="text-[10px] text-faint uppercase tracking-widest">or paste text</span>
            <div className="flex-1 h-px bg-edge-2" />
          </div>

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={notesText}
              onChange={(e) => { setNotesText(e.target.value); setInputError(null); }}
              placeholder={"Paste clinical notes here...\n\nExample:\nPATIENT: Jane Smith, MRN: 12345\nAge: 55, Female, DOB: 1970-05-22\nDx: Type 2 Diabetes (E11.9), Hypertension (I10)\nMeds: Metformin 500mg BID, Lisinopril 10mg daily\nLabs: HbA1c 7.8%, eGFR 68 mL/min"}
              rows={8}
              className="w-full rounded-lg border border-edge-2 bg-surface-1 px-4 py-3 text-[13px] text-body placeholder-faint font-mono leading-relaxed focus:border-purple-500/40 focus:outline-none focus:ring-1 focus:ring-purple-500/20 resize-none"
            />
            {notesText && (
              <div className="absolute top-2 right-2 flex items-center gap-2">
                <span className="text-[10px] text-faint tabular-nums">{notesText.length.toLocaleString()} chars</span>
                <span className="text-[10px] text-purple-400 font-medium">{estimateProcessingTime(notesText.length)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <button onClick={handleLoadSample} className="flex items-center gap-1.5 rounded-lg border border-edge-2 bg-surface-2 px-3 py-1.5 text-xs font-medium text-body hover:bg-surface-3 transition-colors">
                <FileText className="h-3 w-3 text-dim" /> Load Samples
              </button>
              <button onClick={handlePaste} className="flex items-center gap-1.5 rounded-lg border border-edge-2 bg-surface-2 px-3 py-1.5 text-xs font-medium text-body hover:bg-surface-3 transition-colors">
                <ClipboardPaste className="h-3 w-3 text-dim" /> Paste
              </button>
              {notesText && (
                <button onClick={() => setNotesText("")} className="flex items-center gap-1.5 rounded-lg border border-edge-2 bg-surface-2 px-3 py-1.5 text-xs font-medium text-body hover:bg-surface-3 transition-colors">
                  <Trash2 className="h-3 w-3 text-dim" /> Clear
                </button>
              )}
            </div>
            <button
              onClick={handleExtractSingle}
              disabled={!notesText.trim()}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm shadow-purple-500/20"
            >
              <Sparkles className="h-3.5 w-3.5" /> Extract with AI
            </button>
          </div>

          {inputError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-300">{inputError}</p>
            </div>
          )}
        </div>

        {/* Processing info */}
        <div className="rounded-xl border border-edge-2 bg-card/50 p-4">
          <p className="text-xs font-medium text-heading mb-2">How it works</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-start gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/15 text-[10px] font-bold text-purple-400 shrink-0 mt-0.5">1</div>
              <div>
                <p className="text-[11px] font-medium text-body">Upload or paste</p>
                <p className="text-[10px] text-dim">PDF, Word, or plain text clinical notes</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/15 text-[10px] font-bold text-purple-400 shrink-0 mt-0.5">2</div>
              <div>
                <p className="text-[11px] font-medium text-body">AI extracts data</p>
                <p className="text-[10px] text-dim">~30-60s per page. Large files auto-chunked.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/15 text-[10px] font-bold text-purple-400 shrink-0 mt-0.5">3</div>
              <div>
                <p className="text-[11px] font-medium text-body">Review & import</p>
                <p className="text-[10px] text-dim">Verify extracted data, edit fields, then import</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- All documents imported ----
  if (importedDocs === totalDocs && totalDocs > 0) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 mb-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-heading">All Documents Processed</h3>
          <p className="text-xs text-dim mt-1 max-w-md">
            {totalDocs} document{totalDocs !== 1 ? "s" : ""} processed, {totalPatients} patient record{totalPatients !== 1 ? "s" : ""} imported to screening.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={handleClearAll} className="rounded-lg border border-edge-2 bg-surface-2 px-4 py-2 text-xs font-medium text-body hover:bg-surface-3 transition-colors">
              Import More
            </button>
            <button onClick={() => useAppStore.getState().setCurrentPage("screening")} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors">
              View Screening <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Review Queue Phase ----
  return (
    <div className="space-y-3">
      {/* Queue header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Files className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold text-heading">Review Queue</span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-dim">
            {processedDocs}/{totalDocs} processed
          </span>
          {importedDocs > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              {importedDocs} imported
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.text,.md,.csv,.rtf,.pdf,.docx,.doc"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-edge-2 bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-body hover:bg-surface-3 transition-colors">
            <Plus className="h-3 w-3 text-dim" /> Add Files
          </button>
          <button onClick={handleClearAll} className="flex items-center gap-1.5 rounded-lg border border-edge-2 bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-body hover:bg-surface-3 transition-colors">
            <Trash2 className="h-3 w-3 text-dim" /> Clear All
          </button>
        </div>
      </div>

      {/* Document queue pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {documents.map((doc, idx) => (
          <button
            key={doc.id}
            onClick={() => { setActiveDocIdx(idx); setEditingPatientIdx(0); if (!doc.extractedData && !doc.extracting) processDocument(doc, idx); }}
            className={`group relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all whitespace-nowrap ${
              activeDocIdx === idx
                ? "bg-card text-heading shadow-sm ring-1 ring-edge-2"
                : doc.imported
                ? "bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15"
                : doc.error
                ? "bg-red-500/8 text-red-400 hover:bg-red-500/15"
                : "bg-surface-1 text-dim hover:text-body hover:bg-surface-2"
            }`}
          >
            {doc.extracting ? (
              <Loader2 className="h-3 w-3 animate-spin text-purple-400" />
            ) : doc.imported ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            ) : doc.error ? (
              <AlertTriangle className="h-3 w-3 text-red-400" />
            ) : (
              <FileType className="h-3 w-3" />
            )}
            <span className="max-w-[140px] truncate">{doc.name}</span>
            <span className="text-[9px] text-faint">{doc.fileType}</span>
            {doc.extractedData && !doc.imported && (
              <span className="rounded-full bg-purple-500/15 px-1.5 py-px text-[9px] text-purple-400">
                {doc.extractedData.patients.length}
              </span>
            )}
            {!doc.extracting && (
              <button
                onClick={(e) => { e.stopPropagation(); removeDoc(idx); }}
                className="ml-0.5 rounded-md p-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/15 hover:text-red-400 transition-all"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </button>
        ))}
      </div>

      {/* Active document view */}
      {activeDoc && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeDoc.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {/* Extracting state */}
            {activeDoc.extracting && (
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-8">
                <div className="flex flex-col items-center text-center">
                  <div className="relative flex h-14 w-14 items-center justify-center mb-4">
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-purple-500/30"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full border border-purple-500/20"
                      animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                    />
                    <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                  </div>
                  <p className="text-sm font-semibold text-heading">Extracting patient data...</p>
                  <p className="text-xs text-dim mt-1">AI is parsing clinical notes from "{activeDoc.name}"</p>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center gap-1.5 rounded-full bg-surface-1 px-3 py-1">
                      <Clock className="h-3 w-3 text-dim" />
                      <span className="text-[11px] text-body tabular-nums">{elapsedSecs}s elapsed</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full bg-surface-1 px-3 py-1">
                      <FileText className="h-3 w-3 text-dim" />
                      <span className="text-[11px] text-body">{formatFileSize(activeDoc.fileSize)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-1">
                      <span className="text-[11px] text-purple-400">Est. {estimateProcessingTime(activeDoc.sourceText.length)}</span>
                    </div>
                  </div>
                  {activeDoc.sourceText.length > 3000 && (
                    <p className="text-[10px] text-dim mt-2">
                      Large document — processing in {Math.ceil(activeDoc.sourceText.length / 3000)} chunks for best accuracy
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Error state */}
            {!activeDoc.extracting && activeDoc.error && !activeDoc.extractedData && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-heading">Extraction Failed</p>
                    <p className="text-xs text-red-300 mt-1">{activeDoc.error}</p>
                    <button
                      onClick={() => processDocument(activeDoc, activeDocIdx)}
                      className="mt-3 rounded-lg bg-red-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 transition-colors"
                    >
                      Retry Extraction
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Imported state */}
            {activeDoc.imported && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold text-heading">Imported</p>
                    <p className="text-xs text-dim mt-0.5">All patients from this document have been added to screening.</p>
                    {activeDoc.startTime && activeDoc.endTime && (
                      <p className="text-[10px] text-faint mt-1">
                        Processed in {Math.round((activeDoc.endTime - activeDoc.startTime) / 1000)}s
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Review state */}
            {activeDoc.extractedData && !activeDoc.imported && !activeDoc.extracting && (
              <div className="space-y-3">
                {/* Review header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                    <span className="text-[13px] font-semibold text-heading">
                      {activeDoc.extractedData.patients.length} Patient{activeDoc.extractedData.patients.length !== 1 ? "s" : ""} Found
                    </span>
                    <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-400 uppercase tracking-wider">AI-extracted</span>
                    {activeDoc.startTime && activeDoc.endTime && (
                      <span className="text-[10px] text-faint">
                        {Math.round((activeDoc.endTime - activeDoc.startTime) / 1000)}s
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowSource((v) => !v)} className="flex items-center gap-1.5 rounded-lg border border-edge-2 bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-body hover:bg-surface-3 transition-colors">
                      {showSource ? <EyeOff className="h-3 w-3 text-dim" /> : <Eye className="h-3 w-3 text-dim" />}
                      {showSource ? "Hide" : "Show"} Source
                    </button>
                    <button
                      onClick={handleImportAllFromDoc}
                      className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition-colors shadow-sm"
                    >
                      <Upload className="h-3 w-3" />
                      Import All {activeDoc.extractedData.patients.length} Patient{activeDoc.extractedData.patients.length !== 1 ? "s" : ""}
                    </button>
                  </div>
                </div>

                {/* Warnings */}
                {activeDoc.extractedData.parse_warnings && activeDoc.extractedData.parse_warnings.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-300">{activeDoc.extractedData.parse_warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
                  </div>
                )}

                {/* Legend */}
                <div className="flex items-center gap-3 px-1">
                  <span className="text-[10px] text-faint uppercase tracking-wider">Legend:</span>
                  {(["demographic", "diagnosis", "medication", "lab", "vital"] as HighlightCategory[]).map((cat) => (
                    <span key={cat} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[cat].bg} ${CATEGORY_COLORS[cat].text}`}>
                      {cat}
                    </span>
                  ))}
                </div>

                {/* Patient tabs */}
                {activeDoc.extractedData.patients.length > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingPatientIdx(Math.max(0, editingPatientIdx - 1))}
                      disabled={editingPatientIdx === 0}
                      className="rounded-md p-1 text-dim hover:text-body disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-1 flex-1 overflow-x-auto">
                      {activeDoc.extractedData.patients.map((p, idx) => (
                        <button
                          key={idx}
                          onClick={() => setEditingPatientIdx(idx)}
                          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                            editingPatientIdx === idx ? "bg-card text-heading shadow-sm ring-1 ring-edge-2" : "text-dim hover:text-body bg-surface-1"
                          }`}
                        >
                          {p.name || p.patient_id || `Patient ${idx + 1}`}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setEditingPatientIdx(Math.min(activeDoc.extractedData!.patients.length - 1, editingPatientIdx + 1))}
                      disabled={editingPatientIdx === activeDoc.extractedData.patients.length - 1}
                      className="rounded-md p-1 text-dim hover:text-body disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* Side-by-side layout */}
                <div className={`grid gap-3 ${showSource ? "grid-cols-2" : "grid-cols-1"}`} style={{ minHeight: 400 }}>
                  {/* LEFT: Extracted data */}
                  <div className="rounded-xl border border-edge-2 bg-card overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge-2 bg-surface-1/50">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                        <span className="text-[11px] font-semibold text-heading">Extracted Data</span>
                        <span className="text-[10px] text-dim italic">Click any field to edit</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {activePatient && (
                          <>
                            <button
                              onClick={() => handleImportPatient(activePatient)}
                              className="flex items-center gap-1 rounded-md bg-emerald-600/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-600 transition-colors"
                            >
                              <CheckCircle2 className="h-2.5 w-2.5" /> Import This Patient
                            </button>
                            <button
                              onClick={() => removePatient(editingPatientIdx)}
                              className="rounded-md p-1 text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {activePatient && (
                        <>
                          {/* Demographics — editable */}
                          <DataSection title="Demographics" icon={<Edit3 className="h-3 w-3" />}>
                            <div className="grid grid-cols-3 gap-2">
                              <EditableDataField label="Name" value={activePatient.name} field="name" category="demographic" hoveredTerm={hoveredTerm} onHover={setHoveredTerm} editingField={editingField} setEditingField={setEditingField} onSave={updatePatientField} />
                              <EditableDataField label="MRN" value={activePatient.patient_id} field="patient_id" category="demographic" hoveredTerm={hoveredTerm} onHover={setHoveredTerm} editingField={editingField} setEditingField={setEditingField} onSave={updatePatientField} />
                              <EditableDataField label="DOB" value={activePatient.date_of_birth} field="date_of_birth" category="demographic" hoveredTerm={hoveredTerm} onHover={setHoveredTerm} editingField={editingField} setEditingField={setEditingField} onSave={updatePatientField} />
                              <EditableDataField label="Age" value={activePatient.age?.toString() ?? null} field="age" category="demographic" hoveredTerm={hoveredTerm} onHover={setHoveredTerm} editingField={editingField} setEditingField={setEditingField} onSave={updatePatientField} />
                              <EditableDataField label="Gender" value={activePatient.gender} field="gender" category="demographic" hoveredTerm={hoveredTerm} onHover={setHoveredTerm} editingField={editingField} setEditingField={setEditingField} onSave={updatePatientField} />
                              <EditableDataField label="Race" value={activePatient.race} field="race" category="demographic" hoveredTerm={hoveredTerm} onHover={setHoveredTerm} editingField={editingField} setEditingField={setEditingField} onSave={updatePatientField} />
                            </div>
                          </DataSection>

                          {activePatient.diagnoses.length > 0 && (
                            <DataSection title={`Diagnoses (${activePatient.diagnoses.length})`}>
                              <div className="space-y-1">
                                {activePatient.diagnoses.map((dx, i) => (
                                  <div
                                    key={i}
                                    className={`flex items-center justify-between rounded-md px-2.5 py-1.5 transition-colors cursor-default ${
                                      hoveredTerm && (dx.description.toLowerCase().includes(hoveredTerm.toLowerCase()) || dx.icd10_code === hoveredTerm)
                                        ? "bg-rose-500/15 ring-1 ring-rose-500/30" : "bg-surface-1"
                                    }`}
                                    onMouseEnter={() => setHoveredTerm(dx.description)}
                                    onMouseLeave={() => setHoveredTerm(null)}
                                  >
                                    <div className="flex items-center gap-2">
                                      {dx.icd10_code && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-mono font-medium text-blue-400">{dx.icd10_code}</span>}
                                      <span className="text-xs text-body">{dx.description}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {dx.status && (
                                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                                          dx.status === "active" ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20" : "bg-surface-2 text-dim"
                                        }`}>{dx.status}</span>
                                      )}
                                      {dx.onset_date && <span className="text-[10px] text-faint">{dx.onset_date}</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </DataSection>
                          )}

                          {activePatient.medications.length > 0 && (
                            <DataSection title={`Medications (${activePatient.medications.length})`}>
                              <div className="space-y-1">
                                {activePatient.medications.map((med, i) => (
                                  <div
                                    key={i}
                                    className={`flex items-center justify-between rounded-md px-2.5 py-1.5 transition-colors cursor-default ${
                                      hoveredTerm && med.drug_name.toLowerCase().includes(hoveredTerm.toLowerCase())
                                        ? "bg-emerald-500/15 ring-1 ring-emerald-500/30" : "bg-surface-1"
                                    }`}
                                    onMouseEnter={() => setHoveredTerm(med.drug_name)}
                                    onMouseLeave={() => setHoveredTerm(null)}
                                  >
                                    <span className="text-xs text-body font-medium">{med.drug_name}</span>
                                    <div className="flex items-center gap-2 text-[10px] text-dim">
                                      {med.dose && <span>{med.dose}</span>}
                                      {med.frequency && <span>· {med.frequency}</span>}
                                      {med.status && (
                                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                                          med.status === "active" ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20" : ""
                                        }`}>{med.status}</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </DataSection>
                          )}

                          {activePatient.labs.length > 0 && (
                            <DataSection title={`Lab Results (${activePatient.labs.length})`}>
                              <div className="space-y-1">
                                {activePatient.labs.map((lab, i) => (
                                  <div
                                    key={i}
                                    className={`flex items-center justify-between rounded-md px-2.5 py-1.5 transition-colors cursor-default ${
                                      hoveredTerm && lab.test_name.toLowerCase().includes(hoveredTerm.toLowerCase())
                                        ? "bg-indigo-500/15 ring-1 ring-indigo-500/30" : "bg-surface-1"
                                    }`}
                                    onMouseEnter={() => setHoveredTerm(lab.test_name)}
                                    onMouseLeave={() => setHoveredTerm(null)}
                                  >
                                    <span className="text-xs text-body">{lab.test_name}</span>
                                    <div className="flex items-center gap-2 text-[10px]">
                                      <span className={`font-medium tabular-nums ${lab.abnormal ? "text-amber-400" : "text-body"}`}>
                                        {lab.value}{lab.unit ? ` ${lab.unit}` : ""}
                                      </span>
                                      {lab.result_date && <span className="text-faint">{lab.result_date}</span>}
                                      {lab.abnormal && <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-400">ABN</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </DataSection>
                          )}

                          {activePatient.vitals.length > 0 && (
                            <DataSection title={`Vitals (${activePatient.vitals.length})`}>
                              <div className="flex flex-wrap gap-2">
                                {activePatient.vitals.map((v, i) => (
                                  <div
                                    key={i}
                                    className={`rounded-md px-2.5 py-1.5 transition-colors cursor-default ${
                                      hoveredTerm && v.measurement_type.toLowerCase().includes(hoveredTerm.toLowerCase())
                                        ? "bg-purple-500/15 ring-1 ring-purple-500/30" : "bg-surface-1"
                                    }`}
                                    onMouseEnter={() => setHoveredTerm(v.measurement_type)}
                                    onMouseLeave={() => setHoveredTerm(null)}
                                  >
                                    <span className="text-[10px] text-dim">{v.measurement_type}</span>
                                    <span className="ml-1.5 text-xs font-medium text-body tabular-nums">{v.value} {v.unit}</span>
                                  </div>
                                ))}
                              </div>
                            </DataSection>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* RIGHT: Source document */}
                  {showSource && (
                    <div className="rounded-xl border border-edge-2 bg-card overflow-hidden flex flex-col">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge-2 bg-surface-1/50">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-dim" />
                          <span className="text-[11px] font-semibold text-heading">Source Document</span>
                        </div>
                        <span className="text-[10px] text-faint">Hover fields to highlight source</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <HighlightedSource
                          text={activeDoc.sourceText}
                          terms={highlightTerms}
                          hoveredTerm={hoveredTerm}
                          patient={activePatient}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Queue navigation */}
                <div className="flex items-center justify-between pt-2 border-t border-edge-2">
                  <button
                    onClick={() => { const prev = activeDocIdx - 1; if (prev >= 0) { setActiveDocIdx(prev); setEditingPatientIdx(0); } }}
                    disabled={activeDocIdx === 0}
                    className="flex items-center gap-1.5 rounded-lg border border-edge-2 bg-surface-2 px-3 py-1.5 text-xs font-medium text-body hover:bg-surface-3 disabled:opacity-30 transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3" /> Previous
                  </button>
                  <span className="text-[11px] text-dim">
                    Document {activeDocIdx + 1} of {totalDocs}
                  </span>
                  <button
                    onClick={() => { const next = activeDocIdx + 1; const nextDoc = documents[next]; if (next < totalDocs && nextDoc) { setActiveDocIdx(next); setEditingPatientIdx(0); if (!nextDoc.extractedData && !nextDoc.extracting) processDocument(nextDoc, next); } }}
                    disabled={activeDocIdx === totalDocs - 1}
                    className="flex items-center gap-1.5 rounded-lg border border-edge-2 bg-surface-2 px-3 py-1.5 text-xs font-medium text-body hover:bg-surface-3 disabled:opacity-30 transition-colors"
                  >
                    Next <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlighted Source Document
// ---------------------------------------------------------------------------

function HighlightedSource({
  text,
  terms,
  hoveredTerm,
  patient,
}: {
  text: string;
  terms: string[];
  hoveredTerm: string | null;
  patient: ExtractedPatient | null;
}) {
  const rendered = useMemo(() => {
    if (!patient || terms.length === 0) {
      return <span className="text-body">{text}</span>;
    }

    const sortedTerms = [...terms].sort((a, b) => b.length - a.length);
    const escaped = sortedTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
    const parts = text.split(pattern);

    return parts.map((part, i) => {
      const matchedTerm = sortedTerms.find((t) => t.toLowerCase() === part.toLowerCase());
      if (!matchedTerm) return <span key={i}>{part}</span>;

      const category = getTermCategory(matchedTerm, patient);
      const colors = CATEGORY_COLORS[category];
      const isHovered = hoveredTerm && (
        matchedTerm.toLowerCase().includes(hoveredTerm.toLowerCase()) ||
        hoveredTerm.toLowerCase().includes(matchedTerm.toLowerCase())
      );

      return (
        <span
          key={i}
          className={`inline rounded px-0.5 py-px transition-all duration-150 ${colors.bg} ${colors.text} font-medium ${
            isHovered ? `ring-2 ${colors.border} ring-offset-1 ring-offset-card brightness-125` : ""
          }`}
        >
          {part}
          <Sparkles className="inline h-2.5 w-2.5 ml-0.5 opacity-40" />
        </span>
      );
    });
  }, [text, terms, hoveredTerm, patient]);

  return (
    <pre className="whitespace-pre-wrap text-[12px] leading-relaxed font-mono text-dim">
      {rendered}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function DataSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon && <span className="text-dim">{icon}</span>}
        <span className="text-[11px] font-semibold text-heading uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  );
}

function EditableDataField({
  label,
  value,
  field,
  category,
  hoveredTerm,
  onHover,
  editingField,
  setEditingField,
  onSave,
}: {
  label: string;
  value?: string | null;
  field: string;
  category?: HighlightCategory;
  hoveredTerm?: string | null;
  onHover?: (term: string | null) => void;
  editingField: string | null;
  setEditingField: (field: string | null) => void;
  onSave: (field: string, value: string) => void;
}) {
  const [editValue, setEditValue] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = editingField === field;
  const isHighlighted = category && hoveredTerm && value && value.toLowerCase().includes(hoveredTerm.toLowerCase());
  const colors = category ? CATEGORY_COLORS[category] : null;

  useEffect(() => {
    if (isEditing) {
      setEditValue(value ?? "");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isEditing, value]);

  if (isEditing) {
    return (
      <div className="rounded-md px-2.5 py-1.5 bg-surface-1 ring-1 ring-purple-500/30">
        <p className="text-[10px] text-faint">{label}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(field, editValue);
              if (e.key === "Escape") setEditingField(null);
            }}
            className="flex-1 bg-transparent text-xs font-medium text-body outline-none"
          />
          <button onClick={() => onSave(field, editValue)} className="rounded p-0.5 text-emerald-400 hover:bg-emerald-500/15 transition-colors">
            <Save className="h-3 w-3" />
          </button>
          <button onClick={() => setEditingField(null)} className="rounded p-0.5 text-dim hover:bg-surface-3 transition-colors">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group rounded-md px-2.5 py-1.5 transition-colors cursor-pointer ${
        isHighlighted && colors ? `${colors.bg} ring-1 ${colors.border}` : "bg-surface-1 hover:bg-surface-2"
      }`}
      onMouseEnter={() => value && onHover?.(value)}
      onMouseLeave={() => onHover?.(null)}
      onClick={() => setEditingField(field)}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-faint">{label}</p>
        <Pencil className="h-2.5 w-2.5 text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className={`text-xs font-medium mt-0.5 ${value ? "text-body" : "text-faint"}`}>{value || "—"}</p>
    </div>
  );
}
