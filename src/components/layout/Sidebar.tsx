import {
  Search,
  FileUp,
  FlaskConical,
  ClipboardCheck,
  BarChart3,
  Settings,
  ChevronRight,
} from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import type { NavigationPage } from "@/types";

const navItems: { id: NavigationPage; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    id: "screening",
    label: "Screening",
    hint: "Review patient eligibility",
    icon: <Search className="h-4.5 w-4.5" />,
  },
  {
    id: "import",
    label: "Import Data",
    hint: "CSV, FHIR, HL7 files",
    icon: <FileUp className="h-4.5 w-4.5" />,
  },
  {
    id: "trials",
    label: "Trial Discovery",
    hint: "Browse & match trials",
    icon: <FlaskConical className="h-4.5 w-4.5" />,
  },
  {
    id: "review",
    label: "Review Queue",
    hint: "Decisions & export",
    icon: <ClipboardCheck className="h-4.5 w-4.5" />,
  },
  {
    id: "analytics",
    label: "Analytics",
    hint: "Population insights",
    icon: <BarChart3 className="h-4.5 w-4.5" />,
  },
  {
    id: "settings",
    label: "Settings",
    hint: "LLM, database, export",
    icon: <Settings className="h-4.5 w-4.5" />,
  },
];

export function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  return (
    <aside className="no-select flex w-[240px] flex-col border-r border-border bg-[#0e1119]">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
        <img src="/t6logo.png" alt="Talosix" className="h-8 w-8 rounded-lg object-contain" />
        <div>
          <h1 className="text-[13px] font-bold tracking-tight text-white">
            TalOS SiteConnect
          </h1>
          <p className="text-[10px] font-medium text-slate-500">
            Patient Screening
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-3">
        <p className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-widest text-slate-600">
          Workspace
        </p>
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150 ${
                isActive
                  ? "bg-indigo-500/15 text-indigo-300 shadow-sm glow-indigo"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
              }`}
            >
              <span className={isActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-400"}>
                {item.icon}
              </span>
              <div className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium leading-tight">{item.label}</span>
                <span className={`block text-[10px] leading-tight ${isActive ? "text-indigo-400/60" : "text-slate-600"}`}>
                  {item.hint}
                </span>
              </div>
              {isActive && (
                <ChevronRight className="h-3 w-3 text-indigo-500/50" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Security Footer */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-emerald-500/8 px-3 py-2 ring-1 ring-emerald-500/15">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
          <span className="text-[11px] font-medium text-emerald-400/90">
            100% On-Premise
          </span>
        </div>
        <p className="mt-2 px-1 text-[10px] leading-relaxed text-slate-600">
          All data encrypted on this device. No PHI ever leaves your machine.
        </p>
      </div>
    </aside>
  );
}
