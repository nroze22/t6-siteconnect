import { useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Eye,
  Brain,
  ShieldCheck,
  Check,
  X as XIcon,
  Clock,
  MousePointerClick,
  ArrowRight,
  ClipboardCheck,
} from "lucide-react";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useAppStore } from "@/stores/use-app-store";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { scoreColorClass, formatStatus } from "@/lib/formatters";
import type { CriterionResult, CriterionResultType, ReviewStatus } from "@/types";

const resultConfig: Record<
  CriterionResultType,
  { icon: React.ReactNode; label: string; bg: string; border: string; glow: string }
> = {
  met: {
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
    label: "Met",
    bg: "bg-emerald-500/10 text-emerald-400",
    border: "border-l-emerald-500",
    glow: "glow-emerald",
  },
  not_met: {
    icon: <XCircle className="h-4 w-4 text-red-400" />,
    label: "Not Met",
    bg: "bg-red-500/10 text-red-400",
    border: "border-l-red-500",
    glow: "glow-red",
  },
  unknown: {
    icon: <HelpCircle className="h-4 w-4 text-amber-400" />,
    label: "Unknown",
    bg: "bg-amber-500/10 text-amber-400",
    border: "border-l-amber-500",
    glow: "glow-amber",
  },
  needs_review: {
    icon: <Eye className="h-4 w-4 text-blue-400" />,
    label: "Needs Review",
    bg: "bg-blue-500/10 text-blue-400",
    border: "border-l-blue-500",
    glow: "glow-blue",
  },
};

function CriterionCard({ criterion }: { criterion: CriterionResult }) {
  const selectedCriterionId = useScreeningStore((s) => s.selectedCriterionId);
  const selectCriterion = useScreeningStore((s) => s.selectCriterion);
  const openOverrideModal = useScreeningStore((s) => s.openOverrideModal);
  const config = resultConfig[criterion.result];
  const isSelected = selectedCriterionId === criterion.id;

  return (
    <button
      onClick={() => selectCriterion(criterion.id)}
      className={`w-full rounded-lg border border-white/[0.06] border-l-[3px] ${config.border} bg-card p-3 text-left transition-all duration-150 ${
        isSelected
          ? `ring-1 ring-indigo-500/30 ${config.glow}`
          : "hover:bg-white/[0.02] hover:border-white/[0.1]"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] leading-relaxed text-slate-300">
            {criterion.criterionText}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${config.bg}`}>
              {config.label}
            </span>
            {criterion.aiDetermined ? (
              <span className="flex items-center gap-1 rounded-md bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                <Brain className="h-2.5 w-2.5" />
                AI {Math.round(criterion.confidence * 100)}%
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-slate-500">
                <ShieldCheck className="h-2.5 w-2.5" />
                Rule-based
              </span>
            )}
            {criterion.humanVerified && (
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                Verified
              </span>
            )}
          </div>
          {isSelected && (
            <div className="mt-3">
              {criterion.evidence && (
                <div className="rounded-md bg-white/[0.03] p-2.5 ring-1 ring-white/[0.06]">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Evidence</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{criterion.evidence}</p>
                  {criterion.reasoning && (
                    <>
                      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Reasoning</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-slate-400">{criterion.reasoning}</p>
                    </>
                  )}
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openOverrideModal(criterion.id);
                }}
                className="mt-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[10px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
              >
                Override Result
              </button>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export function CriteriaDetailPanel() {
  const selectedPatientId = useScreeningStore((s) => s.selectedPatientId);
  const patients = useScreeningStore((s) => s.patients);
  const screeningResults = useScreeningStore((s) => s.screeningResults);
  const criteriaResults = useScreeningStore((s) => s.criteriaResults);

  if (!selectedPatientId) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background p-8 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/8 ring-1 ring-indigo-500/15">
          <MousePointerClick className="h-7 w-7 text-indigo-400/50" />
        </div>
        <h3 className="text-[14px] font-semibold text-slate-200">
          Select a subject to begin
        </h3>
        <p className="mt-2 max-w-[260px] text-[12px] leading-relaxed text-slate-500">
          Click any subject on the left to see their full eligibility breakdown against the active study criteria.
        </p>
        <div className="mt-6 flex flex-col gap-2 text-left">
          <CoachingStep number={1} text="Select a subject from the ranked list" />
          <CoachingStep number={2} text="Review each inclusion & exclusion criterion" />
          <CoachingStep number={3} text="Click a criterion to see source evidence" />
          <CoachingStep number={4} text="Accept, reject, or defer the subject" />
        </div>
      </div>
    );
  }

  const patient = patients.find((p) => p.id === selectedPatientId);
  const screening = screeningResults.get(selectedPatientId);

  if (!patient || !screening) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <p className="text-[12px] text-slate-500">No screening data available for this subject.</p>
      </div>
    );
  }

  const criteria = criteriaResults.get(screening.id) ?? [];
  const inclusionCriteria = criteria.filter((c) => c.criterionType === "inclusion");
  const exclusionCriteria = criteria.filter((c) => c.criterionType === "exclusion");

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Subject Header */}
      <div className="border-b border-border bg-card/60 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-bold font-mono text-white">{patient.sitePatientId}</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {patient.age} years \u00B7 {patient.gender === "male" ? "Male" : patient.gender === "female" ? "Female" : "Other"}
              {patient.primaryDiagnosis ? ` \u00B7 ${patient.primaryDiagnosis}` : ""}
            </p>
          </div>

          {/* Score */}
          <div className="text-center">
            <div className={`rounded-xl px-4 py-2 ${scoreColorClass(patient.score)}`}>
              <span className="text-2xl font-black tabular-nums">{patient.score}</span>
              <span className="text-[11px] font-medium opacity-60">/100</span>
            </div>
            <p className="mt-1 text-[10px] font-semibold text-slate-500">
              {formatStatus(patient.overallStatus)}
            </p>
          </div>
        </div>

        {/* Summary pills */}
        <div className="mt-3 flex items-center gap-2 text-[10px]">
          <span className="rounded-md bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
            Inclusion: {patient.inclusionMet}/{patient.inclusionTotal}
          </span>
          <span
            className={`rounded-md px-2.5 py-1 font-semibold ring-1 ${
              patient.exclusionTriggered > 0
                ? "bg-red-500/10 text-red-400 ring-red-500/20"
                : "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
            }`}
          >
            Exclusion: {patient.exclusionTriggered}/{patient.exclusionTotal} triggered
          </span>
          {patient.missingDataCount > 0 && (
            <span className="rounded-md bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-400 ring-1 ring-amber-500/20">
              {patient.missingDataCount} missing
            </span>
          )}
        </div>
      </div>

      {/* Criteria List */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Inclusion */}
        <div className="mb-5">
          <h4 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Inclusion Criteria
            <span className="font-normal text-slate-600">
              ({inclusionCriteria.filter((c) => c.result === "met").length}/{inclusionCriteria.length} met)
            </span>
          </h4>
          <div className="flex flex-col gap-2">
            {inclusionCriteria.map((c) => (
              <CriterionCard key={c.id} criterion={c} />
            ))}
          </div>
        </div>

        {/* Exclusion */}
        <div>
          <h4 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <XCircle className="h-3.5 w-3.5 text-red-500" />
            Exclusion Criteria
            <span className="font-normal text-slate-600">
              ({exclusionCriteria.filter((c) => c.result === "met").length}/{exclusionCriteria.length} triggered)
            </span>
          </h4>
          <div className="flex flex-col gap-2">
            {exclusionCriteria.map((c) => (
              <CriterionCard key={c.id} criterion={c} />
            ))}
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <ReviewActionBar patientId={selectedPatientId} reviewStatus={screening.reviewStatus} />
    </div>
  );
}

