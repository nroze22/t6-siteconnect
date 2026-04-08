import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FileHeart,
  Loader2,
  Scan,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
} from "lucide-react";
import { useNaacrStore } from "@/stores/use-naaccr-store";
import { NaacrDashboard } from "./NaacrDashboard";
import { CaseAbstractionWorkspace } from "./CaseAbstractionWorkspace";
import { isTauri } from "@/lib/tauri";
import { useToast } from "@/components/ui/Toast";
import type { AbstractStatus } from "@/types/naaccr";

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const STATUS_BADGE: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  draft: { icon: <Clock className="h-2.5 w-2.5" />, color: "bg-zinc-500/20 text-zinc-400 ring-zinc-500/30", label: "Draft" },
  in_progress: { icon: <Loader2 className="h-2.5 w-2.5" />, color: "bg-blue-500/20 text-blue-300 ring-blue-500/30", label: "In Progress" },
  complete: { icon: <CheckCircle2 className="h-2.5 w-2.5" />, color: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30", label: "Complete" },
  submitted: { icon: <FileCheck className="h-2.5 w-2.5" />, color: "bg-purple-500/20 text-purple-300 ring-purple-500/30", label: "Submitted" },
  accepted: { icon: <CheckCircle2 className="h-2.5 w-2.5" />, color: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30", label: "Accepted" },
};

export function NaacrPage() {
  const {
    cases, isLoading, selectedCaseId, statusFilter,
    setCases, setIsLoading, selectCase, setStatusFilter,
  } = useNaacrStore();

  const [view, setView] = useState<"list" | "dashboard" | "workspace">("list");
  const [detecting, setDetecting] = useState(false);
  const toast = useToast();

  const loadCases = useCallback(async () => {
    if (!isTauri) return;
    setIsLoading(true);
    try {
      const result = await tauriInvoke<Array<{
        id: string; patient_id: string; site_patient_id: string;
        detected_at: string; detection_method: string; abstract_status: string;
        primary_site_icdo3: string | null; histology_icdo3: string | null;
        behavior_code: string | null; grade: string | null;
        date_of_diagnosis: string | null; clinical_stage_group: string | null;
        pathologic_stage_group: string | null; treatment_surgery: string;
        treatment_chemo: string; treatment_immuno: string; treatment_hormone: string;
        completeness_score: number; validation_error_count: number;
        state_registry: string | null; submitted_at: string | null;
      }>>("get_reportable_cases", {
        filters: { status_filter: statusFilter, search: null, limit: 200 },
      });

      setCases(result.map((c) => ({
        id: c.id,
        patientId: c.patient_id,
        sitePatientId: c.site_patient_id,
        detectedAt: c.detected_at,
        detectionMethod: c.detection_method as "auto" | "manual",
        abstractStatus: c.abstract_status as AbstractStatus,
        primarySiteIcdo3: c.primary_site_icdo3,
        histologyIcdo3: c.histology_icdo3,
        behaviorCode: c.behavior_code,
        grade: c.grade,
        laterality: null,
        dateOfDiagnosis: c.date_of_diagnosis,
        diagnosticConfirmation: null,
        clinicalStageGroup: c.clinical_stage_group,
        pathologicStageGroup: c.pathologic_stage_group,
        tnmClinicalT: null, tnmClinicalN: null, tnmClinicalM: null,
        tnmPathologicT: null, tnmPathologicN: null, tnmPathologicM: null,
        treatmentSurgery: c.treatment_surgery,
        treatmentRadiation: "00",
        treatmentChemo: c.treatment_chemo,
        treatmentHormone: c.treatment_hormone,
        treatmentImmuno: c.treatment_immuno,
        treatmentOther: "00",
        dateFirstTreatment: null,
        vitalStatus: "1",
        dateOfLastContact: null,
        completenessScore: c.completeness_score,
        validationErrors: [],
        stateRegistry: c.state_registry,
        submittedAt: c.submitted_at,
        abstractedBy: null,
      })));
    } catch (err) {
      console.error("[naaccr] Failed to load cases:", err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, setCases, setIsLoading]);

  const runDetection = useCallback(async () => {
    if (!isTauri) return;
    setDetecting(true);
    try {
      const detected = await tauriInvoke<Array<{ id: string; icd10_code: string; description: string }>>(
        "detect_reportable_cases", {}
      );
      if (detected.length > 0) {
        toast.success(`${detected.length} new cases detected`, "Reportable cancer cases identified from patient diagnoses");
        loadCases();
      } else {
        toast.info("No new cases", "All reportable diagnoses are already tracked");
      }
    } catch (err) {
      toast.error("Detection failed", err instanceof Error ? err.message : String(err));
    } finally {
      setDetecting(false);
    }
  }, [loadCases, toast]);

  useEffect(() => { loadCases(); }, [loadCases]);

  if (view === "workspace" && selectedCaseId) {
    return (
      <CaseAbstractionWorkspace
        caseId={selectedCaseId}
        onBack={() => {
          setView("list");
          selectCase(null);
          loadCases();
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/50 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15 ring-1 ring-orange-500/25">
              <FileHeart className="h-3.5 w-3.5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-[13px] font-bold text-zinc-100">Tumor Registry</h2>
              <p className="text-[11px] text-zinc-500">
                {cases.length} cases &middot; NAACCR reporting &middot; Auto-detection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Detect button */}
            <button
              onClick={runDetection}
              disabled={detecting}
              className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
            >
              {detecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scan className="h-3 w-3" />}
              Detect Cases
            </button>

            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-zinc-700/50 overflow-hidden">
              <button
                onClick={() => setView("list")}
                className={`px-3 py-1 text-[11px] font-medium ${view === "list" ? "bg-zinc-700/50 text-zinc-200" : "text-zinc-500"}`}
              >
                Cases
              </button>
              <button
                onClick={() => setView("dashboard")}
                className={`px-3 py-1 text-[11px] font-medium ${view === "dashboard" ? "bg-zinc-700/50 text-zinc-200" : "text-zinc-500"}`}
              >
                Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {view === "dashboard" ? (
        <NaacrDashboard />
      ) : (
        <>
          {/* Filters */}
          <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-zinc-800/50">
            <Filter className="h-3 w-3 text-zinc-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded border border-zinc-700/50 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="in_progress">In Progress</option>
              <option value="complete">Complete</option>
              <option value="submitted">Submitted</option>
              <option value="accepted">Accepted</option>
            </select>
          </div>

          {/* Case table */}
          <div className="flex-1 overflow-auto">
            {isLoading && cases.length === 0 ? (
              <div className="flex items-center justify-center h-full text-zinc-500">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading cases...
              </div>
            ) : cases.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                <FileHeart className="h-12 w-12 opacity-30" />
                <p className="text-sm">No reportable cases</p>
                <p className="text-xs text-zinc-600">Click "Detect Cases" to scan patient data for reportable cancers</p>
              </div>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-zinc-900">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Patient</th>
                    <th className="text-left py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Site (ICD-O-3)</th>
                    <th className="text-left py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Dx Date</th>
                    <th className="text-center py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Status</th>
                    <th className="text-center py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Completeness</th>
                    <th className="text-center py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Errors</th>
                    <th className="text-right py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c, idx) => {
                    const badge = STATUS_BADGE[c.abstractStatus] ?? STATUS_BADGE["draft"]!;
                    const pct = Math.round(c.completenessScore * 100);

                    return (
                      <motion.tr
                        key={c.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.02, 0.4) }}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
                        onClick={() => { selectCase(c.id); setView("workspace"); }}
                      >
                        <td className="py-2 px-3 font-mono text-zinc-300">{c.sitePatientId}</td>
                        <td className="py-2 px-3 text-zinc-400">
                          {c.primarySiteIcdo3 || <span className="text-zinc-600">Unmapped</span>}
                        </td>
                        <td className="py-2 px-3 text-zinc-400">{c.dateOfDiagnosis || "—"}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${badge.color}`}>
                            {badge.icon} {badge.label}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400">{pct}%</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          {c.validationErrors.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              <AlertTriangle className="h-3 w-3" />
                              <span className="text-[10px]">{c.validationErrors.length}</span>
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-[10px]">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); selectCase(c.id); setView("workspace"); }}
                            className="text-[10px] text-orange-400 hover:text-orange-300 font-medium"
                          >
                            Abstract
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
