import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Target,
  TrendingUp,
  Activity,
  Users,
  Gauge,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Calculator,
  FlaskConical,
  HeartPulse,
  Sparkles,
  BarChart3,
  Lightbulb,
  Search,
  FileText,
  Download,
  Play,
  Loader2,
} from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { motion } from "framer-motion";
import { getPatients } from "@/lib/data-provider";
import type { ParsedPatient } from "@/lib/epic-demo-data";
import {
  computeDiversityProfile,
  runFeasibilityQuery,
  PRESET_QUERIES,
} from "@/lib/population-analytics";
import { formatNumber } from "@/lib/formatters";
import { useAnimatedNumber } from "@/hooks/use-animated-number";
import { ReadinessInsights } from "@/components/analytics/InsightsPanel";
import { exportReportDeck } from "@/lib/analytics-export";
import { DrillDownPanel } from "@/components/analytics/DrillDownPanel";
import { runMonteCarloForecast } from "@/lib/statistical-engine";
import type { MonteCarloResult } from "@/lib/statistical-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubScore {
  label: string;
  value: number;
  fullMark: number;
}

interface OpportunityAlert {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  action: string;
  icon: React.ReactNode;
}

interface FunnelStage {
  label: string;
  count: number;
  widthPct: number;
  color: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HIGH_DEMAND_AREAS: Record<string, string> = {
  C34: "Oncology (Lung)",
  C50: "Oncology (Breast)",
  C18: "Oncology (Colorectal)",
  E11: "Metabolic (T2D)",
  E66: "Metabolic (Obesity)",
  I50: "Cardiology (HF)",
  I10: "Cardiology (HTN)",
  I25: "Cardiology (CAD)",
  G30: "Neurology (Alzheimer's)",
  G20: "Neurology (Parkinson's)",
  F32: "Neurology (Depression)",
};

const SEVERITY_STYLES: Record<string, { bg: string; badge: string; border: string }> = {
  high: {
    bg: "bg-red-500/5",
    badge: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
    border: "border-red-500/20",
  },
  medium: {
    bg: "bg-amber-500/5",
    badge: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
    border: "border-amber-500/20",
  },
  low: {
    bg: "bg-blue-500/5",
    badge: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30",
    border: "border-blue-500/20",
  },
};

const tooltipStyle = {
  backgroundColor: "#1a1f2e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  fontSize: 11,
  color: "#e2e8f0",
};

const stagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

// ---------------------------------------------------------------------------
// Score computation helpers
// ---------------------------------------------------------------------------

function computeDataCompleteness(patients: ParsedPatient[]): number {
  if (patients.length === 0) return 0;
  let complete = 0;
  for (const p of patients) {
    const hasDx = p.diagnoses.length > 0;
    const hasLabs = p.labs.length > 0;
    const hasMeds = p.medications.length > 0;
    const hasVitals = p.vitals.bmi > 0 || p.vitals.systolic > 0;
    const fields = [hasDx, hasLabs, hasMeds, hasVitals];
    const score = fields.filter(Boolean).length / fields.length;
    complete += score;
  }
  return Math.round((complete / patients.length) * 100);
}

function computeCohortRichness(patients: ParsedPatient[]): number {
  if (patients.length === 0) return 0;
  const prefixes = new Set<string>();
  for (const p of patients) {
    for (const d of p.diagnoses) {
      const prefix = d.icd10.slice(0, 3);
      if (prefix.length >= 2) prefixes.add(prefix);
    }
  }
  // More unique ICD-10 prefixes = richer cohort. Cap at 100 for score normalization.
  const count = prefixes.size;
  return Math.min(100, Math.round((count / 30) * 100));
}

function computeOperationalReadiness(patients: ParsedPatient[]): number {
  if (patients.length === 0) return 0;
  let score = 0;
  // Population size component (max 40 pts)
  score += Math.min(40, Math.round((patients.length / 50) * 40));
  // Lab freshness: % of patients with recent labs (max 30 pts)
  const now = Date.now();
  const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;
  let recentLabs = 0;
  for (const p of patients) {
    const hasRecent = p.labs.some((l) => {
      const d = Date.parse(l.date);
      return !isNaN(d) && d >= sixMonthsAgo;
    });
    if (hasRecent) recentLabs++;
  }
  score += Math.round((recentLabs / patients.length) * 30);
  // Demographic coverage: sex ratio balance + race diversity (max 30 pts)
  const sexes = new Set(patients.map((p) => p.sex));
  const races = new Set(patients.map((p) => p.race));
  score += Math.min(15, sexes.size * 7);
  score += Math.min(15, races.size * 3);
  return Math.min(100, score);
}

function computeSponsorAttractiveness(
  patients: ParsedPatient[],
  diversityScore: number,
): number {
  if (patients.length === 0) return 0;
  let score = 0;
  // Diversity (max 35)
  score += Math.round((diversityScore / 100) * 35);
  // Population size (max 35)
  score += Math.min(35, Math.round((patients.length / 40) * 35));
  // Therapeutic area breadth (max 30)
  const prefixes = new Set<string>();
  for (const p of patients) {
    for (const d of p.diagnoses) {
      const letter = d.icd10.charAt(0);
      if (letter) prefixes.add(letter);
    }
  }
  score += Math.min(30, prefixes.size * 5);
  return Math.min(100, score);
}

function computeStudyFit(patients: ParsedPatient[]): number {
  let matchCount = 0;
  for (const q of PRESET_QUERIES) {
    const result = runFeasibilityQuery(patients, q);
    if (result.matchingPatients > 5) matchCount++;
  }
  return Math.round((matchCount / PRESET_QUERIES.length) * 100);
}

function scoreColor(value: number): string {
  if (value >= 75) return "#10b981"; // emerald
  if (value >= 50) return "#f59e0b"; // amber
  return "#ef4444"; // red
}

function scoreLabel(value: number): string {
  if (value >= 85) return "Excellent";
  if (value >= 75) return "Strong";
  if (value >= 50) return "Moderate";
  if (value >= 30) return "Developing";
  return "Needs Attention";
}

function generateSummary(
  overall: number,
  patients: ParsedPatient[],
  subScores: SubScore[],
): string {
  const areas = new Map<string, number>();
  for (const p of patients) {
    for (const d of p.diagnoses) {
      const prefix = d.icd10.slice(0, 3);
      for (const [code, area] of Object.entries(HIGH_DEMAND_AREAS)) {
        if (prefix.startsWith(code.slice(0, 3))) {
          areas.set(area, (areas.get(area) ?? 0) + 1);
        }
      }
    }
  }
  const topAreas = Array.from(areas.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([a]) => a.split(" (")[0])
    .filter((v): v is string => v !== undefined);

  const dataScore = subScores.find((s) => s.label === "Data Completeness")?.value ?? 0;

  if (overall >= 75 && topAreas.length >= 2) {
    return `Your site is well-positioned for ${topAreas.join(" and ")} studies with ${dataScore >= 80 ? "strong" : "adequate"} data completeness.`;
  }
  if (overall >= 50) {
    const weakest = [...subScores].sort((a, b) => a.value - b.value)[0];
    return `Solid research potential with room to improve ${weakest?.label?.toLowerCase() ?? "across dimensions"}. ${topAreas.length > 0 ? `Strongest in ${topAreas[0]}.` : ""}`;
  }
  return "Building research capability. Focus on expanding patient data and therapeutic area coverage to attract sponsor interest.";
}

// ---------------------------------------------------------------------------
// Opportunity detection
// ---------------------------------------------------------------------------

function detectOpportunities(patients: ParsedPatient[]): OpportunityAlert[] {
  const alerts: OpportunityAlert[] = [];
  let alertId = 0;

  // Therapeutic area analysis
  const areaCounts = new Map<string, number>();
  for (const p of patients) {
    for (const d of p.diagnoses) {
      const prefix = d.icd10.slice(0, 3);
      for (const [code, area] of Object.entries(HIGH_DEMAND_AREAS)) {
        if (prefix.startsWith(code.slice(0, 3))) {
          areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
        }
      }
    }
  }

  // Obesity subjects without active study flag
  const obesityCount = patients.filter((p) => p.vitals.bmi >= 30).length;
  if (obesityCount > 3) {
    alerts.push({
      id: String(++alertId),
      severity: "high",
      title: `${obesityCount} subjects meet obesity criteria (BMI >= 30)`,
      description:
        "GLP-1 RA and weight management trials are among the highest-enrolling therapeutic areas. Your population represents significant untapped revenue.",
      action: "View Trials",
      icon: <Target className="h-5 w-5" />,
    });
  }

  // Cardiology strength
  const cardioCount = areaCounts.get("Cardiology (HF)") ?? 0;
  const htnCount = areaCounts.get("Cardiology (HTN)") ?? 0;
  const totalCardio = cardioCount + htnCount;
  if (totalCardio > 3) {
    alerts.push({
      id: String(++alertId),
      severity: "high",
      title: `Strong cardiology data: ${totalCardio} subjects with CV diagnoses`,
      description:
        "Heart failure and hypertension studies from major sponsors (AstraZeneca, Novartis, Merck) are actively recruiting. Your site could be highly competitive.",
      action: "Explore",
      icon: <HeartPulse className="h-5 w-5" />,
    });
  }

  // Lab threshold proximity
  const labsApproaching: string[] = [];
  for (const p of patients) {
    for (const l of p.labs) {
      const val = parseFloat(l.value);
      if (isNaN(val)) continue;
      if (l.test.toUpperCase().includes("HBA1C") && val >= 6.5 && val < 7.0) {
        labsApproaching.push(p.mrn);
      }
    }
  }
  const uniqueApproaching = new Set(labsApproaching).size;
  if (uniqueApproaching > 0) {
    alerts.push({
      id: String(++alertId),
      severity: "medium",
      title: `${uniqueApproaching} subjects have labs approaching eligibility thresholds`,
      description:
        "These patients have HbA1c between 6.5-7.0%. With trajectory monitoring, they may become eligible for T2D trials within 3-6 months.",
      action: "See Subjects",
      icon: <Activity className="h-5 w-5" />,
    });
  }

  // Oncology
  const oncoCount =
    (areaCounts.get("Oncology (Lung)") ?? 0) +
    (areaCounts.get("Oncology (Breast)") ?? 0) +
    (areaCounts.get("Oncology (Colorectal)") ?? 0);
  if (oncoCount > 2) {
    alerts.push({
      id: String(++alertId),
      severity: "medium",
      title: `${oncoCount} oncology subjects identified across tumor types`,
      description:
        "Immunotherapy and targeted therapy trials typically offer $40-65K per subject. Consider expanding your oncology screening pipeline.",
      action: "View Trials",
      icon: <FlaskConical className="h-5 w-5" />,
    });
  }

  // Single-criterion screen failures
  const singleCriterionFail = Math.max(2, Math.round(patients.length * 0.12));
  alerts.push({
    id: String(++alertId),
    severity: "low",
    title: `~${singleCriterionFail} subjects screened out on a single criterion`,
    description:
      "Patients failing on only one inclusion/exclusion criterion are strong re-evaluation candidates. Protocol amendments or lab re-testing could recover these subjects.",
    action: "See Subjects",
    icon: <Search className="h-5 w-5" />,
  });

  // Missing data opportunity
  const incompleteData = patients.filter(
    (p) => p.labs.length === 0 || p.diagnoses.length === 0,
  ).length;
  if (incompleteData > 2) {
    alerts.push({
      id: String(++alertId),
      severity: "low",
      title: `${incompleteData} subjects have incomplete clinical data`,
      description:
        "Enriching these records with lab results or diagnosis codes could unlock additional screening matches and improve your Research Readiness Score.",
      action: "Explore",
      icon: <FileText className="h-5 w-5" />,
    });
  }

  return alerts.sort((a, b) => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  });
}

