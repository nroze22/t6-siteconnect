import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

const variants = {
  danger: {
    icon: <AlertTriangle className="h-5 w-5 text-red-400" />,
    iconBg: "bg-red-500/15 ring-red-500/25",
    button: "bg-red-600 hover:bg-red-500 focus-visible:ring-red-500/40",
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5 text-amber-400" />,
    iconBg: "bg-amber-500/15 ring-amber-500/25",
    button: "bg-amber-600 hover:bg-amber-500 focus-visible:ring-amber-500/40",
  },
  info: {
    icon: <AlertTriangle className="h-5 w-5 text-blue-400" />,
    iconBg: "bg-blue-500/15 ring-blue-500/25",
    button: "bg-blue-600 hover:bg-blue-500 focus-visible:ring-blue-500/40",
  },
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const v = variants[variant];

  // Focus confirm button on open, handle Escape
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => confirmRef.current?.focus());

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[9994] bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="fixed left-1/2 top-1/2 z-[9995] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card/98 p-6 ring-1 ring-white/10 shadow-2xl shadow-black/40 backdrop-blur-2xl"
          >
            <div className="flex items-start gap-4">
              <div className={`shrink-0 flex items-center justify-center rounded-xl p-2.5 ring-1 ${v.iconBg}`}>
                {v.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-semibold text-heading">{title}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-dim">{description}</p>
              </div>
              <button
                onClick={onCancel}
                className="shrink-0 rounded-lg p-1 text-dim transition-colors hover:bg-white/5 hover:text-body"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                onClick={onCancel}
                className="rounded-lg border border-edge-3 bg-surface-2 px-4 py-2 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body"
              >
                {cancelLabel}
              </button>
              <button
                ref={confirmRef}
                onClick={onConfirm}
                className={`rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition-all shadow-sm ${v.button}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
