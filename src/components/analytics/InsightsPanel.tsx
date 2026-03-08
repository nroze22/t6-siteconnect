import { useState, useMemo } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Info,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { NarrativeInsight } from "@/lib/narrative-engine";
import {
  generateFeasibilityNarrative,
  generateDiversityNarrative,
  generatePerformanceNarrative,
  generateEnrollmentNarrative,
  generateReadinessNarrative,
  generateCohortNarrative,
} from "@/lib/narrative-engine";

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<NarrativeInsight["type"], string> = {
  positive: "border-emerald-500 bg-emerald-500/10",
  warning: "border-amber-500 bg-amber-500/10",
  opportunity: "border-blue-500 bg-blue-500/10",
  neutral: "border-slate-500 bg-slate-500/10",
};

const TYPE_ICON_COLORS: Record<NarrativeInsight["type"], string> = {
  positive: "text-emerald-400",
  warning: "text-amber-400",
  opportunity: "text-blue-400",
  neutral: "text-slate-400",
};

function InsightIcon({ type }: { type: NarrativeInsight["type"] }) {
  const className = `h-4 w-4 ${TYPE_ICON_COLORS[type]}`;
  switch (type) {
    case "positive":
      return <CheckCircle2 className={className} />;
    case "warning":
      return <AlertTriangle className={className} />;
    case "opportunity":
      return <Lightbulb className={className} />;
    case "neutral":
      return <Info className={className} />;
  }
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
};

// ---------------------------------------------------------------------------
// InsightsPanel
// ---------------------------------------------------------------------------

interface InsightsPanelProps {
  insights: NarrativeInsight[];
  title?: string;
  compact?: boolean;
}

