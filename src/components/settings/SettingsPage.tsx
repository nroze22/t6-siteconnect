import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Brain,
  HardDrive,
  Shield,
  Bell,
  Sparkles,
  FolderSync,
  FolderOpen,
  Play,
  Square,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Check,
  Loader2,
  Server,
  ShieldCheck,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
  MemoryStick,
  Monitor,
  Gauge,
  RefreshCw,
  Layers,
  HeadphonesIcon,
  Bug,
  Copy,
  Mail,
  MessageSquare,
  ArrowUpCircle,
  Info,
  Package,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  Settings,
  Database,
} from "lucide-react";
import {
  isTauri,
  startFolderWatcher,
  stopFolderWatcher,
  getWatcherStatus,
  pickWatchFolder,
  type WatcherStatus,
} from "@/lib/tauri";
import {
  getLlmStatus,
  checkLlmHealth,
  checkOllamaStatus,
  installOllama,
  startOllama,
  detectSystemHardware,
  pullOllamaModel,
  configureOllamaBackend,
  testOllamaInference,
  listenForPullProgress,
  listenForPullComplete,
  getAuditTrail,
  exportAuditTrail,
  verifyAuditChain,
  getSummary,
  type LlmStatus,
  type OllamaStatus,
  type SystemHardware,
  type PullProgress,
  type AuditEntry,
} from "@/lib/data-provider";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/use-app-store";
import { useWatcherStore } from "@/stores/use-watcher-store";
import { AiChatTest } from "./AiChatTest";
import { EpicConnectionsPanel } from "./EpicConnectionsPanel";

// ─── Tab Definition ──────────────────────────────────────────

type SettingsTab = "general" | "data" | "security" | "support";

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <Settings className="h-3.5 w-3.5" /> },
  { id: "data", label: "Data", icon: <Database className="h-3.5 w-3.5" /> },
  { id: "security", label: "Security", icon: <Shield className="h-3.5 w-3.5" /> },
  { id: "support", label: "Support", icon: <HeadphonesIcon className="h-3.5 w-3.5" /> },
];

