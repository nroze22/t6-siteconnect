import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Command } from "lucide-react";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const MOD = isMac ? "Cmd" : "Ctrl";

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: [MOD, "K"], description: "Open command palette" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
      { keys: [MOD, "L"], description: "Lock application" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["1"], description: "Go to Screening" },
      { keys: ["2"], description: "Go to Import Data" },
      { keys: ["3"], description: "Go to Review Queue" },
      { keys: ["4"], description: "Go to Trial Discovery" },
      { keys: ["5"], description: "Go to Site Intelligence" },
      { keys: ["6"], description: "Go to Enrollment" },
      { keys: ["7"], description: "Go to Analytics" },
      { keys: ["8"], description: "Go to Performance" },
      { keys: ["9"], description: "Go to Patient Registry" },
      { keys: ["0"], description: "Go to Settings" },
    ],
  },
  {
    title: "Subject Screening",
    shortcuts: [
      { keys: ["↑", "↓"], description: "Navigate subject list" },
      { keys: ["A"], description: "Accept current subject" },
      { keys: ["R"], description: "Reject current subject" },
      { keys: ["D"], description: "Defer current subject" },
      { keys: ["O"], description: "Override selected criterion" },
      { keys: ["N"], description: "Next unreviewed patient" },
    ],
  },
  {
    title: "Review Queue",
    shortcuts: [
      { keys: ["E"], description: "Export results" },
      { keys: ["F"], description: "Focus search / filter" },
    ],
  },
];

export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Only trigger on ? without modifiers, not in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };

    const handleCustom = () => setOpen((prev) => !prev);

    window.addEventListener("keydown", handleKey);
    window.addEventListener("toggle-shortcuts", handleCustom);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("toggle-shortcuts", handleCustom);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[9992] bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            className="fixed left-1/2 top-1/2 z-[9993] w-[640px] max-h-[80vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-card/98 ring-1 ring-white/10 shadow-2xl shadow-black/40 backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-edge-2 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center rounded-lg bg-indigo-500/15 p-2">
                  <Command className="h-4 w-4 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-heading">Keyboard Shortcuts</h2>
                  <p className="text-[12px] text-dim">Navigate faster with keyboard commands</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-dim transition-colors hover:bg-white/5 hover:text-body"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-6">
                {shortcutGroups.map((group) => (
                  <div key={group.title}>
                    <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-widest text-dim">
                      {group.title}
                    </h3>
                    <div className="space-y-1">
                      {group.shortcuts.map((shortcut, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors hover:bg-surface-2"
                        >
                          <span className="text-[12px] text-dim">{shortcut.description}</span>
                          <div className="flex items-center gap-1">
                            {shortcut.keys.map((key, j) => (
                              <span key={j}>
                                {j > 0 && <span className="mx-0.5 text-[9px] text-dim">+</span>}
                                <kbd className="inline-flex min-w-[22px] items-center justify-center rounded-md bg-surface-3 px-1.5 py-0.5 text-[12px] font-medium text-dim ring-1 ring-edge-3">
                                  {key}
                                </kbd>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-edge-2 px-5 py-2.5 text-center">
              <p className="text-[12px] text-dim">
                Press <kbd className="rounded bg-surface-3 px-1 py-0.5 text-[9px] text-dim ring-1 ring-edge-3">?</kbd> to toggle this overlay
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
