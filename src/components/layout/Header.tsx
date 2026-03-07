import { Lock, WifiOff, Keyboard } from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { useScreeningStore } from "@/stores/use-screening-store";

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
        {/* Keyboard shortcut hint */}
        <div className="hidden xl:flex items-center gap-1.5 rounded-md bg-white/[0.03] px-2.5 py-1 ring-1 ring-white/[0.06]">
          <Keyboard className="h-3 w-3 text-slate-600" />
          <span className="text-[10px] text-slate-600">
            Arrow keys to navigate patients
          </span>
        </div>

        {/* Offline indicator */}
        <div className="flex items-center gap-1.5 rounded-md bg-white/[0.03] px-2.5 py-1 ring-1 ring-white/[0.06]">
          <WifiOff className="h-3 w-3 text-slate-500" />
          <span className="text-[10px] font-medium text-slate-500">Offline</span>
        </div>

        {/* Lock button */}
        <button
          onClick={lock}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-300"
          title="Lock application (Cmd+L)"
        >
          <Lock className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
