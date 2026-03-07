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
import { useScreeningStore } from "@/stores/use-screening-store";
import { FlaskConical, Info } from "lucide-react";

// Study lookup for display
const STUDY_NAMES: Record<string, { short: string; sponsor: string; phase: string; nct: string }> = {
  "study-1": { short: "KEYNOTE-789: Pembro + Chemo in NSCLC", sponsor: "Merck Sharp & Dohme", phase: "Phase 3", nct: "NCT05502237" },
  "study-2": { short: "DELIVER: Dapagliflozin in HFpEF", sponsor: "AstraZeneca", phase: "Phase 3", nct: "NCT04564897" },
  "study-3": { short: "STEP-5: Semaglutide Weight Management", sponsor: "Novo Nordisk", phase: "Phase 3", nct: "NCT05252390" },
  "study-4": { short: "Lecanemab in Early Alzheimer's", sponsor: "Eisai / Biogen", phase: "Phase 2", nct: "NCT04381936" },
  "study-5": { short: "Risankizumab in Crohn's Disease", sponsor: "AbbVie", phase: "Phase 3", nct: "NCT05090566" },
  "study-6": { short: "Dupilumab in Atopic Dermatitis", sponsor: "Regeneron / Sanofi", phase: "Phase 3", nct: "NCT04516746" },
};

export function ScreeningPage() {
  const selectedStudyId = useScreeningStore((s) => s.selectedStudyId);
  const setStudyDetailOpen = useScreeningStore((s) => s.setStudyDetailOpen);
  const study = selectedStudyId ? STUDY_NAMES[selectedStudyId] : null;

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Study context bar */}
        {study && (
          <div className="shrink-0 border-b border-indigo-500/15 bg-gradient-to-r from-indigo-500/[0.06] via-indigo-500/[0.03] to-transparent px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15 ring-1 ring-indigo-500/25">
                  <FlaskConical className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13px] font-bold text-white">{study.short}</h3>
                    <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[9px] font-bold text-indigo-300 ring-1 ring-indigo-500/25">
                      {study.phase}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {study.sponsor} &middot; {study.nct}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setStudyDetailOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[10px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
              >
                <Info className="h-3 w-3" />
                Study Details
              </button>
            </div>
          </div>
        )}

        {/* Panels */}
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize="25%" minSize="18%" maxSize="35%">
              <PatientRankPanel />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="42%" minSize="30%">
              <CriteriaDetailPanel />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="33%" minSize="20%">
              <SourceDataPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
      <StudyDetailModal />
      <OverrideModal />
    </>
  );
}
