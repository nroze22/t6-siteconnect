import { useState, useMemo, useEffect } from "react";
import {
  TrendingUp,
  Users,
  DollarSign,
  Target,
  Award,
  BarChart3,
  Info,
  X as XIcon,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Brain,
  GitBranch,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { screenPatientsForStudy, STUDY_SCREENING_DEFS } from "@/lib/epic-demo-data";
import type { ParsedPatient } from "@/lib/epic-demo-data";
import { getPatients } from "@/lib/data-provider";

const STUDY_NAMES: Record<string, string> = {
  "study-1": "KEYNOTE-789",
  "study-2": "DELIVER",
  "study-3": "STEP-5",
  "study-4": "Lecanemab AD",
  "study-5": "Risankizumab CD",
  "study-6": "Dupilumab AD",
};

const STUDY_REVENUE: Record<string, number> = {
  "study-1": 42000,
  "study-2": 28000,
  "study-3": 18000,
  "study-4": 65000,
  "study-5": 35000,
  "study-6": 22000,
};

interface StudyMetrics {
  studyId: string;
  studyName: string;
  totalScreened: number;
  eligible: number;
  potentiallyEligible: number;
  ineligible: number;
  needsReview: number;
  screenPassRate: number;
  avgScore: number;
  topBlockers: { criterion: string; count: number; pct: number }[];
  revenuePerPatient: number;
  projectedRevenue: number;
}

function computeStudyMetrics(parsed: ParsedPatient[]): StudyMetrics[] {
  const metrics: StudyMetrics[] = [];

  for (const studyDef of STUDY_SCREENING_DEFS) {
    const screening = screenPatientsForStudy(parsed, studyDef.studyId);
    const eligible = screening.filter((s) => s.summary.overallStatus === "eligible");
    const potentiallyEligible = screening.filter((s) => s.summary.overallStatus === "potentially_eligible");
    const ineligible = screening.filter((s) => s.summary.overallStatus === "ineligible");
    const needsReview = screening.filter((s) => s.summary.overallStatus === "needs_review");

    // Find top blockers — criteria that fail the most patients
    const blockerMap = new Map<string, number>();
    for (const s of screening) {
      for (const c of s.criteria) {
        if (
          (c.criterionType === "inclusion" && c.result === "not_met") ||
          (c.criterionType === "exclusion" && c.result === "met")
        ) {
          blockerMap.set(c.criterionText, (blockerMap.get(c.criterionText) ?? 0) + 1);
        }
      }
    }
    const topBlockers = Array.from(blockerMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([criterion, count]) => ({
        criterion,
        count,
        pct: Math.round((count / screening.length) * 100),
      }));

    const avgScore = screening.length > 0
      ? Math.round(screening.reduce((sum, s) => sum + s.summary.score, 0) / screening.length)
      : 0;

    const rev = STUDY_REVENUE[studyDef.studyId] ?? 25000;

    metrics.push({
      studyId: studyDef.studyId,
      studyName: STUDY_NAMES[studyDef.studyId] ?? studyDef.studyId,
      totalScreened: screening.length,
      eligible: eligible.length,
      potentiallyEligible: potentiallyEligible.length,
      ineligible: ineligible.length,
      needsReview: needsReview.length,
      screenPassRate: screening.length > 0 ? Math.round((eligible.length / screening.length) * 100) : 0,
      avgScore,
      topBlockers,
      revenuePerPatient: rev,
      projectedRevenue: (eligible.length + Math.round(potentiallyEligible.length * 0.4)) * rev,
    });
  }

  return metrics;
}

// Screen failure intelligence — aggregated across all studies
function computeFailureIntelligence(metrics: StudyMetrics[]) {
  const allBlockers = new Map<string, { count: number; studies: Set<string> }>();
  for (const m of metrics) {
    for (const b of m.topBlockers) {
      const existing = allBlockers.get(b.criterion);
      if (existing) {
        existing.count += b.count;
        existing.studies.add(m.studyName);
      } else {
        allBlockers.set(b.criterion, { count: b.count, studies: new Set([m.studyName]) });
      }
    }
  }
  return Array.from(allBlockers.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([criterion, data]) => ({
      criterion: criterion.length > 65 ? criterion.slice(0, 62) + "..." : criterion,
      fullCriterion: criterion,
      count: data.count,
      studies: Array.from(data.studies),
    }));
}

// Multi-study matching
function computeMultiStudyMatches(parsed: ParsedPatient[]) {
  const patientStudyMap = new Map<string, { name: string; studies: { id: string; name: string; score: number; status: string }[] }>();

  for (const studyDef of STUDY_SCREENING_DEFS) {
    const screening = screenPatientsForStudy(parsed, studyDef.studyId);
    for (const s of screening) {
      if (s.summary.overallStatus === "eligible" || s.summary.overallStatus === "potentially_eligible") {
        const p = parsed.find((pp) => pp.mrn === s.summary.sitePatientId);
        if (!p) continue;
        const key = p.mrn;
        if (!patientStudyMap.has(key)) {
          patientStudyMap.set(key, { name: `${p.firstName} ${p.lastName}`, studies: [] });
        }
        patientStudyMap.get(key)?.studies.push({
          id: studyDef.studyId,
          name: STUDY_NAMES[studyDef.studyId] ?? studyDef.studyId,
          score: s.summary.score,
          status: s.summary.overallStatus,
        });
      }
    }
  }

  return Array.from(patientStudyMap.entries())
    .filter(([_, data]) => data.studies.length > 1)
    .sort((a, b) => b[1].studies.length - a[1].studies.length)
    .map(([mrn, data]) => ({ mrn, ...data }));
}

type PerformanceTab = "overview" | "failures" | "matching";

export function PerformancePage() {
  const [tab, setTab] = useState<PerformanceTab>("overview");
  const [metrics, setMetrics] = useState<StudyMetrics[]>([]);
  const [patients, setPatients] = useState<ParsedPatient[]>([]);
  const [showInfoModal, setShowInfoModal] = useState(false);

  useEffect(() => {
    getPatients().then((parsed) => {
      setPatients(parsed);
      setMetrics(computeStudyMetrics(parsed));
    });
  }, []);

  const totalRevenue = useMemo(() => metrics.reduce((sum, m) => sum + m.projectedRevenue, 0), [metrics]);
  const totalEligible = useMemo(() => metrics.reduce((sum, m) => sum + m.eligible, 0), [metrics]);
  const totalScreened = useMemo(() => metrics.reduce((sum, m) => sum + m.totalScreened, 0), [metrics]);
  const avgPassRate = useMemo(() => {
    const rates = metrics.filter((m) => m.totalScreened > 0).map((m) => m.screenPassRate);
    return rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
  }, [metrics]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold text-white">Site Performance</h2>
              <button onClick={() => setShowInfoModal(true)} className="rounded-full p-1 text-slate-500 hover:bg-white/[0.05] hover:text-slate-300 transition-colors">
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Screen failure intelligence, multi-study matching, and revenue projections</p>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="mt-3 flex items-center gap-3">
          {[
            { label: "Active Studies", value: `${metrics.length}`, icon: <Layers className="h-3.5 w-3.5 text-indigo-400" />, color: "text-indigo-400" },
            { label: "Patients Screened", value: `${totalScreened}`, icon: <Users className="h-3.5 w-3.5 text-blue-400" />, color: "text-blue-400" },
            { label: "Eligible", value: `${totalEligible}`, icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />, color: "text-emerald-400" },
            { label: "Avg Pass Rate", value: `${avgPassRate}%`, icon: <Target className="h-3.5 w-3.5 text-amber-400" />, color: "text-amber-400" },
            { label: "Projected Revenue", value: `$${Math.round(totalRevenue / 1000)}K`, icon: <DollarSign className="h-3.5 w-3.5 text-emerald-400" />, color: "text-emerald-400" },
          ].map((kpi) => (
            <div key={kpi.label} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5 ring-1 ring-white/[0.06]">
              {kpi.icon}
              <div>
                <span className="text-[9px] text-slate-500 block leading-tight">{kpi.label}</span>
                <span className={`text-[14px] font-bold ${kpi.color} leading-tight`}>{kpi.value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mt-3 flex items-center gap-1">
          {[
            { id: "overview" as const, label: "Study Overview", icon: <BarChart3 className="h-3.5 w-3.5" /> },
            { id: "failures" as const, label: "Screen Failure Intelligence", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
            { id: "matching" as const, label: "Multi-Study Matching", icon: <GitBranch className="h-3.5 w-3.5" /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                tab === t.id ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "overview" && <OverviewTab metrics={metrics} />}
        {tab === "failures" && <FailureIntelligenceTab metrics={metrics} />}
        {tab === "matching" && <MultiStudyMatchingTab patients={patients} />}
      </div>

      {showInfoModal && <PerformanceInfoModal onClose={() => setShowInfoModal(false)} />}
    </div>
  );
}

function OverviewTab({ metrics }: { metrics: StudyMetrics[] }) {
  const chartData = metrics.map((m) => ({
    name: m.studyName,
    eligible: m.eligible,
    potential: m.potentiallyEligible,
    ineligible: m.ineligible,
    needsReview: m.needsReview,
  }));

  const revenueData = metrics.map((m) => ({
    name: m.studyName,
    revenue: Math.round(m.projectedRevenue / 1000),
    patients: m.eligible + Math.round(m.potentiallyEligible * 0.4),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Screening Results by Study */}
      <div className="rounded-xl border border-white/[0.06] bg-card p-5">
        <h3 className="text-[13px] font-bold text-white mb-4">Screening Results by Study</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1d2e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}
              />
              <Bar dataKey="eligible" fill="#10b981" name="Eligible" radius={[2, 2, 0, 0]} />
              <Bar dataKey="potential" fill="#8b5cf6" name="Potentially Eligible" radius={[2, 2, 0, 0]} />
              <Bar dataKey="ineligible" fill="#ef4444" name="Ineligible" radius={[2, 2, 0, 0]} />
              <Bar dataKey="needsReview" fill="#f59e0b" name="Needs Review" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Study Cards */}
      <div className="grid grid-cols-2 gap-4">
        {metrics.map((m) => (
          <div key={m.studyId} className="rounded-xl border border-white/[0.06] bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[13px] font-bold text-slate-200">{m.studyName}</h4>
              <span className="text-[11px] font-bold text-emerald-400">${Math.round(m.projectedRevenue / 1000)}K proj.</span>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[
                { label: "Screened", value: m.totalScreened, color: "text-slate-300" },
                { label: "Eligible", value: m.eligible, color: "text-emerald-400" },
                { label: "Pass Rate", value: `${m.screenPassRate}%`, color: m.screenPassRate >= 30 ? "text-emerald-400" : "text-amber-400" },
                { label: "Avg Score", value: m.avgScore, color: "text-indigo-400" },
              ].map((stat) => (
                <div key={stat.label}>
                  <span className="text-[9px] text-slate-600 block">{stat.label}</span>
                  <span className={`text-[14px] font-bold ${stat.color}`}>{stat.value}</span>
                </div>
              ))}
            </div>

            {/* Top Blockers Preview */}
            {m.topBlockers.length > 0 && (
              <div>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">Top Blockers</span>
                <div className="mt-1 space-y-1">
                  {m.topBlockers.slice(0, 2).map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-1 flex-1 rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-red-500/60" style={{ width: `${b.pct}%` }} />
                      </div>
                      <span className="text-[10px] text-red-400 w-8 text-right">{b.pct}%</span>
                      <span className="text-[10px] text-slate-500 truncate flex-1">{b.criterion.slice(0, 40)}...</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Revenue Projections */}
      <div className="rounded-xl border border-white/[0.06] bg-card p-5">
        <h3 className="text-[13px] font-bold text-white mb-4">Revenue Projections by Study</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(v) => `$${v}K`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1d2e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                formatter={(value) => [`$${Number(value)}K`, "Revenue"]}
              />
              <Bar dataKey="revenue" fill="url(#revenueGradient)" radius={[4, 4, 0, 0]} />
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.4} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function FailureIntelligenceTab({ metrics }: { metrics: StudyMetrics[] }) {
  const failures = useMemo(() => computeFailureIntelligence(metrics), [metrics]);
  const totalFails = useMemo(() => failures.reduce((sum, f) => sum + f.count, 0), [failures]);

  // Recommendations based on failure patterns
  const recommendations = useMemo(() => {
    const recs: { severity: "high" | "medium" | "low"; text: string; impact: string }[] = [];

    for (const f of failures.slice(0, 5)) {
      if (f.criterion.toLowerCase().includes("age")) {
        recs.push({ severity: "low", text: `Age criteria blocking ${f.count} patients. Consider protocol amendments for expanded age ranges.`, impact: `+${f.count} potential candidates` });
      } else if (f.criterion.toLowerCase().includes("lab") || f.criterion.toLowerCase().includes("egfr") || f.criterion.toLowerCase().includes("hba1c") || f.criterion.toLowerCase().includes("hematologic")) {
        recs.push({ severity: "medium", text: `Lab-based criterion "${f.criterion.slice(0, 50)}..." is a top blocker. Review thresholds with sponsor for possible amendment.`, impact: `+${Math.round(f.count * 0.6)} if relaxed` });
      } else if (f.criterion.toLowerCase().includes("prior") || f.criterion.toLowerCase().includes("treatment")) {
        recs.push({ severity: "high", text: `Prior treatment history blocking ${f.count} patients. Focus recruitment on treatment-naive populations.`, impact: `Adjust recruitment strategy` });
      } else if (f.criterion.toLowerCase().includes("diagnosis") || f.criterion.toLowerCase().includes("confirmed")) {
        recs.push({ severity: "medium", text: `Diagnosis confirmation blocking ${f.count} patients. Ensure ICD-10 coding is current in EMR.`, impact: `${Math.round(f.count * 0.3)} may have uncoded dx` });
      }
    }

    if (recs.length === 0) {
      recs.push({ severity: "low", text: "Screen failure rates are within normal ranges. Continue current recruitment strategy.", impact: "No action needed" });
    }

    return recs;
  }, [failures]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Failure Waterfall */}
      <div className="rounded-xl border border-white/[0.06] bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[13px] font-bold text-white">Screen Failure Waterfall</h3>
          <span className="text-[11px] text-slate-500">{totalFails} total failures across {metrics.length} studies</span>
        </div>
        <div className="space-y-2.5">
          {failures.map((f, i) => {
            const maxCount = failures[0]?.count ?? 1;
            const pct = Math.round((f.count / maxCount) * 100);
            return (
              <div key={i} className="group">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400 w-6 text-right">{f.count}</span>
                  <div className="flex-1">
                    <div className="h-7 rounded-md bg-white/[0.03] overflow-hidden relative">
                      <div
                        className="h-full rounded-md bg-gradient-to-r from-red-500/40 to-red-500/20 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-3 text-[11px] text-slate-300 truncate">
                        {f.criterion}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {f.studies.map((s) => (
                      <span key={s} className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-slate-500 ring-1 ring-white/[0.06]">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="h-4.5 w-4.5 text-indigo-400" />
          <h3 className="text-[13px] font-bold text-indigo-300">AI-Powered Recommendations</h3>
          <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[9px] font-semibold text-indigo-400 ring-1 ring-indigo-500/25">Smart Insights</span>
        </div>
        <div className="space-y-3">
          {recommendations.map((rec, i) => (
            <div key={i} className="flex gap-3 rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/[0.04]">
              <div className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${
                rec.severity === "high" ? "bg-red-400" : rec.severity === "medium" ? "bg-amber-400" : "bg-blue-400"
              }`} />
              <div className="flex-1">
                <p className="text-[12px] text-slate-300 leading-relaxed">{rec.text}</p>
                <p className="text-[10px] text-emerald-400 mt-1 font-medium">Impact: {rec.impact}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-study failure breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {metrics.map((m) => (
          <div key={m.studyId} className="rounded-xl border border-white/[0.06] bg-card p-4">
            <h4 className="text-[12px] font-bold text-slate-200 mb-3">{m.studyName} — Failure Analysis</h4>
            <div className="flex items-center gap-4 mb-3">
              <div className="relative h-16 w-16">
                <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15" fill="none"
                    stroke={m.screenPassRate >= 30 ? "#10b981" : "#f59e0b"}
                    strokeWidth="3"
                    strokeDasharray={`${m.screenPassRate * 0.942} 94.2`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-[13px] font-bold ${m.screenPassRate >= 30 ? "text-emerald-400" : "text-amber-400"}`}>
                  {m.screenPassRate}%
                </span>
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-emerald-400">Eligible</span>
                  <span className="font-bold text-emerald-400">{m.eligible}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-purple-400">Potentially</span>
                  <span className="font-bold text-purple-400">{m.potentiallyEligible}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-red-400">Ineligible</span>
                  <span className="font-bold text-red-400">{m.ineligible}</span>
                </div>
              </div>
            </div>
            {m.topBlockers.length > 0 && (
              <div className="space-y-1">
                {m.topBlockers.slice(0, 3).map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <XIcon className="h-3 w-3 text-red-400 flex-shrink-0" />
                    <span className="text-slate-500 truncate flex-1">{b.criterion.slice(0, 50)}...</span>
                    <span className="text-red-400 font-medium">{b.count}x</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MultiStudyMatchingTab({ patients }: { patients: ParsedPatient[] }) {
  const matches = useMemo(() => computeMultiStudyMatches(patients), [patients]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Summary */}
      <div className="rounded-xl border border-purple-500/15 bg-purple-500/5 p-5">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch className="h-4.5 w-4.5 text-purple-400" />
          <h3 className="text-[13px] font-bold text-purple-300">Multi-Study Eligible Patients</h3>
        </div>
        <p className="text-[12px] text-slate-400">
          <span className="font-bold text-purple-400">{matches.length} patients</span> are eligible for multiple studies simultaneously.
          Cross-enrolling maximizes per-patient revenue and reduces recruitment costs.
        </p>
      </div>

      {/* Match Cards */}
      <div className="space-y-3">
        {matches.map((match) => (
          <div key={match.mrn} className="rounded-xl border border-white/[0.06] bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/10 ring-1 ring-purple-500/20">
                  <Users className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-white">{match.name}</span>
                  <span className="ml-2 text-[11px] font-mono text-slate-500">{match.mrn}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-bold text-purple-400 ring-1 ring-purple-500/20">
                  {match.studies.length} studies
                </span>
                <span className="text-[11px] font-bold text-emerald-400">
                  ${Math.round(match.studies.reduce((sum, s) => sum + (STUDY_REVENUE[s.id] ?? 25000), 0) / 1000)}K value
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {match.studies.map((study) => (
                <div key={study.id} className="rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.06]">
                  <span className="text-[11px] font-semibold text-slate-200 block">{study.name}</span>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 flex-1 rounded-full bg-white/[0.06]">
                      <div className={`h-full rounded-full ${study.status === "eligible" ? "bg-emerald-500" : "bg-purple-500"}`} style={{ width: `${study.score}%` }} />
                    </div>
                    <span className={`text-[10px] font-bold ${study.status === "eligible" ? "text-emerald-400" : "text-purple-400"}`}>
                      {study.score}
                    </span>
                  </div>
                  <span className={`text-[9px] ${study.status === "eligible" ? "text-emerald-400" : "text-purple-400"}`}>
                    {study.status === "eligible" ? "Eligible" : "Potential"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {matches.length === 0 && (
          <div className="flex h-48 items-center justify-center rounded-xl border border-white/[0.06] bg-card">
            <div className="text-center">
              <GitBranch className="mx-auto h-8 w-8 text-slate-600 mb-2" />
              <p className="text-[13px] text-slate-500">No cross-study matches found</p>
              <p className="text-[11px] text-slate-600">Import more patient data to find multi-study candidates</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PerformanceInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#12141c] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-emerald-600/20 via-cyan-600/10 to-transparent px-6 py-5 border-b border-white/[0.06]">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-white/[0.1] hover:text-white">
            <XIcon className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500/15 p-2.5 ring-1 ring-emerald-500/25">
              <TrendingUp className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-white">Site Performance Intelligence</h3>
              <p className="text-[12px] text-emerald-300/70">Data-driven insights to win more studies and maximize revenue</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {[
            { icon: <AlertTriangle className="h-4 w-4 text-red-400" />, title: "Screen Failure Intelligence", desc: "See exactly which criteria block the most patients. Get AI-powered recommendations to adjust recruitment strategy or discuss protocol amendments." },
            { icon: <GitBranch className="h-4 w-4 text-purple-400" />, title: "Multi-Study Smart Matching", desc: "Automatically identifies patients eligible for multiple studies. Maximize per-patient revenue by cross-enrolling across your trial portfolio." },
            { icon: <DollarSign className="h-4 w-4 text-emerald-400" />, title: "Revenue Projections", desc: "Real-time revenue forecasting based on your actual patient population. Project enrollment numbers and financial outcomes per study." },
            { icon: <Award className="h-4 w-4 text-amber-400" />, title: "Competitive Benchmarking", desc: "Track your screen pass rates, enrollment velocity, and conversion metrics. Use these numbers to demonstrate site capability to sponsors." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <div className="mt-0.5 rounded-lg bg-white/[0.04] p-2 ring-1 ring-white/[0.06]">{item.icon}</div>
              <div>
                <h4 className="text-[13px] font-semibold text-slate-200">{item.title}</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}

          <div className="rounded-lg bg-white/[0.02] px-4 py-3 ring-1 ring-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">The Bottom Line</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Sponsors select sites based on metrics. Sites that can demonstrate strong screen pass rates, fast enrollment velocity, and diverse patient populations win more studies. This dashboard gives you the data to prove it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
