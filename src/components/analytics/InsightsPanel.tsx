import { useState, useMemo, useCallback } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Info,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Brain,
  Loader2,
  RefreshCw,
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
import { generateAiInsight } from "@/lib/data-provider";
import { useAppStore } from "@/stores/use-app-store";

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
  neutral: "text-dim",
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
  /** Data context string for LLM enhancement — if provided, shows "Enhance with AI" button */
  aiContext?: string;
  /** The type of analysis for LLM prompting (e.g., "feasibility", "diversity") */
  aiInsightType?: string;
}

export function InsightsPanel({
  insights,
  title = "AI Insights",
  compact = false,
  aiContext,
  aiInsightType = "clinical trial",
}: InsightsPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [llmInsights, setLlmInsights] = useState<NarrativeInsight[]>([]);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const llmStatus = useAppStore((s) => s.status.llmStatus);
  const isAiReady = llmStatus === "running";

  const allInsights = useMemo(() => [...insights, ...llmInsights], [insights, llmInsights]);

  const handleEnhanceWithAi = useCallback(async () => {
    if (!aiContext || llmLoading) return;
    setLlmLoading(true);
    setLlmError(null);
    try {
      const raw = await generateAiInsight(aiContext, aiInsightType);
      const mapped: NarrativeInsight[] = raw.map((r, i) => ({
        id: `llm-${aiInsightType}-${i}`,
        type: r.type || "neutral",
        title: r.title,
        body: r.body,
        actionable: r.actionable,
        priority: 10 + i, // After heuristic insights
      }));
      setLlmInsights(mapped);
    } catch (err: unknown) {
      setLlmError(err instanceof Error ? err.message : String(err));
    } finally {
      setLlmLoading(false);
    }
  }, [aiContext, aiInsightType, llmLoading]);

  if (allInsights.length === 0 && !llmLoading) {
    return (
      <div className="rounded-xl border border-edge-2 bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-dim">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <span className="text-sm">No insights available for current data</span>
          </div>
          {isAiReady && aiContext && (
            <button
              onClick={handleEnhanceWithAi}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600/80 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-purple-600 transition-colors"
            >
              <Brain className="h-3 w-3" />
              Generate with AI
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-edge-2 bg-card bg-gradient-to-br from-card to-card/80">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-heading">{title}</span>
          <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[12px] font-medium text-indigo-400 uppercase tracking-wider">
            {llmInsights.length > 0 ? "AI-enhanced" : "AI-generated"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAiReady && aiContext && llmInsights.length === 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); handleEnhanceWithAi(); }}
              disabled={llmLoading}
              className="flex items-center gap-1 rounded-md bg-purple-500/10 px-2 py-1 text-[10px] font-medium text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
            >
              {llmLoading ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <Brain className="h-2.5 w-2.5" />
              )}
              {llmLoading ? "Analyzing..." : "Enhance with AI"}
            </button>
          )}
          {llmInsights.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLlmInsights([]); }}
              className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[10px] font-medium text-dim hover:text-body transition-colors"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              Reset
            </button>
          )}
          <span className="text-xs text-dim">
            {allInsights.length} insight{allInsights.length !== 1 ? "s" : ""}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-dim" />
          ) : (
            <ChevronDown className="h-4 w-4 text-dim" />
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
            style={{ overflow: "hidden" }}
          >
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className={compact ? "space-y-1.5 px-3 pb-3" : "space-y-3 px-4 pb-4 pt-2"}
            >
              {allInsights.map((insight) => (
                <motion.div key={insight.id} variants={itemVariants}>
                  {compact ? (
                    <CompactInsightCard insight={insight} isLlm={insight.id.startsWith("llm-")} />
                  ) : (
                    <FullInsightCard insight={insight} isLlm={insight.id.startsWith("llm-")} />
                  )}
                </motion.div>
              ))}

              {/* LLM loading state */}
              {llmLoading && (
                <motion.div variants={itemVariants}>
                  <div className="flex items-center gap-3 rounded-lg border-l-[3px] border-purple-500 bg-purple-500/5 px-3 py-3">
                    <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
                    <div>
                      <p className="text-sm font-medium text-heading">AI is analyzing your data...</p>
                      <p className="text-xs text-dim mt-0.5">Generating deeper clinical insights using the local model</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* LLM error */}
              {llmError && (
                <motion.div variants={itemVariants}>
                  <div className="flex items-center gap-2 rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-300">{llmError}</p>
                  </div>
                </motion.div>
              )}
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

function FullInsightCard({ insight, isLlm = false }: { insight: NarrativeInsight; isLlm?: boolean }) {
  return (
    <div
      className={`relative flex gap-3 rounded-lg border-l-[3px] px-3 py-2.5 ${TYPE_COLORS[insight.type]}`}
    >
      {/* Icon */}
      <div className="mt-0.5 flex-shrink-0">
        <InsightIcon type={insight.type} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className="text-sm font-semibold text-heading leading-snug">
            {insight.title}
          </p>
          {isLlm && (
            <span className="flex-shrink-0 rounded bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-medium text-purple-400 uppercase tracking-wider">
              LLM
            </span>
          )}
          {insight.metric && (
            <span className="flex-shrink-0 text-lg font-bold text-heading leading-none tabular-nums">
              {insight.metric}
            </span>
          )}
        </div>

        <p className="mt-1 text-xs leading-relaxed text-body">
          {insight.body}
        </p>

        {insight.actionable && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-body hover:bg-surface-2 transition-colors cursor-default">
            <ArrowRight className="h-3 w-3 text-dim" />
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

function CompactInsightCard({ insight, isLlm = false }: { insight: NarrativeInsight; isLlm?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border-l-2 px-2.5 py-1.5 ${TYPE_COLORS[insight.type]}`}
    >
      <InsightIcon type={insight.type} />
      <span className="text-xs font-medium text-body truncate">
        {insight.title}
      </span>
      {isLlm && (
        <span className="flex-shrink-0 rounded bg-purple-500/15 px-1 py-0.5 text-[8px] font-medium text-purple-400 uppercase">
          LLM
        </span>
      )}
      {insight.metric && (
        <span className="ml-auto flex-shrink-0 text-xs font-bold text-body tabular-nums">
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
  const aiContext = useMemo(() =>
    `Feasibility analysis: ${matchingPatients} of ${totalPatients} patients match (${(matchRate * 100).toFixed(1)}%). ` +
    `Top criteria: ${criterionBreakdown.slice(0, 3).map(c => `${c.criterion} (${(c.matchRate * 100).toFixed(0)}%)`).join(", ")}. ` +
    `Avg age: ${demographics.avgAge}. Gender: M=${demographics.genderSplit.male}, F=${demographics.genderSplit.female}.`,
    [totalPatients, matchingPatients, matchRate, criterionBreakdown, demographics],
  );
  return <InsightsPanel insights={insights} aiContext={aiContext} aiInsightType="feasibility" />;
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
  const aiContext = useMemo(() =>
    `Diversity analysis: ${totalPatients} patients. Score: ${diversityScore}/100. ` +
    `Gender: ${Object.entries(genderSplit).map(([k, v]) => `${k}=${v}`).join(", ")}. ` +
    `Race: ${Object.entries(raceSplit).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
    [diversityScore, genderSplit, raceSplit, totalPatients],
  );
  return <InsightsPanel insights={insights} title="Diversity Insights" aiContext={aiContext} aiInsightType="diversity and representation" />;
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
  const aiContext = useMemo(() =>
    `Performance: ${studies.length} studies, ${overallScreened} screened, ${overallEligible} eligible. ` +
    `Studies: ${studies.map(s => `${s.name} (pass=${(s.passRate*100).toFixed(0)}%, eligible=${s.eligible}, rev=$${s.revenue/100})`).join("; ")}.`,
    [studies, overallScreened, overallEligible],
  );
  return <InsightsPanel insights={insights} title="Performance Insights" aiContext={aiContext} aiInsightType="site performance and revenue" />;
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
  const aiContext = useMemo(() =>
    `Enrollment: target=${config.targetEnrollment}, months=${config.months}, pool=${config.eligiblePool}. ` +
    `Probability: ${(result.probabilityOfSuccess*100).toFixed(0)}%, expected enrolled: ${result.expectedEnrolled}, ` +
    `median time: ${result.medianTimeToTarget?.toFixed(1) ?? "N/A"} months.`,
    [config, result],
  );
  return <InsightsPanel insights={insights} title="Enrollment Forecast" aiContext={aiContext} aiInsightType="enrollment forecasting" />;
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
  const aiContext = useMemo(() =>
    `Site readiness: overall ${score}/100, ${patientCount} patients. ` +
    `Sub-scores: ${subScores.map(s => `${s.name}=${s.score}`).join(", ")}.`,
    [score, subScores, patientCount],
  );
  return <InsightsPanel insights={insights} title="Site Readiness" aiContext={aiContext} aiInsightType="site readiness" />;
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
  const aiContext = useMemo(() =>
    `Cohort: ${matchingCount} of ${totalPopulation} match ${criteriaCount} criteria. ` +
    `Top blocker: ${topBlocker ?? "none"}. Avg age: ${demographics.avgAge}, male: ${demographics.malePercent}%. ` +
    `Top race: ${demographics.topRace} (${demographics.topRacePercent}%).`,
    [totalPopulation, matchingCount, criteriaCount, topBlocker, demographics],
  );
  return <InsightsPanel insights={insights} title="Cohort Analysis" aiContext={aiContext} aiInsightType="cohort analysis" />;
}
