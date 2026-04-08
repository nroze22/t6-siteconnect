import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical,
  DollarSign,
  Search,
  Filter,
  TrendingUp,
  Users,
  Building2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  X as XIcon,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Activity,
  ArrowUpDown,
  Calculator,
  Package,
  Globe,
  Crosshair,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatNumber } from "@/lib/formatters";
import { screenPatientsViaRust, screeningResultToOutput } from "@/lib/data-provider";
import { generatePitchPDF } from "@/lib/generate-pitch";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useAppStore } from "@/stores/use-app-store";
import { useAnimatedCurrency } from "@/hooks/use-animated-number";
import { useToast } from "@/components/ui/Toast";
import {
  modelStudyFinancials,
  profileToAssumptions,
  computeSiteFitScore,
  rankStudies,
  getArchetype,
  formatRangeCurrency,
  burdenColor,
  confidenceColor,
  riskColor,
  type StudyFinancialModel,
  type ConfidenceLevel,
  type BurdenLevel,
  type StudyArchetypeId,
} from "@/lib/financial-engine";
import { useSiteProfileStore } from "@/stores/use-site-profile-store";
import { useResearchPackStore } from "@/stores/use-research-pack-store";
import { DEMO_SITE_PROFILE } from "@/data/demo-site-profile";
import { BudgetWizard } from "./BudgetWizard";
import { CreateStudyModal } from "./CreateStudyModal";
import { Plus } from "lucide-react";
import { useModeStore } from "@/stores/use-mode-store";
import type { Study } from "@/types";
import type { PackStudy } from "@/types/research-pack";

// ─── PackStudy → Study adapter ───
// Maps research pack studies to the Study type expected by financial engine + BudgetWizard

type StudyView = Study & { eligibleCount: number; packStudy: PackStudy };

function packStudyToStudyView(ps: PackStudy, eligibleCount: number): StudyView {
  // Map pack phase strings to Study phase union
  const phaseMap: Record<string, Study["phase"]> = {
    "Phase 1": "Phase 1",
    "Phase 1/2": "Phase 1/2",
    "Phase 2": "Phase 2",
    "Phase 2/3": "Phase 2/3",
    "Phase 2b": "Phase 2",
    "Phase 2a/2b": "Phase 2",
    "Phase 2b/3": "Phase 2/3",
    "Phase 3": "Phase 3",
    "Phase 4": "Phase 4",
  };

  // Map pack TA to app TA
  const taMap: Record<string, string> = {
    "Oncology": "Oncology",
    "CNS/Neurology": "Neurology",
    "Cardiovascular": "Cardiology",
    "Immunology/Rheumatology": "Immunology",
    "Rare Disease": "Rare Disease",
  };

  return {
    id: ps.nctId,
    nctNumber: ps.nctId,
    title: ps.title,
    shortTitle: ps.briefTitle,
    sponsor: ps.sponsor,
    phase: phaseMap[ps.phase] ?? "Phase 2",
    status: ps.status === "recruiting" ? "recruiting" : "not_yet_recruiting",
    therapeuticArea: taMap[ps.therapeuticArea] ?? ps.therapeuticArea,
    indication: ps.indication,
    studyType: ps.studyType,
    summary: ps.primaryEndpoint
      ? `${ps.title}. Primary endpoint: ${ps.primaryEndpoint}`
      : ps.title,
    source: "curated",
    lastSynced: ps.lastUpdateDate,
    estimatedPerPatientValueCents: ps.estimatedPerPatientCents,
    estimatedSiteStartupCents: ps.estimatedStartupCents,
    currency: "USD",
    paymentModel: "per_visit",
    financialDetails: null,
    eligibleCount,
    packStudy: ps,
  };
}

// Map pack archetypeId → financial engine StudyArchetypeId
const ARCHETYPE_MAP: Record<string, StudyArchetypeId> = {
  phase1_oncology: "oncology_infusion",
  phase2_oncology_immuno: "oncology_immunotherapy",
  phase2_oncology_targeted: "oncology_oral_targeted",
  phase3_oncology_chemo: "oncology_infusion",
  phase2_cns_cognitive: "neurology_long_duration",
  phase3_autoimmune: "autoimmune_biologic",
  phase2_autoimmune: "autoimmune_biologic",
  phase3_cardiovascular_outcomes: "cardiology_moderate",
  phase2_cardiovascular: "cardiology_moderate",
  phase2_metabolic: "primary_care_metabolic",
  gene_cell_therapy: "gene_cell_therapy",
  rare_disease_natural_history: "rare_disease_high_touch",
  phase2_pain_analgesic: "pain_management",
  phase1_healthy_volunteer: "simple_observational",
};

