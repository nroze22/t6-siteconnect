import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  User,
  Stethoscope,
  Pill,
  FlaskConical,
  Activity,
  Target,
  Heart,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { useScreeningStore } from "@/stores/use-screening-store";
import { getPatientClinicalData } from "@/lib/demo-data";
import type {
  Diagnosis,
  Medication,
  LabResult,
  VitalSign,
  PatientSummary,
  CriterionResult,
  ScreeningResult,
} from "@/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PatientDetailModalProps {
  patientId: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const tabs = [
  { id: "overview", label: "Overview", icon: Target },
  { id: "diagnoses", label: "Diagnoses", icon: Stethoscope },
  { id: "medications", label: "Medications", icon: Pill },
  { id: "labs", label: "Labs", icon: FlaskConical },
  { id: "vitals", label: "Vitals", icon: Activity },
  { id: "studies", label: "Study Matches", icon: FileText },
] as const;

type TabId = (typeof tabs)[number]["id"];

// ---------------------------------------------------------------------------
// Score color helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function scoreRingColor(score: number): string {
  if (score >= 70) return "stroke-emerald-400";
  if (score >= 40) return "stroke-amber-400";
  return "stroke-red-400";
}

function scoreRingTrack(score: number): string {
  if (score >= 70) return "stroke-emerald-400/15";
  if (score >= 40) return "stroke-amber-400/15";
  return "stroke-red-400/15";
}

function scoreBgRing(score: number): string {
  if (score >= 70) return "ring-emerald-500/25";
  if (score >= 40) return "ring-amber-500/25";
  return "ring-red-500/25";
}

function statusLabel(status: string): string {
  switch (status) {
    case "eligible":
      return "Eligible";
    case "potentially_eligible":
      return "Potential";
    case "ineligible":
      return "Ineligible";
    case "needs_review":
      return "Needs Review";
    default:
      return status;
  }
}

function statusBadgeClasses(status: string): string {
  switch (status) {
    case "eligible":
      return "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20";
    case "potentially_eligible":
      return "bg-amber-500/15 text-amber-400 ring-amber-500/20";
    case "ineligible":
      return "bg-red-500/15 text-red-400 ring-red-500/20";
    default:
      return "bg-slate-500/15 text-slate-400 ring-slate-500/20";
  }
}

// ---------------------------------------------------------------------------
// Circular progress SVG
// ---------------------------------------------------------------------------