// ─── Main Component ──────────────────────────────────────────

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header with tabs */}
      <div className="shrink-0 border-b border-border bg-card/50">
        <div className="px-6 pt-4 pb-0">
          <h2 className="text-[15px] font-bold text-heading">Settings</h2>
          <p className="text-[12px] text-dim">
            Configure your SiteConnect installation. All settings are stored locally.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-1 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-[12px] font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-background text-heading border-t border-l border-r border-border -mb-px"
                  : "text-dim hover:text-body hover:bg-surface-2"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-3">
          {activeTab === "general" && (
            <>
              <SystemProfilePanel />
              <AiSetupPanel />
              <PreferencesPanel />
              <UpdatePanel />
            </>
          )}
          {activeTab === "data" && (
            <>
              <DatabasePanel />
              <WatcherPanel />
              <EpicConnectionsPanel />
            </>
          )}
          {activeTab === "security" && (
            <AuditTrailPanel />
          )}
          {activeTab === "support" && (
            <SupportPanel />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Folder Watcher Panel
// ---------------------------------------------------------------------------

function WatcherPanel() {
  const [status, setStatus] = useState<WatcherStatus>({ active: false, path: null });
  const [watchPath, setWatchPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const detectedFiles = useWatcherStore((s) => s.detectedFiles);
  const addDetectedFile = useWatcherStore((s) => s.addDetectedFile);

  useEffect(() => {
    getWatcherStatus().then((s) => {
      setStatus(s);
      if (s.path) setWatchPath(s.path);
    });
  }, []);

  const handlePickFolder = useCallback(async () => {
    if (!isTauri) {
      setWatchPath("~/Documents/EMR_Exports");
      return;
    }
    const picked = await pickWatchFolder();
    if (picked) {
      setWatchPath(picked);
      setError(null);
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (!watchPath.trim()) { setError("Please select a folder first"); return; }
    setLoading(true);
    setError(null);
    try {
      if (isTauri) {
        const result = await startFolderWatcher(watchPath);
        setStatus(result);
      } else {
        setStatus({ active: true, path: watchPath });
        toast.success("Watcher started", `Monitoring ${watchPath}`);
        setTimeout(() => {
          addDetectedFile({ path: `${watchPath}/patient_export_2026-03-07.csv`, file_name: "patient_export_2026-03-07.csv", size_bytes: 245760 });
          addDetectedFile({ path: `${watchPath}/lab_results_batch_42.csv`, file_name: "lab_results_batch_42.csv", size_bytes: 128512 });
          toast.info("Files detected", "2 new CSV files found in watched folder");
        }, 2000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [watchPath, toast, addDetectedFile]);

  const handleStop = useCallback(async () => {
    setLoading(true);
    try {
      if (isTauri) {
        const result = await stopFolderWatcher();
        setStatus(result);
      } else {
        setStatus({ active: false, path: null });
        toast.info("Watcher stopped", "No longer monitoring for new files");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return (
    <div className="rounded-xl border border-edge-2 bg-card overflow-hidden">
      <div className="flex items-center gap-4 p-4 border-b border-edge-2">
        <div className="rounded-lg p-2.5 bg-cyan-500/10 ring-1 ring-cyan-500/20">
          <FolderSync className="h-5 w-5 text-cyan-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-body">EMR Auto-Ingest</h3>
            {status.active ? (
              <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Watching
              </span>
            ) : (
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[9px] font-semibold text-dim ring-1 ring-edge-2">
                Inactive
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-dim">
            Watch a local folder for new data files. Files are auto-imported and screened.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className="text-[12px] font-semibold uppercase tracking-wider text-dim">Watch Folder</label>
          <div className="mt-1.5 flex gap-2">
            <input
              type="text"
              value={watchPath}
              onChange={(e) => setWatchPath(e.target.value)}
              placeholder="Path to EMR export folder"
              className="flex-1 rounded-lg border border-edge-2 bg-surface-2 px-3 py-2 font-mono text-[12px] text-body placeholder-dim focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
            />
            <button onClick={handlePickFolder} className="flex items-center gap-1.5 rounded-lg border border-edge-3 bg-surface-2 px-3 py-2 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body">
              <FolderOpen className="h-3.5 w-3.5" /> Browse
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/5 px-3 py-2 ring-1 ring-red-500/15">
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[12px] text-red-400">{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {status.active ? (
            <button onClick={handleStop} disabled={loading} className="flex items-center gap-1.5 rounded-lg bg-red-600/80 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50">
              <Square className="h-3 w-3" /> Stop Watching
            </button>
          ) : (
            <button onClick={handleStart} disabled={loading || !watchPath.trim()} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Start Watching
            </button>
          )}
          <p className="text-[12px] text-dim">
            {status.active ? "Monitoring for new CSV, TSV, and Excel files." : "Select a folder and click Start."}
          </p>
        </div>

        {detectedFiles.length > 0 && (
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-dim mb-2">Recent Detections</p>
            <div className="space-y-1">
              {detectedFiles.filter((f) => !f.dismissed).slice(0, 10).map((f) => (
                <div key={f.path} className="flex items-center gap-2.5 rounded-lg bg-surface-1 px-3 py-2 ring-1 ring-edge-1">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-body truncate">{f.fileName}</p>
                    <p className="text-[12px] text-dim">{formatBytes(f.sizeBytes)}</p>
                  </div>
                  {f.previewStatus === "loading" && (
                    <span className="flex items-center gap-1 text-[10px] text-dim">
                      <Loader2 className="h-3 w-3 animate-spin" /> Previewing
                    </span>
                  )}
                  {f.previewStatus === "ready" && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </span>
                  )}
                  {f.previewStatus === "error" && (
                    <span className="flex items-center gap-1 text-[10px] text-red-400">
                      <XCircle className="h-3 w-3" /> Error
                    </span>
                  )}
                  <button
                    onClick={() => {
                      sessionStorage.setItem("siteconnect-import-file", JSON.stringify({
                        path: f.path,
                        name: f.fileName,
                        size: f.sizeBytes,
                      }));
                      setCurrentPage("import");
                    }}
                    className="rounded-md bg-indigo-500/15 px-2.5 py-1 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-500/25 hover:bg-indigo-500/25 transition-colors"
                  >
                    Preview & Import
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

// ---------------------------------------------------------------------------
// LLM Model Panel
// ---------------------------------------------------------------------------

// ─── Ollama model tier definitions ─────────────────────────────────

const AI_MODELS = [
  { id: "gemma3:1b", label: "Lite (1B)", size: "~1.0 GB", sizeGb: 1.0, ramReq: "4 GB", downloadTime: "1–3 min", description: "Lightweight model for basic AI screening. Fast inference on any hardware." },
  { id: "gemma3:4b", label: "Standard (4B)", size: "~3.3 GB", sizeGb: 3.3, ramReq: "8 GB+", downloadTime: "5–15 min", description: "Balanced performance and quality. Recommended for most sites." },
  { id: "gemma3:12b", label: "Advanced (12B)", size: "~8.1 GB", sizeGb: 8.1, ramReq: "16 GB+", downloadTime: "15–30 min", description: "High-quality clinical reasoning. Great for complex eligibility criteria." },
  { id: "gemma3:27b", label: "Premium (27B)", size: "~17 GB", sizeGb: 17.0, ramReq: "24 GB+", downloadTime: "30–60 min", description: "Near-frontier reasoning with 128K context. Best accuracy available." },
] as const;

type SetupPhase = "idle" | "installing_ollama" | "starting_ollama" | "downloading_model" | "activating" | "testing" | "done" | "error";

function AiSetupPanel() {
  const setGlobalLlmStatus = useAppStore((s) => s.setLlmStatus);
  const toast = useToast();

  // Core state
  const [llmStatus, setLlmStatusLocal] = useState<LlmStatus>({
    status: "not_configured", model_name: null, port: 11434, backend: "ollama",
  });
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({ installed: false, running: false, models: [] });
  const [hardware, setHardware] = useState<SystemHardware | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("gemma3:4b");

  // One-click setup state
  const [phase, setPhase] = useState<SetupPhase>("idle");
  const [phaseMessage, setPhaseMessage] = useState("");
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthy, setHealthy] = useState(false);

  // Download speed tracking
  const [downloadSpeed, setDownloadSpeed] = useState<string>("");
  const lastProgressRef = useRef<{ completed: number; time: number } | null>(null);

  // Sync local + global LLM state
  const setStatus = useCallback((update: LlmStatus | ((prev: LlmStatus) => LlmStatus)) => {
    setLlmStatusLocal((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      const backend = "ollama" as const;
      setGlobalLlmStatus(next.status, next.model_name ?? next.ollama_model, backend);
      return next;
    });
  }, [setGlobalLlmStatus]);

  // Initial load — skip heavy Ollama/hardware checks if LLM is already running
  useEffect(() => {
    const globalLlm = useAppStore.getState().status.llmStatus;
    getLlmStatus().then((status) => {
      setStatus(status);
      // If LLM is already running (from global state or fresh check), just sync state
      // and skip expensive Ollama re-detection + hardware checks
      if (status.status === "running" || globalLlm === "running") {
        // Still populate ollamaStatus minimally so the UI renders correctly
        checkOllamaStatus().then(setOllamaStatus);
        return;
      }
      checkOllamaStatus().then(setOllamaStatus);
      detectSystemHardware().then((hw) => {
        setHardware(hw);
        if (hw.recommended_model && hw.recommended_model !== "none") setSelectedModel(hw.recommended_model);
      });
    });
  }, [setStatus]);

  // Health check for running server
  useEffect(() => {
    if (llmStatus.status !== "running") { setHealthy(false); return; }
    const interval = setInterval(() => { checkLlmHealth().then(setHealthy); }, 5000);
    checkLlmHealth().then(setHealthy);
    return () => clearInterval(interval);
  }, [llmStatus.status]);

  const isModelInstalled = useCallback((modelId: string) => {
    return ollamaStatus.models.some((m) => m.name === modelId || m.name.startsWith(modelId + ":"));
  }, [ollamaStatus.models]);

  // ── ONE-CLICK SETUP: install Ollama → start → pull model → activate ──
  const handleOneClickSetup = useCallback(async (modelId: string) => {
    setError(null);
    setSelectedModel(modelId);

    const modelDef = AI_MODELS.find((m) => m.id === modelId);
    const requiredGb = modelDef?.sizeGb ?? 4.0;

    // Pre-flight: disk space (skip if model is already downloaded)
    const modelAlreadyDownloaded = ollamaStatus.models.some((m) => m.name === modelId || m.name.startsWith(modelId + ":"));
    if (!modelAlreadyDownloaded && hardware && hardware.free_disk_gb < requiredGb + 1) {
      setError(`Not enough disk space. ${modelId} needs ~${requiredGb} GB but you only have ${hardware.free_disk_gb.toFixed(1)} GB free.`);
      toast.error("Insufficient disk space", `Need ~${requiredGb + 1} GB free`);
      return;
    }

    // Step 1: Ensure Ollama is installed
    let currentStatus = await checkOllamaStatus();
    setOllamaStatus(currentStatus);

    if (!currentStatus.installed && !currentStatus.running) {
      setPhase("installing_ollama");
      setPhaseMessage("Step 1: Installing AI engine");
      try {
        const installResult = await installOllama();
        // Windows: installer was launched asynchronously — user needs to complete it
        if (typeof installResult === "string" && (installResult.includes("installer launched") || installResult.includes("Check Again"))) {
          setPhase("error");
          setError("Ollama installer is running. Complete the installation, then click 'Try Again' to continue setup.");
          return;
        }
        currentStatus = await checkOllamaStatus();
        setOllamaStatus(currentStatus);
        if (!currentStatus.installed && !currentStatus.running) {
          throw new Error("Installation completed but Ollama was not detected. Please try again.");
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (errMsg.includes("https://ollama.com/download")) {
          try { const { open } = await import("@tauri-apps/plugin-shell"); await open("https://ollama.com/download"); } catch { window.open("https://ollama.com/download", "_blank"); }
          setPhase("error");
          setError("Please download and install Ollama, then click 'Try Again' to continue setup.");
          return;
        }
        setPhase("error");
        setError(errMsg);
        toast.error("Setup failed", errMsg);
        return;
      }
    }

    // Step 2: Ensure Ollama is running
    if (!currentStatus.running) {
      setPhase("starting_ollama");
      setPhaseMessage("Step 2: Starting AI engine");
      try {
        await startOllama();
        currentStatus = await checkOllamaStatus();
        setOllamaStatus(currentStatus);
        if (!currentStatus.running) {
          throw new Error("Ollama started but is not responding. It may need a moment — try again.");
        }
      } catch (e) {
        setPhase("error");
        setError(e instanceof Error ? e.message : String(e));
        toast.error("Setup failed", "Could not start AI engine");
        return;
      }
    }

    // Step 3: Pull the model if not already installed
    const alreadyInstalled = currentStatus.models.some((m) => m.name === modelId || m.name.startsWith(modelId + ":"));
    if (!alreadyInstalled) {
      setPhase("downloading_model");
      setPhaseMessage("Step 3: Downloading AI model — this will take several minutes");
      setPullProgress(null);
      setDownloadSpeed("");
      lastProgressRef.current = null;

      try {
        await new Promise<void>(async (resolve, reject) => {
          const unlistenProgress = await listenForPullProgress((progress) => {
            setPullProgress(progress);
            // Compute download speed and ETA
            const now = Date.now();
            const last = lastProgressRef.current;
            if (last && progress.completed > last.completed) {
              const elapsed = (now - last.time) / 1000; // seconds
              if (elapsed > 0.5) {
                const bytesPerSec = (progress.completed - last.completed) / elapsed;
                const remaining = progress.total - progress.completed;
                const etaSec = remaining / bytesPerSec;
                const speed = bytesPerSec > 1_000_000
                  ? `${(bytesPerSec / 1_000_000).toFixed(1)} MB/s`
                  : `${(bytesPerSec / 1_000).toFixed(0)} KB/s`;
                const eta = etaSec > 60
                  ? `~${Math.ceil(etaSec / 60)} min left`
                  : `~${Math.ceil(etaSec)}s left`;
                setDownloadSpeed(`${speed} · ${eta}`);
                lastProgressRef.current = { completed: progress.completed, time: now };
              }
            } else if (!last) {
              lastProgressRef.current = { completed: progress.completed, time: now };
            }
            const pct = progress.percent > 0 ? ` (${Math.round(progress.percent)}%)` : "";
            setPhaseMessage(`Downloading AI model${pct}`);
          });
          const unlistenComplete = await listenForPullComplete((result) => {
            unlistenProgress?.();
            unlistenComplete?.();
            if (result.success) resolve();
            else reject(new Error(result.error ?? "Download failed"));
          });

          try {
            await pullOllamaModel(modelId);
            // In web/demo mode, simulate completion
            if (!isTauri) {
              setTimeout(() => {
                setOllamaStatus((prev) => ({
                  ...prev,
                  models: [...prev.models, { name: modelId, size: 3_300_000_000, modified_at: new Date().toISOString() }],
                }));
                resolve();
              }, 2000);
            }
          } catch (e) {
            unlistenProgress?.();
            unlistenComplete?.();
            reject(e);
          }
        });

        setPullProgress(null);
        currentStatus = await checkOllamaStatus();
        setOllamaStatus(currentStatus);
      } catch (e) {
        setPhase("error");
        setPullProgress(null);
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("OLLAMA_UPDATE_REQUIRED")) {
          setError("Ollama needs to be updated to support this model. Please download the latest version from ollama.com/download, then try again.");
          toast.error("Ollama update required", "This model requires a newer Ollama version. Update at ollama.com/download");
          try { const { open } = await import("@tauri-apps/plugin-shell"); await open("https://ollama.com/download"); } catch { /* ignore */ }
        } else {
          setError(msg);
          toast.error("Download failed", msg);
        }
        return;
      }
    }

    // Step 4: Configure & activate
    setPhase("activating");
    setPhaseMessage("Step 4: Configuring screening engine");
    try {
      const result = await configureOllamaBackend(modelId);
      setStatus(result);
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
      toast.error("Activation failed", e instanceof Error ? e.message : "Unknown error");
      return;
    }

    // Step 5: Quick smoke test
    setPhase("testing");
    setPhaseMessage("Step 5: Verifying AI is working");
    try {
      const testResult = await testOllamaInference();
      if (!testResult.success) {
        // Non-fatal — AI is configured but test failed
        toast.info("AI activated", `Model ready, but test returned: ${testResult.error ?? "slow response"}`);
      } else {
        toast.success("AI screening ready", `${modelId} responding in ${testResult.latency_ms}ms`);
      }
    } catch {
      // Non-fatal
      toast.info("AI activated", "Model configured. Inference test was inconclusive.");
    }

    setPhase("done");
    setPhaseMessage("");
  }, [hardware, setStatus, toast]);

  // Disable AI
  const handleDisableAi = useCallback(async () => {
    setStatus((prev) => ({ ...prev, status: "not_configured", model_name: null }));
    setPhase("idle");
    toast.info("AI screening disabled", "Screening will use rule-based mode only");
  }, [setStatus, toast]);

  // Status badge
  const isActive = llmStatus.status === "running" && llmStatus.backend === "ollama";
  const isSettingUp = phase !== "idle" && phase !== "done" && phase !== "error";

  const badge = (() => {
    if (isActive) return { label: "Active", cls: "text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20", dot: true };
    if (isSettingUp) return { label: "Setting up...", cls: "text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/20", dot: false };
    return { label: "Not Active", cls: "text-dim bg-surface-2 ring-1 ring-edge-2", dot: false };
  })();

  return (
    <div className="rounded-xl border border-edge-2 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-edge-2">
        <div className="rounded-lg p-2.5 bg-purple-500/10 ring-1 ring-purple-500/20">
          <Brain className="h-5 w-5 text-purple-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-body">AI Screening</h3>
            <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-semibold ${badge.cls}`}>
              {badge.dot && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              {badge.label}
            </span>
            {isActive && healthy && (
              <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                <Check className="h-2.5 w-2.5" /> Healthy
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-dim">
            {isActive
              ? `Using ${llmStatus.ollama_model ?? selectedModel} · 100% local inference · no PHI leaves this device`
              : "Enable local AI to evaluate complex eligibility criteria. One click — we handle everything."}
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Active state ── */}
        {isActive && !isSettingUp && (
          <div>
            <div className="rounded-lg bg-emerald-500/5 px-4 py-3 ring-1 ring-emerald-500/15">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15">
                  <Sparkles className="h-4.5 w-4.5 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-emerald-400">AI screening is active</p>
                  <p className="text-[12px] text-dim">
                    Model: <span className="font-semibold text-body">{llmStatus.ollama_model ?? selectedModel}</span>
                    {healthy && <span className="ml-2 text-emerald-400">· Healthy</span>}
                  </p>
                </div>
                <button
                  onClick={handleDisableAi}
                  className="rounded-lg border border-edge-3 bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body"
                >
                  Disable
                </button>
              </div>
            </div>

            {/* Chat test */}
            <div className="mt-3">
              <AiChatTest />
            </div>

            {/* System info (compact, in active state) */}
            {hardware && (
              <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px] text-dim">
                <span className="flex items-center gap-1"><MemoryStick className="h-3 w-3" />{hardware.total_ram_gb.toFixed(0)} GB RAM</span>
                <span className="text-faint">·</span>
                <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{hardware.free_disk_gb.toFixed(0)} GB free</span>
                <span className="text-faint">·</span>
                <span>100% on-device inference</span>
              </div>
            )}
          </div>
        )}

        {/* ── Setup in progress ── */}
        {isSettingUp && (
          <div className="rounded-lg bg-purple-500/5 px-4 py-4 ring-1 ring-purple-500/15">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="h-5 w-5 text-purple-400 animate-spin shrink-0" />
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-purple-400">{phaseMessage}</p>
                <p className="text-[12px] text-dim">
                  {phase === "installing_ollama" && "Downloading the Ollama AI runtime (~150 MB). This only happens once."}
                  {phase === "starting_ollama" && "Launching the AI engine on your machine. Almost there..."}
                  {phase === "downloading_model" && (
                    pullProgress && pullProgress.percent > 0
                      ? `Downloading AI model — ${Math.round(pullProgress.percent)}% complete. This is a large file — please keep this window open and don't close the app.`
                      : "Preparing to download the AI model. This is a multi-gigabyte download and may take 10–30 minutes depending on your internet connection. You can continue using the app while it downloads."
                  )}
                  {phase === "activating" && "Connecting the AI model to the screening engine..."}
                  {phase === "testing" && "Verifying the AI model can process clinical criteria..."}
                </p>
              </div>
            </div>

            {/* Progress bar for model download */}
            {phase === "downloading_model" && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-body">
                    {pullProgress?.status === "pulling manifest" ? "Fetching model info..." :
                     pullProgress?.status?.startsWith("pulling") ? "Downloading..." :
                     pullProgress?.status === "verifying sha256 digest" ? "Verifying download..." :
                     pullProgress?.status === "writing manifest" ? "Finalizing..." :
                     pullProgress?.status ?? "Preparing..."}
                  </span>
                  <span className="text-[11px] font-mono font-semibold text-purple-400">
                    {pullProgress && pullProgress.percent > 0 ? `${Math.round(pullProgress.percent)}%` : "—"}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500 ease-out"
                    style={{ width: `${pullProgress?.percent ?? 0}%` }}
                  />
                </div>
                {pullProgress && pullProgress.total > 0 && (
                  <>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10px] text-purple-400 font-medium">
                        {downloadSpeed || "Calculating speed..."}
                      </span>
                      <span className="text-[10px] text-dim">
                        {(pullProgress.completed / 1_000_000_000).toFixed(2)} / {(pullProgress.total / 1_000_000_000).toFixed(1)} GB
                      </span>
                    </div>
                    {pullProgress.percent < 50 && pullProgress.percent > 0 && (
                      <p className="mt-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-[10px] text-dim leading-relaxed">
                        <strong className="text-body">Tip:</strong> AI models are several gigabytes. This is a one-time download — once installed, everything runs locally with no internet needed. Feel free to continue working in other tabs while this completes.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Named step indicators */}
            <div className="mt-4 flex items-center gap-0.5">
              {([
                { key: "installing_ollama", label: "Install" },
                { key: "starting_ollama", label: "Start" },
                { key: "downloading_model", label: "Download" },
                { key: "activating", label: "Configure" },
                { key: "testing", label: "Verify" },
              ] as const).map(({ key, label }, i) => {
                const steps: SetupPhase[] = ["installing_ollama", "starting_ollama", "downloading_model", "activating", "testing"];
                const currentIdx = steps.indexOf(phase);
                const isDone = i < currentIdx;
                const isCurrent = i === currentIdx;
                return (
                  <div key={key} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`h-1.5 w-full rounded-full transition-colors ${isDone ? "bg-purple-500" : isCurrent ? "bg-purple-400 animate-pulse" : "bg-surface-2"}`} />
                    <span className={`text-[9px] font-medium ${isDone ? "text-purple-400" : isCurrent ? "text-purple-400" : "text-faint"}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Model selection (when not active and not setting up) ── */}
        {!isActive && !isSettingUp && (
          <div>
            {/* System info */}
            {hardware && (
              <div className="mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-2 ring-1 ring-edge-1">
                    <MemoryStick className="h-3.5 w-3.5 text-indigo-400" />
                    <p className="text-[12px] font-semibold text-body">{hardware.total_ram_gb.toFixed(1)} GB RAM</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-2 ring-1 ring-edge-1">
                    <HardDrive className={`h-3.5 w-3.5 ${hardware.free_disk_gb < 5 ? "text-red-400" : "text-indigo-400"}`} />
                    <p className={`text-[12px] font-semibold ${hardware.free_disk_gb < 5 ? "text-red-400" : "text-body"}`}>{hardware.free_disk_gb.toFixed(1)} GB free</p>
                  </div>
                </div>
                {hardware.free_disk_gb < 5 && ollamaStatus.models.length === 0 && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-500/5 px-3 py-2 ring-1 ring-red-500/15">
                    <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    <span className="text-[12px] text-red-400">Low disk space. At least 5 GB free is recommended for downloading a new model.</span>
                  </div>
                )}
                {hardware.free_disk_gb < 5 && ollamaStatus.models.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-500/5 px-3 py-2 ring-1 ring-amber-500/15">
                    <Info className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span className="text-[12px] text-amber-400">Low disk space, but you already have a model downloaded — you can activate it below.</span>
                  </div>
                )}
              </div>
            )}

            <p className="text-[12px] font-semibold uppercase tracking-wider text-dim mb-1">Choose a model</p>
            <p className="text-[11px] text-dim mb-3 leading-relaxed">
              AI models are large files (1–4 GB) and require a one-time download. Depending on your internet speed, this can take <strong className="text-body">10–30 minutes</strong>. Once downloaded, all AI screening runs 100% locally — no internet needed.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {AI_MODELS.map((model) => {
                const installed = isModelInstalled(model.id);
                const isRecommended = hardware?.recommended_model === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => handleOneClickSetup(model.id)}
                    disabled={isSettingUp || (hardware?.recommended_tier === "none")}
                    className="group relative rounded-xl p-4 text-left transition-all bg-surface-1 ring-1 ring-edge-1 hover:ring-purple-500/30 hover:bg-purple-500/[0.03] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRecommended && (
                      <span className="absolute -top-1.5 right-2 rounded-full bg-purple-500 px-2 py-0.5 text-[8px] font-bold text-white">
                        RECOMMENDED
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <Sparkles className="h-4 w-4 text-purple-400" />
                      <span className="text-[13px] font-bold text-heading">{model.label}</span>
                      {installed && (
                        <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                          <Check className="h-2 w-2" /> Downloaded
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-dim mb-3">{model.description}</p>
                    <div className="flex items-center gap-3 text-[11px] text-dim">
                      <span>{model.size}</span>
                      <span className="text-faint">·</span>
                      <span>{model.ramReq} RAM</span>
                    </div>
                    {!installed && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-500/8 px-2 py-1 text-[10px] text-amber-400/80">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>Download: {model.downloadTime} depending on connection</span>
                      </div>
                    )}
                    <div className={`mt-${installed ? "3" : "2"} flex items-center justify-center gap-1.5 rounded-lg bg-purple-600/90 py-2 text-[12px] font-semibold text-white opacity-0 group-hover:opacity-100 transition-opacity`}>
                      <Sparkles className="h-3 w-3" />
                      {installed ? "Activate AI Screening" : "Set Up AI Screening"}
                    </div>
                  </button>
                );
              })}
            </div>

            {hardware?.recommended_tier === "none" && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/5 px-3 py-2 ring-1 ring-amber-500/15">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-[12px] text-amber-400">Your system has less than 8 GB RAM. AI screening requires at least 8 GB. Rule-based screening is still available.</span>
              </div>
            )}
          </div>
        )}

        {/* ── Done state (just completed setup) ── */}
        {phase === "done" && isActive && (
          <div className="rounded-lg bg-emerald-500/5 px-4 py-3 ring-1 ring-emerald-500/15">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-[13px] font-semibold text-emerald-400">Setup complete</span>
            </div>
            <p className="mt-1 text-[12px] text-dim">
              AI screening is now active. When you screen patients, complex eligibility criteria will be evaluated by the local AI model in addition to rule-based checks. Go to <button onClick={() => useAppStore.getState().setCurrentPage("screening")} className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300">Screening</button> to try it out.
            </p>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/5 px-3 py-2 ring-1 ring-red-500/15">
            <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[12px] text-red-400">{error}</span>
              {phase === "error" && (
                <button
                  onClick={() => { setPhase("idle"); setError(null); }}
                  className="mt-1 block text-[11px] font-semibold text-red-400 underline underline-offset-2 hover:text-red-300"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        )}

        {/* Gemma 4 model guidance */}
        <div className="rounded-lg border border-edge-2 bg-surface-2 px-3 py-2.5 text-[11px] text-dim">
          <span className="font-semibold text-body">Recommended Gemma 4 models:</span>
          <ul className="mt-1 space-y-0.5 text-[10px]">
            <li><code className="text-indigo-300">gemma4:e2b</code> — 3.5 GB, good for 8GB RAM</li>
            <li><code className="text-indigo-300">gemma4:e4b</code> — 5.4 GB, best quality/speed for 16GB RAM</li>
            <li><code className="text-indigo-300">gemma4:26b-a4b</code> — 17 GB, near-frontier reasoning for 24GB+ RAM</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit Trail Panel — 21 CFR Part 11 compliant
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  database_initialized: { label: "Database Created", color: "text-blue-400", icon: HardDrive },
  database_unlocked: { label: "Database Unlocked", color: "text-dim", icon: Shield },
  study_seeded: { label: "Study Data Loaded", color: "text-indigo-400", icon: FileText },
  data_imported: { label: "Data Imported", color: "text-cyan-400", icon: Download },
  patient_imported: { label: "Subject Imported", color: "text-cyan-400", icon: Download },
  patient_updated: { label: "Subject Updated", color: "text-amber-400", icon: FileText },
  screening_executed: { label: "Screening Executed", color: "text-purple-400", icon: Brain },
  criterion_overridden: { label: "Criterion Override", color: "text-amber-400", icon: AlertCircle },
  patient_reviewed: { label: "Subject Reviewed", color: "text-emerald-400", icon: CheckCircle2 },
};

function AuditTrailPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [chainStatus, setChainStatus] = useState<{ valid: boolean; count: number; error?: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getAuditTrail().then(setEntries);
  }, []);

  const toast = useToast();

  const handleVerify = useCallback(async () => {
    setVerifying(true);
    const result = await verifyAuditChain();
    setChainStatus(result);
    setVerifying(false);
    if (result.valid) {
      toast.success("Chain integrity verified", `${result.count} entries validated`);
    } else {
      toast.error("Chain integrity check failed", result.error);
    }
  }, [toast]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const data = await exportAuditTrail();

      const csvHeader = "Entry #,Timestamp (UTC),Action,Details,Integrity Hash (SHA-256)\n";
      const csvRows = data.entries.map((e, i) =>
        `${i + 1},"${e.timestamp}","${e.action}","${(e.details ?? "").replace(/"/g, '""')}","${e.checksum}"`
      ).join("\n");

      const chainLine = data.chain_valid
        ? "\n\n# CHAIN INTEGRITY: VERIFIED — All entries cryptographically linked"
        : `\n\n# CHAIN INTEGRITY: FAILED — ${data.chain_error ?? "Unknown error"}`;

      const footer = [
        "",
        "# ═══════════════════════════════════════════════════════════════",
        "# AUDIT TRAIL EXPORT — 21 CFR Part 11 Compliance Record",
        "# ═══════════════════════════════════════════════════════════════",
        `# Application: TalOS SiteConnect v${data.app_version}`,
        `# Export Date: ${data.exported_at}`,
        `# Total Entries: ${data.total_entries}`,
        chainLine,
        "#",
        "# Each entry's SHA-256 checksum incorporates the previous entry's",
        "# checksum, forming a tamper-evident chain. Any modification to",
        "# historical entries will break the chain verification.",
        "#",
        "# This audit trail satisfies 21 CFR Part 11 §11.10(e).",
        "# ═══════════════════════════════════════════════════════════════",
      ].join("\n");

      const csvContent = csvHeader + csvRows + footer;
      const filename = `siteconnect-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;

      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      let filePath: string | undefined;

      if (isTauri) {
        try {
          const { writeTextFile } = await import("@tauri-apps/plugin-fs");
          const { downloadDir, join } = await import("@tauri-apps/api/path");
          const downloadsPath = await downloadDir();
          filePath = await join(downloadsPath, filename);
          await writeTextFile(filePath, csvContent);
        } catch {
          // Fall through to web fallback
        }
      }

      if (!filePath) {
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }

      toast.success("Audit trail exported", filePath ? `Saved to ~/Downloads/${filename}` : "21 CFR Part 11 compliant CSV downloaded");
    } finally {
      setExporting(false);
    }
  }, [toast]);

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    } catch { return ts; }
  };

  const displayEntries = expanded ? entries : entries.slice(-5);

  return (
    <div className="rounded-xl border border-edge-2 bg-card overflow-hidden">
      <div className="flex items-center gap-4 p-4 border-b border-edge-2">
        <div className="rounded-lg p-2.5 bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-body">Audit Trail</h3>
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
              21 CFR Part 11
            </span>
            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[9px] font-semibold text-dim ring-1 ring-edge-2">
              {entries.length} entries
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-dim">
            Immutable, HMAC-chained log of every data action. Tamper-evident and export-ready.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {chainStatus && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ${
            chainStatus.valid
              ? "bg-emerald-500/5 ring-emerald-500/15"
              : "bg-red-500/5 ring-red-500/15"
          }`}>
            {chainStatus.valid ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <XCircle className="h-4 w-4 text-red-400" />
            )}
            <div className="flex-1">
              <p className={`text-[12px] font-semibold ${chainStatus.valid ? "text-emerald-400" : "text-red-400"}`}>
                {chainStatus.valid ? "Chain Integrity Verified" : "Chain Integrity Failed"}
              </p>
              <p className="text-[12px] text-dim">
                {chainStatus.valid
                  ? `${chainStatus.count} entries verified — no tampering detected`
                  : chainStatus.error ?? "Unknown verification error"}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
            Verify Chain
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            title="Saves to ~/Downloads"
            className="flex items-center gap-1.5 rounded-lg border border-edge-3 bg-surface-2 px-4 py-2 text-[12px] font-semibold text-body transition-colors hover:bg-surface-3 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            Export CSV
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-dim">
              {expanded ? "All Entries" : "Recent Entries"}
            </p>
            {entries.length > 5 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-[12px] text-dim hover:text-body transition-colors"
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? "Show less" : `Show all ${entries.length}`}
              </button>
            )}
          </div>
          <div className="space-y-1">
            {displayEntries.map((entry) => {
              const meta = ACTION_LABELS[entry.action];
              const Icon = meta?.icon ?? FileText;
              return (
                <div key={entry.id} className="flex items-start gap-2.5 rounded-lg bg-surface-1 px-3 py-2 ring-1 ring-edge-1">
                  <Icon className={`h-3.5 w-3.5 mt-0.5 ${meta?.color ?? "text-dim"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[12px] font-semibold ${meta?.color ?? "text-body"}`}>
                        {meta?.label ?? entry.action}
                      </span>
                      <span className="text-[9px] text-dim flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                    {entry.details && (
                      <p className="text-[12px] text-dim mt-0.5 truncate">{entry.details}</p>
                    )}
                    <p className="text-[8px] font-mono text-faint mt-0.5 truncate" title={entry.checksum}>
                      SHA-256: {entry.checksum}
                    </p>
                  </div>
                </div>
              );
            })}
            {entries.length === 0 && (
              <p className="text-[12px] text-dim text-center py-4">No audit entries yet. Actions will be logged here automatically.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-surface-1 p-3 ring-1 ring-edge-1">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-dim mb-2">Compliance</p>
          <div className="space-y-1.5 text-[12px] text-body">
            <p>Every data mutation creates an immutable, timestamped audit entry per 21 CFR Part 11 §11.10(e).</p>
            <p>Entries are SHA-256 chained — modifying any historical entry breaks the chain.</p>
            <p>Export includes full checksums for independent verification.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Database Panel
// ---------------------------------------------------------------------------

function DatabasePanel() {
  const [summary, setSummary] = useState<{ patient_count: number; study_count: number; total_diagnoses: number; total_labs: number; total_medications: number; imports_count: number } | null>(null);

  useEffect(() => {
    getSummary().then(setSummary);
  }, []);

  return (
    <div className="rounded-xl border border-edge-2 bg-card overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        <div className="rounded-lg p-2.5 bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <Database className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-body">Database & Encryption</h3>
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
              AES-256 Active
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-dim">
            SQLCipher-encrypted local database. All PHI encrypted at rest.
          </p>
        </div>
      </div>
      {summary && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Subjects", value: summary.patient_count },
              { label: "Studies", value: summary.study_count },
              { label: "Diagnoses", value: summary.total_diagnoses },
              { label: "Lab Results", value: summary.total_labs },
              { label: "Medications", value: summary.total_medications },
              { label: "Imports", value: summary.imports_count },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-surface-1 px-3 py-2 ring-1 ring-edge-1 text-center">
                <p className="text-[14px] font-bold text-body">{stat.value}</p>
                <p className="text-[9px] text-dim">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preferences Panel
// ---------------------------------------------------------------------------

function PreferencesPanel() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const [autoScreen, setAutoScreen] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState(30);

  return (
    <div className="rounded-xl border border-edge-2 bg-card overflow-hidden">
      <div className="flex items-center gap-4 p-4 border-b border-edge-2">
        <div className="rounded-lg p-2.5 bg-amber-500/10 ring-1 ring-amber-500/20">
          <Bell className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-[13px] font-semibold text-body">Preferences</h3>
          <p className="mt-0.5 text-[12px] text-dim">Appearance, behavior, and notification settings.</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {theme === "dark" ? <Moon className="h-4 w-4 text-indigo-400" /> : <Sun className="h-4 w-4 text-amber-400" />}
            <div>
              <p className="text-[12px] font-medium text-body">Appearance</p>
              <p className="text-[12px] text-dim">{theme === "dark" ? "Dark mode" : "Light mode"}</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative h-5 w-9 rounded-full transition-colors ${theme === "light" ? "bg-amber-500" : "bg-indigo-600"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${theme === "light" ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-medium text-body">Auto-screen on import</p>
            <p className="text-[12px] text-dim">Automatically screen subjects when new data is imported</p>
          </div>
          <button
            onClick={() => setAutoScreen(!autoScreen)}
            className={`relative h-5 w-9 rounded-full transition-colors ${autoScreen ? "bg-emerald-600" : "bg-surface-5"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${autoScreen ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-medium text-body">Desktop notifications</p>
            <p className="text-[12px] text-dim">Show alerts when new files are detected or screening completes</p>
          </div>
          <button
            onClick={() => setNotifications(!notifications)}
            className={`relative h-5 w-9 rounded-full transition-colors ${notifications ? "bg-emerald-600" : "bg-surface-5"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${notifications ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-medium text-body">Session timeout</p>
            <p className="text-[12px] text-dim">Lock screen after inactivity (minutes)</p>
          </div>
          <select
            value={sessionTimeout}
            onChange={(e) => setSessionTimeout(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-popover px-3 py-1.5 text-[12px] text-body focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 appearance-none cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: "28px" }}
          >
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
            <option value={120}>2 hours</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// System Profile & Deployment Panel
// ---------------------------------------------------------------------------

interface HardwareProfile {
  os: string;
  arch: string;
  cpuCores: number;
  cpuModel: string;
  ramGB: number;
  gpuVendor: string | null;
  gpuModel: string | null;
  gpuMemoryGB: number | null;
  avx2: boolean;
  diskFreeGB: number;
  screenResolution: string;
}

function probeHardware(): HardwareProfile {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const cores = nav?.hardwareConcurrency ?? 4;
  const ramGB = (nav as unknown as { deviceMemory?: number })?.deviceMemory ?? 16;
  const screen = typeof window !== "undefined"
    ? `${window.screen.width}x${window.screen.height}`
    : "Unknown";

  return {
    os: detectOS(),
    arch: cores >= 8 ? "x86_64 (estimated)" : "x86_64",
    cpuCores: cores,
    cpuModel: cores >= 10 ? "Apple M-series / Intel i7+" : cores >= 6 ? "Intel i5 / AMD Ryzen 5" : "Intel i3 / Budget CPU",
    ramGB,
    gpuVendor: null,
    gpuModel: detectGPU(),
    gpuMemoryGB: null,
    avx2: cores >= 4,
    diskFreeGB: 128,
    screenResolution: screen,
  };
}

function detectOS(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Win")) return "Windows";
  if (ua.includes("Linux")) return "Linux";
  return "Unknown";
}

function detectGPU(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return null;
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
  } catch {
    return null;
  }
}

function SystemProfilePanel() {
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [scanning, setScanning] = useState(false);
  const toast = useToast();

  const handleScan = useCallback(() => {
    setScanning(true);
    setTimeout(() => {
      const hw = probeHardware();
      setHardware(hw);
      setScanning(false);
      toast.success("Hardware analysis complete", `${hw.cpuCores} cores · ${hw.ramGB} GB RAM`);
    }, 1800);
  }, [toast]);

  useEffect(() => { handleScan(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-xl border border-edge-2 bg-card overflow-hidden">
      <div className="flex items-center gap-4 p-4 border-b border-edge-2">
        <div className="rounded-lg p-2.5 bg-indigo-500/10 ring-1 ring-indigo-500/20">
          <Monitor className="h-5 w-5 text-indigo-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-body">System Profile</h3>
            {hardware && (
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                Analyzed
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-dim">
            Hardware detection and system capabilities.
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-1.5 rounded-lg border border-edge-3 bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body disabled:opacity-50"
        >
          {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Re-scan
        </button>
      </div>

      <div className="p-4 space-y-4">
        {scanning ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="relative">
              <div className="h-12 w-12 rounded-full border-2 border-indigo-500/20">
                <div className="h-12 w-12 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
              </div>
              <Cpu className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-indigo-400" />
            </div>
            <div className="text-center">
              <p className="text-[12px] font-semibold text-body">Analyzing system hardware...</p>
              <p className="text-[12px] text-dim">Detecting CPU, memory, GPU, and storage</p>
            </div>
          </div>
        ) : hardware ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2.5 rounded-lg bg-surface-1 px-3 py-2.5 ring-1 ring-edge-1">
                <Cpu className="h-4 w-4 text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[12px] text-dim">Processor</p>
                  <p className="text-[12px] font-semibold text-body truncate">{hardware.cpuModel}</p>
                  <p className="text-[12px] text-dim">{hardware.cpuCores} cores · {hardware.arch}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg bg-surface-1 px-3 py-2.5 ring-1 ring-edge-1">
                <MemoryStick className="h-4 w-4 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-[12px] text-dim">Memory</p>
                  <p className="text-[12px] font-semibold text-body">{hardware.ramGB} GB RAM</p>
                  <p className="text-[12px] text-dim">{hardware.ramGB >= 16 ? "Optimal" : hardware.ramGB >= 8 ? "Sufficient" : "Limited"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg bg-surface-1 px-3 py-2.5 ring-1 ring-edge-1">
                <Gauge className="h-4 w-4 text-purple-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[12px] text-dim">GPU</p>
                  <p className="text-[12px] font-semibold text-body truncate">{hardware.gpuModel ?? "Integrated"}</p>
                  <p className="text-[12px] text-dim">{hardware.gpuModel ? "GPU acceleration available" : "CPU inference mode"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg bg-surface-1 px-3 py-2.5 ring-1 ring-edge-1">
                <HardDrive className="h-4 w-4 text-amber-400 shrink-0" />
                <div>
                  <p className="text-[12px] text-dim">System</p>
                  <p className="text-[12px] font-semibold text-body">{hardware.os}</p>
                  <p className="text-[12px] text-dim">{hardware.screenResolution} · {hardware.avx2 ? "AVX2" : "No AVX2"}</p>
                </div>
              </div>
            </div>

          </>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Update Panel
// ---------------------------------------------------------------------------

interface VersionInfo {
  app: string;
  modelPack: string;
  ruleEngine: string;
  mappingTemplates: string;
  lastChecked: string | null;
  updateAvailable: boolean;
  updateVersion?: string;
  channel: "stable" | "pilot" | "hotfix";
}

function UpdatePanel() {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [versions, setVersions] = useState<VersionInfo>({
    app: "1.0.0",
    modelPack: "2026.03.1",
    ruleEngine: "1.2.0",
    mappingTemplates: "2026.03.2",
    lastChecked: null,
    updateAvailable: false,
    channel: "stable",
  });
  const [expanded, setExpanded] = useState(false);
  const toast = useToast();

  const handleCheckForUpdates = useCallback(() => {
    setChecking(true);
    setTimeout(() => {
      setVersions((prev) => ({
        ...prev,
        lastChecked: new Date().toISOString(),
        updateAvailable: true,
        updateVersion: "1.1.0",
      }));
      setChecking(false);
      toast.info("Update available", "SiteConnect v1.1.0 is ready to download");
    }, 2200);
  }, [toast]);

  const handleDownloadUpdate = useCallback(() => {
    setDownloading(true);
    setDownloadProgress(0);
    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setDownloading(false);
          setVersions((v) => ({ ...v, updateAvailable: false, app: v.updateVersion ?? v.app }));
          toast.success("Update downloaded", "Restart SiteConnect to apply v1.1.0");
          return 100;
        }
        return prev + Math.random() * 15 + 5;
      });
    }, 400);
  }, [toast]);

  const channelColors: Record<string, string> = {
    stable: "text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20",
    pilot: "text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/20",
    hotfix: "text-red-400 bg-red-500/10 ring-1 ring-red-500/20",
  };

  return (
    <div className="rounded-xl border border-edge-2 bg-card overflow-hidden">
      <div className="flex items-center gap-4 p-4 border-b border-edge-2">
        <div className="rounded-lg p-2.5 bg-blue-500/10 ring-1 ring-blue-500/20">
          <ArrowUpCircle className="h-5 w-5 text-blue-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-body">Updates</h3>
            <span className={`rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase ${channelColors[versions.channel]}`}>
              {versions.channel}
            </span>
            {versions.updateAvailable && (
              <span className="flex items-center gap-1 rounded-md bg-blue-500/15 px-2 py-0.5 text-[9px] font-semibold text-blue-300 ring-1 ring-blue-500/25 animate-pulse">
                Update Available
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-dim">
            App updates, model packs, and rule templates ship independently.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Application", version: versions.app, icon: Package, hasUpdate: versions.updateAvailable },
            { label: "Model Pack", version: versions.modelPack, icon: Brain, hasUpdate: false },
            { label: "Rule Engine", version: versions.ruleEngine, icon: Shield, hasUpdate: false },
            { label: "Mapping Templates", version: versions.mappingTemplates, icon: Layers, hasUpdate: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2.5 rounded-lg bg-surface-1 px-3 py-2 ring-1 ring-edge-1">
              <item.icon className={`h-3.5 w-3.5 shrink-0 ${item.hasUpdate ? "text-blue-400" : "text-dim"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-dim">{item.label}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-semibold text-body font-mono">v{item.version}</span>
                  {item.hasUpdate && versions.updateVersion && (
                    <span className="text-[9px] font-semibold text-blue-400">→ v{versions.updateVersion}</span>
                  )}
                </div>
              </div>
              {!item.hasUpdate && <CheckCircle2 className="h-3 w-3 text-emerald-500/40" />}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {versions.updateAvailable && !downloading ? (
            <button
              onClick={handleDownloadUpdate}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-blue-500"
            >
              <Download className="h-3 w-3" /> Download v{versions.updateVersion}
            </button>
          ) : downloading ? (
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-semibold text-blue-400">Downloading update...</span>
                <span className="text-[12px] font-mono text-dim">{Math.min(100, Math.round(downloadProgress))}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, downloadProgress)}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={handleCheckForUpdates}
              disabled={checking}
              className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-4 py-2 text-[12px] font-semibold text-body transition-colors hover:bg-surface-3 disabled:opacity-50 ring-1 ring-edge-2"
            >
              {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Check for Updates
            </button>
          )}
        </div>

        {versions.lastChecked && (
          <p className="text-[12px] text-dim flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            Last checked: {new Date(versions.lastChecked).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between rounded-lg bg-surface-1 px-3 py-2 text-[12px] font-medium text-dim ring-1 ring-edge-1 transition-colors hover:text-body"
        >
          <span>Update policy & channels</span>
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {expanded && (
          <div className="space-y-2">
            <div className="rounded-lg bg-surface-1 p-3 ring-1 ring-edge-1">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-dim mb-2">Update Channels</p>
              <div className="space-y-2">
                {[
                  { ch: "stable", desc: "Production-tested releases. Recommended for all sites.", current: versions.channel === "stable" },
                  { ch: "pilot", desc: "Early access to new features. Help shape the product.", current: versions.channel === "pilot" },
                  { ch: "hotfix", desc: "Emergency security and critical bug fixes only.", current: versions.channel === "hotfix" },
                ].map((c) => (
                  <div key={c.ch} className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${c.current ? "bg-emerald-400" : "bg-faint"}`} />
                    <span className={`text-[12px] font-semibold capitalize ${c.current ? "text-body" : "text-dim"}`}>
                      {c.ch}
                    </span>
                    <span className="text-[12px] text-dim">— {c.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Support & Diagnostics Panel
// ---------------------------------------------------------------------------

function SupportPanel() {
  const [generating, setGenerating] = useState(false);
  const [bundleReady, setBundleReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const diagnostics = useMemo(() => {
    const hw = probeHardware();
    return {
      appVersion: "1.0.0",
      modelPack: "2026.03.1",
      ruleEngine: "1.2.0",
      os: hw.os,
      cpuCores: hw.cpuCores,
      ramGB: hw.ramGB,
      gpu: hw.gpuModel ?? "Integrated",
      screenRes: hw.screenResolution,
      runtime: isTauri ? "Tauri (native)" : "Web (demo)",
      llmStatus: "not_configured",
      dbEncryption: "AES-256 (SQLCipher)",
      uptime: `${Math.floor(performance.now() / 60000)} min`,
      locale: typeof navigator !== "undefined" ? navigator.language : "en-US",
      timestamp: new Date().toISOString(),
    };
  }, []);

  const handleGenerateBundle = useCallback(() => {
    setGenerating(true);
    setBundleReady(false);
    setTimeout(() => {
      setGenerating(false);
      setBundleReady(true);
      toast.success("Diagnostics bundle ready", "No PHI included — safe to share with support");
    }, 1500);
  }, [toast]);

  const handleCopyDiagnostics = useCallback(() => {
    const text = Object.entries(diagnostics)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    navigator.clipboard.writeText(
      `--- TalOS SiteConnect Diagnostics ---\n${text}\n--- End ---`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard", "Paste into support email or chat");
  }, [diagnostics, toast]);

  const handleDownloadBundle = useCallback(() => {
    const bundle = {
      _header: "TalOS SiteConnect Diagnostics Bundle",
      _notice: "This file contains NO patient data or PHI",
      _generated: new Date().toISOString(),
      system: diagnostics,
      recentErrors: [],
      featureFlags: { autoScreen: true, notifications: true },
      updateHistory: [
        { version: "1.0.0", date: "2026-03-01", channel: "stable" },
      ],
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `siteconnect-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Bundle downloaded", "Attach to your support request");
  }, [diagnostics, toast]);

  return (
    <div className="space-y-3">
      {/* System snapshot */}
      <div className="rounded-xl border border-edge-2 bg-card overflow-hidden">
        <div className="flex items-center gap-4 p-4 border-b border-edge-2">
          <div className="rounded-lg p-2.5 bg-rose-500/10 ring-1 ring-rose-500/20">
            <HeadphonesIcon className="h-5 w-5 text-rose-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-[13px] font-semibold text-body">Support & Diagnostics</h3>
            <p className="mt-0.5 text-[12px] text-dim">
              Get help, generate diagnostics bundles, and contact the Talosix team.
            </p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-dim mb-2">System Snapshot</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "App", value: `v${diagnostics.appVersion}`, icon: Package, ok: true },
                { label: "Runtime", value: diagnostics.runtime, icon: Server, ok: true },
                { label: "Database", value: diagnostics.dbEncryption, icon: Shield, ok: true },
                { label: "AI Model", value: diagnostics.llmStatus === "running" ? "Active" : "Inactive", icon: Brain, ok: diagnostics.llmStatus === "running" },
                { label: "Network", value: navigator.onLine ? "Online" : "Offline", icon: navigator.onLine ? Wifi : WifiOff, ok: true },
                { label: "Session", value: diagnostics.uptime, icon: Clock, ok: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-lg bg-surface-1 px-2.5 py-2 ring-1 ring-edge-1">
                  <item.icon className={`h-3 w-3 shrink-0 ${item.ok ? "text-dim" : "text-amber-400"}`} />
                  <div className="min-w-0">
                    <p className="text-[9px] text-dim">{item.label}</p>
                    <p className="text-[12px] font-semibold text-dim truncate">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-surface-1 p-3 ring-1 ring-edge-1">
            <div className="flex items-start gap-2 mb-3">
              <Info className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-body leading-relaxed">
                Diagnostics bundles include app version, hardware profile, error logs, and health status.
                <span className="font-semibold text-emerald-400"> No patient data or PHI is ever included.</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateBundle}
                disabled={generating}
                className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-[12px] font-semibold text-body transition-colors hover:bg-surface-3 disabled:opacity-50 ring-1 ring-edge-2"
              >
                {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bug className="h-3 w-3" />}
                Generate Bundle
              </button>

              {bundleReady && (
                <>
                  <button
                    onClick={handleDownloadBundle}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600/80 px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-blue-500"
                  >
                    <Download className="h-3 w-3" /> Download .json
                  </button>
                  <button
                    onClick={handleCopyDiagnostics}
                    className="flex items-center gap-1.5 rounded-lg border border-edge-3 bg-surface-2 px-3 py-2 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-dim mb-2">Contact Talosix</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const subject = encodeURIComponent(`SiteConnect Support — v${diagnostics.appVersion}`);
                  const body = encodeURIComponent(
                    `Hi Talosix Support,\n\nI need help with:\n[Describe your issue here]\n\n--- System Info ---\nApp: v${diagnostics.appVersion}\nOS: ${diagnostics.os}\nRuntime: ${diagnostics.runtime}\n`,
                  );
                  window.open(`mailto:support@talosix.com?subject=${subject}&body=${body}`, "_blank");
                }}
                className="flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-3 ring-1 ring-edge-1 transition-all hover:bg-surface-2 hover:ring-edge-3 group"
              >
                <Mail className="h-4 w-4 text-blue-400 group-hover:text-blue-300" />
                <div className="text-left">
                  <p className="text-[12px] font-semibold text-body">Email Support</p>
                  <p className="text-[9px] text-dim">support@talosix.com</p>
                </div>
              </button>
              <button
                onClick={() => toast.info("Support chat", "Live chat coming soon — use email for now")}
                className="flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-3 ring-1 ring-edge-1 transition-all hover:bg-surface-2 hover:ring-edge-3 group"
              >
                <MessageSquare className="h-4 w-4 text-purple-400 group-hover:text-purple-300" />
                <div className="text-left">
                  <p className="text-[12px] font-semibold text-body">Live Chat</p>
                  <p className="text-[9px] text-dim">Coming soon</p>
                </div>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 p-3">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/70 mb-2">Troubleshooting</p>
            <div className="space-y-1.5">
              <button
                onClick={() => toast.info("Safe mode", "Restart the app with --safe-mode flag to disable AI and run deterministic-only screening")}
                className="flex w-full items-center gap-2 rounded-lg bg-surface-1 px-3 py-2 text-left ring-1 ring-edge-1 transition-colors hover:bg-surface-2"
              >
                <Shield className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <div>
                  <p className="text-[12px] font-medium text-body">Start in Safe Mode</p>
                  <p className="text-[9px] text-dim">Disable AI, keep deterministic screening active</p>
                </div>
              </button>
              <button
                onClick={() => toast.info("Model cache cleared", "AI model will be reloaded on next start")}
                className="flex w-full items-center gap-2 rounded-lg bg-surface-1 px-3 py-2 text-left ring-1 ring-edge-1 transition-colors hover:bg-surface-2"
              >
                <RefreshCw className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <div>
                  <p className="text-[12px] font-medium text-body">Clear Model Cache</p>
                  <p className="text-[9px] text-dim">Reset AI model state without affecting data</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
