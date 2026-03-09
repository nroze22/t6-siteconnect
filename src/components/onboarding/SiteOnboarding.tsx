import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  FlaskConical,
  Users,
  DollarSign,
  Database,
  Target,
  Settings,
  CheckCircle2,
  GripVertical,
  Shield,
} from "lucide-react";
import { useSiteProfileStore } from "@/stores/use-site-profile-store";
import {
  THERAPEUTIC_AREAS,
  STUDY_PHASES,
  EHR_SYSTEMS,
  DECLINE_REASONS,
  type RankingFactor,
  type StudyTypePreference,
  type RecruitmentChannel,
  type ExportType,
  type DataDomain,
  type UserRole,
  type OutputType,
} from "@/types/site-profile";

interface SiteOnboardingProps {
  onComplete: () => void;
}

const STEPS = [
  { id: "research", label: "Research Program", icon: FlaskConical, color: "text-blue-400" },
  { id: "capacity", label: "Team & Capacity", icon: Users, color: "text-purple-400" },
  { id: "financials", label: "Financial Defaults", icon: DollarSign, color: "text-emerald-400" },
  { id: "data", label: "Data & Systems", icon: Database, color: "text-cyan-400" },
  { id: "preferences", label: "Study Evaluation", icon: Target, color: "text-amber-400" },
  { id: "workspace", label: "Workspace Setup", icon: Settings, color: "text-indigo-400" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function SiteOnboarding({ onComplete }: SiteOnboardingProps) {
  const [step, setStep] = useState<StepId>("research");
  const store = useSiteProfileStore();
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      store.completeOnboarding();
      onComplete();
    } else {
      const nextStep = STEPS[stepIndex + 1];
      if (nextStep) setStep(nextStep.id);
    }
  }, [isLast, stepIndex, store, onComplete]);

  const handleBack = useCallback(() => {
    if (!isFirst) {
      const prevStep = STEPS[stepIndex - 1];
      if (prevStep) setStep(prevStep.id);
    }
  }, [isFirst, stepIndex]);

  const handleSkip = useCallback(() => {
    store.completeOnboarding();
    onComplete();
  }, [store, onComplete]);

  const completionPercent = Math.round(((stepIndex + 1) / STEPS.length) * 100);

  return (
    <div className="dark-always fixed inset-0 z-[100] flex items-center justify-center bg-[#080b12]">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-2xl">
        {/* Top bar — progress */}
        <div className="mb-6 flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <img src="/t6logo.png" alt="Talosix" className="h-8 w-8 rounded-lg object-contain" />
            <div>
              <h1 className="text-[15px] font-bold text-white">Tune Your Engine</h1>
              <p className="text-[12px] text-slate-400">Help SiteConnect understand your research program</p>
            </div>
          </div>
          <button
            onClick={handleSkip}
            className="rounded-lg px-3 py-1.5 text-[12px] text-slate-400 transition-colors hover:text-slate-200"
          >
            Skip for now
          </button>
        </div>

        {/* Step indicators */}
        <div className="mb-4 flex items-center gap-1 px-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isCurrent = s.id === step;
            const isPast = i < stepIndex;
            return (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className={`group flex flex-1 items-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-medium transition-all ${
                  isCurrent
                    ? "bg-white/[0.06] text-white ring-1 ring-white/[0.1]"
                    : isPast
                      ? "text-emerald-400/70 hover:bg-white/[0.03]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                }`}
              >
                {isPast ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                ) : (
                  <Icon className={`h-3 w-3 shrink-0 ${isCurrent ? s.color : ""}`} />
                )}
                <span className="hidden lg:inline truncate">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="mb-6 h-1 rounded-full bg-white/[0.06] mx-2">
          <motion.div
            className="h-1 rounded-full bg-gradient-to-r from-indigo-500 to-blue-500"
            initial={{ width: 0 }}
            animate={{ width: `${completionPercent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Content card */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#111318]/95 shadow-2xl shadow-black/40 backdrop-blur-sm overflow-hidden">
          <div className="max-h-[55vh] overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
              >
                {step === "research" && <StepResearch />}
                {step === "capacity" && <StepCapacity />}
                {step === "financials" && <StepFinancials />}
                {step === "data" && <StepData />}
                {step === "preferences" && <StepPreferences />}
                {step === "workspace" && <StepWorkspace />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4">
            <div>
              {!isFirst && (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-400 hover:bg-white/[0.04] hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[12px] text-slate-400">
                Step {stepIndex + 1} of {STEPS.length}
              </span>
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 rounded-lg bg-white px-5 py-2.5 text-[13px] font-semibold text-[#111318] transition-all hover:bg-slate-200"
              >
                {isLast ? "Launch SiteConnect" : "Continue"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Security footer */}
        <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-400">
          <Shield className="h-3 w-3" />
          <span>All preferences stored locally. Nothing leaves this device.</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 1: Research Program
// ═══════════════════════════════════════════════════════════════

function StepResearch() {
  const { profile, updateResearch } = useSiteProfileStore();
  const r = profile.research;

  return (
    <div className="space-y-5">
      <StepHeader
        title="About Your Research Program"
        subtitle="We use this to match you with relevant trials and filter out ones that don't fit your expertise."
      />

      <Field label="Site Name">
        <input
          value={r.siteName}
          onChange={(e) => updateResearch({ siteName: e.target.value })}
          placeholder="e.g., Midwest Clinical Research Center"
          className="input-field"
        />
      </Field>

      <Field label="Site Type">
        <div className="flex gap-2">
          {([
            { value: "single_site", label: "Single Site" },
            { value: "multi_site_group", label: "Multi-Site Group" },
            { value: "health_system", label: "Hospital / Health System" },
          ] as const).map((opt) => (
            <ToggleChip
              key={opt.value}
              label={opt.label}
              selected={r.siteType === opt.value}
              onClick={() => updateResearch({ siteType: opt.value })}
            />
          ))}
        </div>
      </Field>

      <Field label="Therapeutic Areas You Currently Run" hint="Select all that apply">
        <ChipGrid
          options={THERAPEUTIC_AREAS as unknown as string[]}
          selected={r.activeTherapeuticAreas}
          onChange={(v) => updateResearch({ activeTherapeuticAreas: v })}
        />
      </Field>

      <Field label="Areas You Want to Grow Into" hint="Optional — helps us surface opportunities">
        <ChipGrid
          options={THERAPEUTIC_AREAS.filter((ta) => !r.activeTherapeuticAreas.includes(ta)) as unknown as string[]}
          selected={r.growthTherapeuticAreas}
          onChange={(v) => updateResearch({ growthTherapeuticAreas: v })}
        />
      </Field>

      <Field label="Study Types You Accept">
        <div className="flex flex-wrap gap-2">
          {([
            { value: "drug", label: "Drug" },
            { value: "device", label: "Device" },
            { value: "observational", label: "Observational" },
            { value: "registry", label: "Registry" },
            { value: "investigator_initiated", label: "Investigator-Initiated" },
          ] as { value: StudyTypePreference; label: string }[]).map((opt) => (
            <ToggleChip
              key={opt.value}
              label={opt.label}
              selected={r.studyTypes.includes(opt.value)}
              onClick={() => {
                const next = r.studyTypes.includes(opt.value)
                  ? r.studyTypes.filter((t) => t !== opt.value)
                  : [...r.studyTypes, opt.value];
                updateResearch({ studyTypes: next });
              }}
            />
          ))}
        </div>
      </Field>

      <Field label="Phases You Accept">
        <div className="flex flex-wrap gap-2">
          {STUDY_PHASES.map((phase) => (
            <ToggleChip
              key={phase}
              label={phase}
              selected={r.acceptedPhases.includes(phase)}
              onClick={() => {
                const next = r.acceptedPhases.includes(phase)
                  ? r.acceptedPhases.filter((p) => p !== phase)
                  : [...r.acceptedPhases, phase];
                updateResearch({ acceptedPhases: next });
              }}
            />
          ))}
        </div>
      </Field>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 2: Team & Capacity
// ═══════════════════════════════════════════════════════════════

function StepCapacity() {
  const { profile, updateOperations } = useSiteProfileStore();
  const ops = profile.operations;

  return (
    <div className="space-y-5">
      <StepHeader
        title="Team & Operational Capacity"
        subtitle="Your staffing and capabilities determine which studies are a realistic fit — we'll flag studies that would overload your team."
      />

      <div className="grid grid-cols-2 gap-4">
        <Field label="Active Coordinators">
          <NumberInput value={ops.coordinatorCount} onChange={(v) => updateOperations({ coordinatorCount: v })} min={0} max={50} />
        </Field>
        <Field label="Full-Time Equivalent">
          <NumberInput value={ops.coordinatorsFTE} onChange={(v) => updateOperations({ coordinatorsFTE: v })} min={0} max={50} step={0.5} />
        </Field>
        <Field label="PIs / Sub-Is">
          <NumberInput value={ops.piCount} onChange={(v) => updateOperations({ piCount: v })} min={0} max={20} />
        </Field>
        <Field label="New Studies / Quarter">
          <NumberInput value={ops.newStudiesPerQuarter} onChange={(v) => updateOperations({ newStudiesPerQuarter: v })} min={0} max={20} />
        </Field>
        <Field label="Max Active Studies">
          <NumberInput value={ops.maxActiveStudies} onChange={(v) => updateOperations({ maxActiveStudies: v })} min={1} max={50} />
        </Field>
      </div>

      <Field label="Dedicated Staff">
        <div className="flex flex-wrap gap-2">
          <ToggleChip label="Regulatory" selected={ops.hasDedicatedRegulatory} onClick={() => updateOperations({ hasDedicatedRegulatory: !ops.hasDedicatedRegulatory })} />
          <ToggleChip label="Recruitment" selected={ops.hasDedicatedRecruitment} onClick={() => updateOperations({ hasDedicatedRecruitment: !ops.hasDedicatedRecruitment })} />
        </div>
      </Field>

      <Field label="Site Capabilities">
        <div className="flex flex-wrap gap-2">
          <ToggleChip label="In-House Lab" selected={ops.hasInHouseLab} onClick={() => updateOperations({ hasInHouseLab: !ops.hasInHouseLab })} />
          <ToggleChip label="In-House Pharmacy" selected={ops.hasInHousePharmacy} onClick={() => updateOperations({ hasInHousePharmacy: !ops.hasInHousePharmacy })} />
          <ToggleChip label="Imaging Support" selected={ops.hasImagingSupport} onClick={() => updateOperations({ hasImagingSupport: !ops.hasImagingSupport })} />
          <ToggleChip label="Infusion Center" selected={ops.hasInfusionCapability} onClick={() => updateOperations({ hasInfusionCapability: !ops.hasInfusionCapability })} />
          <ToggleChip label="Inpatient Beds" selected={ops.hasInpatientCapability} onClick={() => updateOperations({ hasInpatientCapability: !ops.hasInpatientCapability })} />
        </div>
      </Field>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 3: Financial Defaults
// ═══════════════════════════════════════════════════════════════

function StepFinancials() {
  const { profile, updateFinancials } = useSiteProfileStore();
  const fin = profile.financials;

  return (
    <div className="space-y-5">
      <StepHeader
        title="Financial Defaults"
        subtitle="Your actual costs let us calculate real margins instead of industry averages. You can adjust these anytime in Settings."
      />

      <div className="rounded-lg bg-emerald-500/5 p-3 ring-1 ring-emerald-500/15">
        <p className="text-[12px] text-emerald-300/90 leading-relaxed">
          <span className="font-semibold">Why this matters:</span> Without your rates, every financial estimate is generic. With them, the engine models real P&L from day one.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Coordinator Hourly Rate">
          <CurrencyInput valueCents={fin.coordinatorHourlyRateCents} onChange={(v) => updateFinancials({ coordinatorHourlyRateCents: v })} suffix="/hr" />
        </Field>
        <Field label="PI Hourly Rate">
          <CurrencyInput valueCents={fin.piHourlyRateCents} onChange={(v) => updateFinancials({ piHourlyRateCents: v })} suffix="/hr" />
        </Field>
        <Field label="Regulatory/Admin Rate">
          <CurrencyInput valueCents={fin.regulatoryHourlyRateCents} onChange={(v) => updateFinancials({ regulatoryHourlyRateCents: v })} suffix="/hr" />
        </Field>
        <Field label="Nurse Hourly Rate">
          <CurrencyInput valueCents={fin.nurseHourlyRateCents} onChange={(v) => updateFinancials({ nurseHourlyRateCents: v })} suffix="/hr" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Overhead %">
          <SliderInput value={fin.overheadPercent} min={5} max={60} onChange={(v) => updateFinancials({ overheadPercent: v })} suffix="%" />
        </Field>
        <Field label="Minimum Attractive Margin">
          <SliderInput value={fin.minimumMarginPercent} min={0} max={50} onChange={(v) => updateFinancials({ minimumMarginPercent: v })} suffix="%" />
        </Field>
        <Field label="Default Screen-Fail Rate">
          <SliderInput value={fin.defaultScreenFailPercent} min={5} max={70} onChange={(v) => updateFinancials({ defaultScreenFailPercent: v })} suffix="%" />
        </Field>
        <Field label="Default Completion Rate">
          <SliderInput value={fin.defaultCompletionPercent} min={50} max={99} onChange={(v) => updateFinancials({ defaultCompletionPercent: v })} suffix="%" />
        </Field>
      </div>

      <Field label="Modeling Preferences">
        <div className="flex flex-wrap gap-2">
          <ToggleChip label="Include fringe/benefits in hourly costs" selected={fin.includeFringeBenefits} onClick={() => updateFinancials({ includeFringeBenefits: !fin.includeFringeBenefits })} />
          <ToggleChip label="Require startup fees" selected={fin.requireStartupFees} onClick={() => updateFinancials({ requireStartupFees: !fin.requireStartupFees })} />
          <ToggleChip label="Expect screen-fail reimbursement" selected={fin.expectScreenFailReimbursement} onClick={() => updateFinancials({ expectScreenFailReimbursement: !fin.expectScreenFailReimbursement })} />
          <ToggleChip label="Show 3 scenarios (conservative/base/optimistic)" selected={fin.showScenarios} onClick={() => updateFinancials({ showScenarios: !fin.showScenarios })} />
        </div>
      </Field>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 4: Data & Systems
// ═══════════════════════════════════════════════════════════════

function StepData() {
  const { profile, updateDataReadiness } = useSiteProfileStore();
  const data = profile.dataReadiness;

  return (
    <div className="space-y-5">
      <StepHeader
        title="Data & Systems"
        subtitle="Knowing your EHR setup helps us configure patient screening imports and auto-detect compatible data formats."
      />

      <Field label="EHR / EMR System">
        <select
          value={data.ehrSystem}
          onChange={(e) => updateDataReadiness({ ehrSystem: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-[#1a1f2e] px-3 py-2.5 text-[13px] text-slate-200 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 appearance-none cursor-pointer"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
        >
          <option value="">Select your EHR...</option>
          {EHR_SYSTEMS.map((ehr) => (
            <option key={ehr} value={ehr}>{ehr}</option>
          ))}
        </select>
      </Field>

      <Field label="Can you export data directly?">
        <div className="flex gap-2">
          <ToggleChip label="Yes" selected={data.canExportDirectly} onClick={() => updateDataReadiness({ canExportDirectly: true })} />
          <ToggleChip label="Not yet" selected={!data.canExportDirectly} onClick={() => updateDataReadiness({ canExportDirectly: false })} />
        </div>
      </Field>

      <Field label="Export Formats Available">
        <div className="flex flex-wrap gap-2">
          {([
            { value: "csv", label: "CSV" },
            { value: "excel", label: "Excel" },
            { value: "report", label: "Report Export" },
            { value: "flat_file", label: "Flat File" },
            { value: "fhir", label: "FHIR" },
            { value: "hl7", label: "HL7" },
          ] as { value: ExportType; label: string }[]).map((opt) => (
            <ToggleChip
              key={opt.value}
              label={opt.label}
              selected={data.exportTypes.includes(opt.value)}
              onClick={() => {
                const next = data.exportTypes.includes(opt.value)
                  ? data.exportTypes.filter((t) => t !== opt.value)
                  : [...data.exportTypes, opt.value];
                updateDataReadiness({ exportTypes: next });
              }}
            />
          ))}
        </div>
      </Field>

      <Field label="Data Domains You Can Export" hint="Which clinical data is available?">
        <div className="flex flex-wrap gap-2">
          {([
            { value: "demographics", label: "Demographics" },
            { value: "diagnoses", label: "Diagnoses / ICD-10" },
            { value: "medications", label: "Medications" },
            { value: "labs", label: "Lab Results" },
            { value: "encounters", label: "Encounters" },
            { value: "providers", label: "Providers" },
            { value: "locations", label: "Locations" },
          ] as { value: DataDomain; label: string }[]).map((opt) => (
            <ToggleChip
              key={opt.value}
              label={opt.label}
              selected={data.availableDomains.includes(opt.value)}
              onClick={() => {
                const next = data.availableDomains.includes(opt.value)
                  ? data.availableDomains.filter((d) => d !== opt.value)
                  : [...data.availableDomains, opt.value];
                updateDataReadiness({ availableDomains: next });
              }}
            />
          ))}
        </div>
      </Field>

      <Field label="How Often Can You Refresh Exports?">
        <div className="flex flex-wrap gap-2">
          {([
            { value: "daily", label: "Daily" },
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" },
            { value: "ad_hoc", label: "Ad Hoc" },
          ] as const).map((opt) => (
            <ToggleChip
              key={opt.value}
              label={opt.label}
              selected={data.refreshFrequency === opt.value}
              onClick={() => updateDataReadiness({ refreshFrequency: opt.value })}
            />
          ))}
        </div>
      </Field>

      <Field label="Set Up Watch Folder Import?">
        <div className="flex gap-2">
          <ToggleChip label="Yes, auto-import from folder" selected={data.useWatchFolder} onClick={() => updateDataReadiness({ useWatchFolder: true })} />
          <ToggleChip label="No, manual imports only" selected={!data.useWatchFolder} onClick={() => updateDataReadiness({ useWatchFolder: false })} />
        </div>
      </Field>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 5: Study Evaluation
// ═══════════════════════════════════════════════════════════════

function StepPreferences() {
  const { profile, updatePreferences, updatePopulation } = useSiteProfileStore();
  const prefs = profile.preferences;
  const pop = profile.population;

  const rankingLabels: Record<RankingFactor, string> = {
    revenue: "Likely Revenue / Patient",
    low_burden: "Low Operational Burden",
    enrollment_potential: "High Enrollment Potential",
    sponsor_relationship: "Sponsor Relationship Value",
    therapeutic_alignment: "Therapeutic Alignment",
    short_duration: "Shorter Duration",
    low_startup_complexity: "Lower Startup Complexity",
  };

  const moveRanking = (factor: RankingFactor, direction: "up" | "down") => {
    const list = [...prefs.rankingFactors];
    const idx = list.indexOf(factor);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= list.length) return;
    [list[idx], list[newIdx]] = [list[newIdx]!, list[idx]!];
    updatePreferences({ rankingFactors: list });
  };

  return (
    <div className="space-y-5">
      <StepHeader
        title="How You Evaluate Studies"
        subtitle="Every site weighs trade-offs differently. This tunes the ranking engine so the best opportunities for you rise to the top."
      />

      <div className="rounded-xl bg-indigo-500/5 p-4 ring-1 ring-indigo-500/15">
        <p className="text-[12px] font-semibold text-indigo-300 mb-3">
          Rank what matters most when deciding to pursue a study:
        </p>
        <div className="space-y-1.5">
          {prefs.rankingFactors.map((factor, i) => (
            <div
              key={factor}
              className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.06]"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-400">
                {i + 1}
              </span>
              <GripVertical className="h-3 w-3 text-slate-400" />
              <span className="flex-1 text-[13px] text-slate-200">{rankingLabels[factor]}</span>
              <button
                onClick={() => moveRanking(factor, "up")}
                disabled={i === 0}
                className="rounded p-1 text-slate-400 hover:text-white disabled:opacity-20"
              >
                <ArrowLeft className="h-3 w-3 rotate-90" />
              </button>
              <button
                onClick={() => moveRanking(factor, "down")}
                disabled={i === prefs.rankingFactors.length - 1}
                className="rounded p-1 text-slate-400 hover:text-white disabled:opacity-20"
              >
                <ArrowRight className="h-3 w-3 rotate-90" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <Field label="Study Complexity Preference">
        <div className="flex gap-2">
          {([
            { value: "easier_lower_yield", label: "Easier, lower yield" },
            { value: "balanced", label: "Balanced" },
            { value: "complex_higher_upside", label: "Complex, higher upside" },
          ] as const).map((opt) => (
            <ToggleChip
              key={opt.value}
              label={opt.label}
              selected={prefs.studyComplexityPreference === opt.value}
              onClick={() => updatePreferences({ studyComplexityPreference: opt.value })}
            />
          ))}
        </div>
      </Field>

      <Field label="Top Reasons You Decline Studies" hint="Select your most common">
        <ChipGrid
          options={DECLINE_REASONS as unknown as string[]}
          selected={prefs.topDeclineReasons}
          onChange={(v) => updatePreferences({ topDeclineReasons: v })}
        />
      </Field>

      <Field label="How Do You Recruit Patients?">
        <div className="flex flex-wrap gap-2">
          {([
            { value: "own_database", label: "Own Patient Database" },
            { value: "provider_referrals", label: "Provider Referrals" },
            { value: "community_outreach", label: "Community Outreach" },
            { value: "advertising", label: "Advertising" },
          ] as { value: RecruitmentChannel; label: string }[]).map((opt) => (
            <ToggleChip
              key={opt.value}
              label={opt.label}
              selected={pop.recruitmentChannels.includes(opt.value)}
              onClick={() => {
                const next = pop.recruitmentChannels.includes(opt.value)
                  ? pop.recruitmentChannels.filter((c) => c !== opt.value)
                  : [...pop.recruitmentChannels, opt.value];
                updatePopulation({ recruitmentChannels: next });
              }}
            />
          ))}
        </div>
      </Field>

      <Field label="Is Diversity a Strategic Priority?">
        <div className="flex gap-2">
          <ToggleChip label="Yes" selected={pop.diversityPriority} onClick={() => updatePopulation({ diversityPriority: true })} />
          <ToggleChip label="No" selected={!pop.diversityPriority} onClick={() => updatePopulation({ diversityPriority: false })} />
        </div>
      </Field>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 6: Workspace Setup
// ═══════════════════════════════════════════════════════════════

function StepWorkspace() {
  const { profile, updateWorkflow } = useSiteProfileStore();
  const wf = profile.workflow;

  return (
    <div className="space-y-5">
      <StepHeader
        title="Workspace & Output Preferences"
        subtitle="We'll optimize the layout and default exports based on who's using the app and what deliverables you need."
      />

      <Field label="Primary App Users">
        <div className="flex flex-wrap gap-2">
          {([
            { value: "coordinator", label: "Study Coordinator" },
            { value: "research_director", label: "Research Director" },
            { value: "feasibility_lead", label: "Feasibility Lead" },
            { value: "finance_admin", label: "Finance / Admin" },
            { value: "pi", label: "Principal Investigator" },
          ] as { value: UserRole; label: string }[]).map((opt) => (
            <ToggleChip
              key={opt.value}
              label={opt.label}
              selected={wf.primaryUsers.includes(opt.value)}
              onClick={() => {
                const next = wf.primaryUsers.includes(opt.value)
                  ? wf.primaryUsers.filter((u) => u !== opt.value)
                  : [...wf.primaryUsers, opt.value];
                updateWorkflow({ primaryUsers: next });
              }}
            />
          ))}
        </div>
      </Field>

      <Field label="Who Approves New Studies?">
        <input
          value={wf.studyApprover}
          onChange={(e) => updateWorkflow({ studyApprover: e.target.value })}
          placeholder="e.g., Research Director, PI Committee"
          className="input-field"
        />
      </Field>

      <Field label="Default Output Needs">
        <div className="flex flex-wrap gap-2">
          <ToggleChip label="Internal Review Packets" selected={wf.needsFinancePackets} onClick={() => updateWorkflow({ needsFinancePackets: !wf.needsFinancePackets })} />
          <ToggleChip label="Sponsor Feasibility Summaries" selected={wf.needsFeasibilitySummaries} onClick={() => updateWorkflow({ needsFeasibilitySummaries: !wf.needsFeasibilitySummaries })} />
          {([
            { value: "internal_review", label: "Internal Review" },
            { value: "sponsor_outreach", label: "Sponsor Outreach" },
            { value: "budget_negotiation", label: "Budget Negotiation Prep" },
          ] as { value: OutputType; label: string }[]).map((opt) => (
            <ToggleChip
              key={opt.value}
              label={opt.label}
              selected={wf.defaultOutputs.includes(opt.value)}
              onClick={() => {
                const next = wf.defaultOutputs.includes(opt.value)
                  ? wf.defaultOutputs.filter((o) => o !== opt.value)
                  : [...wf.defaultOutputs, opt.value];
                updateWorkflow({ defaultOutputs: next });
              }}
            />
          ))}
        </div>
      </Field>

      <Field label="Optimize Workspace For">
        <div className="flex flex-wrap gap-2">
          {([
            { value: "browsing", label: "Quick Study Browsing" },
            { value: "financial_review", label: "Detailed Financial Review" },
            { value: "feasibility_packets", label: "Feasibility Packet Generation" },
            { value: "candidate_review", label: "Candidate Review Workflows" },
          ] as const).map((opt) => (
            <ToggleChip
              key={opt.value}
              label={opt.label}
              selected={wf.workspaceOptimization === opt.value}
              onClick={() => updateWorkflow({ workspaceOptimization: opt.value })}
            />
          ))}
        </div>
      </Field>

      <div className="rounded-xl bg-gradient-to-br from-indigo-500/8 to-blue-500/8 p-4 ring-1 ring-indigo-500/15">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-[13px] font-bold text-white">Your engine is tuned</span>
        </div>
        <p className="text-[12px] text-slate-300 leading-relaxed">
          SiteConnect will use your research profile, staffing capacity, financial assumptions,
          and evaluation preferences to personalize study recommendations, burden scores, and
          financial models. You can refine any of these in Settings at any time.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shared UI Components
// ═══════════════════════════════════════════════════════════════

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-[18px] font-bold text-white">{title}</h2>
      <p className="text-[13px] text-slate-300">{subtitle}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-semibold text-slate-200">
        {label}
        {hint && <span className="ml-1.5 font-normal text-slate-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function ToggleChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-[12px] font-medium transition-all ring-1 ${
        selected
          ? "bg-indigo-500/15 text-indigo-300 ring-indigo-500/30"
          : "bg-white/[0.03] text-slate-300 ring-white/[0.08] hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      {selected && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
      {label}
    </button>
  );
}

function ChipGrid({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <ToggleChip
          key={opt}
          label={opt}
          selected={selected.includes(opt)}
          onClick={() => {
            const next = selected.includes(opt)
              ? selected.filter((s) => s !== opt)
              : [...selected, opt];
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="input-field w-full"
    />
  );
}

function CurrencyInput({
  valueCents,
  onChange,
  suffix,
}: {
  valueCents: number;
  onChange: (cents: number) => void;
  suffix?: string;
}) {
  const dollars = valueCents / 100;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[13px] text-slate-400">$</span>
      <input
        type="number"
        value={dollars}
        onChange={(e) => onChange(Math.round(parseFloat(e.target.value || "0") * 100))}
        className="input-field flex-1"
      />
      {suffix && <span className="text-[12px] text-slate-400">{suffix}</span>}
    </div>
  );
}

function SliderInput({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] font-semibold text-slate-200">
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-indigo-500 h-1.5 rounded-full appearance-none bg-white/[0.08] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:shadow-md"
      />
    </div>
  );
}
