import { useState } from "react";
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
  Zap,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatNumber } from "@/lib/formatters";
import { parseEpicRows, screenPatientsForStudy } from "@/lib/epic-demo-data";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useAppStore } from "@/stores/use-app-store";
import type { Study } from "@/types";

// Demo curated trial data with financials
const DEMO_STUDIES: (Study & { eligibleCount: number })[] = [
  {
    id: "study-1",
    nctNumber: "NCT05502237",
    title: "A Phase 3, Randomized, Double-Blind Study of Pembrolizumab Plus Chemotherapy vs Placebo Plus Chemotherapy in Previously Untreated Locally Advanced or Metastatic NSCLC",
    shortTitle: "KEYNOTE-789: Pembro + Chemo in NSCLC",
    sponsor: "Merck Sharp & Dohme",
    phase: "Phase 3",
    status: "recruiting",
    therapeuticArea: "Oncology",
    indication: "Non-Small Cell Lung Cancer",
    studyType: "interventional",
    summary: "Phase 3 study evaluating pembrolizumab in combination with pemetrexed and platinum chemotherapy versus placebo in participants with previously untreated metastatic nonsquamous NSCLC.",
    source: "curated",
    lastSynced: null,
    estimatedPerPatientValueCents: 4200000,
    estimatedSiteStartupCents: 3500000,
    currency: "USD",
    paymentModel: "per_visit",
    financialDetails: JSON.stringify({ perVisitPayment: 280000, estimatedVisits: 15, screeningPayment: 150000, screenFailurePayment: 75000 }),
    eligibleCount: 12,
  },
  {
    id: "study-2",
    nctNumber: "NCT04564897",
    title: "A Randomized, Double-Blind, Placebo-Controlled Phase 3 Study of Dapagliflozin in Patients With Heart Failure With Preserved Ejection Fraction",
    shortTitle: "DELIVER: Dapagliflozin in HFpEF",
    sponsor: "AstraZeneca",
    phase: "Phase 3",
    status: "recruiting",
    therapeuticArea: "Cardiology",
    indication: "Heart Failure with Preserved Ejection Fraction",
    studyType: "interventional",
    summary: "Evaluating the efficacy and safety of dapagliflozin in reducing cardiovascular death and worsening heart failure in patients with HFpEF.",
    source: "curated",
    lastSynced: null,
    estimatedPerPatientValueCents: 1800000,
    estimatedSiteStartupCents: 2500000,
    currency: "USD",
    paymentModel: "per_visit",
    financialDetails: JSON.stringify({ perVisitPayment: 150000, estimatedVisits: 12, screeningPayment: 100000 }),
    eligibleCount: 23,
  },
  {
    id: "study-3",
    nctNumber: "NCT05252390",
    title: "A Phase 3, Multicenter, Randomized Study to Evaluate Semaglutide 2.4 mg for Weight Management in Adults With Overweight or Obesity",
    shortTitle: "STEP-5: Semaglutide Weight Management",
    sponsor: "Novo Nordisk",
    phase: "Phase 3",
    status: "recruiting",
    therapeuticArea: "Diabetes/Metabolic",
    indication: "Obesity / Overweight",
    studyType: "interventional",
    summary: "Evaluating the efficacy and safety of semaglutide 2.4 mg once weekly versus placebo for weight management in adults with overweight or obesity.",
    source: "curated",
    lastSynced: null,
    estimatedPerPatientValueCents: 1400000,
    estimatedSiteStartupCents: 2000000,
    currency: "USD",
    paymentModel: "per_visit",
    financialDetails: JSON.stringify({ perVisitPayment: 120000, estimatedVisits: 12, screeningPayment: 80000 }),
    eligibleCount: 34,
  },
  {
    id: "study-4",
    nctNumber: "NCT04381936",
    title: "A Phase 2 Study of Lecanemab in Early Alzheimer's Disease With Confirmed Amyloid Pathology",
    shortTitle: "Lecanemab in Early Alzheimer's",
    sponsor: "Eisai / Biogen",
    phase: "Phase 2",
    status: "recruiting",
    therapeuticArea: "Neurology",
    indication: "Early Alzheimer's Disease",
    studyType: "interventional",
    summary: "Evaluating efficacy and safety of lecanemab in participants with early AD confirmed by amyloid PET or CSF biomarkers.",
    source: "curated",
    lastSynced: null,
    estimatedPerPatientValueCents: 3500000,
    estimatedSiteStartupCents: 4000000,
    currency: "USD",
    paymentModel: "milestone",
    financialDetails: JSON.stringify({ screeningMilestone: 200000, randomizationMilestone: 500000, completionMilestone: 800000, perVisitPayment: 200000, estimatedVisits: 10 }),
    eligibleCount: 5,
  },
  {
    id: "study-5",
    nctNumber: "NCT05090566",
    title: "A Phase 3 Study of Risankizumab Versus Placebo in Participants With Moderately to Severely Active Crohn's Disease",
    shortTitle: "Risankizumab in Crohn's Disease",
    sponsor: "AbbVie",
    phase: "Phase 3",
    status: "recruiting",
    therapeuticArea: "Immunology",
    indication: "Crohn's Disease",
    studyType: "interventional",
    summary: "Evaluating the efficacy and safety of risankizumab for the treatment of moderately to severely active Crohn's disease.",
    source: "curated",
    lastSynced: null,
    estimatedPerPatientValueCents: 2800000,
    estimatedSiteStartupCents: 3000000,
    currency: "USD",
    paymentModel: "hybrid",
    financialDetails: JSON.stringify({ perVisitPayment: 175000, estimatedVisits: 14, inductionMilestone: 350000, maintenanceMilestone: 300000 }),
    eligibleCount: 8,
  },
  {
    id: "study-6",
    nctNumber: "NCT04516746",
    title: "A Phase 3 Study of Dupilumab in Adults With Moderate-to-Severe Atopic Dermatitis Inadequately Controlled by Topical Therapies",
    shortTitle: "Dupilumab in Atopic Dermatitis",
    sponsor: "Regeneron / Sanofi",
    phase: "Phase 3",
    status: "recruiting",
    therapeuticArea: "Immunology",
    indication: "Atopic Dermatitis",
    studyType: "interventional",
    summary: "Evaluating efficacy and safety of dupilumab in adult patients with moderate-to-severe atopic dermatitis.",
    source: "curated",
    lastSynced: null,
    estimatedPerPatientValueCents: 1600000,
    estimatedSiteStartupCents: 2200000,
    currency: "USD",
    paymentModel: "per_visit",
    financialDetails: JSON.stringify({ perVisitPayment: 130000, estimatedVisits: 12, screeningPayment: 90000 }),
    eligibleCount: 15,
  },
];

