import { X, FlaskConical, DollarSign, Building2, Users, ClipboardList, ExternalLink } from "lucide-react";
import { useScreeningStore } from "@/stores/use-screening-store";
import { formatCurrency } from "@/lib/formatters";

// Study data matching the KEYNOTE-789 demo
const STUDY_INFO = {
  id: "study-1",
  nctNumber: "NCT05502237",
  shortTitle: "KEYNOTE-789: Pembro + Chemo in NSCLC",
  fullTitle:
    "A Phase 3, Randomized, Double-Blind Study of Pembrolizumab Plus Chemotherapy vs Placebo Plus Chemotherapy in Previously Untreated Locally Advanced or Metastatic NSCLC",
  sponsor: "Merck Sharp & Dohme",
  phase: "Phase 3",
  therapeuticArea: "Oncology",
  indication: "Non-Small Cell Lung Cancer",
  estimatedPerPatientCents: 4200000,
  siteStartupCents: 3500000,
  paymentModel: "Per Visit",
  summary:
    "Phase 3 study evaluating pembrolizumab in combination with pemetrexed and platinum chemotherapy versus placebo in participants with previously untreated metastatic nonsquamous NSCLC.",
  inclusionCriteria: [
    "1. Histologically or cytologically confirmed metastatic nonsquamous NSCLC (Stage IV)",
    "2. No prior systemic therapy for metastatic NSCLC",
    "3. Measurable disease per RECIST v1.1",
    "4. ECOG Performance Status 0-1",
    "5. PD-L1 tumor expression assessed by central lab",
    "6. Adequate organ function (ANC >= 1500/uL, Platelets >= 100,000/uL, Hgb >= 9.0 g/dL)",
    "7. eGFR >= 30 mL/min/1.73m2",
    "8. Total bilirubin <= 1.5x ULN (or <= 3x ULN if Gilbert's disease)",
    "9. Life expectancy >= 3 months",
    "10. Age >= 18 years",
  ],
  exclusionCriteria: [
    "1. EGFR activating mutations or ALK rearrangements",
    "2. Active autoimmune disease requiring systemic therapy in the past 2 years",
    "3. Active CNS metastases (treated, stable CNS metastases allowed)",
    "4. Prior anti-PD-1, anti-PD-L1, or anti-PD-L2 therapy",
    "5. Active infection requiring systemic therapy",
    "6. Known HIV, active Hep B or Hep C",
  ],
};

export function StudyDetailModal() {
  const isOpen = useScreeningStore((s) => s.isStudyDetailOpen);
  const setOpen = useScreeningStore((s) => s.setStudyDetailOpen);
  const patientCount = useScreeningStore((s) => s.patients.length);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="relative z-10 mx-4 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-edge-3 bg-card shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-edge-2 bg-gradient-to-r from-indigo-500/5 to-transparent p-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-indigo-400" />
              <span className="rounded-md bg-emerald-500/15 px-2.5 py-0.5 text-[12px] font-bold text-emerald-400 ring-1 ring-emerald-500/20">
                {STUDY_INFO.phase}
              </span>
              <span className="font-mono text-xs text-dim">
                {STUDY_INFO.nctNumber}
              </span>
            </div>
            <h2 className="mt-2 text-base font-bold text-heading">
              {STUDY_INFO.shortTitle}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-dim">
              <Building2 className="h-3 w-3" />
              {STUDY_INFO.sponsor} &middot; {STUDY_INFO.therapeuticArea} &middot;{" "}
              {STUDY_INFO.indication}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="ml-4 rounded-lg p-1.5 text-dim transition-colors hover:bg-surface-2 hover:text-body"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Summary */}
          <p className="text-sm leading-relaxed text-dim">
            {STUDY_INFO.summary}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-body">
            {STUDY_INFO.fullTitle}
          </p>

          {/* Financial card */}
          <div className="mt-5 rounded-xl bg-emerald-500/8 p-4 ring-1 ring-emerald-500/15">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <DollarSign className="h-3.5 w-3.5" />
              Financial Intelligence
            </h3>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <div>
                <p className="text-[12px] font-medium text-emerald-400/60">
                  Per Subject Value
                </p>
                <p className="text-lg font-black text-emerald-400">
                  {formatCurrency(STUDY_INFO.estimatedPerPatientCents)}
                </p>
              </div>
              <div>
                <p className="text-[12px] font-medium text-emerald-400/60">
                  Site Startup
                </p>
                <p className="text-lg font-black text-emerald-400">
                  {formatCurrency(STUDY_INFO.siteStartupCents)}
                </p>
              </div>
              <div>
                <p className="text-[12px] font-medium text-emerald-400/60">
                  Payment Model
                </p>
                <p className="text-lg font-black text-emerald-400">
                  {STUDY_INFO.paymentModel}
                </p>
              </div>
            </div>
          </div>

          {/* Criteria */}
          <div className="mt-5 grid grid-cols-2 gap-4">
            {/* Inclusion */}
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-body">
                <ClipboardList className="h-3.5 w-3.5 text-emerald-500" />
                Inclusion Criteria ({STUDY_INFO.inclusionCriteria.length})
              </h3>
              <ul className="mt-2 space-y-1.5">
                {STUDY_INFO.inclusionCriteria.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-emerald-500/5 px-3 py-2 text-[12px] leading-relaxed text-body ring-1 ring-emerald-500/10"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            {/* Exclusion */}
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-body">
                <ClipboardList className="h-3.5 w-3.5 text-red-500" />
                Exclusion Criteria ({STUDY_INFO.exclusionCriteria.length})
              </h3>
              <ul className="mt-2 space-y-1.5">
                {STUDY_INFO.exclusionCriteria.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-red-500/5 px-3 py-2 text-[12px] leading-relaxed text-body ring-1 ring-red-500/10"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-edge-2 bg-surface-1 px-5 py-3">
          <div className="flex items-center gap-1.5 text-xs text-dim">
            <Users className="h-3.5 w-3.5" />
            Currently screening {patientCount} subjects against this study
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 rounded-lg border border-edge-3 bg-surface-2 px-3 py-1.5 text-xs font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body">
              <ExternalLink className="h-3 w-3" />
              ClinicalTrials.gov
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
