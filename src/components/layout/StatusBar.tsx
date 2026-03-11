import { Brain, Database, HardDrive, Activity } from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { formatNumber } from "@/lib/formatters";
import { Tooltip } from "@/components/ui/Tooltip";

export function StatusBar() {
  const status = useAppStore((s) => s.status);

  const llmConfig: Record<string, { label: string; dotColor: string; textColor: string; tooltip: string }> = {
    not_configured: { label: "AI screening off", dotColor: "bg-slate-600", textColor: "text-dim", tooltip: "Go to Settings → Data & AI to enable AI-powered screening" },
    model_downloading: { label: "Downloading AI model...", dotColor: "bg-amber-400 animate-pulse", textColor: "text-amber-400/70", tooltip: "Downloading the AI model — this may take a few minutes" },
    model_ready: { label: "AI model ready", dotColor: "bg-blue-400", textColor: "text-blue-400/70", tooltip: "AI model is downloaded — activate it from Settings" },
    starting: { label: "AI starting...", dotColor: "bg-amber-400 animate-pulse", textColor: "text-amber-400/70", tooltip: "Loading AI model into memory — this may take a moment" },
    running: {
      label: `AI active${status.llmModel ? ` · ${status.llmModel}` : ""}`,
      dotColor: "bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.5)]",
      textColor: "text-emerald-400/70",
      tooltip: `AI screening is running${status.llmModel ? ` with ${status.llmModel}` : ""} — all inference happens locally on this device`,
    },
    error: { label: "AI error", dotColor: "bg-red-400", textColor: "text-red-400/70", tooltip: "AI screening encountered an error — check Settings for details" },
    stopped: { label: "AI stopped", dotColor: "bg-slate-600", textColor: "text-dim", tooltip: "AI screening is stopped — re-enable from Settings" },
  };

  const llm = llmConfig[status.llmStatus] ?? llmConfig["not_configured"]!;

  return (
    <footer className="no-select flex h-7 items-center justify-between border-t border-border bg-background px-4 text-[12px]">
      <div className="flex items-center gap-4">
        <Tooltip content={llm.tooltip} side="top">
          <div className="flex items-center gap-1.5">
            <Brain className="h-3 w-3 text-dim" />
            <span className={`h-1.5 w-1.5 rounded-full ${llm.dotColor}`} />
            <span className={llm.textColor}>{llm.label}</span>
          </div>
        </Tooltip>

        <div className="h-3 w-px bg-border" />

        <Tooltip content={status.databaseReady ? "SQLCipher encrypted database is ready" : "Database is initializing..."} side="top">
          <div className="flex items-center gap-1.5">
            <Database className="h-3 w-3 text-dim" />
            <span className={status.databaseReady ? "text-dim" : "text-amber-400/70"}>
              {status.databaseReady ? "DB connected" : "Initializing..."}
            </span>
          </div>
        </Tooltip>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-dim" />
          <span className="text-dim tabular-nums">
            {formatNumber(status.patientCount)} subjects
          </span>
          <span className="text-faint">|</span>
          <span className="text-dim tabular-nums">
            {formatNumber(status.studyCount)} studies
          </span>
        </div>

        <div className="h-3 w-px bg-border" />

        <Tooltip content="All data encrypted at rest with AES-256 via SQLCipher" side="top">
          <div className="flex items-center gap-1">
            <HardDrive className="h-3 w-3 text-emerald-500/60" />
            <span className="text-emerald-500/60">AES-256</span>
          </div>
        </Tooltip>
      </div>
    </footer>
  );
}
