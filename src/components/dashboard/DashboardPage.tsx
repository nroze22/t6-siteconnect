import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  FileUp,
  FlaskConical,
  ClipboardCheck,
  GitBranch,
  BarChart3,
  Cpu,
  Activity,
  CheckCircle2,
  Circle,
  ArrowRight,
  Sparkles,
  Shield,
} from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { useSiteProfileStore } from "@/stores/use-site-profile-store";
import { usePipelineStore, STAGES_ORDER } from "@/stores/use-pipeline-store";
import { getSummary, getStudies } from "@/lib/data-provider";
import { formatNumber, formatCurrencyCompact } from "@/lib/formatters";
import type { NavigationPage } from "@/types";
import type { AnalyticsSummary, AnalyticsStudy } from "@/lib/data-provider";

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

// ─── Stat pill ───
function StatPill({ label, children, delay }: { label: string; children: React.ReactNode; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center gap-1 rounded-xl bg-surface-1 px-5 py-3 ring-1 ring-edge-1"
    >
      <span className="text-[20px] font-bold tracking-tight text-heading">{children}</span>
      <span className="text-[11px] font-medium text-dim">{label}</span>
    </motion.div>
  );
}

// ─── Feature card ───
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  metric?: string;
  metricLabel?: string;
  page: NavigationPage;
  accent: string;
  delay: number;
}

function FeatureCard({ icon, title, description, metric, metricLabel, page, accent, delay }: FeatureCardProps) {
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => setCurrentPage(page)}
      className="group relative flex flex-col gap-3 rounded-xl border border-edge-2 bg-card p-5 text-left transition-all duration-200 hover:border-indigo-500/30 hover:bg-surface-1 hover:shadow-lg hover:shadow-indigo-500/5"
    >
      {/* Icon */}
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
        {icon}
      </div>

      {/* Title + description */}
      <div>
        <h3 className="text-[14px] font-bold text-heading">{title}</h3>
        <p className="mt-0.5 text-[12px] leading-relaxed text-dim">{description}</p>
      </div>

      {/* Metric */}
      {metric && (
        <div className="mt-auto pt-2 border-t border-edge-1">
          <span className="text-[18px] font-bold text-heading">{metric}</span>
          {metricLabel && <span className="ml-1.5 text-[11px] text-dim">{metricLabel}</span>}
        </div>
      )}

      {/* Hover arrow */}
      <div className="absolute right-4 top-5 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-1">
        <ArrowRight className="h-4 w-4 text-indigo-400" />
      </div>
    </motion.button>
  );
}

// ─── Checklist item ───
function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
      ) : (
        <Circle className="h-4 w-4 text-dim shrink-0" />
      )}
      <span className={`text-[12px] ${done ? "text-dim line-through" : "text-body font-medium"}`}>
        {label}
      </span>
    </div>
  );
}

