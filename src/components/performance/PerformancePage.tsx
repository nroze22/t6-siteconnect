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
  Download,
  FileText,
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
import { SkeletonCard, SkeletonChart } from "@/components/ui/Skeleton";
import { useAnimatedNumber } from "@/hooks/use-animated-number";
import { PerformanceInsights } from "@/components/analytics/InsightsPanel";
import { exportCSV, exportReportDeck } from "@/lib/analytics-export";
import { useAnalyticsStore } from "@/stores/use-analytics-store";
import { DrillDownPanel } from "@/components/analytics/DrillDownPanel";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPatients().then((parsed) => {
      setPatients(parsed);
      setMetrics(computeStudyMetrics(parsed));
      setLoading(false);
    });
  }, []);

  const totalRevenue = useMemo(() => metrics.reduce((sum, m) => sum + m.projectedRevenue, 0), [metrics]);
  const totalEligible = useMemo(() => metrics.reduce((sum, m) => sum + m.eligible, 0), [metrics]);
  const totalScreened = useMemo(() => metrics.reduce((sum, m) => sum + m.totalScreened, 0), [metrics]);
  const animatedScreened = useAnimatedNumber(totalScreened);
  const animatedEligible = useAnimatedNumber(totalEligible);
  const animatedRevenue = useAnimatedNumber(Math.round(totalRevenue / 1000));
  const avgPassRate = useMemo(() => {
    const rates = metrics.filter((m) => m.totalScreened > 0).map((m) => m.screenPassRate);
    return rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
  }, [metrics]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-[12px] text-dim">Screen failure intelligence, multi-study matching, and revenue projections</p>
            <button onClick={() => setShowInfoModal(true)} className="rounded-full p-1 text-dim hover:bg-surface-3 hover:text-body transition-colors">
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const headers = ["Study", "Screened", "Eligible", "Potentially Eligible", "Ineligible", "Needs Review", "Pass Rate (%)", "Avg Score", "Revenue/Patient ($)", "Projected Revenue ($)"];
                const rows = metrics.map((m) => [
                  m.studyName,
                  m.totalScreened,
                  m.eligible,
                  m.potentiallyEligible,
                  m.ineligible,
                  m.needsReview,
                  m.screenPassRate,
                  m.avgScore,
                  m.revenuePerPatient,
                  m.projectedRevenue,
                ] as (string | number | null)[]);
                exportCSV({ filename: "site-performance-metrics", headers, rows, includeTimestamp: true });
              }}
              disabled={metrics.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-dim hover:bg-surface-3 hover:text-body transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              onClick={() => {
                exportReportDeck({
                  title: "Site Performance Report",
                  subtitle: `${metrics.length} Active Studies`,
                  confidential: true,
                  sections: [
                    {
                      type: "metrics",
                      title: "Aggregate KPIs",
                      columns: 4,
                      metrics: [
                        { label: "Active Studies", value: String(metrics.length) },
                        { label: "Subjects Screened", value: String(totalScreened), accent: true },
                        { label: "Eligible", value: String(totalEligible), accent: true },
                        { label: "Projected Revenue", value: `$${Math.round(totalRevenue / 1000)}K` },
                      ],
                    },
                    {
                      type: "table",
                      title: "Study Breakdown",
                      headers: ["Study", "Screened", "Eligible", "Pass Rate", "Avg Score", "Projected Revenue"],
                      rows: metrics.map((m) => [
                        m.studyName,
                        m.totalScreened,
                        m.eligible,
                        `${m.screenPassRate}%`,
                        m.avgScore,
                        `$${Math.round(m.projectedRevenue / 1000)}K`,
                      ]),
                    },
                  ],
                });
              }}
              disabled={metrics.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-dim hover:bg-surface-3 hover:text-body transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <FileText className="h-3.5 w-3.5" />
              PDF
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="mt-3 flex items-center gap-3">
          {[
            { label: "Active Studies", value: `${metrics.length}`, icon: <Layers className="h-3.5 w-3.5 text-indigo-400" />, color: "text-indigo-400" },
            { label: "Subjects Screened", value: `${animatedScreened}`, icon: <Users className="h-3.5 w-3.5 text-blue-400" />, color: "text-blue-400" },
            { label: "Eligible", value: `${animatedEligible}`, icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />, color: "text-emerald-400" },
            { label: "Avg Pass Rate", value: `${avgPassRate}%`, icon: <Target className="h-3.5 w-3.5 text-amber-400" />, color: "text-amber-400" },
            { label: "Projected Revenue", value: `$${animatedRevenue}K`, icon: <DollarSign className="h-3.5 w-3.5 text-emerald-400" />, color: "text-emerald-400" },
          ].map((kpi) => (
            <div key={kpi.label} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 ring-1 ring-edge-2">
              {kpi.icon}
              <div>
                <span className="text-[9px] text-dim block leading-tight">{kpi.label}</span>
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
                tab === t.id ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25" : "text-dim hover:bg-surface-2 hover:text-body"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonChart className="col-span-3" />
          </div>
        ) : (
          <>
            {tab === "overview" && <OverviewTab metrics={metrics} patients={patients} />}
            {tab === "failures" && <FailureIntelligenceTab metrics={metrics} />}
            {tab === "matching" && <MultiStudyMatchingTab patients={patients} />}
          </>
        )}
      </div>

      {showInfoModal && <PerformanceInfoModal onClose={() => setShowInfoModal(false)} />}
      <DrillDownPanel />
    </div>
  );
}

function OverviewTab({ metrics, patients }: { metrics: StudyMetrics[]; patients: ParsedPatient[] }) {
  const openDrillDown = useAnalyticsStore((s) => s.openDrillDown);

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

  const totalScreened = metrics.reduce((sum, m) => sum + m.totalScreened, 0);
  const totalEligible = metrics.reduce((sum, m) => sum + m.eligible, 0);

  const performanceStudies = useMemo(() => metrics.map((m) => ({
    name: m.studyName,
    passRate: m.screenPassRate,
    eligible: m.eligible,
    revenue: m.projectedRevenue,
  })), [metrics]);

  // Pre-compute eligible patient IDs per study for drill-down
  const eligibleByStudy = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const studyDef of STUDY_SCREENING_DEFS) {
      const screening = screenPatientsForStudy(patients, studyDef.studyId);
      const eligibleIds = screening
        .filter((s) => s.summary.overallStatus === "eligible")
        .map((s) => s.summary.sitePatientId);
      map.set(studyDef.studyId, eligibleIds);
    }
    return map;
  }, [patients]);

  const handleStudyClick = (m: StudyMetrics) => {
    const patientIds = eligibleByStudy.get(m.studyId) ?? [];
    openDrillDown({
      type: "study",
      title: `${m.studyName} — Eligible Subjects`,
      description: `${m.eligible} eligible subjects out of ${m.totalScreened} screened (${m.screenPassRate}% pass rate)`,
      patientIds,
      sourceChart: "Study Overview",
      sourceValue: m.studyName,
      metadata: {
        studyId: m.studyId,
        screenPassRate: m.screenPassRate,
        projectedRevenue: m.projectedRevenue,
      },
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Performance Insights */}
      <PerformanceInsights
        studies={performanceStudies}
        overallScreened={totalScreened}
        overallEligible={totalEligible}
      />

      {/* Screening Results by Study */}
      <div className="rounded-xl border border-edge-2 bg-card p-5">
        <h3 className="text-[13px] font-bold text-heading mb-4">Screening Results by Study</h3>
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
          <div
            key={m.studyId}
            className="rounded-xl border border-edge-2 bg-card p-4 cursor-pointer hover:border-indigo-500/30 hover:bg-surface-1 transition-colors"
            onClick={() => handleStudyClick(m)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleStudyClick(m); } }}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[13px] font-bold text-body">{m.studyName}</h4>
              <span className="text-[12px] font-bold text-emerald-400">${Math.round(m.projectedRevenue / 1000)}K proj.</span>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[
                { label: "Screened", value: m.totalScreened, color: "text-body" },
                { label: "Eligible", value: m.eligible, color: "text-emerald-400" },
                { label: "Pass Rate", value: `${m.screenPassRate}%`, color: m.screenPassRate >= 30 ? "text-emerald-400" : "text-amber-400" },
                { label: "Avg Score", value: m.avgScore, color: "text-indigo-400" },
              ].map((stat) => (
                <div key={stat.label}>
                  <span className="text-[9px] text-dim block">{stat.label}</span>
                  <span className={`text-[14px] font-bold ${stat.color}`}>{stat.value}</span>
                </div>
              ))}
            </div>

            {/* Top Blockers Preview */}
            {m.topBlockers.length > 0 && (
              <div>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-dim">Top Blockers</span>
                <div className="mt-1 space-y-1">
                  {m.topBlockers.slice(0, 2).map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-1 flex-1 rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-red-500/60" style={{ width: `${b.pct}%` }} />
                      </div>
                      <span className="text-[12px] text-red-400 w-8 text-right">{b.pct}%</span>
                      <span className="text-[12px] text-dim truncate flex-1">{b.criterion.slice(0, 40)}...</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Revenue Projections */}
      <div className="rounded-xl border border-edge-2 bg-card p-5">
        <h3 className="text-[13px] font-bold text-heading mb-4">Revenue Projections by Study</h3>
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
        recs.push({ severity: "low", text: `Age criteria blocking ${f.count} subjects. Consider protocol amendments for expanded age ranges.`, impact: `+${f.count} potential candidates` });
      } else if (f.criterion.toLowerCase().includes("lab") || f.criterion.toLowerCase().includes("egfr") || f.criterion.toLowerCase().includes("hba1c") || f.criterion.toLowerCase().includes("hematologic")) {
        recs.push({ severity: "medium", text: `Lab-based criterion "${f.criterion.slice(0, 50)}..." is a top blocker. Review thresholds with sponsor for possible amendment.`, impact: `+${Math.round(f.count * 0.6)} if relaxed` });
      } else if (f.criterion.toLowerCase().includes("prior") || f.criterion.toLowerCase().includes("treatment")) {
        recs.push({ severity: "high", text: `Prior treatment history blocking ${f.count} subjects. Focus recruitment on treatment-naive populations.`, impact: `Adjust recruitment strategy` });
      } else if (f.criterion.toLowerCase().includes("diagnosis") || f.criterion.toLowerCase().includes("confirmed")) {
        recs.push({ severity: "medium", text: `Diagnosis confirmation blocking ${f.count} subjects. Ensure ICD-10 coding is current in EMR.`, impact: `${Math.round(f.count * 0.3)} may have uncoded dx` });
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
      <div className="rounded-xl border border-edge-2 bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[13px] font-bold text-heading">Screen Failure Waterfall</h3>
          <span className="text-[12px] text-dim">{totalFails} total failures across {metrics.length} studies</span>
        </div>
        <div className="space-y-2.5">
          {failures.map((f, i) => {
            const maxCount = failures[0]?.count ?? 1;
            const pct = Math.round((f.count / maxCount) * 100);
            return (
              <div key={i} className="group">
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-dim w-6 text-right">{f.count}</span>
                  <div className="flex-1">
                    <div className="h-7 rounded-md bg-surface-2 overflow-hidden relative">
                      <div
                        className="h-full rounded-md bg-gradient-to-r from-red-500/40 to-red-500/20 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-3 text-[12px] text-body truncate">
                        {f.criterion}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {f.studies.map((s) => (
                      <span key={s} className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] text-dim ring-1 ring-edge-2">{s}</span>
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
            <div key={i} className="flex gap-3 rounded-lg bg-surface-1 p-3 ring-1 ring-edge-1">
              <div className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${
                rec.severity === "high" ? "bg-red-400" : rec.severity === "medium" ? "bg-amber-400" : "bg-blue-400"
              }`} />
              <div className="flex-1">
                <p className="text-[12px] text-body leading-relaxed">{rec.text}</p>
                <p className="text-[12px] text-emerald-400 mt-1 font-medium">Impact: {rec.impact}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-study failure breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {metrics.map((m) => (
          <div key={m.studyId} className="rounded-xl border border-edge-2 bg-card p-4">
            <h4 className="text-[12px] font-bold text-body mb-3">{m.studyName} — Failure Analysis</h4>
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
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-emerald-400">Eligible</span>
                  <span className="font-bold text-emerald-400">{m.eligible}</span>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-purple-400">Potentially</span>
                  <span className="font-bold text-purple-400">{m.potentiallyEligible}</span>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-red-400">Ineligible</span>
                  <span className="font-bold text-red-400">{m.ineligible}</span>
                </div>
              </div>
            </div>
            {m.topBlockers.length > 0 && (
              <div className="space-y-1">
                {m.topBlockers.slice(0, 3).map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <XIcon className="h-3 w-3 text-red-400 flex-shrink-0" />
                    <span className="text-dim truncate flex-1">{b.criterion.slice(0, 50)}...</span>
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
          <h3 className="text-[13px] font-bold text-purple-300">Multi-Study Eligible Subjects</h3>
        </div>
        <p className="text-[12px] text-dim">
          <span className="font-bold text-purple-400">{matches.length} subjects</span> are eligible for multiple studies simultaneously.
          Cross-enrolling maximizes per-subject revenue and reduces recruitment costs.
        </p>
      </div>

      {/* Match Cards */}
      <div className="space-y-3">
        {matches.map((match) => (
          <div key={match.mrn} className="rounded-xl border border-edge-2 bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/10 ring-1 ring-purple-500/20">
                  <Users className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-heading">{match.name}</span>
                  <span className="ml-2 text-[12px] font-mono text-dim">{match.mrn}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[12px] font-bold text-purple-400 ring-1 ring-purple-500/20">
                  {match.studies.length} studies
                </span>
                <span className="text-[12px] font-bold text-emerald-400">
                  ${Math.round(match.studies.reduce((sum, s) => sum + (STUDY_REVENUE[s.id] ?? 25000), 0) / 1000)}K value
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {match.studies.map((study) => (
                <div key={study.id} className="rounded-lg bg-surface-2 px-3 py-2 ring-1 ring-edge-2">
                  <span className="text-[12px] font-semibold text-body block">{study.name}</span>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 flex-1 rounded-full bg-surface-3">
                      <div className={`h-full rounded-full ${study.status === "eligible" ? "bg-emerald-500" : "bg-purple-500"}`} style={{ width: `${study.score}%` }} />
                    </div>
                    <span className={`text-[12px] font-bold ${study.status === "eligible" ? "text-emerald-400" : "text-purple-400"}`}>
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
          <div className="flex h-48 items-center justify-center rounded-xl border border-edge-2 bg-card">
            <div className="text-center">
              <GitBranch className="mx-auto h-8 w-8 text-dim mb-2" />
              <p className="text-[13px] text-dim">No cross-study matches found</p>
              <p className="text-[12px] text-dim">Import more subject data to find multi-study candidates</p>
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
      <div className="w-full max-w-lg rounded-2xl border border-edge-3 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-emerald-600/20 via-cyan-600/10 to-transparent px-6 py-5 border-b border-edge-2">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1 text-dim hover:bg-surface-5 hover:text-heading">
            <XIcon className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500/15 p-2.5 ring-1 ring-emerald-500/25">
              <TrendingUp className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-heading">Site Performance Intelligence</h3>
              <p className="text-[12px] text-emerald-300/70">Data-driven insights to win more studies and maximize revenue</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {[
            { icon: <AlertTriangle className="h-4 w-4 text-red-400" />, title: "Screen Failure Intelligence", desc: "See exactly which criteria block the most subjects. Get AI-powered recommendations to adjust recruitment strategy or discuss protocol amendments." },
            { icon: <GitBranch className="h-4 w-4 text-purple-400" />, title: "Multi-Study Smart Matching", desc: "Automatically identifies subjects eligible for multiple studies. Maximize per-subject revenue by cross-enrolling across your trial portfolio." },
            { icon: <DollarSign className="h-4 w-4 text-emerald-400" />, title: "Revenue Projections", desc: "Real-time revenue forecasting based on your actual subject population. Project enrollment numbers and financial outcomes per study." },
            { icon: <Award className="h-4 w-4 text-amber-400" />, title: "Competitive Benchmarking", desc: "Track your screen pass rates, enrollment velocity, and conversion metrics. Use these numbers to demonstrate site capability to sponsors." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <div className="mt-0.5 rounded-lg bg-surface-2 p-2 ring-1 ring-edge-2">{item.icon}</div>
              <div>
                <h4 className="text-[13px] font-semibold text-body">{item.title}</h4>
                <p className="text-[12px] text-dim leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}

          <div className="rounded-lg bg-surface-1 px-4 py-3 ring-1 ring-edge-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-dim mb-1.5">The Bottom Line</p>
            <p className="text-[12px] text-dim leading-relaxed">
              Sponsors select sites based on metrics. Sites that can demonstrate strong screen pass rates, fast enrollment velocity, and diverse subject populations win more studies. This dashboard gives you the data to prove it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