function CoachingStep({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/10 text-[10px] font-bold text-indigo-400 ring-1 ring-indigo-500/20">
        {number}
      </span>
      <span className="text-[11px] text-slate-500">{text}</span>
    </div>
  );
}

function ReviewActionBar({ patientId, reviewStatus }: { patientId: string; reviewStatus: ReviewStatus }) {
  const reviewPatient = useScreeningStore((s) => s.reviewPatient);
  const patients = useScreeningStore((s) => s.patients);
  const selectPatient = useScreeningStore((s) => s.selectPatient);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const toast = useToast();

  const currentPatient = patients.find((p) => p.id === patientId);

  const reviewProgress = useMemo(() => {
    const reviewed = patients.filter((p) => p.reviewStatus !== "pending").length;
    return { reviewed, total: patients.length, pending: patients.length - reviewed };
  }, [patients]);

  const nextPendingPatient = useMemo(() => {
    const currentIdx = patients.findIndex((p) => p.id === patientId);
    for (let i = currentIdx + 1; i < patients.length; i++) {
      if (patients[i]?.reviewStatus === "pending") return patients[i];
    }
    for (let i = 0; i < currentIdx; i++) {
      if (patients[i]?.reviewStatus === "pending") return patients[i];
    }
    return null;
  }, [patients, patientId]);

  const handleReview = (status: ReviewStatus) => {
    reviewPatient(patientId, status);
    const pid = currentPatient?.sitePatientId ?? patientId;
    if (status === "accepted") {
      toast.success(`Subject ${pid} accepted`, `${reviewProgress.pending - 1} remaining`);
    } else if (status === "rejected") {
      toast.error(`Subject ${pid} rejected`, `${reviewProgress.pending - 1} remaining`);
    } else if (status === "deferred") {
      toast.warning(`Subject ${pid} deferred`, "Will revisit later");
    }
  };

  // Keyboard shortcuts: A=Accept, R=Reject, D=Defer
  useEffect(() => {
    if (reviewStatus !== "pending") return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "a" || e.key === "A") { e.preventDefault(); handleReview("accepted"); }
      else if (e.key === "r" || e.key === "R") { e.preventDefault(); handleReview("rejected"); }
      else if (e.key === "d" || e.key === "D") { e.preventDefault(); handleReview("deferred"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const handleNextPatient = () => {
    if (nextPendingPatient) {
      selectPatient(nextPendingPatient.id);
    }
  };

  if (reviewStatus !== "pending") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="border-t border-border bg-card/60 px-4 py-3 space-y-2.5"
      >
        {/* Decision status */}
        <div className="flex items-center justify-between">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.05, type: "spring", damping: 20, stiffness: 400 }}
            className="flex items-center gap-2 text-[12px]"
          >
            {reviewStatus === "accepted" && (
              <>
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
                  <Check className="h-3 w-3 text-emerald-400" />
                </div>
                <span className="font-semibold text-emerald-400">Accepted</span>
              </>
            )}
            {reviewStatus === "rejected" && (
              <>
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/15">
                  <XIcon className="h-3 w-3 text-red-400" />
                </div>
                <span className="font-semibold text-red-400">Rejected</span>
              </>
            )}
            {reviewStatus === "deferred" && (
              <>
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15">
                  <Clock className="h-3 w-3 text-amber-400" />
                </div>
                <span className="font-semibold text-amber-400">Deferred</span>
              </>
            )}
          </motion.div>
          <button
            onClick={() => reviewPatient(patientId, "pending")}
            className="rounded-md border border-white/[0.08] px-3 py-1 text-[10px] font-medium text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300"
          >
            Undo
          </button>
        </div>

        {/* Next actions */}
        <div className="flex gap-2">
          {nextPendingPatient ? (
            <button
              onClick={handleNextPatient}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-[12px] font-semibold text-white transition-all hover:bg-indigo-500"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Next Subject ({reviewProgress.pending} remaining)
            </button>
          ) : (
            <button
              onClick={() => setCurrentPage("review")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-[12px] font-semibold text-white transition-all hover:bg-emerald-500"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              All Reviewed — View Results
            </button>
          )}
          <button
            onClick={() => setCurrentPage("review")}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
            title="Review Queue"
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-500">Review progress</span>
            <span className="text-[10px] font-bold tabular-nums text-slate-400">
              {reviewProgress.reviewed}/{reviewProgress.total}
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.04]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all duration-500"
              style={{ width: `${reviewProgress.total > 0 ? (reviewProgress.reviewed / reviewProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="border-t border-border bg-card/60 px-4 py-4">
      {/* Progress hint */}
      {reviewProgress.reviewed > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-md bg-white/[0.02] px-3 py-1.5 ring-1 ring-white/[0.04]">
          <span className="text-[10px] text-slate-500">
            {reviewProgress.reviewed} of {reviewProgress.total} reviewed
          </span>
          <button
            onClick={() => setCurrentPage("review")}
            className="text-[10px] font-medium text-indigo-400 hover:text-indigo-300"
          >
            View Queue
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <Tooltip content="Accept this subject" shortcut="A" side="top" className="flex-1">
          <button
            onClick={() => handleReview("accepted")}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-[12px] font-semibold text-white shadow-md shadow-emerald-900/20 transition-all hover:bg-emerald-500 hover:shadow-emerald-500/20 active:scale-[0.97]"
          >
            <Check className="h-3.5 w-3.5" />
            Accept
          </button>
        </Tooltip>
        <Tooltip content="Reject this subject" shortcut="R" side="top" className="flex-1">
          <button
            onClick={() => handleReview("rejected")}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2 text-[12px] font-semibold text-white shadow-md shadow-red-900/20 transition-all hover:bg-red-500 hover:shadow-red-500/20 active:scale-[0.97]"
          >
            <XIcon className="h-3.5 w-3.5" />
            Reject
          </button>
        </Tooltip>
        <Tooltip content="Defer for later review" shortcut="D" side="top" className="flex-1">
          <button
            onClick={() => handleReview("deferred")}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 py-2 text-[12px] font-semibold text-white shadow-md shadow-amber-900/20 transition-all hover:bg-amber-500 hover:shadow-amber-500/20 active:scale-[0.97]"
          >
            <Clock className="h-3.5 w-3.5" />
            Defer
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
