import { Brain, Database, HardDrive, Activity, Sparkles } from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { useLlmQueueStore } from "@/stores/use-llm-queue-store";
import { formatNumber } from "@/lib/formatters";
import { Tooltip } from "@/components/ui/Tooltip";

export function StatusBar() {
  const status = useAppStore((s) => s.status);
  const queueStatus = useLlmQueueStore((s) => s.status);
  const queueCompleted = useLlmQueueStore((s) => s.completedJobs);
  const queueTotal = useLlmQueueStore((s) => s.totalJobs);

  const llmConfig: Record<string, { label: string; dotColor: string; textColor: string; tooltip: string }> = {
    not_configured: { label: "AI off", dotColor: "bg-slate-600", textColor: "text-dim", tooltip: "Go to Settings → Data & AI to enable AI-powered screening" },
    model_downloading: { label: "Downloading model...", dotColor: "bg-amber-400 animate-pulse", textColor: "text-amber-400", tooltip: "Downloading AI model — this may take 10–30 minutes. The app is fully usable." },
    model_ready: { label: "Model ready", dotColor: "bg-blue-400", textColor: "text-blue-400", tooltip: "AI model is downloaded — activate it from Settings" },
    starting: { label: "AI starting...", dotColor: "bg-amber-400 animate-pulse", textColor: "text-amber-400", tooltip: "Loading AI model into memory — this may take a moment" },
    running: {
      label: `AI active${status.llmModel ? ` · ${status.llmModel}` : ""}`,
      dotColor: "bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.5)]",
      textColor: "text-emerald-400",
      tooltip: `AI screening is running${status.llmModel ? ` with ${status.llmModel}` : ""} — all inference happens locally on this device`,
    },
    error: { label: "AI error", dotColor: "bg-red-400", textColor: "text-red-400", tooltip: "AI screening encountered an error — check Settings for details" },
    stopped: { label: "AI stopped", dotColor: "bg-slate-600", textColor: "text-dim", tooltip: "AI screening is stopped — re-enable from Settings" },
  };

  const llm = llmConfig[status.llmStatus] ?? llmConfig["not_configured"]!;

  return (
    <footer className="no-select flex h-8 items-center justify-between border-t border-border bg-background glass px-4 text-[11px]">
      <div className="flex items-center gap-5">
        {/* LLM status */}
        <Tooltip content={llm.tooltip} side="top">
          <div className="flex items-center gap-1.5">
            <Brain className="h-3 w-3 text-dim" aria-hidden="true" />
            <span className={`h-1.5 w-1.5 rounded-full ${llm.dotColor}`} aria-hidden="true" />
            <span className={llm.textColor}>{llm.label}</span>
          </div>
        </Tooltip>

        {/* LLM queue progress */}
        {queueStatus === "processing" && queueTotal > 0 && (
          <>
            <div className="h-3 w-px bg-border" aria-hidden="true" />
            <Tooltip content={`Background AI is pre-generating summaries (${queueCompleted}/${queueTotal} done)`} side="top">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-violet-400 animate-pulse" aria-hidden="true" />
                <span className="text-violet-400 tabular-nums">
                  Enhancing {queueCompleted}/{queueTotal}
                </span>
              </div>
            </Tooltip>
          </>
        )}
        {queueStatus === "done" && queueTotal > 0 && (
          <>
            <div className="h-3 w-px bg-border" aria-hidden="true" />
            <Tooltip content="All patient summaries and criterion explanations have been AI-enhanced" side="top">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-violet-400/60" aria-hidden="true" />
                <span className="text-dim">AI enhanced</span>
              </div>
            </Tooltip>
          </>
        )}

        <div className="h-3 w-px bg-border" aria-hidden="true" />

        {/* Database status */}
        <Tooltip content={status.databaseReady ? "SQLCipher encrypted database is ready" : "Database is initializing..."} side="top">
          <div className="flex items-center gap-1.5">
            <Database className="h-3 w-3 text-dim" aria-hidden="true" />
            <span className={status.databaseReady ? "text-dim" : "text-amber-400"}>
              {status.databaseReady ? "DB ready" : "Initializing..."}
            </span>
          </div>
        </Tooltip>
      </div>

      <div className="flex items-center gap-5">
        {/* Counts */}
        <div className="flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-dim" aria-hidden="true" />
          <span className="text-dim tabular-nums">
            {formatNumber(status.patientCount)} subjects
          </span>
          <span className="text-faint" aria-hidden="true">·</span>
          <span className="text-dim tabular-nums">
            {formatNumber(status.studyCount)} studies
          </span>
        </div>

        <div className="h-3 w-px bg-border" aria-hidden="true" />

        {/* Encryption badge */}
        <Tooltip content="All data encrypted at rest with AES-256 via SQLCipher" side="top">
          <div className="flex items-center gap-1.5">
            <HardDrive className="h-3 w-3 text-emerald-500" aria-hidden="true" />
            <span className="text-emerald-500 font-medium">AES-256</span>
          </div>
        </Tooltip>
      </div>
    </footer>
  );
}
