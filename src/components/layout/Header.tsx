import { Lock, WifiOff, Search, Command, HelpCircle } from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { useScreeningStore } from "@/stores/use-screening-store";
import { Tooltip } from "@/components/ui/Tooltip";
import { useHelpDrawer } from "@/components/ui/HelpDrawer";

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

const pageConfig: Record<string, { title: string; subtitle: string }> = {
  screening: {
    title: "Subject Screening",
    subtitle: "Review eligibility against active study criteria",
  },
  import: {
    title: "Import Data",
    subtitle: "Load subject records from CSV, FHIR, or HL7 files",
  },
  trials: {
    title: "Trial Discovery",
    subtitle: "Browse trials and match your subject population",
  },
  review: {
    title: "Review Queue",
    subtitle: "Review screening decisions and export results",
  },
  analytics: {
    title: "Population Intelligence",
    subtitle: "Feasibility, lab trajectories, and diversity analytics",
  },
  pipeline: {
    title: "Enrollment Pipeline",
    subtitle: "Track subjects from screening through enrollment",
  },
  cohort: {
    title: "Cohort Builder",
    subtitle: "Define and explore subject populations with natural language queries",
  },
  intelligence: {
    title: "Research Intelligence",
    subtitle: "Readiness scoring, missed opportunities, enrollment funnels, and ROI analysis",
  },
  performance: {
    title: "Site Performance",
    subtitle: "Screen failure intelligence, multi-study matching, and revenue",
  },
  settings: {
    title: "Settings",
    subtitle: "Configure LLM, database, and export options",
  },
};

export function Header() {
  const currentPage = useAppStore((s) => s.currentPage);
  const lock = useAppStore((s) => s.lock);
  const patientCount = useScreeningStore((s) => s.patients.length);
  const helpDrawer = useHelpDrawer();
  const config = pageConfig[currentPage] ?? { title: "SiteConnect", subtitle: "" };
  const screeningSub = currentPage === "screening" && patientCount > 0
    ? `Screening ${patientCount} patients`
    : config.subtitle;

  const openCommandPalette = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }));
  };

  return (
    <header className="no-select flex h-12 items-center justify-between border-b border-border bg-card/30 glass px-5">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground leading-tight">
          {config.title}
        </h2>
        <p className="text-[12px] text-dim leading-tight">
          {screeningSub}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* Command palette trigger */}
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-dim ring-1 ring-edge-2 transition-all hover:bg-surface-3 hover:text-body hover:ring-edge-4"
        >
          <Search className="h-3 w-3" />
          <span className="text-[12px]">Search...</span>
          <div className="flex items-center gap-0.5 ml-2">
            <kbd className="flex h-[18px] items-center rounded bg-surface-3 px-1 text-[9px] font-medium text-dim ring-1 ring-edge-3">
              {isMac ? <Command className="h-2.5 w-2.5" /> : <span className="text-[9px]">Ctrl</span>}
            </kbd>
            <kbd className="flex h-[18px] items-center rounded bg-surface-3 px-1 text-[9px] font-medium text-dim ring-1 ring-edge-3">
              K
            </kbd>
          </div>
        </button>

        {/* Offline indicator */}
        <Tooltip content="All data stays on this device" side="bottom">
          <div className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1 ring-1 ring-edge-2">
            <WifiOff className="h-3 w-3 text-dim" />
            <span className="text-[12px] font-medium text-dim">Offline</span>
          </div>
        </Tooltip>

        {/* Keyboard shortcuts hint */}
        <Tooltip content="Keyboard shortcuts" shortcut="?" side="bottom">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("toggle-shortcuts"))}
            className="flex items-center justify-center rounded-md px-2 py-1 text-dim transition-colors hover:bg-surface-3 hover:text-body"
          >
            <kbd className="flex h-[18px] items-center rounded bg-surface-3 px-1.5 text-[12px] font-medium text-dim ring-1 ring-edge-3">
              ?
            </kbd>
          </button>
        </Tooltip>

        {/* Help button */}
        <Tooltip content="Help & Guide" shortcut="F1" side="bottom">
          <button
            onClick={helpDrawer.toggle}
            className="flex items-center justify-center rounded-md px-2 py-1 text-dim transition-colors hover:bg-surface-3 hover:text-body"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </Tooltip>

        {/* Lock button */}
        <Tooltip content="Lock application" shortcut={isMac ? "Cmd+L" : "Ctrl+L"} side="bottom">
          <button
            onClick={lock}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-dim transition-colors hover:bg-surface-3 hover:text-body"
          >
            <Lock className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
