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
  Lightbulb,
  HeartPulse,
  FileHeart,
} from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { useWatcherStore } from "@/stores/use-watcher-store";
import { useModeStore } from "@/stores/use-mode-store";
import { isPageVisibleInMode } from "@/lib/workspace-modes";
import { Tooltip } from "@/components/ui/Tooltip";
import type { NavigationPage } from "@/types";

interface NavItem {
  id: NavigationPage;
  label: string;
  hint: string;
  icon: React.ReactNode;
  shortcut: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "Core Workflow",
    items: [
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
        id: "review",
        label: "Review Queue",
        hint: "Decisions & export",
        icon: <ClipboardCheck className="h-4.5 w-4.5" />,
        shortcut: "3",
      },
    ],
  },
  {
    title: "Discovery",
    items: [
      {
        id: "trials",
        label: "Trial Discovery",
        hint: "Browse & match trials",
        icon: <FlaskConical className="h-4.5 w-4.5" />,
        shortcut: "4",
      },
      {
        id: "intelligence",
        label: "Site Intelligence",
        hint: "Readiness & ROI",
        icon: <Lightbulb className="h-4.5 w-4.5" />,
        shortcut: "5",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        id: "pipeline",
        label: "Enrollment",
        hint: "Track subject outreach",
        icon: <GitBranch className="h-4.5 w-4.5" />,
        shortcut: "6",
      },
      {
        id: "analytics",
        label: "Analytics",
        hint: "Feasibility & cohorts",
        icon: <BarChart3 className="h-4.5 w-4.5" />,
        shortcut: "7",
      },
      {
        id: "performance",
        label: "Performance",
        hint: "Metrics & revenue",
        icon: <TrendingUp className="h-4.5 w-4.5" />,
        shortcut: "8",
      },
    ],
  },
  {
    title: "Compliance",
    items: [
      {
        id: "registry",
        label: "Patient Registry",
        hint: "Consent & matching",
        icon: <HeartPulse className="h-4.5 w-4.5" />,
        shortcut: "9",
      },
      {
        id: "naaccr",
        label: "Tumor Registry",
        hint: "NAACCR reporting",
        icon: <FileHeart className="h-4.5 w-4.5" />,
        shortcut: "",
      },
    ],
  },
];

export function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const unreadCount = useWatcherStore((s) => s.unreadCount);
  const markAllRead = useWatcherStore((s) => s.markAllRead);
  const currentMode = useModeStore((s) => s.currentMode);

  // Filter each group's items by what's visible in the active workspace mode.
  // Empty groups are dropped entirely so the sidebar stays tight.
  const visibleGroups = (currentMode === "data-counts" ? [{title: "Data operations", items: [{id: "dashboard" as NavigationPage, label: "Laboratory rehearsal", hint: "Request to reconciled release", icon: <FlaskConical className="h-4.5 w-4.5" />, shortcut: "`"}]}] : navGroups)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isPageVisibleInMode(item.id, currentMode)),
    }))
    .filter((group) => group.items.length > 0);

  const navigate = (page: NavigationPage) => {
    setCurrentPage(page);
    if (currentMode === "data-counts") window.dispatchEvent(new CustomEvent("data-counts-navigate", {detail: page}));
  };

  return (
    <aside className="no-select flex w-[240px] flex-col border-r border-border bg-background">
      {/* Logo — click to go to Dashboard */}
      <button
        onClick={() => navigate("dashboard")}
        className="flex h-14 items-center gap-2.5 border-b border-border px-5 transition-colors hover:bg-surface-3"
      >
        <div className={`logo-glow flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 shadow-lg shadow-indigo-500/20 ${currentPage === "dashboard" ? "ring-2 ring-indigo-400/40" : ""}`}>
          <img src="/t6logo.png" alt="Talosix" className="h-6 w-6 object-contain" />
        </div>
        <div className="text-left">
          <h1 className="text-[13px] font-bold tracking-tight text-heading">
            TalOS SiteConnect
          </h1>
          <p className="text-[12px] font-medium text-dim">
            {currentMode === "data-counts" ? "Hospital data operations" : currentPage === "dashboard" ? "Dashboard" : "On-Premise Screening"}
          </p>
        </div>
      </button>

      {/* Navigation Groups */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
        {visibleGroups.map((group, gi) => (
          <div key={group.title} className={gi > 0 ? "mt-2" : ""}>
            <p className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-widest text-dim">
              {group.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      navigate(item.id);
                      if (item.id === "import" && unreadCount > 0) markAllRead();
                    }}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150 ${!isActive ? "hover:bg-surface-3" : ""}`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-lg bg-indigo-500/15 ring-1 ring-indigo-400/30"
                        transition={{ type: "spring", damping: 28, stiffness: 350 }}
                      />
                    )}
                    <span className={`relative z-10 ${isActive ? "text-indigo-400" : "text-dim group-hover:text-body"}`}>
                      {item.icon}
                      {item.id === "import" && unreadCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[9px] font-bold text-white shadow-lg shadow-indigo-500/40">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </span>
                    <div className="relative z-10 flex-1 min-w-0">
                      <span className={`block text-[13px] font-semibold leading-tight ${isActive ? "text-heading" : "text-dim group-hover:text-body"}`}>
                        {item.label}
                      </span>
                      <span className={`block text-[11px] leading-tight ${isActive ? "text-indigo-400/80" : "text-dim/60"}`}>
                        {item.hint}
                      </span>
                    </div>
                    {item.shortcut && (
                      <span className={`relative z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded text-[10px] font-medium ${isActive ? "text-indigo-400/60" : "text-dim/40"}`}>
                        {isActive ? <ChevronRight className="h-3 w-3 text-indigo-500/50" /> : item.shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Settings — pinned at bottom */}
      <div className="border-t border-border px-3 py-2">
        <button
          onClick={() => navigate("settings")}
          className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150 ${currentPage !== "settings" ? "hover:bg-surface-3" : ""}`}
        >
          {currentPage === "settings" && (
            <motion.div
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-lg bg-indigo-500/15 ring-1 ring-indigo-400/30"
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            />
          )}
          <span className={`relative z-10 ${currentPage === "settings" ? "text-indigo-400" : "text-dim group-hover:text-body"}`}>
            <Settings className="h-4.5 w-4.5" />
          </span>
          <span className={`relative z-10 text-[13px] font-semibold ${currentPage === "settings" ? "text-heading" : "text-dim group-hover:text-body"}`}>
            Settings
          </span>
          <span className={`relative z-10 ml-auto text-[10px] font-medium ${currentPage === "settings" ? "text-indigo-400/60" : "text-dim/40"}`}>
            {currentPage === "settings" ? <ChevronRight className="h-3 w-3 text-indigo-500/50" /> : "0"}
          </span>
        </button>
      </div>

      {/* Security Footer */}
      <div className="border-t border-border px-4 py-3">
        <Tooltip content="Zero data leaves this device. HIPAA-ready architecture." side="right">
          <div className="flex items-center gap-2.5 rounded-lg bg-emerald-500/8 px-3 py-2 ring-1 ring-emerald-500/15">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            <span className="text-[12px] font-medium text-emerald-400/90">
              {currentMode === 'data-counts' ? 'Synthetic rehearsal' : '100% On-Premise'}
            </span>
          </div>
        </Tooltip>
      </div>
    </aside>
  );
}
