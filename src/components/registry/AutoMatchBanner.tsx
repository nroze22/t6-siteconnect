import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, ChevronRight, Loader2 } from "lucide-react";
import { isTauri } from "@/lib/tauri";
import { useRegistryStore } from "@/stores/use-registry-store";

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

interface AutoMatchBannerProps {
  onViewMatch?: (patientId: string, studyId: string) => void;
}

export function AutoMatchBanner({ onViewMatch }: AutoMatchBannerProps) {
  const notifications = useRegistryStore((s) => s.notifications);
  const setNotifications = useRegistryStore((s) => s.setNotifications);
  const dismissNotification = useRegistryStore((s) => s.dismissNotification);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!isTauri) return;
    setLoading(true);
    try {
      const result = await tauriInvoke<Array<{
        id: string; patient_id: string; study_id: string;
        score: number; status: string; notified_at: string;
        dismissed: number; actioned: number;
      }>>("get_auto_match_notifications", { studyId: null });

      setNotifications(result.map((n) => ({
        id: n.id,
        patientId: n.patient_id,
        studyId: n.study_id,
        score: n.score,
        status: n.status as "eligible" | "potentially_eligible" | "ineligible" | "needs_review",
        notifiedAt: n.notified_at,
        dismissed: n.dismissed !== 0,
        actioned: n.actioned !== 0,
      })));
    } catch (err) {
      console.error("[auto-match] Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [setNotifications]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleDismiss = async (notificationId: string) => {
    dismissNotification(notificationId);
    if (isTauri) {
      try {
        await tauriInvoke("dismiss_auto_match", { notificationId });
      } catch (err) {
        console.error("[auto-match] Failed to dismiss:", err);
      }
    }
  };

  if (notifications.length === 0) return null;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      className="border-b border-emerald-500/20 bg-emerald-500/[0.04]"
    >
      <div className="px-4 py-2.5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[11px] font-semibold text-emerald-300">
            {notifications.length} Auto-Match{notifications.length !== 1 ? "es" : ""} Found
          </span>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-emerald-500/50" />}
        </div>

        <div className="flex flex-col gap-1">
          <AnimatePresence>
            {notifications.slice(0, 5).map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10, height: 0 }}
                className="flex items-center gap-2 rounded-lg bg-emerald-500/[0.06] px-3 py-1.5"
              >
                <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                  n.status === "eligible" ? "bg-emerald-400" : "bg-amber-400"
                }`} />
                <span className="text-[11px] text-zinc-300 flex-1 truncate">
                  Patient <span className="font-mono">{n.patientId.substring(0, 8)}</span>
                  {" → "}
                  <span className="font-mono">{n.studyId.substring(0, 8)}</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400">{Math.round(n.score)}%</span>
                <button
                  onClick={() => onViewMatch?.(n.patientId, n.studyId)}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
                >
                  View <ChevronRight className="h-2.5 w-2.5" />
                </button>
                <button
                  onClick={() => handleDismiss(n.id)}
                  className="text-zinc-600 hover:text-zinc-400"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {notifications.length > 5 && (
            <span className="text-[10px] text-emerald-500/50 pl-3">
              +{notifications.length - 5} more matches
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
