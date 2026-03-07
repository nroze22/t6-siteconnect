import { Lock, WifiOff, Search, Command } from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { useScreeningStore } from "@/stores/use-screening-store";
import { Tooltip } from "@/components/ui/Tooltip";

const pageConfig: Record<string, { title: string; subtitle: string }> = {
  screening: {
    title: "Patient Screening",
    subtitle: "Review eligibility against active study criteria",
  },
  import: {
    title: "Import Data",
    subtitle: "Load patient records from CSV, FHIR, or HL7 files",
  },
  trials: {
    title: "Trial Discovery",
    subtitle: "Browse trials and match your patient population",
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
    subtitle: "Track patients from screening through enrollment",
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
  const config = pageConfig[currentPage] ?? { title: "SiteConnect", subtitle: "" };
  const screeningSub = currentPage === "screening" && patientCount > 0
    ? `Screening ${patientCount} patients`
    : config.subtitle;

  const openCommandPalette = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  };

  return (
    <header className="no-select flex h-12 items-center justify-between border-b border-border bg-card/50 px-5">
      <div>
        <h2 className="text-[13px] font-semibold text-foreground leading-tight">
          {config.title}
        </h2>
        <p className="text-[10px] text-slate-500 leading-tight">
          {screeningSub}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* Command palette trigger */}
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5 text-slate-500 ring-1 ring-white/[0.06] transition-all hover:bg-white/[0.06] hover:text-slate-300 hover:ring-white/[0.1]"
        >
          <Search className="h-3 w-3" />
          <span className="text-[11px]">Search...</span>
          <div className="flex items-center gap-0.5 ml-2">
            <kbd className="flex h-[18px] items-center rounded bg-white/[0.06] px-1 text-[9px] font-medium text-slate-500 ring-1 ring-white/[0.08]">
              <Command className="h-2.5 w-2.5" />
            </kbd>
            <kbd className="flex h-[18px] items-center rounded bg-white/[0.06] px-1 text-[9px] font-medium text-slate-500 ring-1 ring-white/[0.08]">
              K
            </kbd>
          </div>
        </button>

        {/* Offline indicator */}
        <Tooltip content="All data stays on this device" side="bottom">
          <div className="flex items-center gap-1.5 rounded-md bg-white/[0.03] px-2.5 py-1 ring-1 ring-white/[0.06]">
            <WifiOff className="h-3 w-3 text-slate-500" />
            <span className="text-[10px] font-medium text-slate-500">Offline</span>
          </div>
        </Tooltip>

        {/* Keyboard shortcuts hint */}
        <Tooltip content="Keyboard shortcuts" shortcut="?" side="bottom">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("toggle-shortcuts"))}
            className="flex items-center justify-center rounded-md px-2 py-1 text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-300"
          >
            <kbd className="flex h-[18px] items-center rounded bg-white/[0.06] px-1.5 text-[10px] font-medium text-slate-500 ring-1 ring-white/[0.08]">
              ?
            </kbd>
          </button>
        </Tooltip>

        {/* Lock button */}
        <Tooltip content="Lock application" shortcut="Cmd+L" side="bottom">
          <button
            onClick={lock}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-300"
          >
            <Lock className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
