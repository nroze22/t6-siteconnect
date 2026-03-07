import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  FileUp,
  FlaskConical,
  ClipboardCheck,
  BarChart3,
  Settings,
  GitBranch,
  TrendingUp,
  Keyboard,
  ArrowRight,
  Command,
  CornerDownLeft,
} from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import type { NavigationPage } from "@/types";

interface CommandItem {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  section: string;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const navigateTo = useCallback(
    (page: NavigationPage) => {
      setCurrentPage(page);
      setOpen(false);
    },
    [setCurrentPage]
  );

  const commands: CommandItem[] = useMemo(
    () => [
      // Navigation
      { id: "nav-screening", label: "Patient Screening", hint: "Review eligibility", icon: <Search className="h-4 w-4" />, section: "Navigate", action: () => navigateTo("screening"), keywords: ["patients", "screen", "eligibility", "criteria"] },
      { id: "nav-import", label: "Import Data", hint: "CSV, FHIR, HL7", icon: <FileUp className="h-4 w-4" />, section: "Navigate", action: () => navigateTo("import"), keywords: ["upload", "csv", "fhir", "hl7", "file"] },
      { id: "nav-trials", label: "Trial Discovery", hint: "Browse & match trials", icon: <FlaskConical className="h-4 w-4" />, section: "Navigate", action: () => navigateTo("trials"), keywords: ["study", "clinical", "nct", "sponsor"] },
      { id: "nav-review", label: "Review Queue", hint: "Decisions & export", icon: <ClipboardCheck className="h-4 w-4" />, section: "Navigate", action: () => navigateTo("review"), keywords: ["accept", "reject", "defer", "decision"] },
      { id: "nav-pipeline", label: "Enrollment Pipeline", hint: "Track outreach", icon: <GitBranch className="h-4 w-4" />, section: "Navigate", action: () => navigateTo("pipeline"), keywords: ["enrollment", "kanban", "outreach", "status"] },
      { id: "nav-analytics", label: "Population Intel", hint: "Feasibility & diversity", icon: <BarChart3 className="h-4 w-4" />, section: "Navigate", action: () => navigateTo("analytics"), keywords: ["chart", "diversity", "feasibility", "demographics"] },
      { id: "nav-performance", label: "Site Performance", hint: "Metrics & revenue", icon: <TrendingUp className="h-4 w-4" />, section: "Navigate", action: () => navigateTo("performance"), keywords: ["revenue", "metrics", "kpi", "financial"] },
      { id: "nav-settings", label: "Settings", hint: "LLM, database, export", icon: <Settings className="h-4 w-4" />, section: "Navigate", action: () => navigateTo("settings"), keywords: ["configure", "llm", "database", "preferences", "audit"] },
      // Actions
      { id: "act-shortcuts", label: "Keyboard Shortcuts", hint: "View all shortcuts", icon: <Keyboard className="h-4 w-4" />, section: "Actions", action: () => { setOpen(false); window.dispatchEvent(new CustomEvent("toggle-shortcuts")); }, keywords: ["keys", "hotkey", "shortcut", "help"] },
    ],
    [navigateTo]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.hint.toLowerCase().includes(q) ||
        c.keywords?.some((k) => k.includes(q))
    );
  }, [query, commands]);

  // Group by section
  const sections = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const existing = map.get(item.section);
      if (existing) existing.push(item);
      else map.set(item.section, [item]);
    }
    return map;
  }, [filtered]);

  // Flatten for index tracking
  const flatItems = useMemo(() => filtered, [filtered]);

  // Global shortcut: Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setSelectedIndex(0);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keyboard navigation in list
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatItems[selectedIndex];
        if (item) item.action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, selectedIndex, flatItems]);

  // Reset selected on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[9990] bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            className="fixed left-1/2 top-[18%] z-[9991] w-[560px] -translate-x-1/2 overflow-hidden rounded-2xl bg-[#131825]/98 ring-1 ring-white/10 shadow-2xl shadow-black/40 backdrop-blur-2xl"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
              <Search className="h-4.5 w-4.5 shrink-0 text-slate-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search commands, pages, actions..."
                className="flex-1 bg-transparent text-[14px] text-slate-200 placeholder-slate-500 outline-none"
              />
              <kbd className="hidden sm:flex items-center gap-0.5 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-white/[0.08]">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[360px] overflow-y-auto p-2">
              {flatItems.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-slate-500">
                  <Search className="h-5 w-5" />
                  <p className="text-[13px]">No results for &ldquo;{query}&rdquo;</p>
                </div>
              )}

              {Array.from(sections.entries()).map(([section, items]) => (
                <div key={section}>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                    {section}
                  </p>
                  {items.map((item) => {
                    const globalIndex = flatItems.indexOf(item);
                    const isSelected = globalIndex === selectedIndex;
                    return (
                      <button
                        key={item.id}
                        data-index={globalIndex}
                        onClick={item.action}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-100 ${
                          isSelected
                            ? "bg-indigo-500/12 text-indigo-300"
                            : "text-slate-400 hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className={`shrink-0 ${isSelected ? "text-indigo-400" : "text-slate-500"}`}>
                          {item.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="block text-[13px] font-medium">{item.label}</span>
                          <span className={`block text-[10px] ${isSelected ? "text-indigo-400/50" : "text-slate-600"}`}>
                            {item.hint}
                          </span>
                        </div>
                        {isSelected && (
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-indigo-500/50" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2">
              <div className="flex items-center gap-3 text-[10px] text-slate-600">
                <span className="flex items-center gap-1">
                  <CornerDownLeft className="h-3 w-3" /> Select
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-[9px]">↑↓</span> Navigate
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-slate-600">
                <Command className="h-3 w-3" />
                <span>K to toggle</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
