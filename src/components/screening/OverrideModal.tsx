import { useState } from "react";
import { X, AlertTriangle, ShieldCheck } from "lucide-react";
import { useScreeningStore } from "@/stores/use-screening-store";
import type { CriterionResultType } from "@/types";

const overrideOptions: { value: CriterionResultType; label: string; color: string }[] = [
  { value: "met", label: "Met", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "not_met", label: "Not Met", color: "bg-red-50 text-red-700 border-red-200" },
  { value: "unknown", label: "Unknown / Missing Data", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "needs_review", label: "Needs Review", color: "bg-blue-50 text-blue-700 border-blue-200" },
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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeModal}
      />

      {/* Modal */}
      <div className="relative z-10 mx-4 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-50 p-2">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Manual Override
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Override the automated screening result for this criterion.
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* Criterion text */}
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              {criterion.criterionType === "inclusion" ? "Inclusion" : "Exclusion"} Criterion
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground">
              {criterion.criterionText}
            </p>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Current result:{" "}
              <span className="font-semibold">
                {criterion.result === "met" ? "Met" : criterion.result === "not_met" ? "Not Met" : criterion.result === "unknown" ? "Unknown" : "Needs Review"}
              </span>
              {criterion.aiDetermined && " (AI-determined)"}
            </p>
          </div>

          {/* Override options */}
          <div className="mt-4">
            <p className="text-xs font-semibold text-foreground">
              New Result
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {overrideOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedOverride(opt.value)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    selectedOverride === opt.value
                      ? `${opt.color} ring-2 ring-primary/30`
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Justification */}
          <div className="mt-4">
            <label className="text-xs font-semibold text-foreground">
              Justification <span className="font-normal text-muted-foreground">(required, min 10 chars)</span>
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Provide clinical justification for this override..."
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Audit warning */}
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <p className="text-[12px] leading-relaxed text-amber-800">
              This override will be logged in the audit trail with your identity, timestamp, and justification.
              All overrides are permanent records and cannot be deleted.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <button
            onClick={closeModal}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
              canSubmit
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "cursor-not-allowed bg-muted text-muted-foreground"
            }`}
          >
            Apply Override
          </button>
        </div>
      </div>
    </div>
  );
}
