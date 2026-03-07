import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  HelpCircle,
  Search,
  FileUp,
  FlaskConical,
  ClipboardCheck,
  BarChart3,
  GitBranch,
  TrendingUp,
  Settings,
  Lightbulb,
  Shield,
  Brain,
  Keyboard,
  ArrowRight,
  CheckCircle2,
  Zap,
  Lock,
  Database,
  Eye,
  Users,
  Target,
  ChevronRight,
} from "lucide-react";
import type { NavigationPage } from "@/types";

interface HelpSection {
  title: string;
  content: string;
}

interface HelpTip {
  icon: React.ReactNode;
  text: string;
}

interface PageHelp {
  title: string;
  icon: React.ReactNode;
  description: string;
  sections: HelpSection[];
  tips: HelpTip[];
  shortcuts?: { keys: string; action: string }[];
}

const pageHelp: Record<NavigationPage, PageHelp> = {
  screening: {
    title: "Patient Screening",
    icon: <Search className="h-5 w-5" />,
    description: "Review patient eligibility against study inclusion and exclusion criteria using AI-assisted screening.",
    sections: [
      {
        title: "How It Works",
        content: "The screening engine evaluates each patient against every study criterion. Tier 1 uses rule-based matching (labs, diagnoses, demographics). Tier 2 uses a local LLM for complex criteria requiring clinical judgment. All processing happens on your device.",
      },
      {
        title: "Three-Panel Layout",
        content: "Left panel ranks patients by eligibility score. Center panel shows each criterion's result with evidence. Right panel displays the patient's source data with relevant fields highlighted.",
      },
      {
        title: "Reviewing Patients",
        content: "After reviewing the criteria results and evidence, use Accept, Reject, or Defer to record your clinical judgment. Each decision is logged in the audit trail. You can override any individual criterion result with a documented justification.",
      },
      {
        title: "Confidence Scores",
        content: "Each criterion shows a confidence percentage. Rule-based matches (labs, ICD-10 codes) are typically 90-100%. LLM-assisted evaluations show lower confidence and are flagged for human review. Scores below 70% should always be manually verified.",
      },
      {
        title: "Status Colors",
        content: "Green (Eligible): All inclusion met, no exclusions triggered. Amber (Potentially Eligible): Most criteria met, some unknown. Red (Ineligible): Exclusion triggered or key inclusion not met. Blue (Needs Review): Insufficient data or low-confidence AI results.",
      },
    ],
    tips: [
      { icon: <Keyboard className="h-3.5 w-3.5" />, text: "Press A to accept, R to reject, D to defer the current patient" },
      { icon: <ArrowRight className="h-3.5 w-3.5" />, text: "Arrow keys navigate the patient list without using the mouse" },
      { icon: <Eye className="h-3.5 w-3.5" />, text: "Click any criterion to see the source evidence that was matched" },
      { icon: <Brain className="h-3.5 w-3.5" />, text: "AI-determined results show a brain icon — always verify these" },
    ],
    shortcuts: [
      { keys: "↑ ↓", action: "Navigate patients" },
      { keys: "A", action: "Accept patient" },
      { keys: "R", action: "Reject patient" },
      { keys: "D", action: "Defer patient" },
      { keys: "O", action: "Override criterion" },
    ],
  },
  import: {
    title: "Import Data",
    icon: <FileUp className="h-5 w-5" />,
    description: "Load patient records from CSV exports. The system auto-detects Epic Clarity format and maps columns automatically.",
    sections: [
      {
        title: "Supported Formats",
        content: "Currently supports CSV files from Epic Clarity exports (wide and long format). The system auto-detects the format and maps columns to the internal schema. FHIR, CDA, and HL7v2 support is planned for future releases.",
      },
      {
        title: "Column Mapping",
        content: "After file selection, the mapper shows which source columns map to which patient fields (MRN, DOB, diagnosis, labs, etc.). Auto-mapped columns show a confidence score. You can adjust any mapping before importing.",
      },
      {
        title: "What Happens During Import",
        content: "Records are parsed, deduplicated by patient ID, and encrypted into the local SQLCipher database. Diagnoses, medications, labs, and vitals are extracted and linked. Duplicate patients are updated, not duplicated. An audit trail entry is created for each import.",
      },
      {
        title: "Data Safety",
        content: "All imported data stays on this device. Files are processed entirely locally — nothing is uploaded to any server. The import process creates a checkpointed audit entry so you can track exactly what was imported and when.",
      },
    ],
    tips: [
      { icon: <Shield className="h-3.5 w-3.5" />, text: "PHI never leaves your device — all parsing happens locally" },
      { icon: <Database className="h-3.5 w-3.5" />, text: "Duplicate patients are automatically merged by patient ID" },
      { icon: <Zap className="h-3.5 w-3.5" />, text: "Use the demo data button to explore the app with sample patients" },
    ],
  },
  trials: {
    title: "Trial Discovery",
    icon: <FlaskConical className="h-5 w-5" />,
    description: "Browse curated clinical trials with financial intelligence. See which trials match your patient population and estimate revenue opportunity.",
    sections: [
      {
        title: "Curated Trial List",
        content: "Trials shown here are curated for relevance to your site's therapeutic areas and patient population. This is not a ClinicalTrials.gov browser — it's a focused list of high-value opportunities with financial projections.",
      },
      {
        title: "Financial Intelligence",
        content: "Each trial card shows estimated per-patient value, projected revenue based on your eligible patient count, and enrollment probability. These projections use industry benchmarks for screen failure rates and retention.",
      },
      {
        title: "Screen Patients",
        content: "Click 'Screen Patients' on any trial to run your patient population against that study's criteria. Results appear immediately in the Screening view. You can screen against multiple studies to find the best opportunities.",
      },
    ],
    tips: [
      { icon: <Target className="h-3.5 w-3.5" />, text: "Revenue projections account for screen failure and retention rates" },
      { icon: <Users className="h-3.5 w-3.5" />, text: "Filter by therapeutic area to focus on your site's strengths" },
      { icon: <Search className="h-3.5 w-3.5" />, text: "Search by sponsor name, NCT number, or indication" },
    ],
  },
  review: {
    title: "Review Queue",
    icon: <ClipboardCheck className="h-5 w-5" />,
    description: "Review all screening decisions in one place. Accept, reject, or defer patients, then export results for sponsor submission.",
    sections: [
      {
        title: "Review Workflow",
        content: "All patients screened against the active study appear here. Filter by decision status (Accepted, Rejected, Deferred, Pending) to focus your review. Each decision is recorded with a timestamp in the audit trail.",
      },
      {
        title: "Sorting & Selection",
        content: "Click any column header to sort (Patient ID, Score, Status, Decision). Use checkboxes to select multiple patients for bulk actions — accept, reject, or defer many patients at once with a confirmation step.",
      },
      {
        title: "Export Options",
        content: "Summary CSV: One row per patient with scores and decisions. Detailed CSV: One row per criterion per patient with evidence. Both formats are suitable for sponsor submission and audit documentation.",
      },
    ],
    tips: [
      { icon: <CheckCircle2 className="h-3.5 w-3.5" />, text: "Use bulk select to accept/reject multiple patients at once" },
      { icon: <ArrowRight className="h-3.5 w-3.5" />, text: "Click the arrow button to jump back to a patient in Screening" },
      { icon: <Zap className="h-3.5 w-3.5" />, text: "Quick Export in the footer downloads a summary CSV instantly" },
    ],
  },
  pipeline: {
    title: "Enrollment Pipeline",
    icon: <GitBranch className="h-5 w-5" />,
    description: "Track patients through the enrollment funnel — from identification through consent and enrollment. Kanban-style board for CRC workflow management.",
    sections: [
      {
        title: "Pipeline Stages",
        content: "Patients flow through 6 stages: Identified (screening found them), Contacted (outreach initiated), Interested (patient expressed interest), Consented (informed consent signed), Enrolled (randomized/enrolled), and Screen Failed (dropped out of pipeline).",
      },
      {
        title: "Conversion Funnel",
        content: "The header shows conversion rates between stages. These metrics help identify bottlenecks — for example, if contact-to-interest rate is low, your outreach messaging may need adjustment.",
      },
      {
        title: "Patient Cards",
        content: "Click any card to expand it and see details: assigned CRC, next action items, notes, and eligibility score. Use the action buttons to log calls, add notes, or advance patients to the next stage.",
      },
    ],
    tips: [
      { icon: <Target className="h-3.5 w-3.5" />, text: "Focus on patients with high scores who are stuck in early stages" },
      { icon: <Users className="h-3.5 w-3.5" />, text: "Filter by study to manage pipeline for specific trials" },
    ],
  },
  analytics: {
    title: "Population Intelligence",
    icon: <BarChart3 className="h-5 w-5" />,
    description: "Operational intelligence derived from your patient data — feasibility analysis, lab trajectories, and FDA diversity compliance.",
    sections: [
      {
        title: "Protocol Feasibility",
        content: "Select a preset query (e.g., NSCLC patients with specific lab values) to see how many of your patients would qualify. The criterion-by-criterion breakdown shows exactly where patients fail, helping you estimate realistic enrollment.",
      },
      {
        title: "Lab Trajectories",
        content: "Identifies patients who are approaching eligibility thresholds. For example, a patient whose A1C is trending toward the inclusion range may become eligible soon — these are your 'watchlist' patients for proactive outreach.",
      },
      {
        title: "Diversity Profile",
        content: "Shows your patient population's demographic breakdown (race, ethnicity, gender, age, insurance) with a Simpson Diversity Score. The FDA Diversity Action Plan requires sponsors to demonstrate enrollment efforts across demographics — this dashboard helps you plan.",
      },
    ],
    tips: [
      { icon: <Lightbulb className="h-3.5 w-3.5" />, text: "Use feasibility data in sponsor calls to demonstrate your site's capability" },
      { icon: <TrendingUp className="h-3.5 w-3.5" />, text: "Watchlist patients are worth proactive outreach — they're almost eligible" },
      { icon: <Shield className="h-3.5 w-3.5" />, text: "A diversity score above 60 is strong for FDA diversity compliance" },
    ],
  },
  performance: {
    title: "Site Performance",
    icon: <TrendingUp className="h-5 w-5" />,
    description: "Screen failure intelligence, multi-study matching, and revenue projections across all active trials at your site.",
    sections: [
      {
        title: "KPI Overview",
        content: "See active study count, total patients screened, eligible count, average pass rate, and projected revenue at a glance. These metrics update in real-time as you import data and make review decisions.",
      },
      {
        title: "Screen Failure Intelligence",
        content: "For each study, see which criteria cause the most screen failures. This data is invaluable for protocol feedback to sponsors and for training your team to pre-screen more effectively before formal screening.",
      },
      {
        title: "Multi-Study Matching",
        content: "Shows patients who are eligible for multiple studies simultaneously. This helps you maximize enrollment and revenue by identifying patients who could be offered backup study options if their first-choice trial isn't suitable.",
      },
    ],
    tips: [
      { icon: <Zap className="h-3.5 w-3.5" />, text: "Multi-study matches can increase per-patient revenue by 40%+" },
      { icon: <Target className="h-3.5 w-3.5" />, text: "Share screen failure data with sponsors to improve protocol design" },
    ],
  },
  settings: {
    title: "Settings",
    icon: <Settings className="h-5 w-5" />,
    description: "Configure folder watching, local LLM, audit trail, database, and preferences.",
    sections: [
      {
        title: "Folder Watcher",
        content: "Set a folder to watch for new CSV files. When a new file appears, you'll be notified and can import it with one click. Useful for automated Epic export workflows.",
      },
      {
        title: "Local LLM",
        content: "TalOS SiteConnect can run a local language model (BioMistral-7B via llama.cpp) for Tier 2 screening — criteria that require clinical judgment beyond rule-based matching. The model runs entirely on your device.",
      },
      {
        title: "Audit Trail",
        content: "Every action in the system is logged in a tamper-evident audit trail using HMAC-SHA256 chain integrity. You can verify the chain at any time and export a 21 CFR Part 11 compliant CSV for regulatory documentation.",
      },
      {
        title: "Database",
        content: "Shows the current state of your encrypted SQLCipher database — patient count, study count, diagnosis records, lab results, and import history. All data is encrypted at rest with AES-256.",
      },
    ],
    tips: [
      { icon: <Lock className="h-3.5 w-3.5" />, text: "Your database passphrase is never stored — only you can unlock it" },
      { icon: <Shield className="h-3.5 w-3.5" />, text: "Export audit trail CSV before any regulatory audit" },
      { icon: <Brain className="h-3.5 w-3.5" />, text: "LLM requires ~4GB RAM — close other apps if performance is slow" },
    ],
  },
};