function StudyCard({ study, onScreenPatients }: { study: (typeof DEMO_STUDIES)[number]; onScreenPatients: (studyId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const projectedRevenue = Math.round(study.eligibleCount * (study.estimatedPerPatientValueCents ?? 0) * 0.3);

  const phaseColors: Record<string, string> = {
    "Phase 1": "bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20",
    "Phase 2": "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20",
    "Phase 3": "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20",
    "Phase 4": "bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20",
    "Phase 1/2": "bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/20",
    "Phase 2/3": "bg-teal-500/15 text-teal-400 ring-1 ring-teal-500/20",
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-card transition-all hover:border-white/[0.1] hover:shadow-lg hover:shadow-black/10">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${phaseColors[study.phase] ?? "bg-slate-500/15 text-slate-400"}`}>
                {study.phase}
              </span>
              <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-white/[0.06]">
                {study.therapeuticArea}
              </span>
              <span className="text-[10px] font-mono text-slate-500">{study.nctNumber}</span>
            </div>
            <h3 className="mt-1.5 text-[13px] font-bold text-slate-100 leading-snug">{study.shortTitle}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Building2 className="h-3 w-3" />
              {study.sponsor}
            </p>
          </div>

          {/* Financial highlight */}
          <div className="shrink-0 rounded-xl bg-emerald-500/10 p-3 text-center ring-1 ring-emerald-500/20">
            <p className="text-[10px] font-medium text-emerald-400/70">Per Patient</p>
            <p className="text-lg font-black text-emerald-400">
              {formatCurrency(study.estimatedPerPatientValueCents ?? 0)}
            </p>
          </div>
        </div>

        {/* Key metrics row */}
        <div className="mt-3 flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Users className="h-3.5 w-3.5 text-indigo-400" />
            <span className="font-semibold text-indigo-300">{study.eligibleCount} eligible</span>
            <span className="text-slate-500">at your site</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-semibold text-emerald-400">{formatCurrencyCompact(projectedRevenue)}</span>
            <span className="text-slate-500">projected revenue</span>
          </div>
        </div>
      </div>

      {/* Expandable details */}
      <div className="border-t border-white/[0.04]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-4 py-2 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-300"
        >
          <span>{expanded ? "Hide Details" : "View Details"}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {expanded && (
          <div className="border-t border-white/[0.04] px-4 pb-4 pt-3">
            <p className="text-[12px] leading-relaxed text-slate-400">{study.summary}</p>

            {/* Financial breakdown */}
            <div className="mt-3 rounded-lg bg-emerald-500/5 p-3 ring-1 ring-emerald-500/10">
              <h4 className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
                <DollarSign className="h-3 w-3" />
                Financial Intelligence
              </h4>
              <div className="mt-2 grid grid-cols-3 gap-3 text-[12px]">
                <div>
                  <p className="text-[10px] text-emerald-400/60">Per Patient</p>
                  <p className="font-bold text-emerald-400">{formatCurrency(study.estimatedPerPatientValueCents ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-emerald-400/60">Site Startup</p>
                  <p className="font-bold text-emerald-400">{formatCurrency(study.estimatedSiteStartupCents ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-emerald-400/60">Payment Model</p>
                  <p className="font-bold capitalize text-emerald-400">{study.paymentModel?.replace("_", " ")}</p>
                </div>
              </div>
              <div className="mt-2 rounded-md bg-emerald-500/8 p-2 ring-1 ring-emerald-500/10">
                <p className="text-[10px] text-emerald-300/70">
                  With {study.eligibleCount} eligible patients and a 30% enrollment rate, your site could earn an estimated{" "}
                  <span className="font-bold text-emerald-300">{formatCurrency(projectedRevenue)}</span>.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onScreenPatients(study.id)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                <Search className="h-3 w-3" />
                Screen Patients
              </button>
              <button className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200">
                <FileText className="h-3 w-3" />
                Generate Pitch
              </button>
              <button className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200">
                <ExternalLink className="h-3 w-3" />
                ClinicalTrials.gov
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TrialsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArea, setSelectedArea] = useState<string>("all");

  const setPatients = useScreeningStore((s) => s.setPatients);
  const setScreeningResult = useScreeningStore((s) => s.setScreeningResult);
  const setCriteriaResults = useScreeningStore((s) => s.setCriteriaResults);
  const selectStudy = useScreeningStore((s) => s.selectStudy);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const handleScreenPatients = (studyId: string) => {
    const parsed = parseEpicRows();
    const screening = screenPatientsForStudy(parsed, studyId);
    if (screening.length === 0) return;
    setPatients(screening.map((s) => s.summary));
    for (const s of screening) {
      setScreeningResult(s.summary.id, s.result);
      setCriteriaResults(s.result.id, s.criteria);
    }
    selectStudy(studyId);
    setCurrentPage("screening");
  };

  const areas = ["all", ...new Set(DEMO_STUDIES.map((s) => s.therapeuticArea))];
  const filtered = DEMO_STUDIES.filter((s) => {
    if (selectedArea !== "all" && s.therapeuticArea !== selectedArea) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (s.title?.toLowerCase().includes(q)) || (s.shortTitle?.toLowerCase().includes(q)) || s.sponsor.toLowerCase().includes(q) || s.indication.toLowerCase().includes(q) || (s.nctNumber?.toLowerCase().includes(q));
    }
    return true;
  }).sort((a, b) => (b.eligibleCount * (b.estimatedPerPatientValueCents ?? 0)) - (a.eligibleCount * (a.estimatedPerPatientValueCents ?? 0)));

  const totalOpportunity = DEMO_STUDIES.reduce((sum, s) => sum + Math.round(s.eligibleCount * (s.estimatedPerPatientValueCents ?? 0) * 0.3), 0);
  const totalEligible = DEMO_STUDIES.reduce((sum, s) => sum + s.eligibleCount, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-white">Trial Discovery</h2>
            <p className="text-[12px] text-slate-500">
              Curated trials with financial intelligence — see the revenue opportunity at your site.
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search trials, sponsors, indications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-80 rounded-lg border border-white/[0.06] bg-white/[0.03] py-2 pl-9 pr-4 text-[12px] text-slate-200 placeholder-slate-600 focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        {/* Revenue summary bar */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-emerald-500/8 px-4 py-2.5 ring-1 ring-emerald-500/15">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="text-[10px] font-medium text-emerald-400/60">Total Revenue Opportunity</p>
              <p className="text-xl font-black tabular-nums text-emerald-400">{formatCurrencyCompact(totalOpportunity)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg bg-blue-500/8 px-4 py-2.5 ring-1 ring-blue-500/15">
            <Users className="h-5 w-5 text-blue-400" />
            <div>
              <p className="text-[10px] font-medium text-blue-400/60">Total Eligible Patients</p>
              <p className="text-xl font-black tabular-nums text-blue-400">{formatNumber(totalEligible)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg bg-purple-500/8 px-4 py-2.5 ring-1 ring-purple-500/15">
            <FlaskConical className="h-5 w-5 text-purple-400" />
            <div>
              <p className="text-[10px] font-medium text-purple-400/60">Active Studies</p>
              <p className="text-xl font-black tabular-nums text-purple-400">{DEMO_STUDIES.length}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-amber-500/8 px-3 py-2 ring-1 ring-amber-500/15">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-[11px] font-semibold text-amber-400/80">No other tool shows you the money</span>
          </div>
        </div>

        {/* Therapeutic area filter */}
        <div className="mt-3 flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-600" />
          {areas.map((area) => (
            <button
              key={area}
              onClick={() => setSelectedArea(area)}
              className={`rounded-md px-3 py-1 text-[11px] font-medium transition-all ${
                selectedArea === area
                  ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25"
                  : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
              }`}
            >
              {area === "all" ? "All Areas" : area}
            </button>
          ))}
        </div>
      </div>

      {/* Study cards */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4">
          {filtered.map((study) => (
            <StudyCard key={study.id} study={study} onScreenPatients={handleScreenPatients} />
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FlaskConical className="h-10 w-10 text-slate-700" />
            <p className="mt-3 text-[13px] font-medium text-slate-400">No trials match your search</p>
            <p className="mt-1 text-[11px] text-slate-600">Try adjusting your filters or search query.</p>
          </div>
        )}
      </div>
    </div>
  );
}
