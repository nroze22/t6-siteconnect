import { Brain, Database, HardDrive, Activity } from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { formatNumber } from "@/lib/formatters";
import { Tooltip } from "@/components/ui/Tooltip";

export function StatusBar() {
  const status = useAppStore((s) => s.status);

  const llmConfig: Record<string, { label: string; dotColor: string; textColor: string; tooltip: string }> = {
    not_configured: { label: "LLM not configured", dotColor: "bg-slate-600", textColor: "text-slate-500", tooltip: "Go to Settings to configure a local LLM for Tier 2 screening" },
    starting: { label: "LLM starting...", dotColor: "bg-amber-400 animate-pulse", textColor: "text-amber-400/70", tooltip: "Loading model into memory — this may take a moment" },
    ready: { label: `LLM ready  ${status.llmModel ?? ""}`, dotColor: "bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.5)]", textColor: "text-emerald-400/70", tooltip: "Local LLM is running and ready for Tier 2 criterion evaluation" },
    error: { label: "LLM error", dotColor: "bg-red-400", textColor: "text-red-400/70", tooltip: "LLM failed to start — check Settings for details" },
    disabled: { label: "Rule-based only", dotColor: "bg-slate-500", textColor: "text-slate-500", tooltip: "Screening uses rule-based engine only (no LLM assistance)" },
  };

  const llm = llmConfig[status.llmStatus] ?? llmConfig["not_configured"]!;

  return (
    <footer className="no-select flex h-7 items-center justify-between border-t border-border bg-[#0a0d14] px-4 text-[10px]">
      <div className="flex items-center gap-4">
        <Tooltip content={llm.tooltip} side="top">
          <div className="flex items-center gap-1.5">
            <Brain className="h-3 w-3 text-slate-600" />
            <span className={`h-1.5 w-1.5 rounded-full ${llm.dotColor}`} />
            <span className={llm.textColor}>{llm.label}</span>
          </div>
        </Tooltip>

        <div className="h-3 w-px bg-border" />

        <Tooltip content={status.databaseReady ? "SQLCipher encrypted database is ready" : "Database is initializing..."} side="top">
          <div className="flex items-center gap-1.5">
            <Database className="h-3 w-3 text-slate-600" />
            <span className={status.databaseReady ? "text-slate-500" : "text-amber-400/70"}>
              {status.databaseReady ? "DB connected" : "Initializing..."}
            </span>
          </div>
        </Tooltip>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-slate-600" />
          <span className="text-slate-500 tabular-nums">
            {formatNumber(status.patientCount)} subjects
          </span>
          <span className="text-slate-700">|</span>
          <span className="text-slate-500 tabular-nums">
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
