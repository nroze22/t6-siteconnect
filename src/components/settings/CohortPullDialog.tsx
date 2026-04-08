import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Loader2,
  Pill,
  Stethoscope,
  TestTube2,
  Users,
  X,
} from "lucide-react";
import {
  pullEpicCohort,
  type CohortPullProgress,
  type CohortPullScope,
  type CohortPullSummary,
  type EpicConnection,
} from "@/lib/tauri";

interface CohortPullDialogProps {
  connection: EpicConnection;
  onClose: () => void;
  onComplete: (summary: CohortPullSummary) => void;
}

const PROGRESS_EVENT = "epic://cohort-pull/progress";

const PHASE_LABELS: Record<string, string> = {
  idle: "Ready",
  kickoff: "Asking Epic to start the export",
  polling: "Waiting for Epic to prepare files",
  importing: "Importing into local database",
  done: "Done",
  error: "Failed",
};

/**
 * Cohort pull dialog. Lets the user pick an export scope, kicks off
 * Bulk Data `$export`, and shows live progress events streamed from
 * the Rust backend over `epic://cohort-pull/progress`.
 *
 * Nothing leaves the device — both the FHIR pull and the import are
 * local to this Tauri process.
 */
export function CohortPullDialog({ connection, onClose, onComplete }: CohortPullDialogProps) {
  const [scope, setScope] = useState<CohortPullScope>("patient");
  const [groupId, setGroupId] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<CohortPullProgress | null>(null);
  const [summary, setSummary] = useState<CohortPullSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Subscribe to progress events while the dialog is mounted.
  useEffect(() => {
    let active = true;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<CohortPullProgress>(PROGRESS_EVENT, (event) => {
        if (!active) return;
        // Filter to events for this connection only.
        if (event.payload.connection_id === connection.id) {
          setProgress(event.payload);
        }
      });
      unlistenRef.current = unlisten;
    })();
    return () => {
      active = false;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, [connection.id]);

  const start = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSummary(null);
    setProgress({
      connection_id: connection.id,
      phase: "kickoff",
      message: "Starting…",
      elapsed_seconds: 0,
      stats: null,
    });
    try {
      const result = await pullEpicCohort({
        connection_id: connection.id,
        scope,
        group_id: scope === "group" ? groupId.trim() : null,
      });
      setSummary(result);
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [connection.id, scope, groupId, onComplete]);

  const isDone = !!summary;
  const phaseLabel: string = isDone
    ? PHASE_LABELS.done!
    : error
      ? PHASE_LABELS.error!
      : PHASE_LABELS[progress?.phase ?? "idle"] ?? progress?.phase ?? "Ready";

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9994] bg-black/70 backdrop-blur-sm"
        onClick={running ? undefined : onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="fixed left-1/2 top-1/2 z-[9995] flex h-[min(86vh,720px)] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-edge-2 bg-surface-1 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-edge-2 px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15 ring-1 ring-indigo-400/25">
              <Download className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-heading">
                Pull cohort from {connection.site_label}
              </h2>
              <p className="mt-0.5 text-[11px] text-dim">
                Bulk Data <code>$export</code> • Patients, conditions, meds, observations • all local.
              </p>
            </div>
          </div>
          <button
            onClick={running ? undefined : onClose}
            disabled={running}
            className="rounded-md p-1.5 text-dim transition-colors hover:bg-surface-3 hover:text-body disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!isDone && !running && !error && (
            <ScopeSelector
              scope={scope}
              setScope={setScope}
              groupId={groupId}
              setGroupId={setGroupId}
            />
          )}

          {(running || progress) && !isDone && !error && (
            <ProgressView phaseLabel={phaseLabel} progress={progress} />
          )}

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-4 text-[12px] text-rose-300">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                Cohort pull failed
              </div>
              <p className="text-rose-200/80">{error}</p>
            </div>
          )}

          {summary && <SummaryView summary={summary} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-edge-2 px-6 py-4">
          {!isDone ? (
            <>
              <button
                onClick={onClose}
                disabled={running}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={start}
                disabled={running || (scope === "group" && !groupId.trim())}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-1.5 text-[12px] font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400 disabled:opacity-60"
              >
                {running ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Pulling…
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    Start pull
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-1.5 text-[12px] font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Done
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}

// --- subviews ---

function ScopeSelector({
  scope,
  setScope,
  groupId,
  setGroupId,
}: {
  scope: CohortPullScope;
  setScope: (s: CohortPullScope) => void;
  groupId: string;
  setGroupId: (s: string) => void;
}) {
  const options: { id: CohortPullScope; label: string; description: string }[] = [
    {
      id: "patient",
      label: "Patient-level export",
      description: "Every patient your access token can see. Most universally supported.",
    },
    {
      id: "system",
      label: "System-level export",
      description: "Whole-tenant export. Requires elevated scopes — usually denied at sites.",
    },
    {
      id: "group",
      label: "Group export",
      description: "Pull a specific cohort defined by a Group resource id.",
    },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-dim">
        Export scope
      </h3>
      <div className="space-y-2">
        {options.map((opt) => {
          const active = scope === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setScope(opt.id)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                active
                  ? "border-indigo-400/40 bg-indigo-500/[0.06] ring-1 ring-indigo-400/25"
                  : "border-edge-2 bg-surface-2 hover:border-edge-4"
              }`}
            >
              <div
                className={`mt-1 h-3 w-3 flex-none rounded-full ring-2 ring-offset-2 ring-offset-surface-2 ${
                  active ? "bg-indigo-400 ring-indigo-400/40" : "bg-surface-3 ring-edge-3"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-heading">{opt.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-dim">
                  {opt.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {scope === "group" && (
        <div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-dim">
              Group resource id
            </span>
            <input
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="abc-123"
              className="w-full rounded-lg border border-edge-3 bg-surface-1 px-3 py-2 font-mono text-[11px] text-body placeholder:text-dim/50 focus:border-indigo-400/40 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
            />
          </label>
        </div>
      )}
      <div className="rounded-lg border border-edge-2 bg-surface-2 px-3 py-2 text-[11px] text-dim">
        Will pull <strong className="text-body">Patient</strong>,{" "}
        <strong className="text-body">Condition</strong>,{" "}
        <strong className="text-body">Observation</strong>, and{" "}
        <strong className="text-body">MedicationRequest</strong> resources by default.
      </div>
    </div>
  );
}

function ProgressView({
  phaseLabel,
  progress,
}: {
  phaseLabel: string;
  progress: CohortPullProgress | null;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 animate-pulse rounded-full bg-indigo-500/20 blur-xl" />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-lg shadow-indigo-500/30">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-indigo-300">
            {phaseLabel}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-body">
            {progress?.message ?? "Working…"}
          </div>
          {progress && (
            <div className="mt-0.5 text-[10px] text-dim">
              Elapsed: {progress.elapsed_seconds}s
            </div>
          )}
        </div>
      </div>

      {progress?.stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat icon={<Users className="h-3 w-3" />} label="Patients" value={progress.stats.patients} />
          <Stat icon={<Stethoscope className="h-3 w-3" />} label="Conditions" value={progress.stats.diagnoses} />
          <Stat icon={<Pill className="h-3 w-3" />} label="Meds" value={progress.stats.medications} />
          <Stat icon={<TestTube2 className="h-3 w-3" />} label="Labs" value={progress.stats.labs} />
        </div>
      )}

      <div className="rounded-lg border border-edge-2 bg-surface-2 px-3 py-2 text-[10px] text-dim">
        All data stays on this device. The export streams directly into your encrypted database.
      </div>
    </div>
  );
}

function SummaryView({ summary }: { summary: CohortPullSummary }) {
  const total = summary.patients_inserted + summary.patients_updated;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <div className="text-[14px] font-bold text-heading">Cohort imported</div>
          <div className="text-[11px] text-dim">
            Completed in {summary.elapsed_seconds}s
            {summary.skipped > 0 && ` · ${summary.skipped} skipped`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat icon={<Users className="h-3 w-3" />} label="Patients" value={total} subtle={`${summary.patients_inserted} new · ${summary.patients_updated} updated`} />
        <Stat icon={<Stethoscope className="h-3 w-3" />} label="Conditions" value={summary.diagnoses_inserted} />
        <Stat icon={<Pill className="h-3 w-3" />} label="Medications" value={summary.medications_inserted} />
        <Stat icon={<TestTube2 className="h-3 w-3" />} label="Labs" value={summary.labs_inserted} />
        {summary.vitals_inserted > 0 && (
          <Stat icon={<Database className="h-3 w-3" />} label="Vitals" value={summary.vitals_inserted} />
        )}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  subtle,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtle?: string;
}) {
  return (
    <div className="rounded-lg border border-edge-2 bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[18px] font-bold tabular-nums text-indigo-300">
        {value.toLocaleString()}
      </div>
      {subtle && <div className="mt-0.5 text-[10px] text-dim/70">{subtle}</div>}
    </div>
  );
}