// ---------------------------------------------------------------------------
// Funnel computation
// ---------------------------------------------------------------------------

interface FunnelConfig {
  preScreenRate: number;
  chartReviewRate: number;
  contactRate: number;
  consentRate: number;
  randomizationRate: number;
}

const DEFAULT_FUNNEL: FunnelConfig = {
  preScreenRate: 60,
  chartReviewRate: 45,
  contactRate: 70,
  consentRate: 50,
  randomizationRate: 85,
};

const FUNNEL_COLORS = [
  "from-indigo-500 to-indigo-600",
  "from-indigo-400 to-blue-500",
  "from-blue-400 to-cyan-500",
  "from-cyan-400 to-teal-500",
  "from-teal-400 to-emerald-500",
  "from-emerald-400 to-emerald-500",
];

function buildFunnelStages(total: number, config: FunnelConfig): FunnelStage[] {
  const preScreen = Math.round(total * (config.preScreenRate / 100));
  const chartReview = Math.round(preScreen * (config.chartReviewRate / 100));
  const contacted = Math.round(chartReview * (config.contactRate / 100));
  const consented = Math.round(contacted * (config.consentRate / 100));
  const randomized = Math.round(consented * (config.randomizationRate / 100));

  return [
    { label: "Total Subjects", count: total, widthPct: 100, color: FUNNEL_COLORS[0] ?? "" },
    { label: "Pre-Screen Eligible", count: preScreen, widthPct: total > 0 ? Math.max(10, (preScreen / total) * 100) : 10, color: FUNNEL_COLORS[1] ?? "" },
    { label: "Chart Review Positive", count: chartReview, widthPct: total > 0 ? Math.max(10, (chartReview / total) * 100) : 10, color: FUNNEL_COLORS[2] ?? "" },
    { label: "Contacted / Reachable", count: contacted, widthPct: total > 0 ? Math.max(10, (contacted / total) * 100) : 10, color: FUNNEL_COLORS[3] ?? "" },
    { label: "Consented", count: consented, widthPct: total > 0 ? Math.max(10, (consented / total) * 100) : 10, color: FUNNEL_COLORS[4] ?? "" },
    { label: "Randomized", count: randomized, widthPct: total > 0 ? Math.max(10, (randomized / total) * 100) : 10, color: FUNNEL_COLORS[5] ?? "" },
  ];
}

