import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Upload,
  FileText,
  Sparkles,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ClipboardPaste,
  FilePlus2,
  Zap,
} from "lucide-react";
import {
  extractTextFromFile,
  detectDocumentFormat,
  type ExtractedDocument,
} from "@/lib/document-extract";
import {
  parseProtocolText,
  createCustomStudy,
  inferStructuredRules,
  type ParsedProtocol,
  type CreateCustomStudyInput,
  type InferredRule,
} from "@/lib/tauri";

interface CreateStudyModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (studyId: string) => void;
}

type Stage = "input" | "parsing" | "review";

type InputMethod = "file" | "paste" | "blank";

/** A criterion + the structured rule (if any) the LLM inferred for it. */
interface CriterionItem {
  text: string;
  rule: InferredRule | null;
}

interface FormState {
  title: string;
  shortTitle: string;
  nctNumber: string;
  sponsor: string;
  phase: string;
  therapeuticArea: string;
  indication: string;
  summary: string;
  perPatientDollars: string;
  siteStartupDollars: string;
  inclusion: CriterionItem[];
  exclusion: CriterionItem[];
}

const EMPTY_FORM: FormState = {
  title: "",
  shortTitle: "",
  nctNumber: "",
  sponsor: "",
  phase: "",
  therapeuticArea: "",
  indication: "",
  summary: "",
  perPatientDollars: "",
  siteStartupDollars: "",
  inclusion: [],
  exclusion: [],
};

const PHASE_OPTIONS = [
  "Phase 1",
  "Phase 1/2",
  "Phase 2",
  "Phase 2/3",
  "Phase 3",
  "Phase 4",
];

function parsedToForm(parsed: ParsedProtocol): FormState {
  return {
    title: parsed.title ?? "",
    shortTitle: parsed.short_title ?? "",
    nctNumber: parsed.nct_number ?? "",
    sponsor: parsed.sponsor ?? "",
    phase: parsed.phase ?? "",
    therapeuticArea: parsed.therapeutic_area ?? "",
    indication: parsed.indication ?? "",
    summary: parsed.summary ?? "",
    perPatientDollars: "",
    siteStartupDollars: "",
    inclusion: parsed.inclusion_criteria.map((text) => ({ text, rule: null })),
    exclusion: parsed.exclusion_criteria.map((text) => ({ text, rule: null })),
  };
}

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100);
}

