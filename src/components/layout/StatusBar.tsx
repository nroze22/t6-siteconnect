import { Brain, Database, HardDrive, Activity } from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { formatNumber } from "@/lib/formatters";

export function StatusBar() {
  const status = useAppStore((s) => s.status);

  const llmConfig: Record<string, { label: string; dotColor: string; textColor: string }> = {
    not_configured: { label: "LLM not configured", dotColor: "bg-slate-600", textColor: "text-slate-500" },
    starting: { label: "LLM starting...", dotColor: "bg-amber-400 animate-pulse", textColor: "text-amber-400/70" },
    ready: { label: `LLM ready  ${status.llmModel ?? ""}`, dotColor: "bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.5)]", textColor: "text-emerald-400/70" },
    error: { label: "LLM error", dotColor: "bg-red-400", textColor: "text-red-400/70" },
    disabled: { label: "Rule-based only", dotColor: "bg-slate-500", textColor: "text-slate-500" },
  };

  const llm = llmConfig[status.llmStatus] ?? llmConfig["not_configured"]!;

  return (
    <footer className="no-select flex h-7 items-center justify-between border-t border-border bg-[#0a0d14] px-4 text-[10px]">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3 w-3 text-slate-600" />
          <span className={`h-1.5 w-1.5 rounded-full ${llm.dotColor}`} />
          <span className={llm.textColor}>{llm.label}</span>
        </div>

        <div className="h-3 w-px bg-border" />

        <div className="flex items-center gap-1.5">
          <Database className="h-3 w-3 text-slate-600" />
          <span className={status.databaseReady ? "text-slate-500" : "text-amber-400/70"}>
            {status.databaseReady ? "DB connected" : "Initializing..."}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-slate-600" />
          <span className="text-slate-500 tabular-nums">
            {formatNumber(status.patientCount)} patients
          </span>
          <span className="text-slate-700">|</span>
          <span className="text-slate-500 tabular-nums">
            {formatNumber(status.studyCount)} studies
          </span>
        </div>

        <div className="h-3 w-px bg-border" />

        <div className="flex items-center gap-1">
          <HardDrive className="h-3 w-3 text-emerald-500/60" />
          <span className="text-emerald-500/60">AES-256</span>
        </div>
      </div>
    </footer>
  );
}
