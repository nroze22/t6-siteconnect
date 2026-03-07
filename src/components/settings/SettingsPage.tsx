import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  HardDrive,
  Shield,
  Bell,
  ChevronRight,
  Sparkles,
  FolderSync,
  FolderOpen,
  Play,
  Square,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import {
  isTauri,
  startFolderWatcher,
  stopFolderWatcher,
  getWatcherStatus,
  pickWatchFolder,
  listenForFileDetected,
  type WatcherStatus,
  type FileDetectedEvent,
} from "@/lib/tauri";

export function SettingsPage() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <h2 className="text-[15px] font-bold text-white">Settings</h2>
        <p className="text-[12px] text-slate-500">
          Configure your SiteConnect installation. All settings are stored locally.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-3">
          {/* EMR Auto-Ingest — full interactive panel */}
          <WatcherPanel />

          {[
            {
              icon: <Brain className="h-5 w-5 text-purple-400" />,
              iconBg: "bg-purple-500/10 ring-1 ring-purple-500/20",
              title: "AI Model",
              desc: "Select and manage the local language model for AI-powered screening. BioMistral-7B recommended for clinical accuracy.",
              action: "Configure",
              badge: "Not configured",
              badgeColor: "text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/20",
            },
            {
              icon: <HardDrive className="h-5 w-5 text-emerald-400" />,
              iconBg: "bg-emerald-500/10 ring-1 ring-emerald-500/20",
              title: "Database & Encryption",
              desc: "Manage encryption passphrase, backup/restore, and database maintenance.",
              action: "Manage",
              badge: "AES-256 Active",
              badgeColor: "text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20",
            },
            {
              icon: <Shield className="h-5 w-5 text-blue-400" />,
              iconBg: "bg-blue-500/10 ring-1 ring-blue-500/20",
              title: "Privacy & Telemetry",
              desc: "Control optional anonymized telemetry. Preview exactly what gets shared before enabling.",
              action: "Review",
            },
            {
              icon: <Bell className="h-5 w-5 text-amber-400" />,
              iconBg: "bg-amber-500/10 ring-1 ring-amber-500/20",
              title: "Preferences",
              desc: "Theme, default filters, session timeout, and notification settings.",
              action: "Edit",
            },
          ].map((section) => (
            <div
              key={section.title}
              className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-card p-4 transition-all hover:border-white/[0.1]"
            >
              <div className={`rounded-lg p-2.5 ${section.iconBg}`}>
                {section.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-slate-200">{section.title}</h3>
                  {section.badge && (
                    <span className={`rounded-md px-2 py-0.5 text-[9px] font-semibold ${section.badgeColor}`}>
                      {section.badge}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">{section.desc}</p>
              </div>
              <button className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200">
                {section.action}
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* Quick start guide */}
          <div className="mt-6 rounded-xl border border-indigo-500/15 bg-indigo-500/5 p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <h3 className="text-[13px] font-bold text-indigo-300">Getting Started</h3>
            </div>
            <div className="mt-3 space-y-2.5">
              {[
                { step: 1, text: "Import patient data from your EMR (CSV, FHIR, or HL7)", done: false },
                { step: 2, text: "Configure the AI model for enhanced screening (optional)", done: false },
                { step: 3, text: "Screen patients against active clinical trials", done: false },
                { step: 4, text: "Review eligibility results and accept/reject candidates", done: false },
              ].map((item) => (
                <div key={item.step} className="flex items-center gap-3">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                    item.done
                      ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20"
                      : "bg-white/[0.04] text-slate-500 ring-1 ring-white/[0.08]"
                  }`}>
                    {item.step}
                  </span>
                  <span className="text-[12px] text-slate-400">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Folder Watcher Panel — real interactive component
// ---------------------------------------------------------------------------

function WatcherPanel() {
  const [status, setStatus] = useState<WatcherStatus>({ active: false, path: null });
  const [watchPath, setWatchPath] = useState("");
  const [recentFiles, setRecentFiles] = useState<FileDetectedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load initial status
  useEffect(() => {
    getWatcherStatus().then((s) => {
      setStatus(s);
      if (s.path) setWatchPath(s.path);
    });
  }, []);

  // Listen for file-detected events
  useEffect(() => {
    let cleanup: (() => void) | null = null;

    listenForFileDetected((event) => {
      setRecentFiles((prev) => [event, ...prev].slice(0, 10));
    }).then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      cleanup?.();
    };
  }, []);

  const handlePickFolder = useCallback(async () => {
    if (!isTauri) {
      // Web dev mode — simulate with a path
      setWatchPath("/Users/demo/Documents/EMR_Exports");
      return;
    }
    const picked = await pickWatchFolder();
    if (picked) {
      setWatchPath(picked);
      setError(null);
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (!watchPath.trim()) {
      setError("Please select a folder first");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isTauri) {
        const result = await startFolderWatcher(watchPath);
        setStatus(result);
      } else {
        // Web dev mode — simulate active watcher
        setStatus({ active: true, path: watchPath });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [watchPath]);

  const handleStop = useCallback(async () => {
    setLoading(true);
    try {
      if (isTauri) {
        const result = await stopFolderWatcher();
        setStatus(result);
      } else {
        setStatus({ active: false, path: null });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-white/[0.06]">
        <div className="rounded-lg p-2.5 bg-cyan-500/10 ring-1 ring-cyan-500/20">
          <FolderSync className="h-5 w-5 text-cyan-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-slate-200">EMR Auto-Ingest</h3>
            {status.active ? (
              <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Watching
              </span>
            ) : (
              <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold text-slate-500 ring-1 ring-white/[0.06]">
                Inactive
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Watch a local folder for new CSV exports. Files are auto-imported and screened instantly.
          </p>
        </div>
      </div>

      {/* Config */}
      <div className="p-4 space-y-3">
        {/* Folder selector */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Watch Folder
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              type="text"
              value={watchPath}
              onChange={(e) => setWatchPath(e.target.value)}
              placeholder="/path/to/emr/exports"
              className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 font-mono text-[12px] text-slate-200 placeholder-slate-600 focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
            />
            <button
              onClick={handlePickFolder}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Browse
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/5 px-3 py-2 ring-1 ring-red-500/15">
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[11px] text-red-400">{error}</span>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2">
          {status.active ? (
            <button
              onClick={handleStop}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-red-600/80 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
            >
              <Square className="h-3 w-3" />
              Stop Watching
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={loading || !watchPath.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              Start Watching
            </button>
          )}
          <p className="text-[10px] text-slate-600">
            {status.active
              ? "Monitoring for new .csv files in real-time using OS file events."
              : "Click Start to begin monitoring. The watcher runs while the app is open."}
          </p>
        </div>

        {/* How it works */}
        <div className="rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/[0.04]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">How it works</p>
          <div className="space-y-1.5 text-[11px] text-slate-500">
            <p>1. Point this to your EMR's export folder (e.g., where Epic Clarity drops CSVs)</p>
            <p>2. SiteConnect uses OS-level file events — no polling, instant detection</p>
            <p>3. New .csv files are auto-imported, columns auto-mapped, and patients screened</p>
            <p>4. You get a notification when new patients are ready for review</p>
          </div>
        </div>

        {/* Recent detections */}
        {recentFiles.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Recent Detections</p>
            <div className="space-y-1">
              {recentFiles.map((f, i) => (
                <div
                  key={`${f.path}-${i}`}
                  className="flex items-center gap-2.5 rounded-lg bg-white/[0.02] px-3 py-2 ring-1 ring-white/[0.04]"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-slate-300 truncate">{f.file_name}</p>
                    <p className="text-[10px] text-slate-600">{formatBytes(f.size_bytes)}</p>
                  </div>
                  <button
                    onClick={() => {
                      // Navigate to import with this file's path
                      // In production: would auto-import via Rust backend
                      console.info(`Would auto-import: ${f.path}`);
                    }}
                    className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                  >
                    Import
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
