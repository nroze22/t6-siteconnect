import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronRight,
  ChevronLeft,
  DollarSign,
  Users,
  Sliders,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Calculator,
  Briefcase,
  Building2,
  Info,
} from "lucide-react";
import {
  type StudyFinancialModel,
  type SiteAssumptions,
  type RevenueDriver,
  type ScenarioCase,
  DEFAULT_SITE_ASSUMPTIONS,
  recalculateWithAssumptions,
  formatRangeCurrency,
  confidenceColor,
  getArchetype,
} from "@/lib/financial-engine";
import { formatCurrency } from "@/lib/formatters";
import type { Study } from "@/types";

interface BudgetWizardProps {
  study: Study & { eligibleCount: number };
  model: StudyFinancialModel;
  onClose: () => void;
}

const STEPS = [
  { id: "overview", label: "Model Overview", icon: BarChart3 },
  { id: "assumptions", label: "Site Assumptions", icon: Sliders },
  { id: "outputs", label: "Financial Outputs", icon: Calculator },
  { id: "tuning", label: "Line-Item Tuning", icon: Briefcase },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function BudgetWizard({ study, model: initialModel, onClose }: BudgetWizardProps) {
  const [step, setStep] = useState<StepId>("overview");
  const [assumptions, setAssumptions] = useState<SiteAssumptions>({
    ...DEFAULT_SITE_ASSUMPTIONS,
    enrollmentTarget: study.eligibleCount,
    screenFailRatePercent: Math.round(
      (getArchetype(initialModel.archetype).screenFailRangePercent[0]! +
        getArchetype(initialModel.archetype).screenFailRangePercent[1]!) / 2
    ),
  });

  const model = useMemo(
    () => recalculateWithAssumptions(initialModel, study, assumptions),
    [initialModel, study, assumptions]
  );

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const canNext = stepIndex < STEPS.length - 1;
  const canPrev = stepIndex > 0;

  const updateAssumption = useCallback(
    <K extends keyof SiteAssumptions>(key: K, value: SiteAssumptions[K]) => {
      setAssumptions((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9994] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 28, stiffness: 350 }}
        className="fixed inset-4 z-[9995] flex flex-col overflow-hidden rounded-2xl bg-background ring-1 ring-white/10 shadow-2xl shadow-black/50 md:inset-x-[10%] md:inset-y-[5%] lg:inset-x-[15%]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge-2 px-6 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-heading">Site Budget Wizard</h2>
            <p className="mt-0.5 text-[12px] text-dim">
              {study.shortTitle ?? study.title}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-md px-2 py-0.5 text-[12px] font-bold ring-1 ${confidenceColor(model.confidence)}`}>
              {model.confidence.toUpperCase()} CONFIDENCE
            </span>
            <button onClick={onClose} className="rounded-lg p-1.5 text-dim hover:bg-white/5 hover:text-heading">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex border-b border-edge-2 px-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isCurrent = s.id === step;
            const isPast = i < stepIndex;
            return (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-[12px] font-medium transition-all ${
                  isCurrent
                    ? "border-indigo-500 text-indigo-700 dark:text-indigo-300"
                    : isPast
                      ? "border-transparent text-emerald-600 dark:text-emerald-400/70 hover:text-emerald-700 dark:hover:text-emerald-300"
                      : "border-transparent text-dim hover:text-body"
                }`}
              >
                {isPast ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {step === "overview" && <StepOverview model={model} study={study} />}
              {step === "assumptions" && (
                <StepAssumptions
                  assumptions={assumptions}
                  model={model}
                  onUpdate={updateAssumption}
                />
              )}
              {step === "outputs" && <StepOutputs model={model} assumptions={assumptions} />}
              {step === "tuning" && (
                <StepTuning
                  model={model}
                  assumptions={assumptions}
                  onOverride={(label, cents) =>
                    updateAssumption("siteOverrides", { ...assumptions.siteOverrides, [label]: cents })
                  }
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-edge-2 px-6 py-3">
          <button
            onClick={() => canPrev && setStep(STEPS[stepIndex - 1]!.id)}
            disabled={!canPrev}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-medium text-dim transition-colors hover:bg-surface-2 hover:text-heading disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>

          <div className="flex items-center gap-2 text-[12px] text-dim">
            <Info className="h-3 w-3" />
            {model.methodology.slice(0, 80)}...
          </div>

          <button
            onClick={() => canNext ? setStep(STEPS[stepIndex + 1]!.id) : onClose()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            {canNext ? (
              <>Next <ChevronRight className="h-3.5 w-3.5" /></>
            ) : (
              <>Done <CheckCircle2 className="h-3.5 w-3.5" /></>
            )}
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ─── Step 1: Model Overview ─────────────────────────

function StepOverview({ model, study }: { model: StudyFinancialModel; study: Study }) {
  const archetype = getArchetype(model.archetype);

  return (
    <div className="space-y-6">
      {/* Quick summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard
          label="Per Patient (Modeled)"
          value={formatRangeCurrency(model.perPatientRange)}
          sub="/ enrolled patient"
          color="emerald"
        />
        <SummaryCard
          label="Startup Package"
          value={formatRangeCurrency(model.startupRange)}
          sub="site activation"
          color="blue"
        />
        <SummaryCard
          label="Operational Burden"
          value={model.burdenScore.overall.replace("_", " ")}
          sub={`Score: ${model.burdenScore.operational}/100`}
          color={model.burdenScore.overall === "low" ? "emerald" : model.burdenScore.overall === "medium" ? "amber" : "red"}
        />
        <SummaryCard
          label="Screen-Fail Risk"
          value={model.screenFailRisk}
          sub={`${archetype.screenFailRangePercent[0]}–${archetype.screenFailRangePercent[1]}%`}
          color={model.screenFailRisk === "low" ? "emerald" : model.screenFailRisk === "medium" ? "amber" : "red"}
        />
      </div>

      {/* Archetype & methodology */}
      <div className="rounded-xl border border-edge-2 bg-surface-1 p-4">
        <h3 className="text-[12px] font-bold text-body">Study Archetype</h3>
        <div className="mt-2 flex items-center gap-3">
          <span className="rounded-lg bg-indigo-500/12 px-3 py-1 text-[12px] font-semibold text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/20">
            {archetype.label}
          </span>
          <span className="text-[12px] text-dim">{archetype.category}</span>
          <span className="text-[12px] text-dim">|</span>
          <span className="text-[12px] text-dim">{study.phase}</span>
          <span className="text-[12px] text-dim">|</span>
          <span className="text-[12px] text-dim">{study.therapeuticArea}</span>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-dim">{model.methodology}</p>
      </div>

      {/* Visit model */}
      <div className="rounded-xl border border-edge-2 bg-surface-1 p-4">
        <h3 className="text-[12px] font-bold text-body">Visit Structure</h3>
        <div className="mt-3 grid grid-cols-5 gap-3">
          {[
            { label: "Screening", value: model.visitModel.screeningVisits },
            { label: "Treatment", value: model.visitModel.treatmentVisits },
            { label: "Follow-Up", value: model.visitModel.followUpVisits },
            { label: "Total", value: model.visitModel.totalVisits },
            { label: "Duration", value: `${model.visitModel.estimatedDurationMonths}mo` },
          ].map((v) => (
            <div key={v.label} className="rounded-lg bg-surface-2 p-2.5 text-center ring-1 ring-edge-1">
              <p className="text-[12px] text-dim">{v.label}</p>
              <p className="text-[16px] font-bold text-body">{v.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-dim">Cadence: {model.visitModel.visitCadence}</p>
      </div>

      {/* Burden detail */}
      <div className="rounded-xl border border-edge-2 bg-surface-1 p-4">
        <h3 className="text-[12px] font-bold text-body">Burden Analysis</h3>
        <div className="mt-3 space-y-2">
          {Object.entries(model.burdenScore.details).map(([key, val]) => (
            <BurdenBar key={key} label={key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} value={val as number} />
          ))}
        </div>
      </div>

      {/* Revenue drivers preview */}
      <div className="rounded-xl border border-edge-2 bg-surface-1 p-4">
        <h3 className="text-[12px] font-bold text-body">
          Modeled Revenue Drivers ({model.revenueDrivers.length} line items)
        </h3>
        <div className="mt-3 max-h-48 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-edge-2 text-left text-[12px] font-semibold uppercase tracking-wider text-dim">
                <th className="pb-2 pr-4">Procedure</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4 text-right">Unit Value</th>
                <th className="pb-2 pr-4 text-right">Qty</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {model.revenueDrivers.map((d, i) => (
                <tr key={i} className="border-b border-edge-1">
                  <td className="py-1.5 pr-4 text-body">{d.label}</td>
                  <td className="py-1.5 pr-4 text-dim capitalize">{d.category.replace("_", " ")}</td>
                  <td className="py-1.5 pr-4 text-right text-dim">{formatCurrency(d.unitValueCents)}</td>
                  <td className="py-1.5 pr-4 text-right text-dim">{d.quantity}</td>
                  <td className="py-1.5 text-right font-medium text-emerald-400">{formatCurrency(d.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Site Assumptions ─────────────────────────

function StepAssumptions({
  assumptions,
  model,
  onUpdate,
}: {
  assumptions: SiteAssumptions;
  model: StudyFinancialModel;
  onUpdate: <K extends keyof SiteAssumptions>(key: K, value: SiteAssumptions[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-300">Adjust to your site&apos;s economics</p>
            <p className="mt-1 text-[12px] text-amber-800/80 dark:text-amber-400/70">
              These defaults are based on industry benchmarks. Updating them with your actual rates
              will improve estimate accuracy and shift confidence from Low/Medium to High.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Staffing */}
        <div className="rounded-xl border border-edge-2 bg-surface-1 p-4">
          <h3 className="flex items-center gap-2 text-[12px] font-bold text-body">
            <Users className="h-3.5 w-3.5 text-blue-400" />
            Staffing Rates
          </h3>
          <div className="mt-4 space-y-4">
            <AssumptionInput
              label="Coordinator Hourly Rate"
              valueCents={assumptions.coordinatorHourlyRateCents}
              onChange={(v) => onUpdate("coordinatorHourlyRateCents", v)}
              prefix="$"
              suffix="/hr"
            />
            <AssumptionInput
              label="PI Hourly Rate"
              valueCents={assumptions.piHourlyRateCents}
              onChange={(v) => onUpdate("piHourlyRateCents", v)}
              prefix="$"
              suffix="/hr"
            />
            <AssumptionInput
              label="Nurse Hourly Rate"
              valueCents={assumptions.nurseHourlyRateCents}
              onChange={(v) => onUpdate("nurseHourlyRateCents", v)}
              prefix="$"
              suffix="/hr"
            />
          </div>
        </div>

        {/* Operations */}
        <div className="rounded-xl border border-edge-2 bg-surface-1 p-4">
          <h3 className="flex items-center gap-2 text-[12px] font-bold text-body">
            <Building2 className="h-3.5 w-3.5 text-purple-400" />
            Operational Costs
          </h3>
          <div className="mt-4 space-y-4">
            <AssumptionSlider
              label="Overhead %"
              value={assumptions.overheadPercent}
              min={10}
              max={60}
              onChange={(v) => onUpdate("overheadPercent", v)}
              suffix="%"
            />
            <AssumptionSlider
              label="Regulatory Startup Hours"
              value={assumptions.regulatoryStartupHours}
              min={10}
              max={120}
              onChange={(v) => onUpdate("regulatoryStartupHours", v)}
              suffix=" hrs"
            />
            <AssumptionInput
              label="Pharmacy Handling / Visit"
              valueCents={assumptions.pharmacyHandlingCents}
              onChange={(v) => onUpdate("pharmacyHandlingCents", v)}
              prefix="$"
              suffix=""
            />
          </div>
        </div>

        {/* Enrollment */}
        <div className="rounded-xl border border-edge-2 bg-surface-1 p-4">
          <h3 className="flex items-center gap-2 text-[12px] font-bold text-body">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            Enrollment Assumptions
          </h3>
          <div className="mt-4 space-y-4">
            <AssumptionSlider
              label="Target Enrollment"
              value={assumptions.enrollmentTarget}
              min={1}
              max={50}
              onChange={(v) => onUpdate("enrollmentTarget", v)}
              suffix=" patients"
            />
            <AssumptionSlider
              label="Screen Failure Rate"
              value={assumptions.screenFailRatePercent}
              min={5}
              max={70}
              onChange={(v) => onUpdate("screenFailRatePercent", v)}
              suffix="%"
            />
            <AssumptionSlider
              label="Expected Completion Rate"
              value={assumptions.expectedCompletionPercent}
              min={50}
              max={99}
              onChange={(v) => onUpdate("expectedCompletionPercent", v)}
              suffix="%"
            />
          </div>
        </div>

        {/* Pass-through */}
        <div className="rounded-xl border border-edge-2 bg-surface-1 p-4">
          <h3 className="flex items-center gap-2 text-[12px] font-bold text-body">
            <DollarSign className="h-3.5 w-3.5 text-amber-400" />
            Markup & Pass-Through
          </h3>
          <div className="mt-4 space-y-4">
            <AssumptionSlider
              label="Lab Markup"
              value={assumptions.labMarkupPercent}
              min={0}
              max={50}
              onChange={(v) => onUpdate("labMarkupPercent", v)}
              suffix="%"
            />
            <AssumptionSlider
              label="Imaging Markup"
              value={assumptions.imagingMarkupPercent}
              min={0}
              max={50}
              onChange={(v) => onUpdate("imagingMarkupPercent", v)}
              suffix="%"
            />
          </div>
        </div>
      </div>

      {/* Live recalculated summary */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
        <h3 className="text-[12px] font-bold text-indigo-700 dark:text-indigo-300">Live Recalculated Estimate</h3>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <p className="text-[12px] text-indigo-700/80 dark:text-indigo-400/60">Per Patient (Net)</p>
            <p className="text-[18px] font-black text-indigo-700 dark:text-indigo-300">
              {formatCurrency(model.scenarioOutputs.base.perPatientNetCents)}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-indigo-700/80 dark:text-indigo-400/60">Total Net Contribution</p>
            <p className="text-[18px] font-black text-indigo-700 dark:text-indigo-300">
              {formatCurrency(model.scenarioOutputs.base.totalNetContributionCents)}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-indigo-700/80 dark:text-indigo-400/60">Break-Even at</p>
            <p className="text-[18px] font-black text-indigo-700 dark:text-indigo-300">
              {model.scenarioOutputs.base.breakEvenEnrollment} patients
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Financial Outputs ─────────────────────────

function StepOutputs({ model, assumptions }: { model: StudyFinancialModel; assumptions: SiteAssumptions }) {
  const scenarios = model.scenarioOutputs;

  return (
    <div className="space-y-6">
      {/* Three scenario columns */}
      <div className="grid grid-cols-3 gap-4">
        <ScenarioCard scenario={scenarios.conservative} color="amber" />
        <ScenarioCard scenario={scenarios.base} color="indigo" highlight />
        <ScenarioCard scenario={scenarios.optimistic} color="emerald" />
      </div>

      {/* Per-patient waterfall */}
      <div className="rounded-xl border border-edge-2 bg-surface-1 p-4">
        <h3 className="text-[12px] font-bold text-body">Per-Patient Contribution Waterfall (Base Case)</h3>
        <div className="mt-4 space-y-2">
          <WaterfallRow label="Gross Procedure Revenue" value={scenarios.base.perPatientGrossCents} positive />
          <WaterfallRow
            label={`Staff Cost (Coord + PI + Nursing)`}
            value={Math.round(model.costDrivers.reduce((s, d) => s + d.estimatedCostCents, 0))}
            positive={false}
          />
          <WaterfallRow
            label={`Overhead (${assumptions.overheadPercent}%)`}
            value={Math.round(model.costDrivers.reduce((s, d) => s + d.estimatedCostCents, 0) * assumptions.overheadPercent / 100)}
            positive={false}
          />
          <div className="border-t border-edge-3 pt-2">
            <WaterfallRow
              label="Net Contribution / Patient"
              value={scenarios.base.perPatientNetCents}
              positive={scenarios.base.perPatientNetCents > 0}
              bold
            />
          </div>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="rounded-xl border border-edge-2 bg-surface-1 p-4">
        <h3 className="text-[12px] font-bold text-body">Staffing Hours (Base Case)</h3>
        <div className="mt-3 max-h-40 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-edge-2 text-left text-[12px] font-semibold uppercase tracking-wider text-dim">
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4 text-right">Hrs/Visit</th>
                <th className="pb-2 pr-4 text-right">Visits</th>
                <th className="pb-2 pr-4 text-right">Total Hrs</th>
                <th className="pb-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {model.costDrivers.map((d, i) => (
                <tr key={i} className="border-b border-edge-1">
                  <td className="py-1.5 pr-4 text-body">{d.label}</td>
                  <td className="py-1.5 pr-4 text-right text-dim">{d.hoursPerUnit.toFixed(1)}</td>
                  <td className="py-1.5 pr-4 text-right text-dim">{d.quantity}</td>
                  <td className="py-1.5 pr-4 text-right text-dim">{d.totalHours.toFixed(0)}</td>
                  <td className="py-1.5 text-right font-medium text-red-400">{formatCurrency(d.estimatedCostCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Startup economics */}
      <div className="rounded-xl border border-edge-2 bg-surface-1 p-4">
        <h3 className="text-[12px] font-bold text-body">Startup Economics</h3>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <p className="text-[12px] text-dim">Startup Revenue</p>
            <p className="text-[15px] font-bold text-emerald-400">{formatCurrency(scenarios.base.startupRevenueCents)}</p>
          </div>
          <div>
            <p className="text-[12px] text-dim">Startup Cost (est.)</p>
            <p className="text-[15px] font-bold text-red-400">{formatCurrency(scenarios.base.startupCostCents)}</p>
          </div>
          <div>
            <p className="text-[12px] text-dim">Net Startup</p>
            <p className={`text-[15px] font-bold ${scenarios.base.startupRevenueCents - scenarios.base.startupCostCents >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatCurrency(scenarios.base.startupRevenueCents - scenarios.base.startupCostCents)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Line-Item Tuning ─────────────────────────

function StepTuning({
  model,
  assumptions,
  onOverride,
}: {
  model: StudyFinancialModel;
  assumptions: SiteAssumptions;
  onOverride: (label: string, cents: number) => void;
}) {
  const categories = useMemo(() => {
    const map = new Map<string, RevenueDriver[]>();
    for (const d of model.revenueDrivers) {
      const existing = map.get(d.category);
      if (existing) existing.push(d);
      else map.set(d.category, [d]);
    }
    return map;
  }, [model.revenueDrivers]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div>
            <p className="text-[12px] font-semibold text-blue-700 dark:text-blue-300">Override individual line items</p>
            <p className="mt-1 text-[12px] text-blue-800/80 dark:text-blue-400/70">
              Click any unit value to enter your negotiated rate. Overrides are highlighted in blue
              and recalculate all outputs in real-time.
            </p>
          </div>
        </div>
      </div>

      {Array.from(categories.entries()).map(([category, drivers]) => (
        <div key={category} className="rounded-xl border border-edge-2 bg-surface-1 p-4">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-dim">
            {category.replace("_", " ")}
          </h3>
          <div className="mt-3 space-y-1">
            {drivers.map((d, i) => {
              const isOverridden = assumptions.siteOverrides[d.label] !== undefined;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 transition-colors ${
                    isOverridden ? "bg-blue-500/8 ring-1 ring-blue-500/15" : "hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] text-body">{d.label}</span>
                    {isOverridden && (
                      <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold text-blue-400 ring-1 ring-blue-500/30">
                        OVERRIDE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[12px] text-dim">×{d.quantity}</span>
                    <EditableValue
                      valueCents={d.unitValueCents}
                      onChange={(v) => onOverride(d.label, v)}
                    />
                    <span className="w-20 text-right text-[12px] font-medium text-emerald-400">
                      {formatCurrency(d.totalCents)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-end border-t border-edge-1 pt-2">
            <span className="text-[12px] font-semibold text-emerald-400">
              Subtotal: {formatCurrency(drivers.reduce((s, d) => s + d.totalCents, 0))}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Shared Sub-Components ─────────────────────────

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-500/8 ring-emerald-500/15 text-emerald-400",
    blue: "bg-blue-500/8 ring-blue-500/15 text-blue-400",
    amber: "bg-amber-500/8 ring-amber-500/15 text-amber-400",
    red: "bg-red-500/8 ring-red-500/15 text-red-400",
    purple: "bg-purple-500/8 ring-purple-500/15 text-purple-400",
  };
  return (
    <div className={`rounded-xl p-3.5 ring-1 ${colors[color] ?? colors.blue}`}>
      <p className="text-[12px] font-medium text-body">{label}</p>
      <p className="mt-1 text-[18px] font-black capitalize">{value}</p>
      <p className="text-[12px] text-dim">{sub}</p>
    </div>
  );
}

function BurdenBar({ label, value }: { label: string; value: number }) {
  const color = value < 30 ? "bg-emerald-500" : value < 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 text-[12px] text-dim">{label}</span>
      <div className="flex-1 rounded-full bg-surface-3 h-2">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-8 text-right text-[12px] font-medium text-dim">{value}</span>
    </div>
  );
}

function ScenarioCard({ scenario, color, highlight }: { scenario: ScenarioCase; color: string; highlight?: boolean }) {
  const ringColor = highlight ? "ring-indigo-500/30 border-indigo-500/20" : "ring-edge-2 border-edge-2";
  const colors: Record<string, string> = { amber: "text-amber-400", indigo: "text-indigo-300", emerald: "text-emerald-400" };
  const textColor = colors[color] ?? "text-body";

  return (
    <div className={`rounded-xl border p-4 ${ringColor} ring-1 ${highlight ? "bg-indigo-500/5" : "bg-surface-1"}`}>
      <h4 className={`text-[12px] font-bold ${textColor}`}>{scenario.label}</h4>
      <div className="mt-3 space-y-2.5">
        <div>
          <p className="text-[12px] text-dim">Gross / Patient</p>
          <p className={`text-[16px] font-black ${textColor}`}>{formatCurrency(scenario.perPatientGrossCents)}</p>
        </div>
        <div>
          <p className="text-[12px] text-dim">Net / Patient</p>
          <p className={`text-[14px] font-bold ${scenario.perPatientNetCents >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {formatCurrency(scenario.perPatientNetCents)}
          </p>
        </div>
        <hr className="border-edge-2" />
        <div>
          <p className="text-[12px] text-dim">Total Net</p>
          <p className={`text-[16px] font-black ${scenario.totalNetContributionCents >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {formatCurrency(scenario.totalNetContributionCents)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div>
            <p className="text-dim">Enrollment</p>
            <p className="font-semibold text-body">{scenario.enrollmentCount}</p>
          </div>
          <div>
            <p className="text-dim">Screen-Fail</p>
            <p className="font-semibold text-body">{scenario.screenFailRate}%</p>
          </div>
          <div>
            <p className="text-dim">Completion</p>
            <p className="font-semibold text-body">{scenario.completionRate}%</p>
          </div>
          <div>
            <p className="text-dim">Break-Even</p>
            <p className="font-semibold text-body">{scenario.breakEvenEnrollment} pts</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WaterfallRow({ label, value, positive, bold }: { label: string; value: number; positive: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[12px] ${bold ? "font-bold text-body" : "text-dim"}`}>{label}</span>
      <span className={`text-[13px] tabular-nums ${bold ? "font-black" : "font-semibold"} ${positive ? "text-emerald-400" : "text-red-400"}`}>
        {positive ? "+" : "−"}{formatCurrency(Math.abs(value))}
      </span>
    </div>
  );
}

function AssumptionInput({
  label,
  valueCents,
  onChange,
  prefix,
  suffix,
}: {
  label: string;
  valueCents: number;
  onChange: (cents: number) => void;
  prefix?: string;
  suffix?: string;
}) {
  const dollars = valueCents / 100;
  return (
    <div>
      <label className="mb-1 block text-[12px] font-medium text-dim">{label}</label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-[12px] text-dim">{prefix}</span>}
        <input
          type="number"
          value={dollars}
          onChange={(e) => onChange(Math.round(parseFloat(e.target.value || "0") * 100))}
          className="w-24 rounded-md border border-edge-3 bg-surface-2 px-2 py-1.5 text-[12px] text-body focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
        />
        {suffix && <span className="text-[12px] text-dim">{suffix}</span>}
      </div>
    </div>
  );
}

function AssumptionSlider({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[12px] font-medium text-dim">{label}</label>
        <span className="text-[12px] font-semibold text-body">
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-indigo-500 h-1.5 rounded-full appearance-none bg-surface-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:shadow-md"
      />
    </div>
  );
}

function EditableValue({ valueCents, onChange }: { valueCents: number; onChange: (cents: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(valueCents / 100));

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onChange(Math.round(parseFloat(draft || "0") * 100));
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onChange(Math.round(parseFloat(draft || "0") * 100));
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-20 rounded border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-right text-[12px] text-indigo-300 outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(String(valueCents / 100)); setEditing(true); }}
      className="w-20 rounded px-2 py-0.5 text-right text-[12px] text-body transition-colors hover:bg-surface-3 hover:text-heading"
      title="Click to override"
    >
      {formatCurrency(valueCents)}
    </button>
  );
}
