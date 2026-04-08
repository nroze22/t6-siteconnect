import { useState, useCallback, useEffect } from "react";
import { LlmStatusBanner } from "@/components/ui/LlmStatusBanner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/ResizablePanels";
import { PatientRankPanel } from "./PatientRankPanel";
import { CriteriaDetailPanel } from "./CriteriaDetailPanel";
import { SourceDataPanel } from "./SourceDataPanel";
import { StudyDetailModal } from "./StudyDetailModal";
import { OverrideModal } from "./OverrideModal";
import { MatrixView } from "./MatrixView";
import { BestMatchView } from "./BestMatchView";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useMatrixScreeningStore } from "@/stores/use-matrix-screening-store";
import { useToast } from "@/components/ui/Toast";
import { screenPatientsViaRust, screeningResultToOutput, screenPatientsMulti, getStudies, type AnalyticsStudy } from "@/lib/data-provider";
import { FlaskConical, Info, ChevronDown, Loader2, RefreshCw, Grid3X3, List, Play } from "lucide-react";

type ScreeningMode = "single" | "multi";

// Fallback study list for demo/web mode
const DEMO_STUDY_LIST: { id: string; short: string; sponsor: string; phase: string; nct: string }[] = [
  { id: "study-1", short: "KEYNOTE-789: Pembro + Chemo in NSCLC", sponsor: "Merck Sharp & Dohme", phase: "Phase 3", nct: "NCT05502237" },
  { id: "study-2", short: "DELIVER: Dapagliflozin in HFpEF", sponsor: "AstraZeneca", phase: "Phase 3", nct: "NCT04564897" },
  { id: "study-3", short: "STEP-5: Semaglutide Weight Management", sponsor: "Novo Nordisk", phase: "Phase 3", nct: "NCT05252390" },
  { id: "study-4", short: "Lecanemab in Early Alzheimer's", sponsor: "Eisai / Biogen", phase: "Phase 2", nct: "NCT04381936" },
  { id: "study-5", short: "Risankizumab in Crohn's Disease", sponsor: "AbbVie", phase: "Phase 3", nct: "NCT05090566" },
  { id: "study-6", short: "Dupilumab in Atopic Dermatitis", sponsor: "Regeneron / Sanofi", phase: "Phase 3", nct: "NCT04516746" },
];

function analyticsStudyToDisplay(s: AnalyticsStudy): { id: string; short: string; sponsor: string; phase: string; nct: string } {
  return {
    id: s.id,
    short: s.short_title ?? s.title,
    sponsor: s.sponsor,
    phase: s.phase ?? "",
    nct: s.nct_number ?? "",
  };
}

const SCREENING_STEPS = [
  "Loading patient records...",
  "Parsing eligibility criteria...",
  "Evaluating inclusion criteria...",
  "Evaluating exclusion criteria...",
  "Checking lab value thresholds...",
  "Scoring patient eligibility...",
  "Ranking candidates...",
];

