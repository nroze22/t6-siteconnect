import { motion } from "framer-motion";
import {
  Search,
  FileUp,
  FlaskConical,
  ClipboardCheck,
  BarChart3,
  Settings,
  ChevronRight,
  GitBranch,
  TrendingUp,
  Users,
  Lightbulb,
} from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { Tooltip } from "@/components/ui/Tooltip";
import type { NavigationPage } from "@/types";

const navItems: { id: NavigationPage; label: string; hint: string; icon: React.ReactNode; shortcut: string }[] = [
  {
    id: "screening",
    label: "Screening",
    hint: "Review subject eligibility",
    icon: <Search className="h-4.5 w-4.5" />,
    shortcut: "1",
  },
  {
    id: "import",
    label: "Import Data",
    hint: "CSV, FHIR, HL7 files",
    icon: <FileUp className="h-4.5 w-4.5" />,
    shortcut: "2",
  },
  {
    id: "trials",
    label: "Trial Discovery",
    hint: "Browse & match trials",
    icon: <FlaskConical className="h-4.5 w-4.5" />,
    shortcut: "3",
  },
  {
    id: "review",
    label: "Review Queue",
    hint: "Decisions & export",
    icon: <ClipboardCheck className="h-4.5 w-4.5" />,
    shortcut: "4",
  },
  {
    id: "pipeline",
    label: "Enrollment Pipeline",
    hint: "Track subject outreach",
    icon: <GitBranch className="h-4.5 w-4.5" />,
    shortcut: "5",
  },
  {
    id: "analytics",
    label: "Population Intel",
    hint: "Feasibility & diversity",
    icon: <BarChart3 className="h-4.5 w-4.5" />,
    shortcut: "6",
  },
  {
    id: "cohort",
    label: "Cohort Builder",
    hint: "Explore populations",
    icon: <Users className="h-4.5 w-4.5" />,
    shortcut: "7",
  },
  {
    id: "intelligence",
    label: "Research Intel",
    hint: "Readiness & ROI",
    icon: <Lightbulb className="h-4.5 w-4.5" />,
    shortcut: "8",
  },
  {
    id: "performance",
    label: "Site Performance",
    hint: "Metrics & revenue",
    icon: <TrendingUp className="h-4.5 w-4.5" />,
    shortcut: "9",
  },
  {
    id: "settings",
    label: "Settings",
    hint: "LLM, database, export",
    icon: <Settings className="h-4.5 w-4.5" />,
    shortcut: "0",
  },
];

export function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  return (
    <aside className="no-select flex w-[240px] flex-col border-r border-border bg-background">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 shadow-lg shadow-indigo-500/20">
          <img src="/t6logo.png" alt="Talosix" className="h-6 w-6 object-contain" />
        </div>
        <div>
          <h1 className="text-[13px] font-bold tracking-tight text-heading">
            TalOS SiteConnect
          </h1>
          <p className="text-[12px] font-medium text-dim">
            On-Premise Screening
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-3">
        <p className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-widest text-dim">
          Workspace
        </p>
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className="group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150"
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-indigo-500/15 ring-1 ring-indigo-500/20"
                  transition={{ type: "spring", damping: 28, stiffness: 350 }}
                />
              )}
              <span className={`relative z-10 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-dim group-hover:text-dim"}`}>
                {item.icon}
              </span>
              <div className="relative z-10 flex-1 min-w-0">
                <span className={`block text-[13px] font-medium leading-tight ${isActive ? "text-indigo-700 dark:text-indigo-300" : "text-dim group-hover:text-body"}`}>
                  {item.label}
                </span>
                <span className={`block text-[12px] leading-tight ${isActive ? "text-indigo-600/70 dark:text-indigo-400/60" : "text-dim"}`}>
                  {item.hint}
                </span>
              </div>
              <span className="relative z-10">
                {isActive ? (
                  <ChevronRight className="h-3 w-3 text-indigo-500/50" />
                ) : (
                  <kbd className="hidden group-hover:flex h-[18px] items-center rounded bg-surface-3 px-1.5 text-[9px] font-medium text-dim ring-1 ring-edge-2">
                    {item.shortcut}
                  </kbd>
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Security Footer */}
      <div className="border-t border-border px-4 py-3">
        <Tooltip content="Zero data leaves this device. HIPAA-ready architecture." side="right">
          <div className="flex items-center gap-2.5 rounded-lg bg-emerald-500/8 px-3 py-2 ring-1 ring-emerald-500/15">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            <span className="text-[12px] font-medium text-emerald-400/90">
              100% On-Premise
            </span>
          </div>
        </Tooltip>
        <p className="mt-2 px-1 text-[12px] leading-relaxed text-dim">
          All data encrypted on this device. No PHI ever leaves your machine.
        </p>
      </div>
    </aside>
  );
}
