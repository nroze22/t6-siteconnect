import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertTriangle,
  Wand2,
  FileCheck,
} from "lucide-react";
import { isTauri } from "@/lib/tauri";
import { useToast } from "@/components/ui/Toast";

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

interface CaseAbstractionWorkspaceProps {
  caseId: string;
  onBack: () => void;
}

interface CaseField {
  label: string;
  key: string;
  value: string;
  source: "auto" | "manual" | "llm" | "empty";
  required: boolean;
}

interface ValidationErr {
  rule_code: string;
  rule_name: string;
  level: string;
  message: string;
  fields: string[];
}

export function CaseAbstractionWorkspace({ caseId, onBack }: CaseAbstractionWorkspaceProps) {
  const [fields, setFields] = useState<CaseField[]>([]);
  const [errors, setErrors] = useState<ValidationErr[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autopopulating, setAutopopulating] = useState(false);
  const [validating, setValidating] = useState(false);
  const toast = useToast();

  const loadCase = useCallback(async () => {
    if (!isTauri) return;
    setLoading(true);
    try {
      const cases = await tauriInvoke<Array<{
        id: string; primary_site_icdo3: string | null; histology_icdo3: string | null;
        behavior_code: string | null; grade: string | null; date_of_diagnosis: string | null;
        clinical_stage_group: string | null; pathologic_stage_group: string | null;
        treatment_surgery: string; treatment_chemo: string; treatment_immuno: string;
        treatment_hormone: string; completeness_score: number; abstract_status: string;
      }>>("get_reportable_cases", { filters: { status_filter: "all", search: null, limit: 200 } });

      const c = cases.find((r) => r.id === caseId);
      if (!c) return;

      setFields([
        { label: "Primary Site (ICD-O-3)", key: "primary_site_icdo3", value: c.primary_site_icdo3 ?? "", source: c.primary_site_icdo3 ? "auto" : "empty", required: true },
        { label: "Histology (ICD-O-3)", key: "histology_icdo3", value: c.histology_icdo3 ?? "", source: c.histology_icdo3 ? "auto" : "empty", required: true },
        { label: "Behavior Code", key: "behavior_code", value: c.behavior_code ?? "", source: c.behavior_code ? "auto" : "empty", required: true },
        { label: "Grade", key: "grade", value: c.grade ?? "", source: c.grade ? "auto" : "empty", required: false },
        { label: "Date of Diagnosis", key: "date_of_diagnosis", value: c.date_of_diagnosis ?? "", source: c.date_of_diagnosis ? "auto" : "empty", required: true },
        { label: "Clinical Stage Group", key: "clinical_stage_group", value: c.clinical_stage_group ?? "", source: c.clinical_stage_group ? "auto" : "empty", required: false },
        { label: "Pathologic Stage Group", key: "pathologic_stage_group", value: c.pathologic_stage_group ?? "", source: c.pathologic_stage_group ? "auto" : "empty", required: false },
        { label: "Treatment: Surgery", key: "treatment_surgery", value: c.treatment_surgery, source: c.treatment_surgery !== "00" ? "auto" : "empty", required: false },
        { label: "Treatment: Chemo", key: "treatment_chemo", value: c.treatment_chemo, source: c.treatment_chemo !== "00" ? "auto" : "empty", required: false },
        { label: "Treatment: Immuno", key: "treatment_immuno", value: c.treatment_immuno, source: c.treatment_immuno !== "00" ? "auto" : "empty", required: false },
        { label: "Treatment: Hormone", key: "treatment_hormone", value: c.treatment_hormone, source: c.treatment_hormone !== "00" ? "auto" : "empty", required: false },
      ]);
    } catch (err) {
      console.error("[naaccr] Failed to load case:", err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { loadCase(); }, [loadCase]);

  const handleFieldChange = (key: string, value: string) => {
    setFields((prev) =>
      prev.map((f) => f.key === key ? { ...f, value, source: "manual" } : f)
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateFields: Record<string, string | null> = { case_id: caseId };
      for (const f of fields) {
        if (f.source === "manual" || f.value) {
          updateFields[f.key] = f.value || null;
        }
      }
      if (isTauri) {
        await tauriInvoke("update_reportable_case", { fields: updateFields });
      }
      toast.success("Case saved", "NAACCR fields updated");
    } catch (err) {
      toast.error("Save failed", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAutopopulate = async () => {
    setAutopopulating(true);
    try {
      if (isTauri) {
        const result = await tauriInvoke<{ fields_populated: number; completeness_score: number }>(
          "autopopulate_case", { caseId }
        );
        toast.success(
          `${result.fields_populated} fields populated`,
          `Completeness: ${Math.round(result.completeness_score * 100)}%`
        );
        loadCase();
      }
    } catch (err) {
      toast.error("Auto-populate failed", err instanceof Error ? err.message : String(err));
    } finally {
      setAutopopulating(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      if (isTauri) {
        const result = await tauriInvoke<ValidationErr[]>("validate_case", { caseId });
        setErrors(result);
        const errorCount = result.filter((e) => e.level === "error").length;
        const warnCount = result.filter((e) => e.level === "warning").length;
        if (errorCount === 0 && warnCount === 0) {
          toast.success("Validation passed", "No errors or warnings");
        } else {
          toast.warning(
            `${errorCount} error${errorCount !== 1 ? "s" : ""}, ${warnCount} warning${warnCount !== 1 ? "s" : ""}`,
            "Review issues below"
          );
        }
      }
    } catch (err) {
      toast.error("Validation failed", err instanceof Error ? err.message : String(err));
    } finally {
      setValidating(false);
    }
  };

  const filledCount = fields.filter((f) => f.value && f.value !== "00").length;
  const totalCount = fields.length;

  const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
    auto: { label: "Auto", color: "bg-blue-500/20 text-blue-300" },
    manual: { label: "Manual", color: "bg-amber-500/20 text-amber-300" },
    llm: { label: "LLM", color: "bg-purple-500/20 text-purple-300" },
    empty: { label: "Empty", color: "bg-zinc-500/20 text-zinc-500" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading case...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/50">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-200 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h3 className="text-[12px] font-bold text-zinc-100">Case Abstraction</h3>
          <p className="text-[10px] text-zinc-500">
            {filledCount}/{totalCount} fields &middot; Case {caseId.substring(0, 8)}
          </p>
        </div>
        <button
          onClick={handleAutopopulate}
          disabled={autopopulating}
          className="flex items-center gap-1 rounded-lg border border-zinc-700/50 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          {autopopulating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
          Auto-Fill
        </button>
        <button
          onClick={handleValidate}
          disabled={validating}
          className="flex items-center gap-1 rounded-lg border border-zinc-700/50 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
          Validate
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
            <p className="text-[11px] font-semibold text-amber-300 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {errors.length} validation issue{errors.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-col gap-1">
              {errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span className={`font-mono ${e.level === "error" ? "text-red-400" : e.level === "warning" ? "text-amber-400" : "text-blue-400"}`}>
                    [{e.rule_code}]
                  </span>
                  <span className="text-zinc-300">{e.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Field grid */}
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => {
            const badge = SOURCE_BADGE[f.source] ?? SOURCE_BADGE.empty;
            const hasError = errors.some((e) => e.fields.includes(f.key));

            return (
              <div
                key={f.key}
                className={`rounded-lg border p-3 ${
                  hasError ? "border-red-500/40 bg-red-500/[0.04]" :
                  f.source === "empty" && f.required ? "border-amber-500/30 bg-amber-500/[0.03]" :
                  "border-zinc-800 bg-zinc-900/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-medium text-zinc-400">
                    {f.label}
                    {f.required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${badge?.color}`}>
                    {badge?.label}
                  </span>
                </div>
                <input
                  type="text"
                  value={f.value}
                  onChange={(e) => handleFieldChange(f.key, e.target.value)}
                  placeholder={f.required ? "Required" : "Optional"}
                  className="w-full rounded border border-zinc-700/50 bg-zinc-800/50 px-2.5 py-1.5 text-[12px] text-zinc-200 font-mono placeholder:text-zinc-600 focus:border-orange-500/30 focus:outline-none focus:ring-1 focus:ring-orange-500/20"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