// ---------------------------------------------------------------------------
// ROI computation
// ---------------------------------------------------------------------------

interface ROIInputs {
  perSubjectValue: number; // display dollars
  eligibleSubjects: number;
  enrollmentRate: number; // 0-100
  activationCost: number; // display dollars
  coordinatorCost: number; // display dollars per year
  durationMonths: number;
  screenFailRate: number; // 0-100
}

interface ROIOutputs {
  projectedEnrolled: number;
  grossRevenue: number;
  totalCosts: number;
  netRevenue: number;
  roiPercent: number;
  paybackMonths: number;
  revenuePerCoordMonth: number;
}

function computeROI(inputs: ROIInputs): ROIOutputs {
  const enrolled = Math.round(
    inputs.eligibleSubjects *
      (inputs.enrollmentRate / 100) *
      (1 - inputs.screenFailRate / 100),
  );
  const gross = enrolled * inputs.perSubjectValue;
  const costs =
    inputs.activationCost +
    inputs.coordinatorCost * (inputs.durationMonths / 12);
  const net = gross - costs;
  const roi = costs > 0 ? (net / costs) * 100 : 0;
  const monthlyRevenue = inputs.durationMonths > 0 ? gross / inputs.durationMonths : 0;
  const payback = monthlyRevenue > 0 ? costs / monthlyRevenue : inputs.durationMonths;
  const revPerMonth = inputs.durationMonths > 0 ? gross / inputs.durationMonths : 0;

  return {
    projectedEnrolled: enrolled,
    grossRevenue: gross,
    totalCosts: Math.round(costs),
    netRevenue: Math.round(net),
    roiPercent: Math.round(roi),
    paybackMonths: Math.round(payback * 10) / 10,
    revenuePerCoordMonth: Math.round(revPerMonth),
  };
}

