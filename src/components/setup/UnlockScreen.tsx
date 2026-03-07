import { useState, useCallback, useEffect } from "react";
import {
  Shield,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { unlockDatabase, getDatabasePath, revealDatabaseInFinder, deleteDatabaseFile } from "@/lib/tauri";

interface UnlockScreenProps {
  onUnlock: () => void;
}

export function UnlockScreen({ onUnlock }: UnlockScreenProps) {
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotInfo, setShowForgotInfo] = useState(false);
  const [dbPath, setDbPath] = useState("~/Library/Application Support/com.talosix.siteconnect/siteconnect.db");
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    getDatabasePath()
      .then((p) => { if (p) setDbPath(p); })
      .catch(() => { /* keep default */ });
  }, []);

  const handleRevealInFinder = useCallback(async () => {
    await revealDatabaseInFinder();
  }, []);

  const handleDeleteDatabase = useCallback(async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsDeleting(true);
    try {
      await deleteDatabaseFile();
      window.location.reload();
    } catch {
      setError("Failed to delete database file. Please delete it manually.");
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }, [confirmDelete]);

  const handleUnlock = useCallback(async () => {
    if (!passphrase) return;
    setError(null);
    setIsUnlocking(true);
    try {
      await unlockDatabase(passphrase);
      onUnlock();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Invalid passphrase";
      setError(message);
      setPassphrase("");
    } finally {
      setIsUnlocking(false);
    }
  }, [passphrase, onUnlock]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && passphrase) {
        handleUnlock();
      }
    },
    [passphrase, handleUnlock]
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="unlock-glow absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Branding — compact */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center">
            <div className="unlock-logo flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
              <img src="/t6logo.png" alt="Talosix" className="h-12 w-12 object-contain" />
            </div>
          </div>
          <h1 className="mb-1 text-xl font-bold tracking-tight text-white">
            TalOS SiteConnect
          </h1>
          <p className="text-sm text-slate-500">
            Enter your passphrase to unlock
          </p>
        </div>

        {/* Unlock Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm">
          {/* Passphrase Input */}
          <div className="mb-4">
            <div className="relative">
              <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
                <Lock className="h-4 w-4 text-slate-500" />
              </div>
              <input
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Passphrase"
                className={`w-full rounded-lg border bg-slate-800/50 py-3 pl-10 pr-11 text-sm text-white placeholder-slate-500 transition-colors focus:outline-none focus:ring-1 ${
                  error
                    ? "border-red-500/50 focus:border-red-500/50 focus:ring-red-500/30"
                    : "border-slate-700 focus:border-slate-500 focus:ring-slate-500/30"
                }`}
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                tabIndex={-1}
              >
                {showPassphrase ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Unlock Button */}
          <button
            onClick={handleUnlock}
            disabled={!passphrase || isUnlocking}
            className="w-full rounded-lg bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
          >
            {isUnlocking ? (
              <span className="flex items-center justify-center gap-2">
                <span className="unlock-spinner h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-800" />
                Unlocking...
              </span>
            ) : (
              "Unlock"
            )}
          </button>

          {/* Forgot Passphrase */}
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowForgotInfo(!showForgotInfo)}
              className="text-xs text-slate-500 transition-colors hover:text-slate-400"
            >
              Forgot passphrase?
            </button>
          </div>

          {showForgotInfo && (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500/70" />
                  <div className="text-xs leading-relaxed text-slate-400">
                    <p className="mb-1 font-medium text-amber-400/90">
                      Data cannot be recovered
                    </p>
                    <p>
                      Your passphrase is the sole encryption key. Without it, the
                      database cannot be decrypted. To start fresh, delete the
                      database file below.
                    </p>
                  </div>
                </div>
              </div>

              {/* Database location */}
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-4 py-3">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Database location
                </p>
                <p className="break-all font-mono text-[11px] leading-relaxed text-slate-400">
                  {dbPath}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={handleRevealInFinder}
                    className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-700"
                  >
                    <FolderOpen className="h-3 w-3" />
                    Show in Finder
                  </button>
                  <button
                    onClick={handleDeleteDatabase}
                    disabled={isDeleting}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      confirmDelete
                        ? "border-red-500/50 bg-red-500/20 text-red-300 hover:bg-red-500/30"
                        : "border-slate-700 bg-slate-800 text-slate-300 hover:border-red-500/30 hover:text-red-300"
                    }`}
                  >
                    <Trash2 className="h-3 w-3" />
                    {isDeleting
                      ? "Deleting..."
                      : confirmDelete
                        ? "Confirm Delete"
                        : "Delete & Reset"}
                  </button>
                </div>
                {confirmDelete && (
                  <p className="mt-2 text-[10px] text-red-400/80">
                    This will permanently delete all patient data. Click again to confirm.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-600">
          TalOS SiteConnect v0.1.0
        </p>
      </div>

      <style>{`
        .unlock-glow {
          animation: unlock-pulse 6s ease-in-out infinite alternate;
        }
        @keyframes unlock-pulse {
          0% { opacity: 0.3; }
          100% { opacity: 0.6; }
        }
        .unlock-logo {
          animation: unlock-breathe 4s ease-in-out infinite;
        }
        @keyframes unlock-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        .unlock-spinner {
          animation: unlock-spin 0.8s linear infinite;
        }
        @keyframes unlock-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