function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={scoreRingTrack(score)}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={scoreRingColor(score)}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-black ${scoreColor(score)}`}>
          {score}
        </span>
        <span className="text-[9px] font-medium text-slate-500">SCORE</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  accent = "text-slate-400",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${accent}`} />
        <span className="text-[10px] font-medium text-slate-500">{label}</span>
      </div>
      <p className="mt-1 text-lg font-black text-slate-200">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PatientDetailModal({
  patientId,
  onClose,
}: PatientDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const patients = useScreeningStore((s) => s.patients);
  const screeningResults = useScreeningStore((s) => s.screeningResults);
  const criteriaResults = useScreeningStore((s) => s.criteriaResults);

  const patient: PatientSummary | undefined = useMemo(
    () => patients.find((p) => p.id === patientId),
    [patients, patientId]
  );

  const screening: ScreeningResult | undefined = useMemo(
    () => screeningResults.get(patientId),
    [screeningResults, patientId]
  );

  const criteria: CriterionResult[] = useMemo(() => {
    if (!screening) return [];
    return criteriaResults.get(screening.id) ?? [];
  }, [criteriaResults, screening]);

  const clinicalData = useMemo(
    () => getPatientClinicalData(patientId),
    [patientId]
  );

  // Escape to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!patient) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          className="relative z-10 mx-4 flex max-h-[85vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141824] shadow-2xl shadow-black/40"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {/* ---- Header ---- */}
          <div className="flex items-start gap-4 border-b border-white/[0.06] bg-gradient-to-r from-indigo-500/5 to-transparent p-5">
            {/* Score ring */}
            <div
              className={`flex-shrink-0 rounded-full ring-2 ${scoreBgRing(patient.score)}`}
            >
              <ScoreRing score={patient.score} size={64} />
            </div>

            {/* Subject info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-500" />
                <span className="font-mono text-sm font-bold text-white">
                  {patient.sitePatientId}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${statusBadgeClasses(patient.overallStatus)}`}
                >
                  {statusLabel(patient.overallStatus)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {patient.age} years &middot;{" "}
                {patient.gender === "male" ? "Male" : patient.gender === "female" ? "Female" : patient.gender}{" "}
                &middot;{" "}
                {patient.primaryDiagnosis ?? "No primary diagnosis"}
              </p>
              <p className="mt-1 text-[10px] text-slate-600">
                Inclusion: {patient.inclusionMet}/{patient.inclusionTotal} met
                &nbsp;&middot;&nbsp; Exclusion: {patient.exclusionTriggered}/
                {patient.exclusionTotal} triggered &nbsp;&middot;&nbsp; Missing:{" "}
                {patient.missingDataCount}
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="ml-2 flex-shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* ---- Clinical summary stats ---- */}
          <div className="grid grid-cols-4 gap-3 border-b border-white/[0.06] bg-white/[0.01] px-5 py-3">
            <StatCard
              label="Diagnoses"
              value={clinicalData.diagnoses.length}
              icon={Stethoscope}
              accent="text-indigo-400"
            />
            <StatCard
              label="Active Meds"
              value={
                clinicalData.medications.filter((m) => m.status === "active")
                  .length
              }
              icon={Pill}
              accent="text-emerald-400"
            />
            <StatCard
              label="Recent Labs"
              value={clinicalData.labs.length}
              icon={FlaskConical}
              accent="text-amber-400"
            />
            <StatCard
              label="Vitals"
              value={clinicalData.vitals.length}
              icon={Activity}
              accent="text-cyan-400"
            />
          </div>

          {/* ---- Tab bar ---- */}
          <div className="flex border-b border-white/[0.06] bg-[#0e1119]">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex flex-1 items-center justify-center gap-1.5 px-1 py-2.5 text-[10px] font-medium transition-colors ${
                    isActive
                      ? "border-b-2 border-indigo-500 text-indigo-400"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ---- Tab content ---- */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "overview" && (
              <OverviewTab patient={patient} criteria={criteria} />
            )}
            {activeTab === "diagnoses" && (
              <DiagnosesTab diagnoses={clinicalData.diagnoses} />
            )}
            {activeTab === "medications" && (
              <MedicationsTab medications={clinicalData.medications} />
            )}
            {activeTab === "labs" && <LabsTab labs={clinicalData.labs} />}
            {activeTab === "vitals" && (
              <VitalsTab vitals={clinicalData.vitals} />
            )}
            {activeTab === "studies" && (
              <StudyMatchesTab patient={patient} />
            )}
          </div>

          {/* ---- Footer ---- */}
          <div className="flex items-center justify-end border-t border-white/[0.06] bg-white/[0.02] px-5 py-3">
            <button
              onClick={onClose}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ===========================================================================
// Tab: Overview
// ===========================================================================

function OverviewTab({
  patient,
  criteria,
}: {
  patient: PatientSummary;
  criteria: CriterionResult[];
}) {
  const inclusionCriteria = criteria.filter((c) => c.criterionType === "inclusion");
  const exclusionCriteria = criteria.filter((c) => c.criterionType === "exclusion");

  return (
    <div className="space-y-5 p-5">
      {/* Score breakdown */}
      <div className="flex items-start gap-6">
        <ScoreRing score={patient.score} size={96} />
        <div className="flex-1 space-y-3">
          {/* Inclusion bar */}
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-slate-300">
                Inclusion Criteria
              </span>
              <span className="font-mono text-emerald-400">
                {patient.inclusionMet}/{patient.inclusionTotal}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{
                  width:
                    patient.inclusionTotal > 0
                      ? `${(patient.inclusionMet / patient.inclusionTotal) * 100}%`
                      : "0%",
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          </div>
          {/* Exclusion bar */}
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-slate-300">
                Exclusion Triggered
              </span>
              <span className="font-mono text-red-400">
                {patient.exclusionTriggered}/{patient.exclusionTotal}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full bg-red-500"
                initial={{ width: 0 }}
                animate={{
                  width:
                    patient.exclusionTotal > 0
                      ? `${(patient.exclusionTriggered / patient.exclusionTotal) * 100}%`
                      : "0%",
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          </div>
          {/* Missing data */}
          {patient.missingDataCount > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {patient.missingDataCount} criteria with missing data
            </div>
          )}
        </div>
      </div>

      {/* Key findings */}
      {criteria.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-bold text-slate-200">
            Key Findings
          </h4>
          <div className="space-y-1.5">
            {inclusionCriteria.map((c) => (
              <CriterionRow key={c.id} criterion={c} />
            ))}
            {exclusionCriteria.map((c) => (
              <CriterionRow key={c.id} criterion={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CriterionRow({ criterion }: { criterion: CriterionResult }) {
  const resultColors: Record<string, string> = {
    met: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
    not_met: "bg-red-500/10 text-red-400 ring-red-500/20",
    unknown: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
    needs_review: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  };

  const resultLabel: Record<string, string> = {
    met: "Met",
    not_met: "Not Met",
    unknown: "Unknown",
    needs_review: "Review",
  };

  return (
    <div className="flex items-start gap-2 rounded-lg bg-white/[0.02] px-3 py-2 ring-1 ring-white/[0.05]">
      <span
        className={`mt-0.5 flex-shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold ring-1 ${resultColors[criterion.result] ?? resultColors["unknown"]}`}
      >
        {resultLabel[criterion.result] ?? criterion.result}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-slate-300">
          {criterion.criterionText}
        </p>
        {criterion.evidence && (
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            {criterion.evidence}
          </p>
        )}
      </div>
      <span
        className={`flex-shrink-0 text-[9px] font-medium ${criterion.criterionType === "inclusion" ? "text-emerald-500/60" : "text-red-500/60"}`}
      >
        {criterion.criterionType === "inclusion" ? "INC" : "EXC"}
      </span>
    </div>
  );
}

// ===========================================================================
// Tab: Diagnoses
// ===========================================================================

function DiagnosesTab({ diagnoses }: { diagnoses: Diagnosis[] }) {
  if (diagnoses.length === 0) {
    return <EmptyTab message="No diagnoses on file." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              ICD-10
            </th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              Description
            </th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              Onset
            </th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {diagnoses.map((dx) => (
            <tr
              key={dx.id}
              className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]"
            >
              <td className="px-4 py-2.5 font-mono font-semibold text-slate-200">
                {dx.icd10Code ?? "--"}
              </td>
              <td className="px-4 py-2.5 text-slate-300">{dx.description}</td>
              <td className="px-4 py-2.5 text-slate-500">
                {dx.onsetDate ?? "--"}
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                    dx.status === "active"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : dx.status === "resolved"
                        ? "bg-slate-500/10 text-slate-400"
                        : "bg-white/[0.04] text-slate-500"
                  }`}
                >
                  {dx.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// Tab: Medications
// ===========================================================================

function MedicationsTab({ medications }: { medications: Medication[] }) {
  if (medications.length === 0) {
    return <EmptyTab message="No medications on file." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              Drug
            </th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              Dose
            </th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              Frequency
            </th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              Start
            </th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {medications.map((med) => (
            <tr
              key={med.id}
              className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]"
            >
              <td className="px-4 py-2.5 font-semibold text-slate-200">
                {med.drugName}
              </td>
              <td className="px-4 py-2.5 font-mono text-slate-300">
                {med.dose ?? "--"}
              </td>
              <td className="px-4 py-2.5 text-slate-400">
                {med.frequency ?? "--"}
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                {med.startDate ?? "--"}
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                    med.status === "active"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-slate-500/10 text-slate-500"
                  }`}
                >
                  {med.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// Tab: Labs
// ===========================================================================

function isAbnormal(lab: LabResult): boolean {
  if (lab.abnormalFlag && lab.abnormalFlag !== "N") return true;
  if (lab.value == null || !lab.referenceRange) return false;
  const match = lab.referenceRange.match(
    /^([\d.]+)\s*[-\u2013]\s*([\d.]+)$/
  );
  if (!match) return false;
  const low = parseFloat(match[1] ?? "");
  const high = parseFloat(match[2] ?? "");
  if (Number.isNaN(low) || Number.isNaN(high)) return false;
  return lab.value < low || lab.value > high;
}

function LabsTab({ labs }: { labs: LabResult[] }) {
  if (labs.length === 0) {
    return <EmptyTab message="No lab results on file." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              Test
            </th>
            <th className="px-4 py-2.5 text-right font-semibold text-slate-500">
              Value
            </th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              Unit
            </th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              Reference
            </th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">
              Date
            </th>
          </tr>
        </thead>
        <tbody>
          {labs.map((lab) => {
            const abnormal = isAbnormal(lab);
            return (
              <tr
                key={lab.id}
                className={`border-b border-white/[0.04] transition-colors hover:bg-white/[0.02] ${
                  abnormal ? "bg-red-500/5" : ""
                }`}
              >
                <td className="px-4 py-2.5 font-semibold text-slate-200">
                  {lab.testName}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono font-bold ${
                    abnormal ? "text-red-400" : "text-slate-200"
                  }`}
                >
                  {lab.value != null ? lab.value.toLocaleString() : "--"}
                  {abnormal && (
                    <AlertTriangle className="ml-1 inline h-3 w-3 text-red-400" />
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  {lab.unit ?? "--"}
                </td>
                <td className="px-4 py-2.5 text-[10px] text-slate-600">
                  {lab.referenceRange ?? "--"}
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  {lab.resultDate ?? "--"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// Tab: Vitals
// ===========================================================================

const vitalLabels: Record<string, string> = {
  bp_systolic: "BP Systolic",
  bp_diastolic: "BP Diastolic",
  hr: "Heart Rate",
  weight: "Weight",
  height: "Height",
  bmi: "BMI",
  temp: "Temperature",
};

const vitalIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  bp_systolic: Heart,
  bp_diastolic: Heart,
  hr: Activity,
  weight: User,
  height: User,
  bmi: Target,
  temp: Activity,
};

function VitalsTab({ vitals }: { vitals: VitalSign[] }) {
  if (vitals.length === 0) {
    return <EmptyTab message="No vitals on file." />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-5">
      {vitals.map((v) => {
        const Icon = vitalIcons[v.measurementType] ?? Activity;
        return (
          <div
            key={v.id}
            className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-cyan-400" />
              <span className="text-[11px] font-medium text-slate-400">
                {vitalLabels[v.measurementType] ?? v.measurementType}
              </span>
            </div>
            <p className="mt-2 text-xl font-black text-slate-200">
              {v.value}{" "}
              <span className="text-xs font-medium text-slate-500">
                {v.unit}
              </span>
            </p>
            {v.measurementDate && (
              <p className="mt-1 text-[10px] text-slate-600">
                {v.measurementDate}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Tab: Study Matches
// ===========================================================================

function StudyMatchesTab({ patient }: { patient: PatientSummary }) {
  // In this single-study demo, we display the one study the patient is screened against.
  // In a multi-study setup this would iterate over all screening results for the patient.
  return (
    <div className="p-5">
      <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-indigo-400" />
              <span className="text-[11px] font-bold text-white">
                KEYNOTE-789
              </span>
              <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-400 ring-1 ring-emerald-500/20">
                Phase 3
              </span>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              Pembro + Chemo in NSCLC &middot; Merck Sharp &amp; Dohme
            </p>
          </div>
          <div className="flex flex-col items-end">
            <span className={`text-xl font-black ${scoreColor(patient.score)}`}>
              {patient.score}
            </span>
            <span className="text-[9px] text-slate-500">Score</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-white/[0.03] p-2 text-center ring-1 ring-white/[0.04]">
            <p className="text-[10px] text-slate-500">Inclusion</p>
            <p className="font-mono text-sm font-bold text-emerald-400">
              {patient.inclusionMet}/{patient.inclusionTotal}
            </p>
          </div>
          <div className="rounded-lg bg-white/[0.03] p-2 text-center ring-1 ring-white/[0.04]">
            <p className="text-[10px] text-slate-500">Exclusion</p>
            <p className="font-mono text-sm font-bold text-red-400">
              {patient.exclusionTriggered}/{patient.exclusionTotal}
            </p>
          </div>
          <div className="rounded-lg bg-white/[0.03] p-2 text-center ring-1 ring-white/[0.04]">
            <p className="text-[10px] text-slate-500">Missing</p>
            <p className="font-mono text-sm font-bold text-amber-400">
              {patient.missingDataCount}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${statusBadgeClasses(patient.overallStatus)}`}
          >
            {statusLabel(patient.overallStatus)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Empty state helper
// ===========================================================================

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center">
      <p className="text-[11px] text-slate-600">{message}</p>
    </div>
  );
}