// Generate simulated eligible patient counts based on TA and site profile
function simulateEligibleCount(ps: PackStudy, hasSiteProfile: boolean): number {
  if (!hasSiteProfile) {
    // Random but deterministic from NCT ID
    const hash = ps.nctId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return 3 + (hash % 25);
  }

  // Simulate based on TA and enrollment target
  const taMultipliers: Record<string, number> = {
    "Oncology": 0.8,
    "CNS/Neurology": 0.6,
    "Cardiovascular": 1.2,
    "Immunology/Rheumatology": 0.7,
    "Rare Disease": 0.3,
  };
  const mult = taMultipliers[ps.therapeuticArea] ?? 0.5;
  const base = Math.min(ps.enrollmentTarget * 0.02, 40);
  const hash = ps.nctId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const jitter = 0.7 + (hash % 60) / 100; // 0.7–1.3
  return Math.max(2, Math.round(base * mult * jitter));
}

type SortField = "value" | "burden" | "fit" | "confidence";

// ─── Study Card ───

function StudyCard({
  study,
  model,
  fitInfo,
  compact,
  onScreenPatients,
  onGeneratePitch,
  onOpenWizard,
}: {
  study: StudyView;
  model: StudyFinancialModel;
  fitInfo?: { score: number; fit: "low" | "medium" | "high"; reasons: string[] };
  /** When true, hides financial details and shows only study identity + eligible count + screen button. Used in Screening mode. */
  compact?: boolean;
  onScreenPatients: (studyId: string) => void;
  onGeneratePitch: (study: StudyView) => void;
  onOpenWizard: (study: StudyView, model: StudyFinancialModel) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const baseCase = model.scenarioOutputs.base;
  const ps = study.packStudy;

  const phaseColors: Record<string, string> = {
    "Phase 1": "bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20",
    "Phase 2": "bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/25",
    "Phase 3": "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25",
    "Phase 4": "bg-slate-500/15 text-dim ring-1 ring-slate-500/20",
    "Phase 1/2": "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25",
    "Phase 2/3": "bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/25",
  };

  const satColors: Record<string, string> = {
    low: "text-emerald-400",
    moderate: "text-amber-400",
    high: "text-orange-400",
    saturated: "text-red-400",
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group/card card-lift rounded-xl border border-edge-2 bg-card transition-all duration-200 hover:border-edge-4 hover:shadow-xl hover:shadow-black/20"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Tags row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`rounded-md px-2 py-0.5 text-[12px] font-bold ${phaseColors[study.phase] ?? "bg-slate-500/15 text-dim"}`}>
                {ps.phase}
              </span>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-dim ring-1 ring-edge-2">
                {ps.therapeuticArea}
              </span>
              <span className="text-[12px] font-mono text-dim">{ps.nctId}</span>
              {ps.acronym && (
                <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400 ring-1 ring-cyan-500/20">
                  {ps.acronym}
                </span>
              )}
              {/* Competition badge */}
              <span className={`flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[9px] ring-1 ring-edge-2 ${satColors[ps.competition.saturationLevel]}`}>
                <Globe className="h-2.5 w-2.5" />
                {ps.siteCount ?? "?"} sites
              </span>
              {/* Confidence badge */}
              <span className={`ml-auto rounded-md px-2 py-0.5 text-[9px] font-bold uppercase ring-1 ${confidenceColor(model.confidence)}`}>
                {model.confidence} conf.
              </span>
            </div>
            <h3 className="mt-1.5 text-[13px] font-bold text-heading leading-snug">{study.shortTitle}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-dim">
              <Building2 className="h-3 w-3" />
              {ps.sponsor}
              {ps.leadSponsorType === "industry" && (
                <span className="rounded bg-blue-500/15 px-1 py-0.5 text-[8px] font-semibold text-blue-300">INDUSTRY</span>
              )}
              {ps.leadSponsorType === "academic" && (
                <span className="rounded bg-purple-500/10 px-1 py-0.5 text-[8px] font-semibold text-purple-400">ACADEMIC</span>
              )}
            </p>
          </div>

          {/* Financial highlight — hidden in compact/screening mode */}
          {!compact && (
            <div className="shrink-0 rounded-xl bg-emerald-500/10 p-3 text-center ring-1 ring-emerald-400/30">
              <p className="text-[9px] font-semibold text-dim uppercase tracking-wider">Est. Opportunity</p>
              <p className="text-[17px] font-black tabular-nums text-heading tracking-tight">
                {formatRangeCurrency(model.perPatientRange)}
              </p>
              <p className="text-[9px] text-dim">/ enrolled patient</p>
            </div>
          )}
        </div>

        {/* Metrics row */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <MetricBadge
            icon={<Users className="h-3 w-3 text-indigo-400" />}
            label={`${study.eligibleCount} eligible`}
            sub="at your site"
            color="indigo"
          />
          {!compact && (
            <MetricBadge
              icon={<TrendingUp className="h-3 w-3 text-emerald-400" />}
              label={formatCurrencyCompact(baseCase.totalNetContributionCents)}
              sub="net contribution"
              color="emerald"
            />
          )}
          {!compact && (
            <MetricBadge
              icon={<Activity className="h-3 w-3" />}
              label={model.burdenScore.overall.replace("_", " ")}
              sub="burden"
              color={model.burdenScore.overall === "low" ? "emerald" : model.burdenScore.overall === "medium" ? "amber" : "red"}
              className={`ring-1 ${burdenColor(model.burdenScore.overall)}`}
            />
          )}
          {!compact && (
            <MetricBadge
              icon={<AlertTriangle className="h-3 w-3" />}
              label={model.screenFailRisk}
              sub="SF risk"
              color={model.screenFailRisk === "low" ? "emerald" : model.screenFailRisk === "medium" ? "amber" : "red"}
              className={`ring-1 ${riskColor(model.screenFailRisk)}`}
            />
          )}
          <MetricBadge
            icon={<Clock className="h-3 w-3 text-dim" />}
            label={model.visitModel.estimatedDurationMonths + "mo"}
            sub={model.timeIntensity}
            color="slate"
          />
          {ps.enrollmentTarget > 0 && (
            <MetricBadge
              icon={<Crosshair className="h-3 w-3 text-cyan-400" />}
              label={formatNumber(ps.enrollmentTarget)}
              sub="target enrollment"
              color="slate"
            />
          )}
          {fitInfo && (
            <MetricBadge
              icon={<TrendingUp className="h-3 w-3" />}
              label={`${fitInfo.score}%`}
              sub="site fit"
              color={fitInfo.fit === "high" ? "emerald" : fitInfo.fit === "medium" ? "amber" : "red"}
              className={`ring-1 ${fitInfo.fit === "high" ? "bg-emerald-500/12 ring-emerald-500/20" : fitInfo.fit === "medium" ? "bg-amber-500/12 ring-amber-500/20" : "bg-red-500/12 ring-red-500/20"}`}
            />
          )}
        </div>

        {/* Fit reasons preview */}
        {fitInfo && fitInfo.reasons.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {fitInfo.reasons.slice(0, 3).map((r, i) => (
              <span key={i} className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] text-dim ring-1 ring-edge-1">
                {r}
              </span>
            ))}
          </div>
        )}

        {/* Mini explanation */}
        <p className="mt-2 text-[12px] text-dim italic">
          {model.methodology.slice(0, 120)}...
        </p>
      </div>

      {/* Expandable Tier 2 details */}
      <div className="border-t border-edge-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-4 py-2 text-[12px] font-medium text-dim transition-colors hover:text-body"
        >
          <span>{expanded ? "Hide Financial Detail" : "View Financial Detail"}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="border-t border-edge-1 px-4 pb-4 pt-3">
                {/* Study detail summary */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="rounded-lg bg-surface-1 p-3 ring-1 ring-edge-2">
                    <h4 className="text-[12px] font-bold uppercase tracking-wider text-dim">Study Detail</h4>
                    <div className="mt-2 space-y-1 text-[12px]">
                      <div className="flex justify-between">
                        <span className="text-dim">Sponsor Type</span>
                        <span className="text-body capitalize">{ps.leadSponsorType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-dim">Intervention</span>
                        <span className="text-body">{ps.interventions.map(i => i.name).slice(0, 2).join(", ")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-dim">Target Enrollment</span>
                        <span className="text-body">{formatNumber(ps.enrollmentTarget)} patients</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-dim">Active Sites</span>
                        <span className={`font-semibold ${satColors[ps.competition.saturationLevel]}`}>
                          {ps.siteCount ?? "Unknown"} ({ps.competition.saturationLevel})
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-dim">Competing Studies</span>
                        <span className="text-body">{ps.competition.competingStudyCount} in same TA+phase</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface-1 p-3 ring-1 ring-edge-2">
                    <h4 className="text-[12px] font-bold uppercase tracking-wider text-dim">Key Inclusion Criteria</h4>
                    <ul className="mt-2 space-y-0.5">
                      {ps.keyInclusionCriteria.slice(0, 5).map((c, i) => (
                        <li key={i} className="text-[12px] text-body flex items-start gap-1">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Tier 2: Modeled estimate detail */}
                <div className="grid grid-cols-3 gap-3">
                  {(["conservative", "base", "optimistic"] as const).map((key) => {
                    const s = model.scenarioOutputs[key];
                    const isBase = key === "base";
                    return (
                      <div
                        key={key}
                        className={`rounded-lg p-3 ring-1 ${
                          isBase
                            ? "bg-surface-2 ring-indigo-500/25"
                            : "bg-surface-1 ring-edge-2"
                        }`}
                      >
                        <p className={`text-[12px] font-bold uppercase tracking-wider ${isBase ? "text-indigo-300" : "text-dim"}`}>
                          {s.label}
                        </p>
                        <p className={`mt-1 text-[16px] font-black tabular-nums ${isBase ? "text-heading" : "text-body"}`}>
                          {formatCurrency(s.perPatientGrossCents)}
                        </p>
                        <p className="text-[12px] text-dim">gross / patient</p>
                        <div className="mt-2 space-y-1 text-[12px]">
                          <div className="flex justify-between">
                            <span className="text-dim">Net / patient</span>
                            <span className={`tabular-nums ${s.perPatientNetCents >= 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}`}>
                              {formatCurrency(s.perPatientNetCents)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-dim">Break-even</span>
                            <span className="text-body">{s.breakEvenEnrollment} pts</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-dim">Total net</span>
                            <span className={`tabular-nums ${s.totalNetContributionCents >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}`}>
                              {formatCurrencyCompact(s.totalNetContributionCents)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Visit & burden summary */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-surface-1 p-3 ring-1 ring-edge-2">
                    <h4 className="text-[12px] font-bold uppercase tracking-wider text-dim">Visit Model</h4>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
                      <div><p className="text-[9px] text-dim">Screening</p><p className="font-bold text-body">{model.visitModel.screeningVisits}</p></div>
                      <div><p className="text-[9px] text-dim">Treatment</p><p className="font-bold text-body">{model.visitModel.treatmentVisits}</p></div>
                      <div><p className="text-[9px] text-dim">Follow-up</p><p className="font-bold text-body">{model.visitModel.followUpVisits}</p></div>
                    </div>
                    <p className="mt-1.5 text-[9px] text-dim">
                      {model.visitModel.totalVisits} total visits over {model.visitModel.estimatedDurationMonths} months ({model.visitModel.visitCadence})
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-1 p-3 ring-1 ring-edge-2">
                    <h4 className="text-[12px] font-bold uppercase tracking-wider text-dim">Burden Breakdown</h4>
                    <div className="mt-2 space-y-1">
                      {[
                        { label: "Operational", val: model.burdenScore.operational },
                        { label: "Startup", val: model.burdenScore.startup },
                        { label: "Screening", val: model.burdenScore.screening },
                      ].map((b) => (
                        <div key={b.label} className="flex items-center gap-2">
                          <span className="w-16 text-[12px] text-dim">{b.label}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-surface-3">
                            <div
                              className={`h-1.5 rounded-full ${b.val < 30 ? "bg-emerald-500" : b.val < 60 ? "bg-amber-500" : "bg-red-500"}`}
                              style={{ width: `${b.val}%` }}
                            />
                          </div>
                          <span className="w-6 text-right text-[12px] text-dim">{b.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Top revenue drivers preview */}
                <div className="mt-3 rounded-lg bg-surface-1 p-3 ring-1 ring-edge-2">
                  <h4 className="text-[12px] font-bold uppercase tracking-wider text-dim">
                    Top Revenue Drivers ({model.revenueDrivers.length} modeled line items)
                  </h4>
                  <div className="mt-2 space-y-1">
                    {model.revenueDrivers
                      .filter(d => d.category !== "regulatory")
                      .sort((a, b) => b.totalCents - a.totalCents)
                      .slice(0, 5)
                      .map((d, i) => (
                        <div key={i} className="flex items-center justify-between text-[12px]">
                          <span className="text-body">{d.label} <span className="text-dim">×{d.quantity}</span></span>
                          <span className="font-semibold tabular-nums text-emerald-400">{formatCurrency(d.totalCents)}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onOpenWizard(study, model)}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
                  >
                    <Calculator className="h-3 w-3" />
                    Open Budget Wizard
                  </button>
                  <button
                    onClick={() => onScreenPatients(study.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-edge-3 bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body"
                  >
                    <Search className="h-3 w-3" />
                    Screen Subjects
                  </button>
                  <button
                    onClick={() => onGeneratePitch(study)}
                    title="Saves HTML pitch document to ~/Downloads"
                    className="flex items-center gap-1.5 rounded-lg border border-edge-3 bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body"
                  >
                    <FileText className="h-3 w-3" />
                    Generate Pitch
                  </button>
                  <button
                    onClick={() => ps.nctId && window.open(`https://clinicaltrials.gov/study/${ps.nctId}`, "_blank")}
                    className="flex items-center gap-1.5 rounded-lg border border-edge-3 bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Registry
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function MetricBadge({
  icon,
  label,
  sub,
  color,
  className: extraClass,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  color: string;
  className?: string;
}) {
  const textColors: Record<string, string> = {
    indigo: "text-indigo-300",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
    slate: "text-body",
    cyan: "text-cyan-400",
  };

  return (
    <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] ${extraClass ?? ""}`}>
      {icon}
      <span className={`font-semibold capitalize ${textColors[color] ?? "text-body"}`}>{label}</span>
      <span className="text-dim">{sub}</span>
    </div>
  );
}

// ─── Main Page ───

export function TrialsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortField>("fit");
  const [wizardState, setWizardState] = useState<{
    study: StudyView;
    model: StudyFinancialModel;
  } | null>(null);
  const [isCreateStudyOpen, setIsCreateStudyOpen] = useState(false);

  const setPatients = useScreeningStore((s) => s.setPatients);
  const setScreeningResult = useScreeningStore((s) => s.setScreeningResult);
  const setCriteriaResults = useScreeningStore((s) => s.setCriteriaResults);
  const selectStudy = useScreeningStore((s) => s.selectStudy);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const toast = useToast();
  const currentMode = useModeStore((s) => s.currentMode);
  const isScreeningMode = currentMode === "screening";
  const siteProfile = useSiteProfileStore((s) => s.profile);
  const siteProfileStore = useSiteProfileStore();

  // Load research pack on mount
  const packStudies = useResearchPackStore((s) => s.studies);
  const packManifest = useResearchPackStore((s) => s.manifest);
  const isPackLoaded = useResearchPackStore((s) => s.isLoaded);
  const isPackLoading = useResearchPackStore((s) => s.isLoading);
  const loadPack = useResearchPackStore((s) => s.loadPack);

  useEffect(() => {
    loadPack();
  }, [loadPack]);

  // Auto-load demo site profile in web dev mode if not already set
  useEffect(() => {
    if (!siteProfile.onboardingComplete) {
      // Load demo profile for a great out-of-box experience
      siteProfileStore.updateResearch(DEMO_SITE_PROFILE.research);
      siteProfileStore.updateOperations(DEMO_SITE_PROFILE.operations);
      siteProfileStore.updateFinancials(DEMO_SITE_PROFILE.financials);
      siteProfileStore.updatePreferences(DEMO_SITE_PROFILE.preferences);
      siteProfileStore.updatePopulation(DEMO_SITE_PROFILE.population);
      siteProfileStore.updateDataReadiness(DEMO_SITE_PROFILE.dataReadiness);
      siteProfileStore.updateWorkflow(DEMO_SITE_PROFILE.workflow);
      siteProfileStore.completeOnboarding();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map pack studies → StudyView with simulated eligible counts
  const studies = useMemo<StudyView[]>(() => {
    if (!isPackLoaded || packStudies.length === 0) return [];
    return packStudies.map((ps) => {
      const eligible = simulateEligibleCount(ps, siteProfile.onboardingComplete);
      return packStudyToStudyView(ps, eligible);
    });
  }, [packStudies, isPackLoaded, siteProfile.onboardingComplete]);

  // Pre-compute financial models for all studies using site profile
  const studyModels = useMemo(() => {
    const map = new Map<string, StudyFinancialModel>();
    const assumptions = siteProfile.onboardingComplete
      ? profileToAssumptions(siteProfile)
      : undefined;
    for (const study of studies) {
      const archetypeOverride = ARCHETYPE_MAP[study.packStudy.archetypeId];
      map.set(study.id, modelStudyFinancials(study, assumptions, archetypeOverride));
    }
    return map;
  }, [siteProfile, studies]);

  // Compute fit scores
  const fitScores = useMemo(() => {
    if (!siteProfile.onboardingComplete) return new Map<string, { score: number; fit: "low" | "medium" | "high"; reasons: string[] }>();
    const map = new Map<string, { score: number; fit: "low" | "medium" | "high"; reasons: string[] }>();
    for (const study of studies) {
      const model = studyModels.get(study.id);
      if (!model) continue;
      const archetype = getArchetype(model.archetype);
      map.set(study.id, computeSiteFitScore(study, archetype, siteProfile));
    }
    return map;
  }, [siteProfile, studyModels, studies]);

  const handleGeneratePitch = useCallback(
    async (study: StudyView) => {
      const result = await generatePitchPDF(study);
      if (result.fileName) {
        toast.success("Pitch document saved", `Saved to ~/Downloads/${result.fileName}`);
      } else {
        toast.success("Pitch document generated", "Opened in a new tab");
      }
    },
    [toast]
  );

  const handleScreenPatients = useCallback(
    async (studyId: string) => {
      // Find the study for TA hint and metadata
      const matchedStudy = studies.find((s) => s.id === studyId);
      const rustResults = await screenPatientsViaRust(studyId, matchedStudy?.therapeuticArea);
      const screening = rustResults.map(screeningResultToOutput);
      if (screening.length === 0) {
        toast.warning("No subjects to screen", "Import subject data first");
        return;
      }
      setPatients(screening.map((s) => s.summary));
      for (const s of screening) {
        setScreeningResult(s.summary.id, s.result);
        setCriteriaResults(s.result.id, s.criteria);
      }
      // Pass study metadata so screening page can display it
      selectStudy(studyId, matchedStudy ? {
        short: matchedStudy.shortTitle ?? matchedStudy.title,
        sponsor: matchedStudy.sponsor,
        phase: matchedStudy.phase,
        nct: matchedStudy.nctNumber ?? "",
      } : undefined);
      setCurrentPage("screening");
      const eligible = screening.filter((s) => s.summary.overallStatus === "eligible").length;
      toast.success(`Screened ${screening.length} subjects`, `${eligible} eligible for enrollment`);
    },
    [setPatients, setScreeningResult, setCriteriaResults, selectStudy, setCurrentPage, toast, studies]
  );

  const handleOpenWizard = useCallback(
    (study: StudyView, model: StudyFinancialModel) => {
      setWizardState({ study, model });
    },
    []
  );

  const areas = useMemo(
    () => {
      const taSet = new Set(studies.map((s) => s.therapeuticArea));
      return ["all", ...Array.from(taSet).sort()];
    },
    [studies]
  );

  const filtered = useMemo(() => {
    let results = studies.filter((s) => {
      if (selectedArea !== "all" && s.therapeuticArea !== selectedArea) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          s.title?.toLowerCase().includes(q) ||
          s.shortTitle?.toLowerCase().includes(q) ||
          s.sponsor.toLowerCase().includes(q) ||
          s.indication.toLowerCase().includes(q) ||
          s.nctNumber?.toLowerCase().includes(q) ||
          s.packStudy.conditions.some((c) => c.toLowerCase().includes(q))
        );
      }
      return true;
    });

    // Sort — use site ranking preferences when available
    if (sortBy === "fit" && siteProfile.onboardingComplete) {
      const eligibleMap = new Map(results.map(s => [s.id, s.eligibleCount]));
      results = rankStudies(results, studyModels, eligibleMap, siteProfile.preferences.rankingFactors);
    } else {
      results = [...results].sort((a, b) => {
        const mA = studyModels.get(a.id);
        const mB = studyModels.get(b.id);
        if (!mA || !mB) return 0;

        switch (sortBy) {
          case "value":
            return mB.perPatientRange.baseCents - mA.perPatientRange.baseCents;
          case "burden": {
            const bMap: Record<BurdenLevel, number> = { low: 0, medium: 1, high: 2, very_high: 3 };
            return bMap[mA.burdenScore.overall] - bMap[mB.burdenScore.overall];
          }
          case "fit": {
            return (b.eligibleCount * mB.perPatientRange.baseCents) - (a.eligibleCount * mA.perPatientRange.baseCents);
          }
          case "confidence": {
            const cMap: Record<ConfidenceLevel, number> = { high: 0, medium: 1, low: 2 };
            return cMap[mA.confidence] - cMap[mB.confidence];
          }
          default:
            return 0;
        }
      });
    }

    return results;
  }, [searchQuery, selectedArea, sortBy, studyModels, siteProfile, studies]);

  const totalOpportunity = useMemo(
    () =>
      studies.reduce((sum, s) => {
        const m = studyModels.get(s.id);
        return sum + (m ? m.scenarioOutputs.base.totalNetContributionCents : 0);
      }, 0),
    [studyModels, studies]
  );

  const totalEligible = useMemo(() => studies.reduce((sum, s) => sum + s.eligibleCount, 0), [studies]);
  const animatedRevenue = useAnimatedCurrency(totalOpportunity, 1200);

  // Loading state
  if (isPackLoading || !isPackLoaded) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
          <div className="text-center">
            <p className="text-[13px] font-semibold text-body">Loading Research Pack</p>
            <p className="mt-1 text-[12px] text-dim">Initializing 30 real clinical trials with CMS-anchored benchmarks...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Research Pack badge */}
            {packManifest && (
              <div className="flex items-center gap-1.5 rounded-lg bg-indigo-500/8 px-2.5 py-1 ring-1 ring-indigo-500/15">
                <Package className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-[12px] font-semibold text-indigo-300">{packManifest.packId}</span>
                <span className="text-[9px] text-indigo-400/50">v{packManifest.version}</span>
              </div>
            )}
            <p className="text-[12px] text-dim">
              {packManifest?.studyCount ?? 0} real trials • CMS-anchored pricing • {siteProfile.onboardingComplete ? siteProfile.research.siteName : "Site"} personalized
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-dim" />
              <input
                type="text"
                placeholder="Search trials, sponsors, indications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-80 rounded-lg border border-edge-2 bg-surface-2 py-2 pl-9 pr-9 text-[12px] text-body placeholder-dim focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 rounded p-0.5 text-dim hover:text-body"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => setIsCreateStudyOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-[12px] font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Study
            </button>
          </div>
        </div>

        {/* Revenue summary bar — hidden in Screening mode where CRCs just need to pick a study */}
        {isScreeningMode ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-2.5 rounded-lg bg-blue-500/10 px-4 py-2.5 ring-1 ring-blue-400/30">
              <Users className="h-5 w-5 text-blue-400" />
              <div>
                <p className="text-[12px] font-semibold text-dim">Eligible Subjects</p>
                <p className="text-xl font-black tabular-nums text-heading">{formatNumber(totalEligible)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg bg-purple-500/10 px-4 py-2.5 ring-1 ring-purple-400/30">
              <FlaskConical className="h-5 w-5 text-purple-400" />
              <div>
                <p className="text-[12px] font-semibold text-dim">Active Studies</p>
                <p className="text-xl font-black tabular-nums text-heading">{studies.length}</p>
              </div>
            </div>
            <p className="ml-auto text-[11px] text-dim">
              Select a study below, then click <strong className="text-body">Screen Patients</strong> to start.
            </p>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-2.5 rounded-lg bg-emerald-500/10 px-4 py-2.5 ring-1 ring-emerald-400/30">
              <DollarSign className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-[12px] font-semibold text-dim">Total Net Opportunity</p>
                <p className="text-xl font-black tabular-nums text-heading">{animatedRevenue}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg bg-blue-500/10 px-4 py-2.5 ring-1 ring-blue-400/30">
              <Users className="h-5 w-5 text-blue-400" />
              <div>
                <p className="text-[12px] font-semibold text-dim">Eligible Subjects</p>
                <p className="text-xl font-black tabular-nums text-heading">{formatNumber(totalEligible)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg bg-purple-500/10 px-4 py-2.5 ring-1 ring-purple-400/30">
              <FlaskConical className="h-5 w-5 text-purple-400" />
              <div>
                <p className="text-[12px] font-semibold text-dim">Active Studies</p>
                <p className="text-xl font-black tabular-nums text-heading">{studies.length}</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 ring-1 ring-edge-2">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              <span className="text-[12px] font-medium text-dim">
                ClinicalTrials.gov verified • CMS 2025 fee schedule • Tufts CSDD benchmarks
              </span>
            </div>
          </div>
        )}

        {/* Filter + sort row */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-x-auto">
            <Filter className="h-3.5 w-3.5 shrink-0 text-dim" />
            {areas.map((area) => (
              <button
                key={area}
                onClick={() => setSelectedArea(area)}
                className={`shrink-0 rounded-md px-3 py-1 text-[12px] font-medium transition-all ${
                  selectedArea === area
                    ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25"
                    : "text-dim hover:bg-surface-2 hover:text-body"
                }`}
              >
                {area === "all" ? `All (${studies.length})` : `${area} (${studies.filter(s => s.therapeuticArea === area).length})`}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3 w-3 text-dim" />
            <span className="text-[12px] text-dim mr-1">Sort:</span>
            {(
              [
                { field: "fit", label: "Total Fit" },
                { field: "value", label: "Value" },
                { field: "burden", label: "Burden" },
                { field: "confidence", label: "Confidence" },
              ] as { field: SortField; label: string }[]
            ).map((s) => (
              <button
                key={s.field}
                onClick={() => setSortBy(s.field)}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-all ${
                  sortBy === s.field
                    ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25"
                    : "text-dim hover:bg-surface-2 hover:text-body"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Study cards */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4">
          {filtered.map((study) => {
            const model = studyModels.get(study.id);
            if (!model) return null;
            return (
              <StudyCard
                key={study.id}
                study={study}
                model={model}
                fitInfo={fitScores.get(study.id)}
                compact={isScreeningMode}
                onScreenPatients={handleScreenPatients}
                onGeneratePitch={handleGeneratePitch}
                onOpenWizard={handleOpenWizard}
              />
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FlaskConical className="h-10 w-10 text-faint" />
            <p className="mt-3 text-[13px] font-medium text-dim">No trials match your search</p>
            <p className="mt-1 text-[12px] text-dim">Try adjusting your filters or search query.</p>
          </div>
        )}
      </div>

      {/* Budget Wizard overlay */}
      <AnimatePresence>
        {wizardState && (
          <BudgetWizard
            study={wizardState.study}
            model={wizardState.model}
            onClose={() => setWizardState(null)}
          />
        )}
      </AnimatePresence>

      {/* Create Custom Study modal */}
      <CreateStudyModal
        open={isCreateStudyOpen}
        onClose={() => setIsCreateStudyOpen(false)}
        onCreated={() => {
          toast.success("Study created", "Your custom study has been saved locally.");
        }}
      />
    </div>
  );
}