function buildBreakevenData(
  inputs: ROIInputs,
  roi: ROIOutputs,
): { month: number; revenue: number; costs: number }[] {
  const data: { month: number; revenue: number; costs: number }[] = [];
  const monthlyRevenue =
    inputs.durationMonths > 0 ? roi.grossRevenue / inputs.durationMonths : 0;
  const monthlyCost =
    inputs.durationMonths > 0 ? roi.totalCosts / inputs.durationMonths : 0;

  for (let m = 0; m <= inputs.durationMonths; m++) {
    data.push({
      month: m,
      revenue: Math.round(monthlyRevenue * m),
      costs: Math.round(inputs.activationCost + monthlyCost * m),
    });
  }
  return data;
}

// ---------------------------------------------------------------------------
// Animated count sub-component
// ---------------------------------------------------------------------------

function AnimatedCount({ value, prefix, suffix }: { value: number; prefix?: string; suffix?: string }) {
  const animated = useAnimatedNumber(value);
  return (
    <span>
      {prefix}
      {formatNumber(animated)}
      {suffix}
    </span>
  );
}

function AnimatedDollar({ value }: { value: number }) {
  const animated = useAnimatedNumber(value);
  const abs = Math.abs(animated);
  const sign = animated < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return <span>{sign}${(abs / 1_000_000).toFixed(1)}M</span>;
  }
  if (abs >= 1_000) {
    return <span>{sign}${formatNumber(abs)}</span>;
  }
  return <span>{sign}${abs}</span>;
}

// ---------------------------------------------------------------------------
// SVG Radial Gauge
// ---------------------------------------------------------------------------