function ScreeningProgressOverlay() {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIdx((prev) => (prev + 1) % SCREENING_STEPS.length);
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-gradient-to-r from-indigo-500/[0.06] via-indigo-500/[0.04] to-transparent px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Animated pulse ring */}
        <div className="relative flex h-8 w-8 items-center justify-center">
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-indigo-500/30"
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border border-indigo-500/20"
            animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
          />
          <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-indigo-300">Screening in progress</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={stepIdx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="text-[11px] text-indigo-400/60"
            >
              {SCREENING_STEPS[stepIdx]}
            </motion.p>
          </AnimatePresence>
        </div>
        {/* Progress dots */}
        <div className="flex items-center gap-1">
          {SCREENING_STEPS.map((_, i) => (
            <motion.div
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              animate={{
                backgroundColor: i <= stepIdx ? "var(--color-accent-indigo)" : "color-mix(in srgb, var(--color-accent-indigo) 20%, transparent)",
                scale: i === stepIdx ? 1.3 : 1,
              }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScreeningPage() {
  const selectedStudyId = useScreeningStore((s) => s.selectedStudyId);
  const selectedStudyMeta = useScreeningStore((s) => s.selectedStudyMeta);
  const setStudyDetailOpen = useScreeningStore((s) => s.setStudyDetailOpen);
  const setPatients = useScreeningStore((s) => s.setPatients);
  const setScreeningResult = useScreeningStore((s) => s.setScreeningResult);
  const setCriteriaResults = useScreeningStore((s) => s.setCriteriaResults);
  const selectStudy = useScreeningStore((s) => s.selectStudy);
  const selectPatient = useScreeningStore((s) => s.selectPatient);
  const selectedPatientId = useScreeningStore((s) => s.selectedPatientId);
  const patients = useScreeningStore((s) => s.patients);

  const [showStudyPicker, setShowStudyPicker] = useState(false);
  const [screening, setScreening] = useState(false);
  const [studyList, setStudyList] = useState(DEMO_STUDY_LIST);
  const [studiesLoaded, setStudiesLoaded] = useState(false);
  const [mode, setMode] = useState<ScreeningMode>("single");
  const toast = useToast();

  // Multi-protocol store
  const matrixSelectedStudyIds = useMatrixScreeningStore((s) => s.selectedStudyIds);
  const setMatrixStudyIds = useMatrixScreeningStore((s) => s.setSelectedStudyIds);
  const setMatrixStudyNames = useMatrixScreeningStore((s) => s.setStudyNames);
  const populateMatrix = useMatrixScreeningStore((s) => s.populateFromResults);
  const setMatrixScreening = useMatrixScreeningStore((s) => s.setIsScreening);
  const matrixIsScreening = useMatrixScreeningStore((s) => s.isScreening);
  const matrixViewMode = useMatrixScreeningStore((s) => s.viewMode);
  const setMatrixViewMode = useMatrixScreeningStore((s) => s.setViewMode);

  const toggleMultiStudy = useCallback((studyId: string) => {
    setMatrixStudyIds(
      matrixSelectedStudyIds.includes(studyId)
        ? matrixSelectedStudyIds.filter((id) => id !== studyId)
        : [...matrixSelectedStudyIds, studyId]
    );
  }, [matrixSelectedStudyIds, setMatrixStudyIds]);

  const runMultiScreening = useCallback(async () => {
    if (matrixSelectedStudyIds.length === 0) {
      toast.warning("Select studies", "Choose at least one study for multi-protocol screening");
      return;
    }
    setMatrixScreening(true);
    setScreening(true);

    // Build study name map
    const names: Record<string, string> = {};
    for (const s of studyList) {
      names[s.id] = s.short.split(":")[0] ?? s.short;
    }
    setMatrixStudyNames(names);

    try {
      const response = await screenPatientsMulti(matrixSelectedStudyIds);
      populateMatrix(
        response.results.map((r) => ({
          patientId: r.patient_id,
          studyId: r.study_id,
          sitePatientId: r.site_patient_id ?? r.patient_id,
          age: r.age ?? null,
          gender: r.gender ?? null,
          primaryDiagnosis: r.primary_diagnosis ?? null,
          overallStatus: r.overall_status,
          score: r.score,
          inclusionMet: r.inclusion_met,
          inclusionTotal: r.inclusion_total,
          exclusionTriggered: r.exclusion_triggered,
        })),
        response.batchId
      );
      const eligible = response.results.filter(
        (r) => r.overall_status === "eligible" || r.overall_status === "potentially_eligible"
      ).length;
      toast.success(
        `Multi-protocol screening complete`,
        `${response.patientCount} patients x ${response.studyCount} studies — ${eligible} eligible matches`
      );
    } catch (err) {
      toast.error("Multi-screening failed", err instanceof Error ? err.message : String(err));
    } finally {
      setScreening(false);
      setMatrixScreening(false);
    }
  }, [matrixSelectedStudyIds, studyList, populateMatrix, setMatrixStudyNames, setMatrixScreening, toast]);

  // Load real studies from DB on mount
  useEffect(() => {
    getStudies().then((studies) => {
      if (studies.length > 0) {
        setStudyList(studies.map(analyticsStudyToDisplay));
      }
      setStudiesLoaded(true);
    });
  }, []);

  const studyMap = Object.fromEntries(studyList.map((s) => [s.id, s]));
  // Use study metadata from store (covers research pack studies) or from study list
  const study = selectedStudyId
    ? studyMap[selectedStudyId] ?? (selectedStudyMeta ? { id: selectedStudyId, ...selectedStudyMeta } : null)
    : null;

  const switchStudy = useCallback(async (studyId: string) => {
    setShowStudyPicker(false);
    setScreening(true);
    selectPatient(null);

    try {
      const studyInfo = studyMap[studyId];
      const rustResults = await screenPatientsViaRust(studyId);
      const results = rustResults.map(screeningResultToOutput);
      if (results.length === 0) {
        toast.warning("No subjects to screen", "Import subject data first");
        setScreening(false);
        return;
      }
      setPatients(results.map((s) => s.summary));
      for (const s of results) {
        setScreeningResult(s.summary.id, s.result);
        setCriteriaResults(s.result.id, s.criteria);
      }
      selectStudy(studyId, studyInfo ? {
        short: studyInfo.short,
        sponsor: studyInfo.sponsor,
        phase: studyInfo.phase,
        nct: studyInfo.nct,
      } : undefined);
      const eligible = results.filter((s) => s.summary.overallStatus === "eligible").length;
      toast.success(
        `Screened ${results.length} subjects`,
        `${eligible} eligible for ${studyInfo?.short.split(":")[0] ?? studyId}`
      );
    } catch (err) {
      toast.error("Screening failed", err instanceof Error ? err.message : String(err));
    } finally {
      setScreening(false);
    }
  }, [setPatients, setScreeningResult, setCriteriaResults, selectStudy, selectPatient, toast, studyMap]);

  // Auto-screen first study on mount when no patients are loaded yet
  useEffect(() => {
    if (studiesLoaded && patients.length === 0 && studyList.length > 0 && !screening) {
      switchStudy(studyList[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studiesLoaded]);

  return (
    <>
      <div className="flex h-full flex-col">
        <LlmStatusBanner />
        {/* Study context bar */}
        <div className="glass shrink-0 border-b border-indigo-500/15 bg-gradient-to-r from-indigo-500/[0.06] via-indigo-500/[0.03] to-transparent px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15 ring-1 ring-indigo-500/25">
                <FlaskConical className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              {study ? (
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13px] font-bold text-heading">{study.short}</h3>
                    <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[9px] font-bold text-indigo-300 ring-1 ring-indigo-500/25">
                      {study.phase}
                    </span>
                  </div>
                  <p className="text-[12px] text-dim">
                    {study.sponsor} &middot; {study.nct}
                  </p>
                </div>
              ) : (
                <div>
                  <h3 className="text-[13px] font-bold text-body">No study selected</h3>
                  <p className="text-[12px] text-dim">Choose a study to screen subjects against</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Study switcher */}
              <div className="relative">
                <button
                  onClick={() => setShowStudyPicker(!showStudyPicker)}
                  disabled={screening}
                  className="flex items-center gap-1.5 rounded-lg border border-edge-2 bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-body transition-colors hover:bg-surface-3 hover:text-heading disabled:opacity-50"
                >
                  {screening ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  {screening ? "Screening..." : "Switch Study"}
                  <ChevronDown className={`h-3 w-3 transition-transform ${showStudyPicker ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                {showStudyPicker && (
                  <>
                    <motion.div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowStudyPicker(false)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="absolute right-0 top-full z-50 mt-1 w-[380px] origin-top-right rounded-lg border border-edge-3 bg-card p-1.5 shadow-xl shadow-black/30"
                    >
                      <p className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-dim">
                        Select study to screen against
                      </p>
                      {studyList.map((s, i) => {
                        const isActive = s.id === selectedStudyId;
                        return (
                          <motion.button
                            key={s.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03, duration: 0.15 }}
                            onClick={() => switchStudy(s.id)}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                              isActive
                                ? "bg-indigo-500/12 text-indigo-300"
                                : "text-dim hover:bg-surface-2"
                            }`}
                          >
                            <FlaskConical className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-indigo-400" : "text-dim"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-medium truncate">{s.short}</p>
                              <p className={`text-[9px] ${isActive ? "text-indigo-400/50" : "text-dim"}`}>
                                {s.sponsor} &middot; {s.phase}
                              </p>
                            </div>
                            {isActive && (
                              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[8px] font-bold text-indigo-400 ring-1 ring-indigo-500/30">
                                Active
                              </span>
                            )}
                          </motion.button>
                        );
                      })}
                    </motion.div>
                  </>
                )}
                </AnimatePresence>
              </div>

              {/* Study details */}
              {study && (
                <button
                  onClick={() => setStudyDetailOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-edge-2 bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body"
                >
                  <Info className="h-3 w-3" />
                  Study Details
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mode toggle bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-zinc-800/50 bg-zinc-900/30">
          <div className="flex items-center rounded-lg border border-zinc-700/50 overflow-hidden">
            <button
              onClick={() => setMode("single")}
              className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium transition-colors ${
                mode === "single"
                  ? "bg-indigo-500/15 text-indigo-300"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              }`}
            >
              <List className="h-3 w-3" />
              Single Study
            </button>
            <button
              onClick={() => setMode("multi")}
              className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium transition-colors ${
                mode === "multi"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              }`}
            >
              <Grid3X3 className="h-3 w-3" />
              Multi-Protocol
            </button>
          </div>

          {mode === "multi" && (
            <>
              {/* Multi-study selector pills */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto">
                {studyList.map((s) => {
                  const isSelected = matrixSelectedStudyIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleMultiStudy(s.id)}
                      className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                        isSelected
                          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30"
                          : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {s.short.split(":")[0] ?? s.short}
                    </button>
                  );
                })}
              </div>

              {/* View toggle + Run button */}
              <div className="flex items-center gap-1.5">
                <div className="flex items-center rounded border border-zinc-700/50 overflow-hidden">
                  <button
                    onClick={() => setMatrixViewMode("matrix")}
                    className={`px-2 py-0.5 text-[10px] font-medium ${
                      matrixViewMode === "matrix" ? "bg-zinc-700/50 text-zinc-200" : "text-zinc-500"
                    }`}
                  >
                    Matrix
                  </button>
                  <button
                    onClick={() => setMatrixViewMode("best-match")}
                    className={`px-2 py-0.5 text-[10px] font-medium ${
                      matrixViewMode === "best-match" ? "bg-zinc-700/50 text-zinc-200" : "text-zinc-500"
                    }`}
                  >
                    Best Match
                  </button>
                </div>

                <button
                  onClick={runMultiScreening}
                  disabled={matrixSelectedStudyIds.length === 0 || matrixIsScreening}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {matrixIsScreening ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Screen {matrixSelectedStudyIds.length} stud{matrixSelectedStudyIds.length !== 1 ? "ies" : "y"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Screening overlay */}
        <AnimatePresence>
        {screening && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="shrink-0 overflow-hidden border-b border-indigo-500/15"
          >
            <ScreeningProgressOverlay />
          </motion.div>
        )}
        </AnimatePresence>

        {/* Panels */}
        <div className="flex-1 overflow-hidden">
          {mode === "single" ? (
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel defaultSize="25%" minSize="18%" maxSize="35%">
                <PatientRankPanel />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize="42%" minSize="30%">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedPatientId ?? "none"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <CriteriaDetailPanel />
                  </motion.div>
                </AnimatePresence>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize="33%" minSize="20%">
                <SourceDataPanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            /* Multi-Protocol View */
            <div className="h-full">
              {matrixViewMode === "matrix" ? (
                <MatrixView
                  onCellClick={(patientId, studyId) => {
                    // Switch to single-study view for drill-down
                    selectStudy(studyId);
                    selectPatient(patientId);
                  }}
                />
              ) : (
                <BestMatchView
                  onSelectMatch={(patientId, studyId) => {
                    selectStudy(studyId);
                    selectPatient(patientId);
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
      <StudyDetailModal />
      <OverrideModal />
    </>
  );
}