// ─── Main Dashboard ───
export function DashboardPage() {
  const status = useAppStore((s) => s.status);
  const profile = useSiteProfileStore((s) => s.profile);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const pipelinePatients = usePipelineStore((s) => s.patients);

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
  const stageCounts = STAGES_ORDER.reduce<Record<string, number>>((acc, stage) => {
    acc[stage] = pipelinePatients.filter((p) => p.stage === stage).length;
    return acc;
  }, {});
  const enrolledCount = stageCounts["enrolled"] ?? 0;
  const pipelineTotal = pipelinePatients.length;

  // Total pipeline value from studies
  const totalPipelineValueCents = studies.reduce((sum, s) => {
    return sum + (s.estimated_per_patient_value ?? 0) * 100; // value is in dollars, convert to cents
  }, 0);

  // Screening completion (patients with scores)
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
  const checklistDone = [hasData, hasStudies, hasScreening, hasAI].filter(Boolean).length;
  const checklistTotal = 4;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-8 py-8">
        {/* ─── Welcome banner ─── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-2xl border border-edge-2 bg-gradient-to-br from-indigo-500/[0.08] via-card to-purple-500/[0.05] p-8"
        >
          {/* Decorative gradient orbs */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/[0.07] blur-3xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-purple-500/[0.05] blur-2xl" />

          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-[22px] font-bold tracking-tight text-heading">
                  {greeting}, {siteName}
                </h1>
                <p className="mt-1 text-[13px] text-dim">
                  Your site screening command center. All data stays on this device.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 ring-1 ring-emerald-500/20">
                <Shield className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[11px] font-semibold text-emerald-400">HIPAA-Ready</span>
              </div>
            </div>

            {/* Quick stats */}
            <div className="mt-6 grid grid-cols-4 gap-4">
              <StatPill label="Total Patients" delay={0.15}>
                <AnimatedNumber value={patientCount} />
              </StatPill>
              <StatPill label="Active Studies" delay={0.25}>
                <AnimatedNumber value={studyCount} />
              </StatPill>
              <StatPill label="In Pipeline" delay={0.35}>
                <AnimatedNumber value={pipelineTotal} />
              </StatPill>
              <StatPill label="Pipeline Value" delay={0.45}>
                <AnimatedCurrency cents={totalPipelineValueCents} />
              </StatPill>
            </div>
          </div>
        </motion.div>

        {/* ─── Feature cards grid ─── */}
        <div className="mt-8">
          <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-dim">
            Workflows
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <FeatureCard
              icon={<Search className="h-5 w-5 text-indigo-400" />}
              title="Patient Screening"
              description="AI-powered eligibility screening against study criteria with evidence highlighting."
              metric={patientCount > 0 ? formatNumber(patientCount) : "—"}
              metricLabel="patients available"
              page="screening"
              accent="bg-indigo-500/15 ring-1 ring-indigo-500/25"
              delay={0.3}
            />
            <FeatureCard
              icon={<FileUp className="h-5 w-5 text-sky-400" />}
              title="Import Data"
              description="Bring in CSV, Excel, FHIR, HL7, or CDA patient records with smart column mapping."
              metric={lastImport ? new Date(lastImport).toLocaleDateString() : "No imports yet"}
              metricLabel={lastImport ? "last import" : undefined}
              page="import"
              accent="bg-sky-500/15 ring-1 ring-sky-500/25"
              delay={0.4}
            />
            <FeatureCard
              icon={<FlaskConical className="h-5 w-5 text-violet-400" />}
              title="Trial Discovery"
              description="Browse curated trials with per-patient financials and site compatibility scores."
              metric={studyCount > 0 ? formatNumber(studyCount) : "—"}
              metricLabel="trials available"
              page="trials"
              accent="bg-violet-500/15 ring-1 ring-violet-500/25"
              delay={0.5}
            />
            <FeatureCard
              icon={<ClipboardCheck className="h-5 w-5 text-amber-400" />}
              title="Review Queue"
              description="Adjudicate screening decisions, resolve edge cases, and export verified results."
              metric={`${enrolledCount}`}
              metricLabel="enrolled"
              page="review"
              accent="bg-amber-500/15 ring-1 ring-amber-500/25"
              delay={0.6}
            />
            <FeatureCard
              icon={<GitBranch className="h-5 w-5 text-emerald-400" />}
              title="Enrollment Pipeline"
              description="Track patient outreach from identification through consent and enrollment."
              metric={pipelineTotal > 0 ? `${pipelineTotal}` : "—"}
              metricLabel="in pipeline"
              page="pipeline"
              accent="bg-emerald-500/15 ring-1 ring-emerald-500/25"
              delay={0.7}
            />
            <FeatureCard
              icon={<BarChart3 className="h-5 w-5 text-rose-400" />}
              title="Population Analytics"
              description="Feasibility analysis, demographic breakdowns, and diversity reporting."
              metric={totalDiagnoses > 0 ? formatNumber(totalDiagnoses) : "—"}
              metricLabel="diagnoses tracked"
              page="analytics"
              accent="bg-rose-500/15 ring-1 ring-rose-500/25"
              delay={0.8}
            />
          </div>
        </div>

        {/* ─── Bottom row: AI + Checklist ─── */}
        <div className="mt-8 grid grid-cols-2 gap-4 pb-8">
          {/* AI Status */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-xl border border-edge-2 bg-card p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                hasAI ? "bg-emerald-500/15 ring-1 ring-emerald-500/25"
                  : aiSetupInProgress ? "bg-purple-500/15 ring-1 ring-purple-500/25"
                  : "bg-surface-2 ring-1 ring-edge-1"
              }`}>
                {hasAI ? (
                  <Sparkles className="h-5 w-5 text-emerald-400" />
                ) : aiSetupInProgress ? (
                  <Cpu className="h-5 w-5 text-purple-400 animate-pulse" />
                ) : (
                  <Cpu className="h-5 w-5 text-dim" />
                )}
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-heading">AI Screening</h3>
                <p className="text-[12px] text-dim">
                  {hasAI
                    ? `Active · ${status.llmModel || "Local model"} · Ready for screening`
                    : status.llmStatus === "model_downloading"
                    ? "Downloading AI model — this may take a few minutes..."
                    : status.llmStatus === "starting"
                    ? "Loading AI model into memory..."
                    : status.llmStatus === "model_ready"
                    ? "AI model downloaded — activate in Settings"
                    : status.llmStatus === "error"
                    ? "Something went wrong — check Settings"
                    : "Not set up yet — enable in Settings"}
                </p>
              </div>
              <div className="ml-auto">
                {hasAI ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 ring-1 ring-emerald-500/20">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-semibold text-emerald-400">READY</span>
                  </div>
                ) : aiSetupInProgress ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-purple-500/10 px-2.5 py-1 ring-1 ring-purple-500/20">
                    <div className="h-3 w-3 rounded-full border-2 border-purple-400/30 border-t-purple-400 animate-spin" />
                    <span className="text-[10px] font-semibold text-purple-400">SETTING UP</span>
                  </div>
                ) : (
                  <button
                    onClick={() => setCurrentPage("settings")}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-500"
                  >
                    Set Up
                  </button>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-surface-1 p-3 ring-1 ring-edge-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-dim">Screening Mode</span>
                <span className="font-semibold text-body">
                  {hasAI ? "AI-Assisted + Rule-Based" : "Rule-Based Only"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-dim">Model</span>
                <span className="font-semibold text-body">
                  {hasAI ? (status.llmModel || "Local AI") : "None"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-dim">Privacy</span>
                <span className="font-semibold text-emerald-400">100% on this device</span>
              </div>
            </div>
          </motion.div>

          {/* Getting started checklist */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-xl border border-edge-2 bg-card p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/15 ring-1 ring-indigo-500/25">
                <Activity className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-heading">Getting Started</h3>
                <p className="text-[12px] text-dim">
                  {checklistDone}/{checklistTotal} complete
                </p>
              </div>
              <div className="ml-auto">
                {/* Progress ring */}
                <div className="relative h-10 w-10">
                  <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-surface-2"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      d="M18 2.5a15.5 15.5 0 110 31 15.5 15.5 0 010-31"
                    />
                    <path
                      className="text-indigo-500"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      strokeDasharray={`${(checklistDone / checklistTotal) * 97.4} 97.4`}
                      strokeLinecap="round"
                      d="M18 2.5a15.5 15.5 0 110 31 15.5 15.5 0 010-31"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-heading">
                    {Math.round((checklistDone / checklistTotal) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-0.5">
              <ChecklistItem done={hasData} label="Import patient data (CSV, Excel, FHIR)" />
              <ChecklistItem done={hasStudies} label="Review available clinical trials" />
              <ChecklistItem done={hasScreening} label="Run your first patient screening" />
              <ChecklistItem done={hasAI} label="Activate AI screening engine" />
            </div>

            {!hasData && (
              <button
                onClick={() => setCurrentPage("import")}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                <FileUp className="h-3.5 w-3.5" />
                Import Your First Dataset
              </button>
            )}
            {hasData && !hasScreening && (
              <button
                onClick={() => setCurrentPage("screening")}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                <Search className="h-3.5 w-3.5" />
                Start Screening Patients
              </button>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
