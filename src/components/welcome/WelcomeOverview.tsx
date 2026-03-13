import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileUp,
  Search,
  ClipboardCheck,
  GitBranch,
  Shield,
  ArrowRight,
  X,
  ChevronRight,
  DollarSign,
  Cpu,
  Lock,
} from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { useSiteProfileStore } from "@/stores/use-site-profile-store";
import type { NavigationPage } from "@/types";

const STORAGE_KEY = "siteconnect-welcome-dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // storage unavailable
  }
}

// ─── Data ────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  {
    page: "import" as NavigationPage,
    icon: FileUp,
    label: "Import",
    desc: "Upload EMR data",
    color: "from-blue-500 to-cyan-500",
  },
  {
    page: "screening" as NavigationPage,
    icon: Search,
    label: "Screen",
    desc: "AI eligibility check",
    color: "from-indigo-500 to-violet-500",
  },
  {
    page: "review" as NavigationPage,
    icon: ClipboardCheck,
    label: "Review",
    desc: "Accept or reject",
    color: "from-purple-500 to-pink-500",
  },
  {
    page: "pipeline" as NavigationPage,
    icon: GitBranch,
    label: "Track",
    desc: "Enrollment pipeline",
    color: "from-emerald-500 to-teal-500",
  },
];

const VALUE_PROPS = [
  { icon: DollarSign, label: "Financial intelligence on every trial", color: "text-emerald-400" },
  { icon: Cpu, label: "AI screening runs 100% on your device", color: "text-violet-400" },
  { icon: Lock, label: "AES-256 encrypted — zero data risk", color: "text-amber-400" },
];

// ─── Component ───────────────────────────────────────────────

export function WelcomeOverview() {
  const [visible, setVisible] = useState(!wasDismissed());
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const siteName = useSiteProfileStore((s) => s.profile.research.siteName);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    markDismissed();
  }, []);

  const handleGetStarted = useCallback(() => {
    setVisible(false);
    markDismissed();
    setCurrentPage("import");
  }, [setCurrentPage]);

  const handleNavigate = useCallback(
    (page: NavigationPage) => {
      setVisible(false);
      markDismissed();
      setCurrentPage(page);
    },
    [setCurrentPage],
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[9990] flex items-center justify-center"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-[#080a12]/85 backdrop-blur-xl" />

          {/* Ambient glow */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-32 -top-32 h-[400px] w-[400px] rounded-full bg-indigo-600/8 blur-[100px]" />
            <div className="absolute -bottom-20 -right-20 h-[300px] w-[300px] rounded-full bg-blue-600/6 blur-[80px]" />
          </div>

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-[640px] mx-4 rounded-2xl bg-[#0f1219]/95 ring-1 ring-white/[0.08] shadow-2xl shadow-black/40 glass"
          >
            {/* Close */}
            <button
              onClick={handleDismiss}
              className="absolute right-4 top-4 z-20 rounded-lg p-1.5 text-white/20 transition-colors hover:bg-white/5 hover:text-white/50"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Top section */}
            <div className="px-8 pt-8 pb-6 text-center">
              {/* Logo */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto mb-5 relative inline-flex"
              >
                <div className="absolute inset-0 rounded-2xl bg-indigo-500/25 blur-xl animate-pulse" />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 shadow-lg shadow-indigo-500/25">
                  <img src="/t6logo.png" alt="Talosix" className="h-8 w-8 object-contain" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
              >
                <h1 className="text-[22px] font-extrabold tracking-tight text-white">
                  {siteName ? <>Welcome, {siteName}</> : <>Welcome to SiteConnect</>}
                </h1>
                <p className="mt-2 text-[13px] text-white/40 leading-relaxed max-w-[400px] mx-auto">
                  Screen patients, discover trials, and track enrollment — all on-device, all encrypted.
                </p>
              </motion.div>

              {/* Value props — inline row */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="mt-5 flex items-center justify-center gap-4"
              >
                {VALUE_PROPS.map((vp, i) => (
                  <motion.div
                    key={vp.label}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.35 + i * 0.07 }}
                    className="flex items-center gap-1.5"
                  >
                    <vp.icon className={`h-3 w-3 ${vp.color} opacity-60`} />
                    <span className="text-[10px] text-white/30">{vp.label}</span>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            {/* Divider */}
            <div className="mx-8 h-px bg-white/[0.06]" />

            {/* Workflow steps */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35 }}
              className="px-8 py-5"
            >
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 text-center">
                Get started in 4 steps
              </p>

              <div className="grid grid-cols-4 gap-2">
                {WORKFLOW_STEPS.map((step, i) => (
                  <motion.button
                    key={step.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.4 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    onClick={() => handleNavigate(step.page)}
                    className="group relative rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.05] text-left transition-all duration-200 hover:bg-white/[0.06] hover:ring-white/[0.1]"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${step.color} shadow-sm`}>
                        <step.icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      <span className="text-[9px] font-semibold text-white/20">{i + 1}</span>
                    </div>
                    <p className="text-[12px] font-semibold text-white/80 group-hover:text-white">{step.label}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{step.desc}</p>
                    <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/0 transition-all group-hover:text-white/20" />
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* Footer CTA */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.45 }}
              className="px-8 pb-6 flex flex-col items-center gap-3"
            >
              <button
                onClick={handleGetStarted}
                className="group relative flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-7 py-2.5 text-[13px] font-bold text-white shadow-lg shadow-indigo-500/20 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <span>Import Your First Dataset</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                <div className="absolute inset-0 overflow-hidden rounded-xl">
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>
              </button>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleDismiss}
                  className="text-[11px] text-white/20 transition-colors hover:text-white/40"
                >
                  Skip for now
                </button>
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3 w-3 text-emerald-400/30" />
                  <span className="text-[9px] text-emerald-400/30">100% on-device</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
