import { Brain, Settings } from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";

/**
 * Thin banner shown at the top of pages that depend on the local LLM
 * (Screening, Analytics, Intelligence) when the model is not running.
 * Gives the user a clear explanation + one-click path to fix it.
 */
export function LlmStatusBanner() {
  const llmStatus = useAppStore((s) => s.status.llmStatus);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  // Only show when the LLM is definitively not available.
  if (llmStatus === "running") return null;

  const message =
    llmStatus === "not_configured"
      ? "No AI model configured — screening will use rule-based evaluation only."
      : llmStatus === "starting" || llmStatus === "model_downloading"
        ? "AI model is loading — complex criteria will be evaluated once it's ready."
        : llmStatus === "error" || llmStatus === "stopped"
          ? "AI model is offline — complex criteria will show as \"needs review\" until restarted."
          : null;

  if (!message) return null;

  return (
    <div className="flex items-center gap-2.5 border-b border-amber-400/20 bg-amber-500/[0.06] px-5 py-2">
      <Brain className="h-3.5 w-3.5 flex-none text-amber-400" />
      <span className="flex-1 text-[11px] text-amber-300">{message}</span>
      <button
        onClick={() => setCurrentPage("settings")}
        className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-400/25 transition-colors hover:bg-amber-500/25"
      >
        <Settings className="h-3 w-3" />
        Set up AI
      </button>
    </div>
  );
}