export function InsightsPanel({
  insights,
  title = "AI Insights",
  compact = false,
}: InsightsPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-card p-5">
        <div className="flex items-center gap-2 text-slate-400">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <span className="text-sm">No insights available for current data</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-card overflow-hidden bg-gradient-to-br from-card to-card/80">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-slate-100">{title}</span>
          <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-400 uppercase tracking-wider">
            AI-generated
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {insights.length} insight{insights.length !== 1 ? "s" : ""}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </div>
      </button>

      {/* Body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="insights-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className={compact ? "space-y-1.5 px-3 pb-3" : "space-y-2.5 px-4 pb-4"}
            >
              {insights.map((insight) => (
                <motion.div key={insight.id} variants={itemVariants}>
                  {compact ? (
                    <CompactInsightCard insight={insight} />
                  ) : (
                    <FullInsightCard insight={insight} />
                  )}
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full Insight Card
// ---------------------------------------------------------------------------

function FullInsightCard({ insight }: { insight: NarrativeInsight }) {
  return (
    <div
      className={`relative flex gap-3 rounded-lg border-l-[3px] px-3 py-2.5 ${TYPE_COLORS[insight.type]}`}
    >
      {/* Priority badge */}
      <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 border border-slate-600 text-[10px] font-bold text-slate-300">
        {insight.priority}
      </div>

      {/* Icon */}
      <div className="mt-0.5 flex-shrink-0">
        <InsightIcon type={insight.type} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className="text-sm font-semibold text-slate-100 leading-snug">
            {insight.title}
          </p>
          {insight.metric && (
            <span className="flex-shrink-0 text-lg font-bold text-slate-100 leading-none tabular-nums">
              {insight.metric}
            </span>
          )}
        </div>

        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          {insight.body}
        </p>

        {insight.actionable && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-slate-800/60 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700/60 transition-colors cursor-default">
            <ArrowRight className="h-3 w-3 text-slate-500" />
            {insight.actionable}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact Insight Card
// ---------------------------------------------------------------------------

function CompactInsightCard({ insight }: { insight: NarrativeInsight }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border-l-2 px-2.5 py-1.5 ${TYPE_COLORS[insight.type]}`}
    >
      <InsightIcon type={insight.type} />
      <span className="text-xs font-medium text-slate-200 truncate">
        {insight.title}
      </span>
      {insight.metric && (
        <span className="ml-auto flex-shrink-0 text-xs font-bold text-slate-300 tabular-nums">
          {insight.metric}
        </span>
      )}
    </div>
  );
}

// ===========================================================================
// Convenience wrappers — generate + display insights for specific views
// ===========================================================================

interface FeasibilityInsightsProps {
  totalPatients: number;
  matchingPatients: number;
  matchRate: number;
  criterionBreakdown: { criterion: string; matchCount: number; matchRate: number }[];
  demographics: { avgAge: number; genderSplit: { male: number; female: number; other: number } };
}

export function FeasibilityInsights({
  totalPatients,
  matchingPatients,
  matchRate,
  criterionBreakdown,
  demographics,
}: FeasibilityInsightsProps) {
  const insights = useMemo(
    () =>
      generateFeasibilityNarrative(
        totalPatients,
        matchingPatients,
        matchRate,
        criterionBreakdown,
        demographics,
      ),
    [totalPatients, matchingPatients, matchRate, criterionBreakdown, demographics],
  );
  return <InsightsPanel insights={insights} />;
}

interface DiversityInsightsProps {
  diversityScore: number;
  genderSplit: Record<string, number>;
  raceSplit: Record<string, number>;
  ageBuckets: Record<string, number>;
  totalPatients: number;
}

export function DiversityInsights({
  diversityScore,
  genderSplit,
  raceSplit,
  ageBuckets,
  totalPatients,
}: DiversityInsightsProps) {
  const insights = useMemo(
    () =>
      generateDiversityNarrative(diversityScore, genderSplit, raceSplit, ageBuckets, totalPatients),
    [diversityScore, genderSplit, raceSplit, ageBuckets, totalPatients],
  );
  return <InsightsPanel insights={insights} title="Diversity Insights" />;
}

interface PerformanceInsightsProps {
  studies: { name: string; passRate: number; eligible: number; revenue: number }[];
  overallScreened: number;
  overallEligible: number;
}

export function PerformanceInsights({
  studies,
  overallScreened,
  overallEligible,
}: PerformanceInsightsProps) {
  const insights = useMemo(
    () => generatePerformanceNarrative(studies, overallScreened, overallEligible),
    [studies, overallScreened, overallEligible],
  );
  return <InsightsPanel insights={insights} title="Performance Insights" />;
}

interface EnrollmentInsightsProps {
  config: { targetEnrollment: number; months: number; eligiblePool: number };
  result: {
    medianTimeToTarget: number | null;
    probabilityOfSuccess: number;
    expectedEnrolled: number;
    timeline: { month: number; p50: number }[];
  };
}

export function EnrollmentInsights({ config, result }: EnrollmentInsightsProps) {
  const insights = useMemo(
    () => generateEnrollmentNarrative(config, result),
    [config, result],
  );
  return <InsightsPanel insights={insights} title="Enrollment Forecast" />;
}

interface ReadinessInsightsProps {
  score: number;
  subScores: { name: string; score: number; weight: number }[];
  patientCount: number;
}

export function ReadinessInsights({
  score,
  subScores,
  patientCount,
}: ReadinessInsightsProps) {
  const insights = useMemo(
    () => generateReadinessNarrative(score, subScores, patientCount),
    [score, subScores, patientCount],
  );
  return <InsightsPanel insights={insights} title="Site Readiness" />;
}

interface CohortInsightsProps {
  totalPopulation: number;
  matchingCount: number;
  criteriaCount: number;
  topBlocker: string | null;
  demographics: {
    avgAge: number;
    malePercent: number;
    topRace: string;
    topRacePercent: number;
  };
}

export function CohortInsights({
  totalPopulation,
  matchingCount,
  criteriaCount,
  topBlocker,
  demographics,
}: CohortInsightsProps) {
  const insights = useMemo(
    () =>
      generateCohortNarrative(
        totalPopulation,
        matchingCount,
        criteriaCount,
        topBlocker,
        demographics,
      ),
    [totalPopulation, matchingCount, criteriaCount, topBlocker, demographics],
  );
  return <InsightsPanel insights={insights} title="Cohort Analysis" />;
}
