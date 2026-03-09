import { useState, useCallback } from "react";
import {
  ArrowRight,
  Sparkles,
  Pencil,
  Check,
  ChevronDown,
} from "lucide-react";
import type { ColumnMapping } from "@/types";

const TARGET_FIELDS = [
  { value: "", label: "-- Skip Column --" },
  { value: "patient_id", label: "Subject ID" },
  { value: "date_of_birth", label: "Date of Birth" },
  { value: "gender", label: "Gender" },
  { value: "race", label: "Race" },
  { value: "ethnicity", label: "Ethnicity" },
  { value: "insurance_type", label: "Insurance Type" },
  { value: "diagnosis_icd10", label: "Diagnosis ICD-10" },
  { value: "diagnosis_desc", label: "Diagnosis Description" },
  { value: "diagnosis_date", label: "Diagnosis Date" },
  { value: "medication_name", label: "Medication Name" },
  { value: "medication_dose", label: "Medication Dose" },
  { value: "medication_start", label: "Medication Start Date" },
  { value: "lab_test", label: "Lab Test Name" },
  { value: "lab_value", label: "Lab Value" },
  { value: "lab_unit", label: "Lab Unit" },
  { value: "lab_date", label: "Lab Result Date" },
  { value: "lab_ref_range", label: "Lab Reference Range" },
  { value: "vital_type", label: "Vital Sign Type" },
  { value: "vital_value", label: "Vital Sign Value" },
  { value: "note_text", label: "Clinical Note Text" },
] as const;

interface ColumnMapperProps {
  mappings: ColumnMapping[];
  sampleData: Record<string, string[]>;
  onMappingChange: (index: number, targetField: string) => void;
}

function ConfidenceBadge({ confidence, isManual }: { confidence: number; isManual: boolean }) {
  if (isManual) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[12px] font-semibold text-blue-400 ring-1 ring-blue-500/20">
        <Pencil className="h-2.5 w-2.5" />
        Manual
      </span>
    );
  }
  if (confidence >= 0.9) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[12px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
        <Sparkles className="h-2.5 w-2.5" />
        {Math.round(confidence * 100)}%
      </span>
    );
  }
  if (confidence >= 0.7) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[12px] font-semibold text-amber-400 ring-1 ring-amber-500/20">
        <Sparkles className="h-2.5 w-2.5" />
        {Math.round(confidence * 100)}%
      </span>
    );
  }
  if (confidence > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-2 py-0.5 text-[12px] font-semibold text-orange-400 ring-1 ring-orange-500/20">
        <Sparkles className="h-2.5 w-2.5" />
        {Math.round(confidence * 100)}%
      </span>
    );
  }
  return null;
}

export function ColumnMapper({ mappings, sampleData, onMappingChange }: ColumnMapperProps) {
  const [manualOverrides, setManualOverrides] = useState<Set<number>>(new Set());

  const handleChange = useCallback(
    (index: number, value: string) => {
      setManualOverrides((prev) => { const next = new Set(prev); next.add(index); return next; });
      onMappingChange(index, value);
    },
    [onMappingChange]
  );

  const mappedCount = mappings.filter((m) => m.targetField !== "").length;
  const autoMappedCount = mappings.filter((m, i) => m.targetField !== "" && !manualOverrides.has(i)).length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-lg bg-surface-1 px-4 py-3 ring-1 ring-edge-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[12px] font-medium text-body">{mappedCount} of {mappings.length} mapped</span>
          </div>
          {autoMappedCount > 0 && (
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-[12px] text-dim">{autoMappedCount} auto-suggested</span>
            </div>
          )}
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-widest text-dim">Smart Mapping</span>
      </div>

      <div className="space-y-2">
        {mappings.map((mapping, index) => {
          const isMapped = mapping.targetField !== "";
          const isManual = manualOverrides.has(index);
          const samples = sampleData[mapping.sourceColumn] ?? [];

          return (
            <div
              key={mapping.sourceColumn}
              className={`group rounded-lg border p-3 transition-all duration-150 ${
                isMapped ? "border-edge-2 bg-card" : "border-dashed border-edge-2 bg-surface-1"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[12px] font-medium ${isMapped ? "text-body" : "text-dim"}`}>
                      {mapping.sourceColumn}
                    </span>
                    {isMapped && <ConfidenceBadge confidence={mapping.confidence} isManual={isManual} />}
                  </div>
                  {samples.length > 0 && (
                    <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
                      {samples.slice(0, 3).map((s, i) => (
                        <span key={i} className="max-w-[120px] truncate rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-dim ring-1 ring-edge-1">
                          {s}
                        </span>
                      ))}
                      {samples.length > 3 && <span className="text-[12px] text-dim">+{samples.length - 3} more</span>}
                    </div>
                  )}
                </div>
                <ArrowRight className={`h-4 w-4 shrink-0 ${isMapped ? "text-indigo-500/40" : "text-heading/[0.06]"}`} />
                <div className="relative w-48 shrink-0">
                  <select
                    value={mapping.targetField}
                    onChange={(e) => handleChange(index, e.target.value)}
                    style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif" }}
                    className={`w-full appearance-none rounded-lg border py-2 pl-3 pr-8 text-[12px] font-medium transition-colors focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 ${
                      isMapped
                        ? "border-edge-2 bg-popover text-body"
                        : "border-dashed border-edge-2 bg-card text-dim"
                    }`}
                  >
                    {TARGET_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-dim" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
