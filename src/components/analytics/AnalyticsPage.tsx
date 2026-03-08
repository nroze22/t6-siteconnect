import { useState, useMemo, useEffect, useCallback } from "react";
import {
  BarChart3,
  TrendingUp,
  Users,
  Activity,
  Brain,
  Target,
  Sparkles,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Download,
  Calculator,
  Eye,
  Gauge,
  ShieldCheck,
  Info,
  X as XIcon,
  Zap,
  DollarSign,
  CalendarClock,
  FlaskConical,
  HeartPulse,
  Shield,
  Globe,
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
  PieChart as RePieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { getPatients } from "@/lib/data-provider";
import type { ParsedPatient } from "@/lib/epic-demo-data";
import { SkeletonChart, SkeletonCard } from "@/components/ui/Skeleton";
import { useAnimatedNumber } from "@/hooks/use-animated-number";
import {
  runFeasibilityQuery,
  forecastEnrollment,
  findPatientsApproachingThreshold,
  computeDiversityProfile,
  PRESET_QUERIES,
  LAB_THRESHOLD_PRESETS,
  type EnrollmentForecast,
} from "@/lib/population-analytics";
import { useAnalyticsStore } from "@/stores/use-analytics-store";
import { useFilteredPatients } from "@/stores/use-analytics-store";
import { runMonteCarloForecast } from "@/lib/statistical-engine";
import type { MonteCarloResult } from "@/lib/statistical-engine";
import { exportCSV, exportReportDeck } from "@/lib/analytics-export";
import { FeasibilityInsights, DiversityInsights } from "@/components/analytics/InsightsPanel";
import { ActiveFiltersBar } from "@/components/analytics/ActiveFiltersBar";
import { DrillDownPanel } from "@/components/analytics/DrillDownPanel";

type AnalyticsTab = "feasibility" | "trajectory" | "diversity";

const tooltipStyle = {
  backgroundColor: "#1a1f2e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  fontSize: 11,
  color: "#e2e8f0",
};

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("feasibility");
  const [allPatients, setAllPatients] = useState<ParsedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const filteredPatients = useFilteredPatients(allPatients);
  const patients = filteredPatients;
  const animatedCount = useAnimatedNumber(patients.length);

  useEffect(() => {
    getPatients().then((p) => {
      setAllPatients(p);
      setLoading(false);
    });
  }, []);

  const tabs: { id: AnalyticsTab; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: "feasibility", label: "Protocol Feasibility", icon: <Calculator className="h-4 w-4" />, desc: "Can you run this study?" },
    { id: "trajectory", label: "Lab Trajectories", icon: <TrendingUp className="h-4 w-4" />, desc: "Subjects becoming eligible" },
    { id: "diversity", label: "Diversity Profile", icon: <Users className="h-4 w-4" />, desc: "FDA diversity compliance" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-card/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-slate-500">
            <span className="tabular-nums font-medium text-slate-300">{animatedCount}</span> subjects loaded
          </p>
          <div className="flex items-center gap-1 rounded-lg bg-emerald-500/8 px-3 py-1.5 ring-1 ring-emerald-500/15">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-medium text-emerald-400">Live from your data</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 border-b border-border px-6 py-2">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25"
                  : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
              }`}
            >
              <span className={activeTab === tab.id ? "text-indigo-400" : ""}>{tab.icon}</span>
              {tab.label}
              <span className={`text-[10px] ${activeTab === tab.id ? "text-indigo-400/60" : "text-slate-600"}`}>
                {tab.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Active filters bar */}
      <div className="shrink-0 px-6 pt-2">
        <ActiveFiltersBar />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid grid-cols-2 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonChart className="col-span-2" />
          </div>
        ) : (
          <>
            {activeTab === "feasibility" && <FeasibilityTab patients={patients} />}
            {activeTab === "trajectory" && <TrajectoryTab patients={patients} />}
            {activeTab === "diversity" && <DiversityTab patients={patients} />}
          </>
        )}
      </div>

      {/* Drill-down slide-over */}
      <DrillDownPanel />
    </div>
  );
}

// ============================================================
// TAB 1: PROTOCOL FEASIBILITY CALCULATOR
// ============================================================

function FeasibilityTab({ patients }: { patients: ParsedPatient[] }) {
  const [selectedQueryId, setSelectedQueryId] = useState(PRESET_QUERIES[0]!.id);
  const [forecast, setForecast] = useState<EnrollmentForecast | null>(null);
  const [monteCarlo, setMonteCarlo] = useState<MonteCarloResult | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const openDrillDown = useAnalyticsStore((s) => s.openDrillDown);

  const selectedQuery = PRESET_QUERIES.find((q) => q.id === selectedQueryId) ?? PRESET_QUERIES[0]!;

  const result = useMemo(
    () => runFeasibilityQuery(patients, selectedQuery),
    [patients, selectedQuery],
  );

  // Get matched patient MRNs for drill-down (from the result directly)
  const matchedMRNs = result.matchedPatientIds;

  const handleForecast = () => {
    const fc = forecastEnrollment(patients, result.matchingPatients, selectedQuery.name, 20);
    setForecast(fc);
    // Also run Monte Carlo
    const mc = runMonteCarloForecast({
      eligiblePool: result.matchingPatients,
      screenFailureRate: 0.3,
      consentRate: 0.45,
      dropoutRate: 0.05,
      monthlyCapacity: Math.max(5, Math.ceil(result.matchingPatients / 4)),
      targetEnrollment: 20,
      months: 18,
      simulations: 1000,
    });
    setMonteCarlo(mc);
  };

  const handleDrillDown = useCallback((criterion: string, count: number) => {
    openDrillDown({
      type: "criterion",
      title: `Subjects passing: ${criterion}`,
      description: `${count} subjects meet this criterion from ${selectedQuery.name}`,
      patientIds: matchedMRNs,
      sourceChart: "Feasibility",
      sourceValue: criterion,
      metadata: { query: selectedQuery.name },
    });
  }, [openDrillDown, matchedMRNs, selectedQuery.name]);

  const handleExportCSV = useCallback(() => {
    const headers = ["Criterion", "Passing", "Total", "Rate"];
    const rows = result.criterionBreakdown.map((cb) => [
      cb.criterion,
      cb.matchCount,
      result.totalPatients,
      `${(cb.matchRate * 100).toFixed(1)}%`,
    ]);
    exportCSV({ filename: `feasibility-${selectedQuery.id}`, headers, rows });
  }, [result, selectedQuery.id]);

  const handleExportReport = useCallback(() => {
    exportReportDeck({
      title: `Protocol Feasibility: ${selectedQuery.name}`,
      subtitle: "Population Intelligence Report",
      confidential: true,
      sections: [
        {
          type: "metrics",
          columns: 4,
          metrics: [
            { label: "Total Population", value: String(result.totalPatients) },
            { label: "Matching Subjects", value: String(result.matchingPatients), accent: true },
            { label: "Match Rate", value: `${(result.matchRate * 100).toFixed(1)}%` },
            { label: "Avg Age", value: result.demographics.avgAge > 0 ? `${result.demographics.avgAge}y` : "—" },
          ],
        },
        {
          type: "table",
          headers: ["Criterion", "Passing", "Total", "Rate"],
          rows: result.criterionBreakdown.map((cb) => [
            cb.criterion,
            cb.matchCount,
            result.totalPatients,
            `${(cb.matchRate * 100).toFixed(1)}%`,
          ]),
        },
        ...(monteCarlo ? [{
          type: "metrics" as const,
          columns: 3,
          metrics: [
            { label: "P(Success)", value: `${monteCarlo.probabilityOfSuccess.toFixed(0)}%`, accent: monteCarlo.probabilityOfSuccess >= 70 },
            { label: "Expected Enrolled", value: String(Math.round(monteCarlo.expectedEnrolled)) },
            { label: "Median Time to Target", value: monteCarlo.medianTimeToTarget ? `${monteCarlo.medianTimeToTarget} mo` : "N/A" },
          ],
        }] : []),
      ],
    });
  }, [result, selectedQuery.name, monteCarlo]);

  return (
    <div className="space-y-6">
      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} {...FEASIBILITY_MODAL} />

      {/* Query selector */}
      <div className="flex items-center gap-3">
        <Target className="h-5 w-5 text-indigo-400" />
        <h3 className="text-[14px] font-bold text-white">Select Protocol Template</h3>
        <InfoButton onClick={() => setShowInfo(true)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PRESET_QUERIES.map((q) => (
          <button
            key={q.id}
            onClick={() => { setSelectedQueryId(q.id); setForecast(null); }}
            className={`rounded-lg border p-3 text-left transition-all ${
              selectedQueryId === q.id
                ? "border-indigo-500/30 bg-indigo-500/10 ring-1 ring-indigo-500/20"
                : "border-white/[0.06] bg-card hover:border-white/[0.1]"
            }`}
          >
            <p className={`text-[12px] font-semibold ${selectedQueryId === q.id ? "text-indigo-300" : "text-slate-200"}`}>
              {q.name}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {q.criteria.length} criteria
            </p>
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="grid grid-cols-4 gap-3">
        <ResultCard
          icon={<Users className="h-4 w-4 text-blue-400" />}
          label="Total Population"
          value={String(result.totalPatients)}
          color="bg-blue-500/10 ring-1 ring-blue-500/20"
        />
        <ResultCard
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          label="Matching Subjects"
          value={String(result.matchingPatients)}
          subtext={`${(result.matchRate * 100).toFixed(1)}% match rate`}
          color="bg-emerald-500/10 ring-1 ring-emerald-500/20"
        />
        <ResultCard
          icon={<Gauge className="h-4 w-4 text-amber-400" />}
          label="Avg Age (Matched)"
          value={result.demographics.avgAge > 0 ? `${result.demographics.avgAge}y` : "—"}
          color="bg-amber-500/10 ring-1 ring-amber-500/20"
        />
        <ResultCard
          icon={<Activity className="h-4 w-4 text-purple-400" />}
          label="Gender Split"
          value={result.demographics.avgAge > 0
            ? `${result.demographics.genderSplit.male}M / ${result.demographics.genderSplit.female}F`
            : "—"}
          color="bg-purple-500/10 ring-1 ring-purple-500/20"
        />
      </div>

      {/* Export + drill-down action bar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleDrillDown("All criteria", result.matchingPatients)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-[11px] font-medium text-indigo-300 ring-1 ring-indigo-500/20 transition-colors hover:bg-indigo-500/20"
        >
          <Eye className="h-3.5 w-3.5" />
          View {result.matchingPatients} Matched Subjects
        </button>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.06]"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
        <button
          onClick={handleExportReport}
          className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.06]"
        >
          <FileText className="h-3.5 w-3.5" />
          Export Report
        </button>
      </div>

      {/* AI Insights */}
      <FeasibilityInsights
        totalPatients={result.totalPatients}
        matchingPatients={result.matchingPatients}
        matchRate={result.matchRate}
        criterionBreakdown={result.criterionBreakdown}
        demographics={result.demographics}
      />

      {/* Criterion breakdown — clickable for drill-down */}
      <div className="rounded-xl border border-white/[0.06] bg-card p-4">
        <h4 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
          <BarChart3 className="h-4 w-4 text-indigo-400" />
          Criterion-by-Criterion Feasibility
        </h4>
        <p className="mt-1 text-[11px] text-slate-500">
          Click any criterion to drill down into the matching subjects.
        </p>
        <div className="mt-4 space-y-2.5">
          {result.criterionBreakdown.map((cb, i) => (
            <button
              key={i}
              onClick={() => handleDrillDown(cb.criterion, cb.matchCount)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.03]"
            >
              <span className="w-48 shrink-0 text-left text-[12px] text-slate-300">{cb.criterion}</span>
              <div className="flex-1">
                <div className="h-5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-500"
                    style={{ width: `${cb.matchRate * 100}%` }}
                  />
                </div>
              </div>
              <span className="w-16 shrink-0 text-right text-[12px] font-bold tabular-nums text-slate-200">
                {cb.matchCount}
              </span>
              <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-slate-500">
                {(cb.matchRate * 100).toFixed(0)}%
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Enrollment Forecast */}
      <div className="rounded-xl border border-white/[0.06] bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Enrollment Forecast
            </h4>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Project how quickly you could enroll based on your subject volume.
            </p>
          </div>
          {!forecast && (
            <button
              onClick={handleForecast}
              disabled={result.matchingPatients === 0}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate Forecast
            </button>
          )}
        </div>

        {forecast && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <MiniStat label="Monthly Enrollment" value={`~${forecast.estimatedMonthlyEnrollment}/mo`} />
              <MiniStat label="Time to Target (20)" value={`${forecast.projectedMonths} months`} />
              <MiniStat label="Consent Rate" value={`${(forecast.consentRate * 100).toFixed(0)}%`} />
              <MiniStat label="Screen Failure Rate" value={`${(forecast.screenFailureRate * 100).toFixed(0)}%`} />
            </div>

            {/* Monte Carlo stats */}
            {monteCarlo && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-indigo-500/8 px-3 py-2 ring-1 ring-indigo-500/15">
                  <p className="text-[10px] font-medium text-indigo-400/60">P(Success)</p>
                  <p className={`text-lg font-bold tabular-nums ${monteCarlo.probabilityOfSuccess >= 70 ? "text-emerald-400" : monteCarlo.probabilityOfSuccess >= 40 ? "text-amber-400" : "text-red-400"}`}>
                    {monteCarlo.probabilityOfSuccess.toFixed(0)}%
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.06]">
                  <p className="text-[10px] font-medium text-slate-500">80% Confidence Interval</p>
                  <p className="text-lg font-bold tabular-nums text-slate-200">
                    {Math.round(monteCarlo.confidenceInterval[0])} – {Math.round(monteCarlo.confidenceInterval[1])}
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.06]">
                  <p className="text-[10px] font-medium text-slate-500">Median Time to Target</p>
                  <p className="text-lg font-bold tabular-nums text-slate-200">
                    {monteCarlo.medianTimeToTarget ? `${monteCarlo.medianTimeToTarget} mo` : "Not reached"}
                  </p>
                </div>
              </div>
            )}

            {/* Chart with confidence bands */}
            {/* Chart with confidence bands */}
            {monteCarlo ? (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monteCarlo.timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="p90" stroke="none" fill="rgba(99,102,241,0.08)" name="P90" />
                    <Area type="monotone" dataKey="p10" stroke="none" fill="#0c0f17" name="P10" />
                    <Area type="monotone" dataKey="p75" stroke="none" fill="rgba(99,102,241,0.15)" name="P75" />
                    <Area type="monotone" dataKey="p25" stroke="none" fill="#0c0f17" name="P25" />
                    <Area type="monotone" dataKey="p50" stroke="#6366f1" fill="rgba(99,102,241,0.2)" strokeWidth={2} name="Median (P50)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecast.projectedTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="target" stroke="rgba(239,68,68,0.3)" fill="rgba(239,68,68,0.05)" strokeDasharray="4 4" name="Target" />
                    <Area type="monotone" dataKey="cumulative" stroke="#10b981" fill="rgba(16,185,129,0.15)" name="Projected" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {monteCarlo && (
              <p className="text-[10px] text-slate-600 text-center">
                Monte Carlo simulation (1,000 runs) • Confidence bands: P10–P90 (light) and P25–P75 (dark)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TAB 2: LAB TRAJECTORIES
// ============================================================

function TrajectoryTab({ patients }: { patients: ParsedPatient[] }) {
  const [selectedPreset, setSelectedPreset] = useState(LAB_THRESHOLD_PRESETS[0]!.id);
  const [showInfo, setShowInfo] = useState(false);
  const preset = LAB_THRESHOLD_PRESETS.find((p) => p.id === selectedPreset) ?? LAB_THRESHOLD_PRESETS[0]!;

  const trajectoryGroup = useMemo(
    () => findPatientsApproachingThreshold(patients, preset.labName, preset.threshold, preset.direction, 25),
    [patients, preset],
  );

  return (
    <div className="space-y-6">
      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} {...TRAJECTORY_MODAL} />

      <div className="flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-amber-400" />
        <div>
          <h3 className="text-[14px] font-bold text-white">Subjects Approaching Eligibility</h3>
          <p className="text-[11px] text-slate-500">
            These subjects are near a lab threshold — they may become eligible soon with natural disease progression.
          </p>
        </div>
        <InfoButton onClick={() => setShowInfo(true)} />
      </div>

      {/* Threshold selector */}
      <div className="grid grid-cols-3 gap-2">
        {LAB_THRESHOLD_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedPreset(p.id)}
            className={`rounded-lg border p-3 text-left transition-all ${
              selectedPreset === p.id
                ? "border-amber-500/30 bg-amber-500/10 ring-1 ring-amber-500/20"
                : "border-white/[0.06] bg-card hover:border-white/[0.1]"
            }`}
          >
            <p className={`text-[12px] font-semibold ${selectedPreset === p.id ? "text-amber-300" : "text-slate-200"}`}>
              {p.name}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">{p.trialContext}</p>
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="grid grid-cols-3 gap-3">
        <ResultCard
          icon={<Eye className="h-4 w-4 text-amber-400" />}
          label="Approaching Threshold"
          value={String(trajectoryGroup.patients.length)}
          subtext={`within 25% of ${preset.labName} ${preset.direction === "above" ? "≥" : "≤"} ${preset.threshold}`}
          color="bg-amber-500/10 ring-1 ring-amber-500/20"
        />
        <ResultCard
          icon={<Clock className="h-4 w-4 text-blue-400" />}
          label="Closest Subject"
          value={trajectoryGroup.patients[0]
            ? `${trajectoryGroup.patients[0].distanceToThreshold.toFixed(1)} ${preset.unit} away`
            : "—"}
          color="bg-blue-500/10 ring-1 ring-blue-500/20"
        />
        <ResultCard
          icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
          label="Avg. Time to Threshold"
          value={trajectoryGroup.patients.length > 0 && trajectoryGroup.patients[0]?.estimatedWeeksToThreshold
            ? `~${Math.round(trajectoryGroup.patients.reduce((s, p) => s + (p.estimatedWeeksToThreshold ?? 0), 0) / trajectoryGroup.patients.length)} weeks`
            : "—"}
          color="bg-emerald-500/10 ring-1 ring-emerald-500/20"
        />
      </div>

      {/* Subject watchlist */}
      {trajectoryGroup.patients.length > 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <h4 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Watchlist — Schedule Re-screening
            </h4>
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/20">
              {trajectoryGroup.patients.length} subjects
            </span>
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2.5 text-left font-semibold">Subject</th>
                <th className="px-4 py-2.5 text-left font-semibold">Lab</th>
                <th className="px-4 py-2.5 text-right font-semibold">Current</th>
                <th className="px-4 py-2.5 text-center font-semibold">Threshold</th>
                <th className="px-4 py-2.5 text-right font-semibold">Distance</th>
                <th className="px-4 py-2.5 text-right font-semibold">Proximity</th>
                <th className="px-4 py-2.5 text-right font-semibold">Est. Time</th>
              </tr>
            </thead>
            <tbody>
              {trajectoryGroup.patients.map((tp) => (
                <tr key={tp.mrn} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold font-mono text-slate-200">{tp.mrn}</p>
                    <p className="text-[10px] text-slate-500">{tp.name}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{tp.labName}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-200">
                    {tp.currentValue} <span className="text-[10px] font-normal text-slate-500">{tp.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-white/[0.06]">
                      {tp.direction === "rising" ? "≥" : "≤"} {tp.threshold}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-amber-400">
                    {tp.distanceToThreshold.toFixed(1)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500"
                          style={{ width: `${Math.min(tp.percentToThreshold, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-slate-400">{tp.percentToThreshold.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-400">
                    {tp.estimatedWeeksToThreshold ? `~${tp.estimatedWeeksToThreshold}w` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400/50" />
          <p className="mt-3 text-[13px] font-semibold text-slate-300">No subjects approaching this threshold</p>
          <p className="mt-1 text-[11px] text-slate-500">
            No subjects have {preset.labName} values within 25% of the {preset.threshold} {preset.unit} threshold.
          </p>
        </div>
      )}

      {/* Insight */}
      <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/5 p-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-indigo-400" />
          <span className="text-[12px] font-bold text-indigo-300">Why this matters</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
          Subjects near eligibility thresholds represent your future pipeline. By monitoring lab trajectories,
          you can proactively schedule follow-up visits and labs at the right time — turning "almost eligible"
          subjects into enrolled participants without missing the window. This is predictive enrollment that
          no other site tool provides.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// TAB 3: DIVERSITY DASHBOARD
// ============================================================

function DiversityTab({ patients }: { patients: ParsedPatient[] }) {
  const profile = useMemo(() => computeDiversityProfile(patients), [patients]);
  const [showInfo, setShowInfo] = useState(false);

  const handleExportDiversity = useCallback(() => {
    const raceRows: (string | number)[][] = profile.raceBreakdown.map((r) => [
      r.label, r.count, `${r.percent.toFixed(1)}%`,
    ]);
    const maleCount = profile.genderBreakdown.find((g) => g.label === "Male")?.count ?? 0;
    const femaleCount = profile.genderBreakdown.find((g) => g.label === "Female")?.count ?? 0;
    exportReportDeck({
      title: "Site Diversity Profile",
      subtitle: "FDA Diversity Action Plan Compliance",
      confidential: true,
      sections: [
        {
          type: "metrics",
          columns: 4,
          metrics: [
            { label: "Diversity Score", value: `${profile.diversityScore}/100`, accent: profile.diversityScore >= 60 },
            { label: "Total Subjects", value: String(patients.length) },
            { label: "Gender Split", value: `${maleCount}M / ${femaleCount}F` },
            { label: "Unique Races", value: String(profile.raceBreakdown.length) },
          ],
        },
        { type: "table", headers: ["Race/Ethnicity", "Count", "Percentage"], rows: raceRows },
        { type: "text", text: profile.fdaComplianceNotes.join(" • ") },
      ],
    });
  }, [profile, patients.length]);

  return (
    <div className="space-y-6">
      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} {...DIVERSITY_MODAL} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <div>
            <h3 className="text-[14px] font-bold text-white">Site Diversity Profile</h3>
            <p className="text-[11px] text-slate-500">
              Click any demographic segment to cross-filter all analytics views.
            </p>
          </div>
          <InfoButton onClick={() => setShowInfo(true)} />
        </div>
        <button
          onClick={handleExportDiversity}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] font-medium text-slate-300 hover:bg-white/[0.06]"
        >
          <Download className="h-3.5 w-3.5" />
          Export PDF
        </button>
      </div>

      {/* AI Insights */}
      <DiversityInsights
        diversityScore={profile.diversityScore}
        genderSplit={Object.fromEntries(profile.genderBreakdown.map((g) => [g.label, g.count]))}
        raceSplit={Object.fromEntries(profile.raceBreakdown.map((r) => [r.label, r.count]))}
        ageBuckets={Object.fromEntries(profile.ageBreakdown.map((a) => [a.range, a.count]))}
        totalPatients={patients.length}
      />

      {/* Diversity Score + Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-1 flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-card p-4">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <svg className="h-24 w-24 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="2.5" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={profile.diversityScore >= 60 ? "#10b981" : profile.diversityScore >= 40 ? "#f59e0b" : "#ef4444"}
                strokeWidth="2.5"
                strokeDasharray={`${profile.diversityScore} ${100 - profile.diversityScore}`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-2xl font-black text-white">{profile.diversityScore}</span>
          </div>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Diversity Score</p>
        </div>

        <div className="col-span-3 rounded-xl border border-white/[0.06] bg-card p-4">
          <h4 className="flex items-center gap-2 text-[12px] font-bold text-slate-200">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            FDA Compliance Assessment
          </h4>
          <div className="mt-2.5 space-y-1.5">
            {profile.fdaComplianceNotes.map((note, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                <p className="text-[11px] leading-relaxed text-slate-400">{note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Race/Ethnicity */}
        <div className="rounded-xl border border-white/[0.06] bg-card p-4">
          <h4 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
            <Users className="h-4 w-4 text-indigo-400" />
            Race Distribution
          </h4>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profile.raceBreakdown} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 10, fill: "#94a3b8" }} width={115} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`${value} (${((Number(value) / profile.totalPatients) * 100).toFixed(1)}%)`, "Subjects"]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {profile.raceBreakdown.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gender */}
        <div className="rounded-xl border border-white/[0.06] bg-card p-4">
          <h4 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
            <Users className="h-4 w-4 text-indigo-400" />
            Gender Distribution
          </h4>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={profile.genderBreakdown}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={90}
                  dataKey="count"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {profile.genderBreakdown.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </RePieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Age Distribution */}
        <div className="rounded-xl border border-white/[0.06] bg-card p-4">
          <h4 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
            <BarChart3 className="h-4 w-4 text-indigo-400" />
            Age Distribution
          </h4>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profile.ageBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`${value} subjects (${((Number(value) / profile.totalPatients) * 100).toFixed(1)}%)`, ""]}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Insurance Mix */}
        <div className="rounded-xl border border-white/[0.06] bg-card p-4">
          <h4 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
            <Activity className="h-4 w-4 text-indigo-400" />
            Insurance / Payor Mix
          </h4>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={profile.insuranceBreakdown}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={90}
                  dataKey="count"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {profile.insuranceBreakdown.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </RePieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Ethnicity detail */}
      <div className="rounded-xl border border-white/[0.06] bg-card p-4">
        <h4 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
          <Users className="h-4 w-4 text-indigo-400" />
          Ethnicity Breakdown
        </h4>
        <div className="mt-3 space-y-2">
          {profile.ethnicityBreakdown.map((e) => (
            <div key={e.label} className="flex items-center gap-3">
              <span className="w-36 shrink-0 text-[12px] text-slate-300">{e.label}</span>
              <div className="flex-1">
                <div className="h-4 w-full overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${e.percent}%`, backgroundColor: e.color }}
                  />
                </div>
              </div>
              <span className="w-12 shrink-0 text-right text-[12px] font-bold tabular-nums text-slate-200">{e.count}</span>
              <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-slate-500">{e.percent.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sponsor-ready insight */}
      <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/5 p-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-indigo-400" />
          <span className="text-[12px] font-bold text-indigo-300">Sponsor Site Selection Advantage</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
          This diversity profile demonstrates your site's ability to meet FDA diversity action plan requirements.
          Sites with strong demographic representation are increasingly preferred during site selection.
          Export this profile as a PDF to include in your site feasibility questionnaire responses — it gives
          sponsors quantitative proof of your subject diversity before they even visit your site.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// SHARED COMPONENTS
// ============================================================

function ResultCard({ icon, label, value, subtext, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-card p-4">
      <div className="flex items-center gap-2.5">
        <div className={`rounded-lg p-2 ${color}`}>{icon}</div>
        <div>
          <p className="text-[10px] font-medium text-slate-500">{label}</p>
          <p className="text-xl font-black text-white tabular-nums">{value}</p>
          {subtext && <p className="text-[10px] text-slate-500">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-[14px] font-bold text-white">{value}</p>
    </div>
  );
}

// ============================================================
// INFO MODALS — Feature explainers that sell each capability
// ============================================================

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  subtitle: string;
  highlights: { icon: React.ReactNode; title: string; desc: string }[];
  useCases: string[];
  bottomNote: string;
}

function InfoModal({ open, onClose, icon, iconColor, title, subtitle, highlights, useCases, bottomNote }: InfoModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#141824] shadow-2xl">
        {/* Header gradient */}
        <div className={`rounded-t-2xl px-6 pt-6 pb-4 bg-gradient-to-br ${iconColor}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur-sm">
                {icon}
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-white">{title}</h3>
                <p className="mt-0.5 text-[12px] text-white/70">{subtitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Feature highlights */}
          <div className="space-y-3">
            {highlights.map((h, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06]">
                  {h.icon}
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-slate-200">{h.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{h.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-white/[0.06]" />

          {/* Use cases */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2.5">When to use this</p>
            <div className="space-y-2">
              {useCases.map((uc, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Zap className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400" />
                  <p className="text-[11px] leading-relaxed text-slate-400">{uc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom note */}
          <div className="rounded-lg bg-indigo-500/5 px-4 py-3 ring-1 ring-indigo-500/10">
            <p className="text-[11px] leading-relaxed text-indigo-300/80">{bottomNote}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-500 transition-all hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/20"
      title="Learn more about this feature"
    >
      <Info className="h-3.5 w-3.5" />
    </button>
  );
}

// Modal content configs
const FEASIBILITY_MODAL = {
  icon: <Calculator className="h-5 w-5 text-white" />,
  iconColor: "from-indigo-600/20 via-indigo-500/10 to-transparent",
  title: "Protocol Feasibility Calculator",
  subtitle: "Answer the #1 question sponsors ask: \"How many subjects do you have?\"",
  highlights: [
    {
      icon: <Target className="h-4 w-4 text-indigo-400" />,
      title: "Instant Population Queries",
      desc: "Run any combination of diagnosis codes, age ranges, lab values, medications, and BMI against your entire subject population in milliseconds.",
    },
    {
      icon: <BarChart3 className="h-4 w-4 text-emerald-400" />,
      title: "Criterion-by-Criterion Breakdown",
      desc: "See exactly which eligibility criteria are the bottleneck. Know before you commit that 90% of your subjects pass inclusion but 60% fail on eGFR.",
    },
    {
      icon: <CalendarClock className="h-4 w-4 text-amber-400" />,
      title: "Enrollment Timeline Forecasting",
      desc: "Project monthly enrollment rates, time to target, and build realistic timelines based on your actual subject volume — not guesswork.",
    },
    {
      icon: <DollarSign className="h-4 w-4 text-green-400" />,
      title: "Revenue-Ready Projections",
      desc: "Combine feasibility counts with per-subject payment data to project total study revenue before signing the contract.",
    },
  ],
  useCases: [
    "A sponsor calls asking if you can run their Phase 3 trial — give them an answer in 60 seconds instead of 2 weeks",
    "During site selection, attach a feasibility report showing exact subject counts by criterion to your questionnaire response",
    "Before committing to a study, verify you actually have enough subjects to hit enrollment targets",
    "Negotiate better per-subject payments by demonstrating you have a large eligible population",
  ],
  bottomNote: "Sites that respond to feasibility questionnaires with real data (not estimates) are 3x more likely to be selected. This tool turns a 2-week manual chart review into a 60-second automated query.",
};

const TRAJECTORY_MODAL = {
  icon: <TrendingUp className="h-5 w-5 text-white" />,
  iconColor: "from-amber-600/20 via-amber-500/10 to-transparent",
  title: "Lab Trajectory Monitoring",
  subtitle: "See the future: subjects who are about to become eligible",
  highlights: [
    {
      icon: <HeartPulse className="h-4 w-4 text-amber-400" />,
      title: "Predictive Eligibility Pipeline",
      desc: "Identify subjects whose lab values are trending toward eligibility thresholds. A subject with HbA1c at 6.8% today may cross 7.0% next month.",
    },
    {
      icon: <Eye className="h-4 w-4 text-blue-400" />,
      title: "Watchlist with Proximity Tracking",
      desc: "See exactly how close each subject is to crossing the threshold, with visual proximity bars and estimated weeks to eligibility.",
    },
    {
      icon: <CalendarClock className="h-4 w-4 text-emerald-400" />,
      title: "Proactive Re-screening Alerts",
      desc: "Schedule follow-up labs at the right time — not too early (wasted visit), not too late (missed enrollment window).",
    },
    {
      icon: <FlaskConical className="h-4 w-4 text-purple-400" />,
      title: "Multi-Threshold Monitoring",
      desc: "Track 6 common clinical thresholds: HbA1c, eGFR, BNP, CRP, LDL, and more. Each maps to specific trial types.",
    },
  ],
  useCases: [
    "You're running a diabetes trial requiring HbA1c ≥ 7.5% — find the 12 subjects at 7.1-7.4% who will likely qualify next quarter",
    "A new heart failure study opens — instantly see how many subjects are approaching the BNP ≥ 100 threshold",
    "Reduce screen failures by only screening subjects when their labs are likely to qualify, based on trajectory data",
    "Build a \"pre-screening pipeline\" that coordinators review weekly to catch newly eligible subjects",
  ],
  bottomNote: "This is predictive enrollment intelligence that no other site tool provides. It turns your subject data into a forward-looking pipeline instead of a backward-looking snapshot.",
};

const DIVERSITY_MODAL = {
  icon: <Users className="h-5 w-5 text-white" />,
  iconColor: "from-emerald-600/20 via-emerald-500/10 to-transparent",
  title: "Site Diversity Profile",
  subtitle: "FDA diversity compliance — your competitive advantage in site selection",
  highlights: [
    {
      icon: <Shield className="h-4 w-4 text-emerald-400" />,
      title: "FDA Diversity Action Plan Compliance",
      desc: "Since 2024, the FDA requires diversity action plans for all clinical trials. Sites that can prove diverse subject populations are increasingly preferred.",
    },
    {
      icon: <Globe className="h-4 w-4 text-blue-400" />,
      title: "Race, Ethnicity & Age Breakdowns",
      desc: "Automated demographic analysis with percentage breakdowns, comparison to US census proportions, and visual charts ready for sponsor presentations.",
    },
    {
      icon: <Gauge className="h-4 w-4 text-purple-400" />,
      title: "Simpson Diversity Score",
      desc: "A single 0-100 score that quantifies your population's demographic diversity. Higher scores mean sponsors can meet FDA requirements more easily at your site.",
    },
    {
      icon: <FileText className="h-4 w-4 text-indigo-400" />,
      title: "Export-Ready Reports",
      desc: "Generate a one-page PDF diversity profile to attach to site selection questionnaires, feasibility surveys, and grant applications.",
    },
  ],
  useCases: [
    "A sponsor asks \"What percentage of your subjects are underrepresented minorities?\" — answer with exact data instead of estimates",
    "Include your diversity profile in every feasibility questionnaire response to stand out during site selection",
    "Track diversity metrics over time as you expand outreach to underrepresented communities",
    "Support NIH grant applications with quantitative evidence of your site's diverse subject population",
  ],
  bottomNote: "Sponsors now pay 15-25% higher per-subject rates at sites with strong diversity metrics. Your diversity profile is a revenue multiplier — this tool quantifies and packages it for you.",
};

