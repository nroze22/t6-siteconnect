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
  HelpCircle,
  Users,
  Lightbulb,
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
  shortcutKey?: string;
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
      // Pages
      { id: "nav-dashboard", label: "Dashboard", hint: "Site overview & status", icon: <Search className="h-4 w-4" />, section: "Pages", shortcutKey: "`", action: () => navigateTo("dashboard"), keywords: ["home", "overview", "dashboard", "status"] },
      { id: "nav-screening", label: "Subject Screening", hint: "Review eligibility", icon: <Search className="h-4 w-4" />, section: "Pages", shortcutKey: "1", action: () => navigateTo("screening"), keywords: ["subjects", "screen", "eligibility", "criteria"] },
      { id: "nav-import", label: "Import Data", hint: "CSV, FHIR, HL7", icon: <FileUp className="h-4 w-4" />, section: "Pages", shortcutKey: "2", action: () => navigateTo("import"), keywords: ["upload", "csv", "fhir", "hl7", "file"] },
      { id: "nav-trials", label: "Trial Discovery", hint: "Browse & match trials", icon: <FlaskConical className="h-4 w-4" />, section: "Pages", shortcutKey: "3", action: () => navigateTo("trials"), keywords: ["study", "clinical", "nct", "sponsor"] },
      { id: "nav-review", label: "Review Queue", hint: "Decisions & export", icon: <ClipboardCheck className="h-4 w-4" />, section: "Pages", shortcutKey: "4", action: () => navigateTo("review"), keywords: ["accept", "reject", "defer", "decision"] },
      { id: "nav-pipeline", label: "Enrollment Pipeline", hint: "Track outreach", icon: <GitBranch className="h-4 w-4" />, section: "Pages", shortcutKey: "5", action: () => navigateTo("pipeline"), keywords: ["enrollment", "kanban", "outreach", "status"] },
      { id: "nav-analytics", label: "Population Intel", hint: "Feasibility & diversity", icon: <BarChart3 className="h-4 w-4" />, section: "Pages", shortcutKey: "6", action: () => navigateTo("analytics"), keywords: ["chart", "diversity", "feasibility", "demographics"] },
      { id: "nav-cohort", label: "Cohort Builder", hint: "Explore populations", icon: <Users className="h-4 w-4" />, section: "Pages", shortcutKey: "7", action: () => navigateTo("cohort"), keywords: ["cohort", "population", "explorer", "query", "filter", "subjects"] },
      { id: "nav-intelligence", label: "Research Intelligence", hint: "Readiness & ROI", icon: <Lightbulb className="h-4 w-4" />, section: "Pages", shortcutKey: "8", action: () => navigateTo("intelligence"), keywords: ["readiness", "roi", "opportunity", "funnel", "intelligence", "score"] },
      { id: "nav-performance", label: "Site Performance", hint: "Metrics & revenue", icon: <TrendingUp className="h-4 w-4" />, section: "Pages", shortcutKey: "9", action: () => navigateTo("performance"), keywords: ["revenue", "metrics", "kpi", "financial"] },
      { id: "nav-settings", label: "Settings", hint: "LLM, database, export", icon: <Settings className="h-4 w-4" />, section: "Pages", shortcutKey: "0", action: () => navigateTo("settings"), keywords: ["configure", "llm", "database", "preferences", "audit"] },
      // Actions
      { id: "act-shortcuts", label: "Keyboard Shortcuts", hint: "View all shortcuts", icon: <Keyboard className="h-4 w-4" />, section: "Actions", shortcutKey: "?", action: () => { setOpen(false); window.dispatchEvent(new CustomEvent("toggle-shortcuts")); }, keywords: ["keys", "hotkey", "shortcut"] },
      { id: "act-help", label: "Help & Guide", hint: "Page-specific help and tips", icon: <HelpCircle className="h-4 w-4" />, section: "Actions", action: () => { setOpen(false); window.dispatchEvent(new CustomEvent("toggle-help")); }, keywords: ["help", "guide", "documentation", "how", "faq"] },
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
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9990] bg-black/70 backdrop-blur-md"
            onClick={() => setOpen(false)}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: "spring", damping: 28, stiffness: 380, mass: 0.8 }}
            className="glass fixed left-1/2 top-[16%] z-[9991] w-[580px] -translate-x-1/2 overflow-hidden rounded-2xl bg-card/95 ring-1 ring-white/[0.12] shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5),0_0_0_1px_rgba(99,102,241,0.05)]"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-edge-2 px-5 py-4">
              <Search className="h-5 w-5 shrink-0 text-indigo-400/70" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Where do you want to go?"
                className="flex-1 bg-transparent text-[16px] font-medium text-body placeholder-dim/60 outline-none"
              />
              <kbd className="hidden sm:flex items-center gap-0.5 rounded-md bg-surface-3 px-2 py-1 text-[11px] font-medium text-dim ring-1 ring-edge-3">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[380px] overflow-y-auto p-2">
              {flatItems.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-10 text-dim">
                  <Search className="h-6 w-6 opacity-40" />
                  <p className="text-[13px]">No results for &ldquo;{query}&rdquo;</p>
                  <p className="text-[12px] text-faint">Try a different search term</p>
                </div>
              )}

              {Array.from(sections.entries()).map(([section, items], sectionIdx) => (
                <div key={section}>
                  {sectionIdx > 0 && <div className="mx-3 my-1.5 border-t border-edge-1" />}
                  <p className="px-3 pt-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
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
                            : "text-dim hover:bg-surface-2"
                        }`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${isSelected ? "bg-indigo-500/15 text-indigo-400" : "bg-surface-2 text-dim"}`}>
                          {item.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className={`block text-[13px] font-medium ${isSelected ? "text-indigo-200" : "text-body"}`}>{item.label}</span>
                          <span className={`block text-[12px] ${isSelected ? "text-indigo-400/50" : "text-dim"}`}>
                            {item.hint}
                          </span>
                        </div>
                        {item.shortcutKey && (
                          <kbd className={`hidden sm:flex shrink-0 h-5 min-w-[20px] items-center justify-center rounded-md px-1.5 text-[11px] font-mono font-medium transition-colors ${
                            isSelected
                              ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30"
                              : "bg-surface-3 text-faint ring-1 ring-edge-2"
                          }`}>
                            {item.shortcutKey}
                          </kbd>
                        )}
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
            <div className="flex items-center justify-between border-t border-edge-2 bg-surface-1 px-5 py-2.5">
              <div className="flex items-center gap-4 text-[11px] text-faint">
                <span className="flex items-center gap-1.5">
                  <kbd className="flex h-4 items-center rounded bg-surface-3 px-1 text-[10px] ring-1 ring-edge-2">
                    <CornerDownLeft className="h-2.5 w-2.5" />
                  </kbd>
                  Select
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="flex h-4 items-center rounded bg-surface-3 px-1 text-[10px] ring-1 ring-edge-2">
                    ↑↓
                  </kbd>
                  Navigate
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-faint">
                {/Mac|iPod|iPhone|iPad/.test(navigator.userAgent) ? (
                  <>
                    <kbd className="flex h-4 items-center gap-0.5 rounded bg-surface-3 px-1 text-[10px] ring-1 ring-edge-2">
                      <Command className="h-2.5 w-2.5" />K
                    </kbd>
                    <span>to toggle</span>
                  </>
                ) : (
                  <>
                    <kbd className="flex h-4 items-center rounded bg-surface-3 px-1 text-[10px] ring-1 ring-edge-2">Ctrl+K</kbd>
                    <span>to toggle</span>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
