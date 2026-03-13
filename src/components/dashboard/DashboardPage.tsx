import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Search,
  FileUp,
  FlaskConical,
  Cpu,
  Activity,
  CheckCircle2,
  Circle,
  ArrowRight,
  Sparkles,
  Shield,
  Users,
  TrendingUp,
  Clock,
  Zap,
  ClipboardList,
  Eye,
  UserPlus,
  FileCheck,
  GitBranch,
} from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { useSiteProfileStore } from "@/stores/use-site-profile-store";
import { usePipelineStore, STAGES_ORDER } from "@/stores/use-pipeline-store";
import { useScreeningStore } from "@/stores/use-screening-store";
import { getSummary, getStudies } from "@/lib/data-provider";
import { formatNumber, formatCurrencyCompact } from "@/lib/formatters";
import type { NavigationPage } from "@/types";
import type { AnalyticsSummary, AnalyticsStudy } from "@/lib/data-provider";
import type { ActivityEntry } from "@/stores/use-pipeline-store";

// ─── Animation variants ───
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

// ─── Animated number counter ───
function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const start = performance.now();
    const from = 0;
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value, duration]);

  return <>{formatNumber(display)}</>;
}

function AnimatedCurrency({ cents, duration = 1200 }: { cents: number; duration?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (cents === 0) { setDisplay(0); return; }
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(cents * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [cents, duration]);

  return <>{formatCurrencyCompact(display)}</>;
}

// ─── Mini sparkline (decorative) ───
function MiniSparkline({ trend }: { trend: "up" | "flat" | "down" }) {
  const paths: Record<string, string> = {
    up: "M0 12 L4 10 L8 11 L12 7 L16 8 L20 4 L24 2",
    flat: "M0 8 L4 7 L8 9 L12 7 L16 8 L20 7 L24 8",
    down: "M0 2 L4 4 L8 3 L12 7 L16 8 L20 10 L24 12",
  };
  const color = trend === "up" ? "stroke-emerald-400" : trend === "down" ? "stroke-red-400" : "stroke-dim";
  return (
    <svg width="28" height="14" viewBox="0 0 24 14" fill="none" className="opacity-60">
      <path d={paths[trend]} className={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── KPI Card ───
interface KpiCardProps {
  label: string;
  icon: React.ReactNode;
  trend: "up" | "flat" | "down";
  children: React.ReactNode;
  subtitle?: string;
}

function KpiCard({ label, icon, trend, children, subtitle }: KpiCardProps) {
  return (
    <motion.div
      variants={fadeUp}
      className="glass relative flex flex-col gap-1.5 rounded-xl px-5 py-4 ring-1 ring-edge-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">{label}</span>
        <div className="flex items-center gap-1.5">
          <MiniSparkline trend={trend} />
          <div className="text-dim">{icon}</div>
        </div>
      </div>
      <span className="tabular-nums text-[28px] font-extrabold leading-none tracking-tight text-heading">
        {children}
      </span>
      {subtitle && (
        <span className="text-[11px] text-dim">{subtitle}</span>
      )}
    </motion.div>
  );
}

// ─── Quick Action Card ───
interface QuickActionProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  page: NavigationPage;
  accent: string;
  primary?: boolean;
}

function QuickAction({ icon, title, description, page, accent, primary }: QuickActionProps) {
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  return (
    <motion.button
      variants={fadeUp}
      onClick={() => setCurrentPage(page)}
      className={`card-lift group relative flex items-center gap-4 rounded-xl border bg-card p-5 text-left transition-all duration-200 ${
        primary
          ? "gradient-border-cta border-transparent"
          : "border-edge-2 hover:border-indigo-500/30"
      }`}
    >
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-bold text-heading">{title}</h3>
        <p className="mt-0.5 text-[12px] leading-relaxed text-dim">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-dim opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5" />
    </motion.button>
  );
}

// ─── Activity Item ───
function ActivityItem({ entry, patientName }: { entry: ActivityEntry; patientName: string }) {
  const iconMap: Record<ActivityEntry["type"], React.ReactNode> = {
    added: <UserPlus className="h-3.5 w-3.5 text-indigo-400" />,
    advance: <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />,
    call: <Activity className="h-3.5 w-3.5 text-sky-400" />,
    note: <FileCheck className="h-3.5 w-3.5 text-amber-400" />,
    screen_failed: <Circle className="h-3.5 w-3.5 text-red-400" />,
  };

  const timeAgo = useMemo(() => {
    const diff = Date.now() - new Date(entry.timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, [entry.timestamp]);

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-edge-1 last:border-0">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2">
        {iconMap[entry.type]}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] text-body">
          <span className="font-semibold text-heading">{patientName}</span>{" "}
          {entry.detail.toLowerCase()}
        </p>
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-dim">{timeAgo}</span>
    </div>
  );
}

// ─── Checklist item ───
function ChecklistItem({ done, label, onClick }: { done: boolean; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-1 disabled:cursor-default disabled:hover:bg-transparent"
    >
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
      ) : (
        <Circle className="h-4 w-4 text-dim shrink-0" />
      )}
      <span className={`text-[12px] text-left ${done ? "text-dim line-through" : "text-body font-medium"}`}>
        {label}
      </span>
      {!done && onClick && (
        <ArrowRight className="ml-auto h-3 w-3 text-dim" />
      )}
    </button>
  );
}

// ─── Study Overview Card ───
function StudyCard({ study, pipelineCount, totalPipeline }: { study: AnalyticsStudy; pipelineCount: number; totalPipeline: number }) {
  const progress = totalPipeline > 0 ? Math.round((pipelineCount / Math.max(totalPipeline, 1)) * 100) : 0;

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl border border-edge-2 bg-card p-4 transition-all duration-200 hover:border-edge-1"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-heading">{study.short_title || study.title}</p>
          <p className="mt-0.5 text-[11px] text-dim">
            {study.sponsor} {study.phase ? `· ${study.phase}` : ""}
          </p>
        </div>
        {study.estimated_per_patient_value != null && study.estimated_per_patient_value > 0 && (
          <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-400 ring-1 ring-emerald-500/20">
            ${formatNumber(study.estimated_per_patient_value)}/pt
          </span>
        )}
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-dim">{pipelineCount} in pipeline</span>
          <span className="font-semibold tabular-nums text-body">{study.criteria_count} criteria</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Dashboard ───
export function DashboardPage() {
  const status = useAppStore((s) => s.status);
  const profile = useSiteProfileStore((s) => s.profile);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const pipelinePatients = usePipelineStore((s) => s.patients);
  const pipelineActivity = usePipelineStore((s) => s.activity);
  const screeningResults = useScreeningStore((s) => s.screeningResults);

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [studies, setStudies] = useState<AnalyticsStudy[]>([]);

  // Load data
  useEffect(() => {
    getSummary().then(setSummary).catch(() => {});
    getStudies().then(setStudies).catch(() => {});
  }, []);

  // Derived metrics
  const patientCount = summary?.patient_count ?? status.patientCount;
  const studyCount = summary?.study_count ?? status.studyCount;
  const totalDiagnoses = summary?.total_diagnoses ?? 0;
  const lastImport = summary?.last_import ?? status.lastImport;

  // Pipeline stage counts
  const stageCounts = useMemo(() => {
    return STAGES_ORDER.reduce<Record<string, number>>((acc, stage) => {
      acc[stage] = pipelinePatients.filter((p) => p.stage === stage).length;
      return acc;
    }, {});
  }, [pipelinePatients]);

  const enrolledCount = stageCounts["enrolled"] ?? 0;
  const pipelineTotal = pipelinePatients.length;

  // Screening metrics
  const totalScreened = screeningResults.size;
  // Screen rate (enrolled / total screened)
  const screenRate = totalScreened > 0 ? Math.round((enrolledCount / totalScreened) * 100) : 0;

  // Total pipeline value from studies
  const totalPipelineValueCents = useMemo(() => {
    return studies.reduce((sum, s) => {
      return sum + (s.estimated_per_patient_value ?? 0) * 100;
    }, 0);
  }, [studies]);

  // Pipeline counts per study
  const pipelineByStudy = useMemo(() => {
    const map: Record<string, number> = {};
    pipelinePatients.forEach((p) => {
      map[p.studyId] = (map[p.studyId] ?? 0) + 1;
    });
    return map;
  }, [pipelinePatients]);

  // Recent activity (last 8 entries, newest first)
  const recentActivity = useMemo(() => {
    const sorted = [...pipelineActivity].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return sorted.slice(0, 8);
  }, [pipelineActivity]);

  // Map patientId -> name from pipeline
  const patientNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    pipelinePatients.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [pipelinePatients]);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const siteName = profile.research.siteName || "Research Site";

  // Checklist
  const hasData = patientCount > 0;
  const hasStudies = studyCount > 0;
  const hasScreening = pipelineTotal > 0;
  const hasAI = status.llmStatus === "running";
  const aiSetupInProgress = status.llmStatus === "model_downloading" || status.llmStatus === "starting";
  const checklistItems = [hasData, hasStudies, hasScreening, hasAI];
  const checklistDone = checklistItems.filter(Boolean).length;
  const checklistTotal = checklistItems.length;
  const checklistPct = Math.round((checklistDone / checklistTotal) * 100);

  // Active studies (top 4 for display)
  const topStudies = useMemo(() => studies.slice(0, 4), [studies]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1280px] px-8 py-8">
        {/* ─── Header row ─── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-start justify-between"
        >
          <div>
            <h1 className="text-[24px] font-extrabold tracking-tight text-heading">
              {greeting}, {siteName}
            </h1>
            <p className="mt-1 text-[13px] text-dim">
              Your screening command center — all data stays on this device.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* AI status badge */}
            {hasAI ? (
              <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 ring-1 ring-emerald-500/20">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-400">AI ONLINE</span>
              </div>
            ) : aiSetupInProgress ? (
              <div className="flex items-center gap-2 rounded-full bg-purple-500/10 px-3 py-1.5 ring-1 ring-purple-500/20">
                <div className="h-3 w-3 rounded-full border-2 border-purple-400/30 border-t-purple-400 animate-spin" />
                <span className="text-[10px] font-bold text-purple-400">AI LOADING</span>
              </div>
            ) : null}
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 ring-1 ring-emerald-500/20">
              <Shield className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[10px] font-bold text-emerald-400">HIPAA-READY</span>
            </div>
          </div>
        </motion.div>

        {/* ─── KPI Strip ─── */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mt-6 grid grid-cols-5 gap-3"
        >
          <KpiCard
            label="Total Subjects"
            icon={<Users className="h-3.5 w-3.5" />}
            trend={patientCount > 0 ? "up" : "flat"}
            subtitle={lastImport ? `Last import ${new Date(lastImport).toLocaleDateString()}` : undefined}
          >
            <AnimatedNumber value={patientCount} />
          </KpiCard>
          <KpiCard
            label="Active Studies"
            icon={<FlaskConical className="h-3.5 w-3.5" />}
            trend={studyCount > 0 ? "up" : "flat"}
            subtitle={`${totalDiagnoses > 0 ? formatNumber(totalDiagnoses) + " diagnoses tracked" : "Ready to screen"}`}
          >
            <AnimatedNumber value={studyCount} />
          </KpiCard>
          <KpiCard
            label="Screen Rate"
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            trend={screenRate > 0 ? "up" : "flat"}
            subtitle={`${formatNumber(totalScreened)} screened total`}
          >
            {screenRate}%
          </KpiCard>
          <KpiCard
            label="In Pipeline"
            icon={<GitBranch className="h-3.5 w-3.5" />}
            trend={pipelineTotal > 0 ? "up" : "flat"}
            subtitle={`${enrolledCount} enrolled`}
          >
            <AnimatedNumber value={pipelineTotal} />
          </KpiCard>
          <KpiCard
            label="Pipeline Value"
            icon={<Zap className="h-3.5 w-3.5" />}
            trend={totalPipelineValueCents > 0 ? "up" : "flat"}
            subtitle="Estimated total revenue"
          >
            <AnimatedCurrency cents={totalPipelineValueCents} />
          </KpiCard>
        </motion.div>

        {/* ─── Quick Actions ─── */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mt-6 grid grid-cols-3 gap-3"
        >
          <QuickAction
            icon={<FileUp className="h-5 w-5 text-sky-400" />}
            title="Import Data"
            description="CSV, Excel, FHIR R4, HL7v2, CDA — smart column mapping"
            page="import"
            accent="bg-sky-500/15 ring-1 ring-sky-500/25"
          />
          <QuickAction
            icon={<Search className="h-5 w-5 text-indigo-300" />}
            title="Start Screening"
            description={hasAI ? "AI + rule-based eligibility matching" : "Rule-based eligibility matching"}
            page="screening"
            accent="bg-indigo-500/15 ring-1 ring-indigo-500/25"
            primary
          />
          <QuickAction
            icon={<FlaskConical className="h-5 w-5 text-violet-400" />}
            title="Browse Trials"
            description="Curated trials with per-patient financials"
            page="trials"
            accent="bg-violet-500/15 ring-1 ring-violet-500/25"
          />
        </motion.div>

        {/* ─── Main content grid: Activity + Checklist ─── */}
        <div className="mt-6 grid grid-cols-5 gap-4">
          {/* Recent Activity (3 cols) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="col-span-3 rounded-xl border border-edge-2 bg-card p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-dim" />
                <h2 className="text-[14px] font-bold text-heading">Recent Activity</h2>
              </div>
              {pipelineTotal > 0 && (
                <button
                  onClick={() => setCurrentPage("pipeline")}
                  className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 transition-colors hover:text-indigo-300"
                >
                  View pipeline
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>

            {recentActivity.length > 0 ? (
              <div className="max-h-[320px] overflow-y-auto">
                {recentActivity.map((entry) => (
                  <ActivityItem
                    key={entry.id}
                    entry={entry}
                    patientName={patientNameMap[entry.patientId] ?? "Patient"}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 mb-3">
                  <Activity className="h-5 w-5 text-dim" />
                </div>
                <p className="text-[13px] font-medium text-dim">No activity yet</p>
                <p className="mt-1 text-[11px] text-dim">
                  Import data and run screenings to see activity here.
                </p>
              </div>
            )}
          </motion.div>

          {/* Getting Started (2 cols) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="col-span-2 rounded-xl border border-edge-2 bg-card p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25">
                <ClipboardList className="h-5 w-5 text-indigo-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-[14px] font-bold text-heading">Getting Started</h2>
                <p className="text-[11px] text-dim">
                  {checklistDone === checklistTotal ? "All set!" : `${checklistDone} of ${checklistTotal} complete`}
                </p>
              </div>
              {/* Progress ring */}
              <div className="relative h-11 w-11">
                <svg className="h-11 w-11 -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-surface-2"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    fill="none"
                    d="M18 2.5a15.5 15.5 0 110 31 15.5 15.5 0 010-31"
                  />
                  <path
                    className="text-indigo-500"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    fill="none"
                    strokeDasharray={`${(checklistDone / checklistTotal) * 97.4} 97.4`}
                    strokeLinecap="round"
                    d="M18 2.5a15.5 15.5 0 110 31 15.5 15.5 0 010-31"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold tabular-nums text-heading">
                  {checklistPct}%
                </span>
              </div>
            </div>

            <div className="space-y-0.5">
              <ChecklistItem
                done={hasData}
                label="Import patient data (CSV, Excel, FHIR)"
                onClick={hasData ? undefined : () => setCurrentPage("import")}
              />
              <ChecklistItem
                done={hasStudies}
                label="Review available clinical trials"
                onClick={hasStudies ? undefined : () => setCurrentPage("trials")}
              />
              <ChecklistItem
                done={hasScreening}
                label="Run your first patient screening"
                onClick={hasScreening ? undefined : () => setCurrentPage("screening")}
              />
              <ChecklistItem
                done={hasAI}
                label="Activate AI screening engine"
                onClick={hasAI ? undefined : () => setCurrentPage("settings")}
              />
            </div>

            {/* AI status panel */}
            <div className="mt-4 rounded-lg bg-surface-1 p-3 ring-1 ring-edge-1">
              <div className="flex items-center gap-2 mb-2">
                {hasAI ? (
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Cpu className="h-3.5 w-3.5 text-dim" />
                )}
                <span className="text-[11px] font-semibold text-heading">
                  {hasAI ? "AI Screening Active" : "AI Screening"}
                </span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-dim">Mode</span>
                  <span className="font-semibold text-body">
                    {hasAI ? "AI + Rules" : "Rule-Based Only"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dim">Model</span>
                  <span className="font-semibold text-body">
                    {hasAI ? (status.llmModel || "Local AI") : aiSetupInProgress ? "Loading..." : "Not configured"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dim">Privacy</span>
                  <span className="font-semibold text-emerald-400">100% on-device</span>
                </div>
              </div>
              {!hasAI && !aiSetupInProgress && (
                <button
                  onClick={() => setCurrentPage("settings")}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-500"
                >
                  <Cpu className="h-3 w-3" />
                  Set Up AI
                </button>
              )}
            </div>
          </motion.div>
        </div>

        {/* ─── Study Overview ─── */}
        {topStudies.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="mt-6 pb-8"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-dim" />
                <h2 className="text-[14px] font-bold text-heading">Study Overview</h2>
              </div>
              <button
                onClick={() => setCurrentPage("trials")}
                className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 transition-colors hover:text-indigo-300"
              >
                View all studies
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
              className="grid grid-cols-4 gap-3"
            >
              {topStudies.map((study) => (
                <StudyCard
                  key={study.id}
                  study={study}
                  pipelineCount={pipelineByStudy[study.id] ?? 0}
                  totalPipeline={pipelineTotal}
                />
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* Bottom spacer when no studies */}
        {topStudies.length === 0 && <div className="pb-8" />}
      </div>
    </div>
  );
}