// Persistent help state
let helpDrawerOpen = false;
const listeners = new Set<() => void>();
function setHelpOpen(open: boolean) {
  helpDrawerOpen = open;
  listeners.forEach((l) => l());
}

export function useHelpDrawer() {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return { isOpen: helpDrawerOpen, open: () => setHelpOpen(true), close: () => setHelpOpen(false), toggle: () => setHelpOpen(!helpDrawerOpen) };
}

export function HelpDrawer({ currentPage }: { currentPage: NavigationPage }) {
  const { isOpen, close, toggle } = useHelpDrawer();
  const help = pageHelp[currentPage];
  const [expandedSection, setExpandedSection] = useState<number | null>(0);

  // Reset expanded section when page changes
  useEffect(() => {
    setExpandedSection(0);
  }, [currentPage]);

  // F1 to toggle, Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); toggle(); }
      if (e.key === "Escape" && isOpen) close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close, toggle]);

  // Listen for toggle-help custom event (from CommandPalette)
  useEffect(() => {
    const handler = () => toggle();
    window.addEventListener("toggle-help", handler);
    return () => window.removeEventListener("toggle-help", handler);
  }, [toggle]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9980] bg-black/40"
            onClick={close}
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-[9981] flex h-full w-[400px] flex-col border-l border-white/[0.06] bg-[#0e1119]/98 backdrop-blur-2xl shadow-2xl"
          >
            {/* Header */}
            <div className="shrink-0 border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center rounded-xl bg-indigo-500/15 p-2.5 ring-1 ring-indigo-500/25">
                    <HelpCircle className="h-5 w-5 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-[14px] font-bold text-white">Help & Guide</h2>
                    <p className="text-[10px] text-slate-500">Everything runs offline on your device</p>
                  </div>
                </div>
                <button
                  onClick={close}
                  className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Page context */}
            <div className="shrink-0 border-b border-white/[0.06] px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="text-indigo-400">{help.icon}</span>
                <div>
                  <h3 className="text-[13px] font-semibold text-white">{help.title}</h3>
                  <p className="text-[11px] text-slate-400 leading-snug">{help.description}</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Sections (accordion) */}
              <div className="p-4 space-y-1">
                <p className="px-1 mb-2 text-[9px] font-semibold uppercase tracking-widest text-slate-600">How to use</p>
                {help.sections.map((section, i) => {
                  const isExpanded = expandedSection === i;
                  return (
                    <div key={i} className="rounded-xl ring-1 ring-white/[0.04] overflow-hidden">
                      <button
                        onClick={() => setExpandedSection(isExpanded ? null : i)}
                        className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
                          isExpanded ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
                        }`}
                      >
                        <span className={`text-[12px] font-medium ${isExpanded ? "text-indigo-300" : "text-slate-300"}`}>
                          {section.title}
                        </span>
                        <ChevronRight className={`h-3.5 w-3.5 text-slate-500 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </button>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <p className="px-4 pb-3 text-[11px] leading-relaxed text-slate-400">
                              {section.content}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {/* Pro Tips */}
              <div className="px-4 pb-4">
                <p className="px-1 mb-2 text-[9px] font-semibold uppercase tracking-widest text-slate-600">Pro Tips</p>
                <div className="space-y-1.5">
                  {help.tips.map((tip, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 rounded-xl bg-amber-500/[0.04] px-3.5 py-2.5 ring-1 ring-amber-500/10"
                    >
                      <span className="mt-0.5 shrink-0 text-amber-400">{tip.icon}</span>
                      <p className="text-[11px] leading-snug text-amber-200/80">{tip.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Keyboard shortcuts for this page */}
              {help.shortcuts && (
                <div className="px-4 pb-4">
                  <p className="px-1 mb-2 text-[9px] font-semibold uppercase tracking-widest text-slate-600">Keyboard Shortcuts</p>
                  <div className="rounded-xl ring-1 ring-white/[0.04] overflow-hidden">
                    {help.shortcuts.map((s, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between px-4 py-2 ${i > 0 ? "border-t border-white/[0.04]" : ""}`}
                      >
                        <span className="text-[11px] text-slate-400">{s.action}</span>
                        <kbd className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-white/[0.08]">
                          {s.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Security reminder */}
              <div className="px-4 pb-6">
                <div className="rounded-xl bg-emerald-500/[0.04] p-4 ring-1 ring-emerald-500/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-emerald-400" />
                    <span className="text-[11px] font-semibold text-emerald-300">Privacy & Security</span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-emerald-400/70">
                    All data is encrypted with AES-256 and stored locally on this device.
                    No patient data, screening results, or audit trail entries are ever transmitted
                    to any external server. This application is designed for 21 CFR Part 11 compliance.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-white/[0.06] px-5 py-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-600">
                  TalOS SiteConnect v1.0
                </p>
                <button
                  onClick={() => {
                    close();
                    window.dispatchEvent(new CustomEvent("toggle-shortcuts"));
                  }}
                  className="flex items-center gap-1.5 text-[10px] font-medium text-indigo-400 hover:text-indigo-300"
                >
                  <Keyboard className="h-3 w-3" />
                  All Shortcuts
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
