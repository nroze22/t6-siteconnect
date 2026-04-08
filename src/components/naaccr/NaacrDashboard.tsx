import { useEffect, useCallback } from "react";
import { FileHeart, CheckCircle2, AlertTriangle, Scan } from "lucide-react";
import { useNaacrStore } from "@/stores/use-naaccr-store";
import { isTauri } from "@/lib/tauri";

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-500",
  in_progress: "bg-blue-500",
  complete: "bg-emerald-500",
  submitted: "bg-purple-500",
  accepted: "bg-emerald-600",
};

export function NaacrDashboard() {
  const { dashboard, setDashboard } = useNaacrStore();

  const loadDashboard = useCallback(async () => {
    if (!isTauri) return;
    try {
      const result = await tauriInvoke<{
        total_cases: number; by_status: Array<{ status: string; count: number }>;
        avg_completeness: number; cases_nearing_deadline: number; recent_detections: number;
      }>("get_naaccr_dashboard", {});

      setDashboard({
        totalCases: result.total_cases,
        byStatus: {
          draft: result.by_status.find((s) => s.status === "draft")?.count ?? 0,
          in_progress: result.by_status.find((s) => s.status === "in_progress")?.count ?? 0,
          complete: result.by_status.find((s) => s.status === "complete")?.count ?? 0,
          submitted: result.by_status.find((s) => s.status === "submitted")?.count ?? 0,
          accepted: result.by_status.find((s) => s.status === "accepted")?.count ?? 0,
        },
        avgCompleteness: result.avg_completeness,
        casesNearingDeadline: result.cases_nearing_deadline,
        recentDetections: result.recent_detections,
      });
    } catch (err) {
      console.error("[naaccr] Dashboard load failed:", err);
    }
  }, [setDashboard]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (!dashboard) {
    return <div className="flex items-center justify-center h-full text-zinc-500 text-sm">Loading dashboard...</div>;
  }

  const totalByStatus = Object.values(dashboard.byStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 overflow-auto h-full">
      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileHeart className="h-4 w-4 text-orange-400" />
            <span className="text-[11px] text-zinc-400">Total Cases</span>
          </div>
          <p className="text-2xl font-bold text-zinc-100 font-mono">{dashboard.totalCases}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-[11px] text-zinc-400">Avg Completeness</span>
          </div>
          <p className="text-2xl font-bold text-zinc-100 font-mono">{Math.round(dashboard.avgCompleteness * 100)}%</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Scan className="h-4 w-4 text-blue-400" />
            <span className="text-[11px] text-zinc-400">Recent (7d)</span>
          </div>
          <p className="text-2xl font-bold text-zinc-100 font-mono">{dashboard.recentDetections}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-[11px] text-zinc-400">Near Deadline</span>
          </div>
          <p className="text-2xl font-bold text-zinc-100 font-mono">{dashboard.casesNearingDeadline}</p>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-xs font-semibold text-zinc-300 mb-3">Cases by Status</h3>
        <div className="flex flex-col gap-2">
          {Object.entries(dashboard.byStatus).map(([status, count]) => {
            const pct = totalByStatus > 0 ? (count / totalByStatus) * 100 : 0;
            return (
              <div key={status} className="flex items-center gap-3">
                <span className="text-[11px] text-zinc-400 w-24 capitalize">{status.replace("_", " ")}</span>
                <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${STATUS_COLORS[status] ?? "bg-zinc-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono text-zinc-300 w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