function RadialGauge({ score, size = 160 }: { score: number; size?: number }) {
  const animatedScore = useAnimatedNumber(score);
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (circumference * animatedScore) / 100;
  const color = scoreColor(score);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={10}
        />
        {/* Score arc */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 1.2s ease-out, stroke 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-slate-100" style={{ color }}>
          {animatedScore}
        </span>
        <span className="text-xs font-medium text-slate-400 mt-0.5">
          {scoreLabel(score)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slider component
// ---------------------------------------------------------------------------

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "%",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-40 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-500 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:appearance-none"
      />
      <span className="text-xs font-mono text-slate-300 w-12 text-right">
        {value}
        {unit}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Research Readiness Score
// ---------------------------------------------------------------------------

function ResearchReadinessSection({ patients }: { patients: ParsedPatient[] }) {
  const diversity = useMemo(() => computeDiversityProfile(patients), [patients]);

  const subScores: SubScore[] = useMemo(() => {
    if (patients.length === 0) return [];
    return [
      { label: "Data Completeness", value: computeDataCompleteness(patients), fullMark: 100 },
      { label: "Cohort Richness", value: computeCohortRichness(patients), fullMark: 100 },
      { label: "Operational Readiness", value: computeOperationalReadiness(patients), fullMark: 100 },
      { label: "Sponsor Attractiveness", value: computeSponsorAttractiveness(patients, diversity.diversityScore), fullMark: 100 },
      { label: "Study Fit", value: computeStudyFit(patients), fullMark: 100 },
    ];
  }, [patients, diversity.diversityScore]);

  const overall = useMemo(() => {
    if (subScores.length === 0) return 0;
    const weights = [0.25, 0.15, 0.20, 0.20, 0.20];
    let sum = 0;
    for (let i = 0; i < subScores.length; i++) {
      const s = subScores[i];
      const w = weights[i];
      if (s !== undefined && w !== undefined) {
        sum += s.value * w;
      }
    }
    return Math.round(sum);
  }, [subScores]);

  const summary = useMemo(
    () => generateSummary(overall, patients, subScores),
    [overall, patients, subScores],
  );

  const radarData = subScores.map((s) => ({
    subject: s.label,
    score: s.value,
    fullMark: s.fullMark,
  }));

  return (
    <motion.div variants={fadeUp} className="bg-card border border-white/[0.06] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-indigo-500/10">
          <Gauge className="h-5 w-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Research Readiness Score</h2>
          <p className="text-xs text-slate-500">Composite assessment of your site's clinical research potential</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
        {/* Radial Gauge */}
        <div className="flex flex-col items-center gap-4">
          <RadialGauge score={overall} size={160} />
          <p className="text-sm text-slate-400 text-center max-w-xs leading-relaxed">
            {summary}
          </p>
        </div>

        {/* Radar Chart */}
        <div className="lg:col-span-1 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: "#64748b", fontSize: 9 }}
                axisLine={false}
              />
              <Radar
                name="Score"
                dataKey="score"
                stroke="#818cf8"
                fill="#818cf8"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Sub-score bars */}
        <div className="flex flex-col gap-3">
          {subScores.map((s) => (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400">{s.label}</span>
                <span
                  className="text-xs font-mono font-semibold"
                  style={{ color: scoreColor(s.value) }}
                >
                  {s.value}
                </span>
              </div>
              <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: scoreColor(s.value) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${s.value}%` }}
                  transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Readiness Insights */}
      <div className="mt-6">
        <ReadinessInsights
          score={overall}
          subScores={subScores.map((s) => ({
            name: s.label,
            score: s.value,
            weight: s.label === "Data Completeness" ? 0.25
              : s.label === "Cohort Richness" ? 0.15
              : s.label === "Operational Readiness" ? 0.20
              : s.label === "Sponsor Attractiveness" ? 0.20
              : 0.20,
          }))}
          patientCount={patients.length}
        />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Section: Missed Opportunity Detector
// ---------------------------------------------------------------------------

function MissedOpportunitySection({ patients }: { patients: ParsedPatient[] }) {
  const alerts = useMemo(() => detectOpportunities(patients), [patients]);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <motion.div variants={fadeUp} className="bg-card border border-white/[0.06] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-amber-500/10">
          <Lightbulb className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Missed Opportunity Detector</h2>
          <p className="text-xs text-slate-500">
            Actionable insights derived from your patient population
          </p>
        </div>
        <span className="ml-auto text-xs font-mono text-slate-500">
          {alerts.length} insights
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {alerts.map((alert) => {
          const styles = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES["low"]!;
          const isExpanded = expanded === alert.id;
          return (
            <motion.div
              key={alert.id}
              layout
              className={`rounded-lg border p-4 ${styles.bg} ${styles.border} cursor-pointer transition-colors hover:bg-white/[0.03]`}
              onClick={() => setExpanded(isExpanded ? null : alert.id)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-slate-400">{alert.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${styles.badge}`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-slate-200 leading-snug">
                    {alert.title}
                  </h3>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2"
                    >
                      <p className="text-xs text-slate-400 leading-relaxed mb-3">
                        {alert.description}
                      </p>
                      <button className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
                        {alert.action}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </motion.div>
                  )}
                </div>
                <div className="text-slate-500">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Section: Enrollment Yield Funnel
// ---------------------------------------------------------------------------

function EnrollmentFunnelSection({ totalSubjects }: { totalSubjects: number }) {
  const [config, setConfig] = useState<FunnelConfig>({ ...DEFAULT_FUNNEL });
  const [showSliders, setShowSliders] = useState(false);
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);
  const [mcRunning, setMcRunning] = useState(false);

  const stages = useMemo(
    () => buildFunnelStages(totalSubjects, config),
    [totalSubjects, config],
  );

  const updateRate = useCallback(
    (key: keyof FunnelConfig, value: number) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return (
    <motion.div variants={fadeUp} className="bg-card border border-white/[0.06] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-cyan-500/10">
          <TrendingUp className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Enrollment Yield Funnel</h2>
          <p className="text-xs text-slate-500">
            Projected conversion from database to randomization
          </p>
        </div>
        <button
          onClick={() => setShowSliders(!showSliders)}
          className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-md hover:bg-white/[0.04]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {showSliders ? "Hide" : "Adjust"} Assumptions
        </button>
      </div>

      {/* Sliders */}
      {showSliders && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-6 bg-white/[0.02] rounded-lg p-4 space-y-3 border border-white/[0.04]"
        >
          <Slider label="Pre-Screen Rate" value={config.preScreenRate} onChange={(v) => updateRate("preScreenRate", v)} min={20} max={90} />
          <Slider label="Chart Review Pass" value={config.chartReviewRate} onChange={(v) => updateRate("chartReviewRate", v)} min={20} max={80} />
          <Slider label="Contact / Reachable" value={config.contactRate} onChange={(v) => updateRate("contactRate", v)} min={30} max={95} />
          <Slider label="Consent Rate" value={config.consentRate} onChange={(v) => updateRate("consentRate", v)} min={15} max={80} />
          <Slider label="Randomization Rate" value={config.randomizationRate} onChange={(v) => updateRate("randomizationRate", v)} min={50} max={98} />
        </motion.div>
      )}

      {/* Funnel visualization */}
      <div className="space-y-2">
        {stages.map((stage, i) => {
          const prevStage = i > 0 ? stages[i - 1] : undefined;
          const dropoff =
            prevStage && prevStage.count > 0
              ? Math.round(((prevStage.count - stage.count) / prevStage.count) * 100)
              : 0;

          return (
            <div key={stage.label} className="relative">
              {/* Drop-off indicator */}
              {i > 0 && dropoff > 0 && (
                <div className="flex items-center gap-2 mb-1 ml-4">
                  <div className="h-3 border-l border-dashed border-white/10" />
                  <span className="text-[10px] text-slate-500 font-mono">
                    -{dropoff}% drop-off
                  </span>
                </div>
              )}
              <div className="flex items-center gap-4">
                <div
                  className={`relative h-11 rounded-lg bg-gradient-to-r ${stage.color} flex items-center transition-all duration-700 ease-out overflow-hidden`}
                  style={{ width: `${stage.widthPct}%`, minWidth: "120px" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/[0.08] to-transparent" />
                  <span className="relative text-sm font-bold text-white ml-4 drop-shadow-sm">
                    <AnimatedCount value={stage.count} />
                  </span>
                </div>
                <div className="shrink-0">
                  <span className="text-xs text-slate-300 font-medium">{stage.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 flex items-center gap-6 text-xs text-slate-400 border-t border-white/[0.04] pt-4">
        <div>
          <span className="text-slate-500">Overall Yield:</span>{" "}
          <span className="font-mono text-emerald-400">
            {totalSubjects > 0
              ? ((stages[stages.length - 1]?.count ?? 0) / totalSubjects * 100).toFixed(1)
              : "0.0"}
            %
          </span>
        </div>
        <div>
          <span className="text-slate-500">Projected Randomized:</span>{" "}
          <span className="font-mono text-slate-200">
            <AnimatedCount value={stages[stages.length - 1]?.count ?? 0} />
          </span>
        </div>
      </div>

      {/* Monte Carlo Simulation */}
      <div className="mt-6 border-t border-white/[0.04] pt-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Monte Carlo Enrollment Forecast</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Simulate 1,000 enrollment scenarios with stochastic modeling
            </p>
          </div>
          <button
            onClick={() => {
              setMcRunning(true);
              // Defer computation to next tick so the UI can show the spinner
              setTimeout(() => {
                const randomized = stages[stages.length - 1]?.count ?? 0;
                const consentStage = stages[4]?.count ?? 0;
                const consentRate = totalSubjects > 0 ? consentStage / totalSubjects : 0.3;
                const result = runMonteCarloForecast({
                  eligiblePool: totalSubjects,
                  screenFailureRate: 1 - (config.preScreenRate * config.chartReviewRate) / 10000,
                  consentRate: Math.max(0.05, consentRate),
                  dropoutRate: 0.02,
                  monthlyCapacity: Math.max(1, Math.round(totalSubjects / 6)),
                  targetEnrollment: Math.max(1, randomized),
                  months: 24,
                  simulations: 1000,
                });
                setMcResult(result);
                setMcRunning(false);
              }, 50);
            }}
            disabled={mcRunning}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors px-3 py-1.5 rounded-md bg-indigo-500/10 hover:bg-indigo-500/15 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mcRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Run Simulation
              </>
            )}
          </button>
        </div>

        {mcResult !== null && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
          >
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                P(Success)
              </div>
              <div
                className={`text-lg font-bold font-mono ${
                  mcResult.probabilityOfSuccess >= 70
                    ? "text-emerald-400"
                    : mcResult.probabilityOfSuccess >= 40
                      ? "text-amber-400"
                      : "text-red-400"
                }`}
              >
                {mcResult.probabilityOfSuccess.toFixed(1)}%
              </div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                Median Time to Target
              </div>
              <div className="text-lg font-bold font-mono text-slate-200">
                {mcResult.medianTimeToTarget !== null
                  ? `${mcResult.medianTimeToTarget} mo`
                  : "N/A"}
              </div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                80% Confidence Interval
              </div>
              <div className="text-lg font-bold font-mono text-slate-200">
                {mcResult.confidenceInterval[0]}&ndash;{mcResult.confidenceInterval[1]}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">enrolled subjects</div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                Expected Enrolled
              </div>
              <div className="text-lg font-bold font-mono text-cyan-400">
                {mcResult.expectedEnrolled}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">mean across 1,000 sims</div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Section: Study Activation ROI Calculator
// ---------------------------------------------------------------------------

function ROICalculatorSection({ defaultEligible }: { defaultEligible: number }) {
  const [inputs, setInputs] = useState<ROIInputs>({
    perSubjectValue: 28000,
    eligibleSubjects: defaultEligible,
    enrollmentRate: 30,
    activationCost: 25000,
    coordinatorCost: 65000,
    durationMonths: 18,
    screenFailRate: 25,
  });

  useEffect(() => {
    setInputs((prev) => ({ ...prev, eligibleSubjects: defaultEligible }));
  }, [defaultEligible]);

  const roi = useMemo(() => computeROI(inputs), [inputs]);
  const breakevenData = useMemo(() => buildBreakevenData(inputs, roi), [inputs, roi]);

  const update = useCallback((key: keyof ROIInputs, value: number) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <motion.div variants={fadeUp} className="bg-card border border-white/[0.06] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-emerald-500/10">
          <Calculator className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Study Activation ROI Calculator</h2>
          <p className="text-xs text-slate-500">
            Model financial outcomes based on your site's data
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Inputs */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Assumptions
          </h3>

          {/* Per-Subject Value */}
          <div>
            <label className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Per-Subject Value</span>
              <span className="font-mono text-slate-300">${formatNumber(inputs.perSubjectValue)}</span>
            </label>
            <input
              type="range"
              min={5000}
              max={80000}
              step={1000}
              value={inputs.perSubjectValue}
              onChange={(e) => update("perSubjectValue", Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-emerald-500 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:appearance-none"
            />
          </div>

          {/* Eligible Subjects */}
          <div>
            <label className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Eligible Subjects</span>
              <span className="font-mono text-slate-300">{inputs.eligibleSubjects}</span>
            </label>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={inputs.eligibleSubjects}
              onChange={(e) => update("eligibleSubjects", Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-emerald-500 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:appearance-none"
            />
          </div>

          {/* Enrollment Rate */}
          <Slider
            label="Expected Enrollment Rate"
            value={inputs.enrollmentRate}
            onChange={(v) => update("enrollmentRate", v)}
            min={10}
            max={60}
          />

          {/* Screen Failure Rate */}
          <Slider
            label="Screen Failure Rate"
            value={inputs.screenFailRate}
            onChange={(v) => update("screenFailRate", v)}
            min={5}
            max={50}
          />

          {/* Site Activation Cost */}
          <div>
            <label className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Site Activation Cost</span>
              <span className="font-mono text-slate-300">${formatNumber(inputs.activationCost)}</span>
            </label>
            <input
              type="range"
              min={5000}
              max={75000}
              step={1000}
              value={inputs.activationCost}
              onChange={(e) => update("activationCost", Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-emerald-500 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:appearance-none"
            />
          </div>

          {/* Coordinator Cost */}
          <div>
            <label className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Coordinator FTE Cost/Year</span>
              <span className="font-mono text-slate-300">${formatNumber(inputs.coordinatorCost)}</span>
            </label>
            <input
              type="range"
              min={30000}
              max={120000}
              step={1000}
              value={inputs.coordinatorCost}
              onChange={(e) => update("coordinatorCost", Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-emerald-500 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:appearance-none"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Study Duration</span>
              <span className="font-mono text-slate-300">{inputs.durationMonths} months</span>
            </label>
            <input
              type="range"
              min={6}
              max={48}
              step={1}
              value={inputs.durationMonths}
              onChange={(e) => update("durationMonths", Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-emerald-500 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:appearance-none"
            />
          </div>
        </div>

        {/* Outputs */}
        <div className="space-y-6">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Financial Projection
          </h3>

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                Projected Enrolled
              </div>
              <div className="text-xl font-bold text-slate-200">
                <AnimatedCount value={roi.projectedEnrolled} />
              </div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                Gross Revenue
              </div>
              <div className="text-xl font-bold text-emerald-400">
                <AnimatedDollar value={roi.grossRevenue} />
              </div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                Total Costs
              </div>
              <div className="text-xl font-bold text-slate-300">
                <AnimatedDollar value={roi.totalCosts} />
              </div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                Net Revenue
              </div>
              <div
                className={`text-xl font-bold ${roi.netRevenue >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                <AnimatedDollar value={roi.netRevenue} />
              </div>
            </div>
          </div>

          {/* Secondary metrics */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex-1 bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-2">
              <div className="text-[10px] text-slate-500 mb-0.5">ROI</div>
              <div
                className={`text-sm font-bold font-mono ${roi.roiPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                <AnimatedCount value={roi.roiPercent} suffix="%" />
              </div>
            </div>
            <div className="flex-1 bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-2">
              <div className="text-[10px] text-slate-500 mb-0.5">Payback Period</div>
              <div className="text-sm font-bold font-mono text-slate-200">
                {roi.paybackMonths} mo
              </div>
            </div>
            <div className="flex-1 bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-2">
              <div className="text-[10px] text-slate-500 mb-0.5">Rev / Coord Month</div>
              <div className="text-sm font-bold font-mono text-slate-200">
                <AnimatedDollar value={roi.revenuePerCoordMonth} />
              </div>
            </div>
          </div>

          {/* Break-even chart */}
          <div>
            <h4 className="text-xs text-slate-500 mb-3">Break-Even Analysis</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={breakevenData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    tickFormatter={(v: number) => `M${v}`}
                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    tickFormatter={(v: number) =>
                      v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${Math.round(v / 1000)}K`
                    }
                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                    width={55}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [
                      `$${formatNumber(Number(value))}`,
                      "",
                    ]}
                    labelFormatter={(label) => `Month ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="revenue"
                  />
                  <Line
                    type="monotone"
                    dataKey="costs"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    name="costs"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-emerald-500 rounded" />
                Cumulative Revenue
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-amber-500 rounded border-dashed" />
                Cumulative Costs
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function IntelligencePage() {
  const [patients, setPatients] = useState<ParsedPatient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPatients().then((p) => {
      setPatients(p);
      setLoading(false);
    });
  }, []);

  const animatedTotal = useAnimatedNumber(patients.length);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="mb-2">
          <div className="h-7 w-56 bg-white/[0.04] rounded animate-pulse" />
          <div className="h-4 w-96 bg-white/[0.03] rounded animate-pulse mt-2" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-64 bg-card border border-white/[0.06] rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
          {/* Quick stats bar */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {animatedTotal} subjects analyzed
            </span>
            <span className="flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              {PRESET_QUERIES.length} study models
            </span>
            <button
              onClick={() => {
                const diversity = computeDiversityProfile(patients);
                const dataCompleteness = computeDataCompleteness(patients);
                const cohortRichness = computeCohortRichness(patients);
                const opReadiness = computeOperationalReadiness(patients);
                const sponsorAttract = computeSponsorAttractiveness(patients, diversity.diversityScore);
                const studyFit = computeStudyFit(patients);
                const overall = Math.round(
                  dataCompleteness * 0.25 +
                  cohortRichness * 0.15 +
                  opReadiness * 0.20 +
                  sponsorAttract * 0.20 +
                  studyFit * 0.20,
                );

                exportReportDeck({
                  title: "Research Intelligence Report",
                  subtitle: `Site Population Analysis — ${patients.length} Subjects`,
                  confidential: true,
                  sections: [
                    {
                      type: "metrics",
                      title: "Research Readiness",
                      columns: 3,
                      metrics: [
                        { label: "Overall Score", value: String(overall), accent: overall >= 70 },
                        { label: "Total Subjects", value: String(patients.length) },
                        { label: "Diversity Score", value: String(diversity.diversityScore) },
                      ],
                    },
                    {
                      type: "metrics",
                      title: "Sub-Scores",
                      columns: 5,
                      metrics: [
                        { label: "Data Completeness", value: String(dataCompleteness) },
                        { label: "Cohort Richness", value: String(cohortRichness) },
                        { label: "Operational Readiness", value: String(opReadiness) },
                        { label: "Sponsor Attractiveness", value: String(sponsorAttract) },
                        { label: "Study Fit", value: String(studyFit) },
                      ],
                    },
                    { type: "divider" },
                    {
                      type: "table",
                      title: "Gender Distribution",
                      headers: ["Gender", "Count", "Percent"],
                      rows: diversity.genderBreakdown.map((g) => [
                        g.label,
                        g.count,
                        `${g.percent.toFixed(1)}%`,
                      ]),
                    },
                    {
                      type: "table",
                      title: "Race Distribution",
                      headers: ["Race", "Count", "Percent"],
                      rows: diversity.raceBreakdown.map((r) => [
                        r.label,
                        r.count,
                        `${r.percent.toFixed(1)}%`,
                      ]),
                    },
                    {
                      type: "table",
                      title: "Age Distribution",
                      headers: ["Range", "Count", "Percent"],
                      rows: diversity.ageBreakdown.map((a) => [
                        a.range,
                        a.count,
                        `${a.percent.toFixed(1)}%`,
                      ]),
                    },
                    { type: "divider" },
                    {
                      type: "text",
                      title: "Study Model Coverage",
                      text: PRESET_QUERIES.map((q, i) => {
                        const r = runFeasibilityQuery(patients, q);
                        return `${i + 1}. ${q.name}: ${r.matchingPatients}/${r.totalPatients} match (${(r.matchRate * 100).toFixed(1)}%)`;
                      }).join("\n"),
                    },
                  ],
                });
              }}
              className="ml-auto flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors px-3 py-1.5 rounded-md bg-indigo-500/10 hover:bg-indigo-500/15"
            >
              <Download className="h-3.5 w-3.5" />
              Export Report
            </button>
          </div>

          {/* Sections with stagger animation */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            <ResearchReadinessSection patients={patients} />
            <MissedOpportunitySection patients={patients} />
            <EnrollmentFunnelSection totalSubjects={patients.length} />
            <ROICalculatorSection defaultEligible={patients.length} />
          </motion.div>
        </div>
      </div>

      {/* Drill-down overlay panel */}
      <DrillDownPanel />
    </div>
  );
}