export function CreateStudyModal({ open, onClose, onCreated }: CreateStudyModalProps) {
  const [stage, setStage] = useState<Stage>("input");
  const [inputMethod, setInputMethod] = useState<InputMethod | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [extracted, setExtracted] = useState<ExtractedDocument | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [parsingStep, setParsingStep] = useState<string>("");
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetAndClose = useCallback(() => {
    setStage("input");
    setInputMethod(null);
    setPastedText("");
    setExtracted(null);
    setForm(EMPTY_FORM);
    setParsingStep("");
    setParseWarnings([]);
    setError(null);
    setSaving(false);
    onClose();
  }, [onClose]);

  const runParse = useCallback(
    async (sourceText: string, sourceWarnings: string[]) => {
      setStage("parsing");
      setError(null);
      setParseWarnings(sourceWarnings);

      try {
        setParsingStep("Reading protocol…");
        await new Promise((r) => setTimeout(r, 120));
        setParsingStep("Asking the local AI to extract study details…");
        const parsed = await parseProtocolText(sourceText);
        setParsingStep("Organizing inclusion and exclusion criteria…");
        await new Promise((r) => setTimeout(r, 120));

        // Seed the form so the user sees criteria immediately, even if
        // rule inference is still running.
        const seeded = parsedToForm(parsed);
        setForm(seeded);
        setParseWarnings([...sourceWarnings, ...parsed.warnings]);
        setStage("review");

        // Rule inference is best-effort and runs after the form is shown.
        // Failures are non-fatal — criteria simply stay as `llm_required`.
        const allCriteria = [
          ...parsed.inclusion_criteria,
          ...parsed.exclusion_criteria,
        ];
        if (allCriteria.length === 0) return;

        setParsingStep("Inferring deterministic rules where possible…");
        try {
          const rules = await inferStructuredRules(allCriteria);
          const incCount = parsed.inclusion_criteria.length;
          const incRules = rules.slice(0, incCount);
          const excRules = rules.slice(incCount);
          setForm((f) => ({
            ...f,
            inclusion: f.inclusion.map((c, i) => ({
              ...c,
              rule: incRules[i] ?? null,
            })),
            exclusion: f.exclusion.map((c, i) => ({
              ...c,
              rule: excRules[i] ?? null,
            })),
          }));
        } catch (ruleErr) {
          // Inference failed — keep the criteria as plain text.
          setParseWarnings((w) => [
            ...w,
            `Rule inference skipped: ${ruleErr instanceof Error ? ruleErr.message : String(ruleErr)}`,
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStage("input");
      }
    },
    [],
  );

  const handleFileSelected = useCallback(
    async (file: File) => {
      const format = detectDocumentFormat(file.name);
      if (!format) {
        setError(`Unsupported file type: ${file.name}. Use PDF, DOCX, or TXT.`);
        return;
      }
      setError(null);
      setInputMethod("file");
      setStage("parsing");
      setParsingStep(`Extracting text from ${file.name}…`);

      try {
        const doc = await extractTextFromFile(file);
        setExtracted(doc);
        if (!doc.text.trim()) {
          throw new Error("Could not extract any text from this document.");
        }
        await runParse(doc.text, doc.warnings);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStage("input");
      }
    },
    [runParse],
  );

  const handlePasteSubmit = useCallback(() => {
    if (!pastedText.trim()) {
      setError("Paste some protocol text first.");
      return;
    }
    setInputMethod("paste");
    void runParse(pastedText, []);
  }, [pastedText, runParse]);

  const handleStartBlank = useCallback(() => {
    setInputMethod("blank");
    setForm(EMPTY_FORM);
    setStage("review");
  }, []);

  const handleSave = useCallback(async () => {
    setError(null);
    if (!form.title.trim()) {
      setError("Study title is required.");
      return;
    }
    if (!form.sponsor.trim()) {
      setError("Sponsor is required.");
      return;
    }

    // Drop empty rows and keep criteria + their inferred rules in lockstep.
    const incActive = form.inclusion.filter((c) => c.text.trim());
    const excActive = form.exclusion.filter((c) => c.text.trim());

    const input: CreateCustomStudyInput = {
      title: form.title.trim(),
      short_title: form.shortTitle.trim() || null,
      nct_number: form.nctNumber.trim() || null,
      sponsor: form.sponsor.trim(),
      phase: form.phase || null,
      status: "recruiting",
      therapeutic_area: form.therapeuticArea.trim() || null,
      indication: form.indication.trim() || null,
      summary: form.summary.trim() || null,
      estimated_per_patient_value_cents: dollarsToCents(form.perPatientDollars),
      estimated_site_startup_cents: dollarsToCents(form.siteStartupDollars),
      payment_model: null,
      inclusion_criteria: incActive.map((c) => c.text.trim()),
      exclusion_criteria: excActive.map((c) => c.text.trim()),
      inclusion_structured_rules: incActive.map((c) => c.rule?.rule_json ?? null),
      exclusion_structured_rules: excActive.map((c) => c.rule?.rule_json ?? null),
    };

    setSaving(true);
    try {
      const result = await createCustomStudy(input);
      onCreated(result.study_id);
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }, [form, onCreated, resetAndClose]);

  // --- Criterion list helpers ---

  const updateCriterion = (
    kind: "inclusion" | "exclusion",
    index: number,
    value: string,
  ) => {
    setForm((f) => {
      const list = [...f[kind]];
      const existing = list[index];
      if (!existing) return f;
      // If the user edits the text, the previously-inferred rule no
      // longer matches what they typed — drop it so we don't store
      // a deterministic rule that contradicts the criterion.
      const ruleStillValid = existing.text.trim() === value.trim();
      list[index] = {
        text: value,
        rule: ruleStillValid ? existing.rule : null,
      };
      return { ...f, [kind]: list };
    });
  };

  const removeCriterion = (kind: "inclusion" | "exclusion", index: number) => {
    setForm((f) => {
      const list = f[kind].filter((_, i) => i !== index);
      return { ...f, [kind]: list };
    });
  };

  const addCriterion = (kind: "inclusion" | "exclusion") => {
    setForm((f) => ({ ...f, [kind]: [...f[kind], { text: "", rule: null }] }));
  };

  const clearRule = (kind: "inclusion" | "exclusion", index: number) => {
    setForm((f) => {
      const list = [...f[kind]];
      const existing = list[index];
      if (!existing) return f;
      list[index] = { ...existing, rule: null };
      return { ...f, [kind]: list };
    });
  };

  // --- Rendering ---

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9994] bg-black/70 backdrop-blur-sm"
        onClick={resetAndClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="fixed left-1/2 top-1/2 z-[9995] flex h-[min(88vh,900px)] w-[min(94vw,920px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-edge-2 bg-surface-1 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-edge-2 px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-400/25">
              <Sparkles className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-heading">Create custom study</h2>
              <p className="mt-0.5 text-[11px] text-dim">
                {stage === "input" && "Upload a protocol, paste text, or start from scratch."}
                {stage === "parsing" && "Local AI is extracting study details — nothing leaves your device."}
                {stage === "review" && "Review what was extracted and save when it looks right."}
              </p>
            </div>
          </div>
          <button
            onClick={resetAndClose}
            className="rounded-md p-1.5 text-dim transition-colors hover:bg-surface-3 hover:text-body"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stage content */}
        <div className="flex-1 overflow-y-auto">
          {stage === "input" && (
            <InputStage
              fileInputRef={fileInputRef}
              onFileSelected={handleFileSelected}
              pastedText={pastedText}
              setPastedText={setPastedText}
              onPasteSubmit={handlePasteSubmit}
              onStartBlank={handleStartBlank}
              error={error}
              setError={setError}
            />
          )}
          {stage === "parsing" && (
            <ParsingStage step={parsingStep} extracted={extracted} />
          )}
          {stage === "review" && (
            <ReviewStage
              form={form}
              setForm={setForm}
              inputMethod={inputMethod}
              warnings={parseWarnings}
              updateCriterion={updateCriterion}
              removeCriterion={removeCriterion}
              addCriterion={addCriterion}
              clearRule={clearRule}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-edge-2 bg-surface-1 px-6 py-4">
          <div className="flex items-center gap-2 text-[11px] text-dim">
            {error && stage !== "input" && (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                <span className="text-rose-400">{error}</span>
              </>
            )}
            {!error && stage === "review" && (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  {form.inclusion.filter((c) => c.text.trim()).length} inclusion · {form.exclusion.filter((c) => c.text.trim()).length} exclusion
                  {(() => {
                    const ruleCount =
                      form.inclusion.filter((c) => c.text.trim() && c.rule?.rule_json).length +
                      form.exclusion.filter((c) => c.text.trim() && c.rule?.rule_json).length;
                    return ruleCount > 0 ? ` · ${ruleCount} auto-rule${ruleCount === 1 ? "" : "s"}` : "";
                  })()}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {stage === "review" && (
              <button
                onClick={() => {
                  setStage("input");
                  setInputMethod(null);
                }}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body disabled:opacity-40"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
            {stage === "review" ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-1.5 text-[12px] font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400 disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    Save study
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={resetAndClose}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// --- Stage components ---

interface InputStageProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelected: (file: File) => void;
  pastedText: string;
  setPastedText: (v: string) => void;
  onPasteSubmit: () => void;
  onStartBlank: () => void;
  error: string | null;
  setError: (v: string | null) => void;
}

function InputStage({
  fileInputRef,
  onFileSelected,
  pastedText,
  setPastedText,
  onPasteSubmit,
  onStartBlank,
  error,
  setError,
}: InputStageProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  };

  return (
    <div className="px-6 py-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all ${
          dragging
            ? "border-indigo-400 bg-indigo-500/[0.06]"
            : "border-edge-3 bg-surface-2 hover:border-indigo-400/50 hover:bg-indigo-500/[0.03]"
        }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-400/20">
          <Upload className="h-5 w-5 text-indigo-400" />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-heading">
            Drop a protocol document here
          </div>
          <div className="mt-1 text-[11px] text-dim">
            PDF, DOCX, or TXT · the local AI will extract study details automatically
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelected(file);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
          <span>{error}</span>
        </div>
      )}

      {/* Divider */}
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-edge-2" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
          or
        </span>
        <div className="h-px flex-1 bg-edge-2" />
      </div>

      {/* Paste zone */}
      <div className="rounded-xl border border-edge-2 bg-surface-2 p-4">
        <div className="mb-2 flex items-center gap-2">
          <ClipboardPaste className="h-3.5 w-3.5 text-dim" />
          <span className="text-[12px] font-semibold text-heading">Paste protocol text</span>
        </div>
        <textarea
          value={pastedText}
          onChange={(e) => {
            setPastedText(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Paste the relevant sections of your protocol (eligibility criteria, study overview, etc.)…"
          className="h-28 w-full resize-none rounded-lg border border-edge-3 bg-surface-1 px-3 py-2 text-[12px] text-body placeholder:text-dim/50 focus:border-indigo-400/40 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
        />
        <div className="mt-2 flex items-center justify-end">
          <button
            onClick={onPasteSubmit}
            disabled={!pastedText.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-3 w-3" />
            Parse with AI
          </button>
        </div>
      </div>

      {/* Start blank */}
      <button
        onClick={onStartBlank}
        className="mt-4 flex w-full items-center gap-3 rounded-xl border border-edge-2 bg-surface-2 px-4 py-3 text-left transition-colors hover:border-edge-4 hover:bg-surface-3"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 text-dim ring-1 ring-edge-3">
          <FilePlus2 className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-[12px] font-semibold text-heading">Start from scratch</div>
          <div className="text-[11px] text-dim">Fill in study details manually.</div>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-dim/60" />
      </button>
    </div>
  );
}

function ParsingStage({
  step,
  extracted,
}: {
  step: string;
  extracted: ExtractedDocument | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="relative">
        <div className="absolute inset-0 animate-pulse rounded-full bg-indigo-500/20 blur-2xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-lg shadow-indigo-500/30">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
      </div>
      <div className="text-center">
        <h3 className="text-[14px] font-semibold text-heading">Parsing protocol</h3>
        <p className="mt-1 text-[12px] text-dim">{step || "Working…"}</p>
      </div>
      {extracted && (
        <div className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-[10px] text-dim ring-1 ring-edge-2">
          <FileText className="h-3 w-3" />
          <span>
            {extracted.format.toUpperCase()} · {extracted.text.length.toLocaleString()} chars
            {extracted.pageCount ? ` · ${extracted.pageCount} pages` : ""}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 text-[10px] text-dim/60">
        <Loader2 className="h-3 w-3 animate-spin" />
        All processing happens locally on this device
      </div>
    </div>
  );
}

interface ReviewStageProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  inputMethod: InputMethod | null;
  warnings: string[];
  updateCriterion: (kind: "inclusion" | "exclusion", i: number, v: string) => void;
  removeCriterion: (kind: "inclusion" | "exclusion", i: number) => void;
  addCriterion: (kind: "inclusion" | "exclusion") => void;
  clearRule: (kind: "inclusion" | "exclusion", i: number) => void;
}

function ReviewStage({
  form,
  setForm,
  inputMethod,
  warnings,
  updateCriterion,
  removeCriterion,
  addCriterion,
  clearRule,
}: ReviewStageProps) {
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-5 px-6 py-5">
      {inputMethod && inputMethod !== "blank" && (
        <div className="flex items-center gap-2 rounded-lg border border-indigo-400/25 bg-indigo-500/[0.06] px-3 py-2 text-[11px] text-indigo-300">
          <Sparkles className="h-3.5 w-3.5 flex-none" />
          Auto-filled by the local AI. Review every field — you're in control.
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-400/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-300">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3 w-3" />
            Parser notes
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Identity section */}
      <Section title="Study identity">
        <Field label="Study title" required>
          <input
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
            placeholder="e.g., Pembrolizumab + Chemo in Advanced NSCLC"
            className={inputCls}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Short title">
            <input
              value={form.shortTitle}
              onChange={(e) => setField("shortTitle", e.target.value)}
              placeholder="KEYNOTE-789"
              className={inputCls}
            />
          </Field>
          <Field label="NCT number">
            <input
              value={form.nctNumber}
              onChange={(e) => setField("nctNumber", e.target.value)}
              placeholder="NCT0000000"
              className={inputCls}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sponsor" required>
            <input
              value={form.sponsor}
              onChange={(e) => setField("sponsor", e.target.value)}
              placeholder="Merck Sharp & Dohme"
              className={inputCls}
            />
          </Field>
          <Field label="Phase">
            <select
              value={form.phase}
              onChange={(e) => setField("phase", e.target.value)}
              className={inputCls}
            >
              <option value="">Select phase…</option>
              {PHASE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* Clinical focus */}
      <Section title="Clinical focus">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Therapeutic area">
            <input
              value={form.therapeuticArea}
              onChange={(e) => setField("therapeuticArea", e.target.value)}
              placeholder="Oncology"
              className={inputCls}
            />
          </Field>
          <Field label="Indication">
            <input
              value={form.indication}
              onChange={(e) => setField("indication", e.target.value)}
              placeholder="Non-Small Cell Lung Cancer"
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Summary">
          <textarea
            value={form.summary}
            onChange={(e) => setField("summary", e.target.value)}
            placeholder="1–3 sentence overview of the study objective and intervention…"
            className={`${inputCls} h-20 resize-none`}
          />
        </Field>
      </Section>

      {/* Financials */}
      <Section title="Financials (optional)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Per-patient value ($)">
            <input
              inputMode="decimal"
              value={form.perPatientDollars}
              onChange={(e) => setField("perPatientDollars", e.target.value)}
              placeholder="42000"
              className={inputCls}
            />
          </Field>
          <Field label="Site startup ($)">
            <input
              inputMode="decimal"
              value={form.siteStartupDollars}
              onChange={(e) => setField("siteStartupDollars", e.target.value)}
              placeholder="35000"
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* Criteria */}
      <CriterionList
        kind="inclusion"
        label="Inclusion criteria"
        items={form.inclusion}
        onChange={updateCriterion}
        onRemove={removeCriterion}
        onAdd={addCriterion}
        onClearRule={clearRule}
      />
      <CriterionList
        kind="exclusion"
        label="Exclusion criteria"
        items={form.exclusion}
        onChange={updateCriterion}
        onRemove={removeCriterion}
        onAdd={addCriterion}
        onClearRule={clearRule}
      />
    </div>
  );
}

// --- Small primitives ---

const inputCls =
  "w-full rounded-lg border border-edge-3 bg-surface-1 px-3 py-2 text-[12px] text-body placeholder:text-dim/50 focus:border-indigo-400/40 focus:outline-none focus:ring-1 focus:ring-indigo-400/30";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-dim">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-dim">
        {label}
        {required && <span className="text-rose-400">*</span>}
      </span>
      {children}
    </label>
  );
}

function CriterionList({
  kind,
  label,
  items,
  onChange,
  onRemove,
  onAdd,
  onClearRule,
}: {
  kind: "inclusion" | "exclusion";
  label: string;
  items: CriterionItem[];
  onChange: (kind: "inclusion" | "exclusion", i: number, v: string) => void;
  onRemove: (kind: "inclusion" | "exclusion", i: number) => void;
  onAdd: (kind: "inclusion" | "exclusion") => void;
  onClearRule: (kind: "inclusion" | "exclusion", i: number) => void;
}) {
  const accent = kind === "inclusion" ? "text-emerald-400" : "text-rose-400";
  const filledCount = items.filter((c) => c.text.trim()).length;
  const ruleCount = items.filter((c) => c.text.trim() && c.rule?.rule_json).length;

  return (
    <div className="rounded-xl border border-edge-2 bg-surface-2 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold uppercase tracking-widest ${accent}`}>
            {label}
          </span>
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-semibold text-dim ring-1 ring-edge-3">
            {filledCount}
          </span>
          {ruleCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-400/25">
              <Zap className="h-2.5 w-2.5" />
              {ruleCount} auto-rule{ruleCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <button
          onClick={() => onAdd(kind)}
          className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-1 text-[10px] font-semibold text-dim ring-1 ring-edge-3 transition-colors hover:text-body"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-[11px] italic text-dim/60">
            No criteria yet. Click "Add" to create one.
          </p>
        )}
        {items.map((item, i) => {
          const hasRule = !!item.rule?.rule_json;
          const summary = item.rule?.summary;
          return (
            <div key={i} className="group flex items-start gap-2">
              <span className="mt-2 flex h-5 w-5 flex-none items-center justify-center rounded-md bg-surface-3 text-[10px] font-bold text-dim ring-1 ring-edge-3">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <textarea
                  value={item.text}
                  onChange={(e) => onChange(kind, i, e.target.value)}
                  rows={Math.max(1, Math.ceil(item.text.length / 70))}
                  className={`${inputCls} min-h-[34px] resize-none`}
                />
                {hasRule && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <RuleBadge summary={summary ?? "Auto-rule"} />
                    <button
                      onClick={() => onClearRule(kind, i)}
                      className="text-[10px] text-dim/60 underline-offset-2 transition-colors hover:text-dim hover:underline"
                      title="Use AI screening for this criterion instead"
                    >
                      use AI instead
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => onRemove(kind, i)}
                className="mt-1.5 rounded-md p-1 text-dim/50 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                aria-label="Remove criterion"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RuleBadge({ summary }: { summary: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-400/25"
      title="Will be evaluated deterministically — no LLM call needed at screening time"
    >
      <Zap className="h-2.5 w-2.5" />
      {summary}
    </span>
  );
}
