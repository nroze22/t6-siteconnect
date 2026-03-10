import { useState } from "react";
import { X, AlertTriangle, ShieldCheck } from "lucide-react";
import { useScreeningStore } from "@/stores/use-screening-store";
import type { CriterionResultType } from "@/types";

const overrideOptions: { value: CriterionResultType; label: string; selectedClass: string }[] = [
  { value: "met", label: "Met", selectedClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-400/40 ring-2 ring-emerald-500/30" },
  { value: "not_met", label: "Not Met", selectedClass: "bg-red-500/15 text-red-600 dark:text-red-300 border-red-400/40 ring-2 ring-red-500/30" },
  { value: "unknown", label: "Unknown / Missing Data", selectedClass: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-400/40 ring-2 ring-amber-500/30" },
  { value: "needs_review", label: "Needs Review", selectedClass: "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-400/40 ring-2 ring-blue-500/30" },
];

export function OverrideModal() {
  const isOpen = useScreeningStore((s) => s.isOverrideModalOpen);
  const overrideCriterionId = useScreeningStore((s) => s.overrideCriterionId);
  const closeModal = useScreeningStore((s) => s.closeOverrideModal);
  const criteriaResults = useScreeningStore((s) => s.criteriaResults);
  const screeningResults = useScreeningStore((s) => s.screeningResults);
  const selectedPatientId = useScreeningStore((s) => s.selectedPatientId);

  const [selectedOverride, setSelectedOverride] = useState<CriterionResultType | null>(null);
  const [justification, setJustification] = useState("");

  if (!isOpen || !overrideCriterionId) return null;

  // Find the criterion
  const screening = selectedPatientId ? screeningResults.get(selectedPatientId) : null;
  const criteria = screening ? criteriaResults.get(screening.id) ?? [] : [];
  const criterion = criteria.find((c) => c.id === overrideCriterionId);

  if (!criterion) return null;

  const handleSubmit = () => {
    if (!selectedOverride || !justification.trim()) return;
    // In production, this would call a Tauri command to persist the override with audit trail
    // For now, just close the modal
    closeModal();
    setSelectedOverride(null);
    setJustification("");
  };

  const canSubmit = selectedOverride !== null && justification.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeModal}
      />

      {/* Modal */}
      <div className="relative z-10 mx-4 w-full max-w-lg overflow-hidden rounded-2xl border border-edge-3 bg-card shadow-2xl shadow-black/30">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border bg-surface-1 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 ring-1 ring-amber-500/20">
              <ShieldCheck className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-heading">
                Manual Override
              </h2>
              <p className="mt-0.5 text-xs text-dim">
                Override the automated screening result for this criterion.
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="rounded-lg p-1.5 text-dim transition-colors hover:bg-surface-3 hover:text-heading"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* Criterion text */}
          <div className="rounded-lg bg-surface-2 p-3 ring-1 ring-edge-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">
              {criterion.criterionType === "inclusion" ? "Inclusion" : "Exclusion"} Criterion
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-heading">
              {criterion.criterionText}
            </p>
            <p className="mt-2 text-[12px] text-body">
              Current result:{" "}
              <span className="font-semibold text-heading">
                {criterion.result === "met" ? "Met" : criterion.result === "not_met" ? "Not Met" : criterion.result === "unknown" ? "Unknown" : "Needs Review"}
              </span>
              {criterion.aiDetermined && <span className="text-dim"> (AI-determined)</span>}
            </p>
          </div>

          {/* Override options */}
          <div className="mt-4">
            <p className="text-xs font-semibold text-heading">
              New Result
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {overrideOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedOverride(opt.value)}
                  className={`rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all ${
                    selectedOverride === opt.value
                      ? opt.selectedClass
                      : "border-edge-3 text-body hover:border-edge-4 hover:bg-surface-2"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Justification */}
          <div className="mt-4">
            <label className="text-xs font-semibold text-heading">
              Justification <span className="font-normal text-dim">(required, min 10 chars)</span>
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Provide clinical justification for this override..."
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-edge-3 bg-surface-2 px-3 py-2.5 text-[13px] text-heading placeholder:text-dim focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>

          {/* Audit warning */}
          <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-amber-500/8 p-3 ring-1 ring-amber-500/15">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-[12px] leading-relaxed text-amber-700 dark:text-amber-300/90">
              This override will be logged in the audit trail with your identity, timestamp, and justification.
              All overrides are permanent records and cannot be deleted.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border bg-surface-1 px-5 py-3">
          <button
            onClick={closeModal}
            className="rounded-lg border border-edge-3 bg-surface-2 px-4 py-2 text-xs font-medium text-body transition-colors hover:bg-surface-3 hover:text-heading"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
              canSubmit
                ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-900/20"
                : "cursor-not-allowed bg-surface-3 text-dim"
            }`}
          >
            Apply Override
          </button>
        </div>
      </div>
    </div>
  );
}
