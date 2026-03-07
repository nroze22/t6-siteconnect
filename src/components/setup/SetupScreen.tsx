import { useState, useCallback, useMemo } from "react";
import {
  Lock,
  Database,
  Cpu,
  Shield,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { initializeDatabase } from "@/lib/tauri";

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  width: string;
}

function evaluateStrength(passphrase: string): PasswordStrength {
  if (!passphrase) {
    return { score: 0, label: "", color: "bg-slate-700", width: "w-0" };
  }

  let score = 0;

  // Length scoring
  if (passphrase.length >= 12) score += 1;
  if (passphrase.length >= 16) score += 1;
  if (passphrase.length >= 24) score += 1;

  // Character class scoring
  if (/[a-z]/.test(passphrase)) score += 1;
  if (/[A-Z]/.test(passphrase)) score += 1;
  if (/[0-9]/.test(passphrase)) score += 1;
  if (/[^a-zA-Z0-9]/.test(passphrase)) score += 1;

  if (score <= 2) {
    return { score, label: "Weak", color: "bg-red-500", width: "w-1/4" };
  }
  if (score <= 4) {
    return { score, label: "Fair", color: "bg-amber-500", width: "w-2/4" };
  }
  if (score <= 5) {
    return { score, label: "Strong", color: "bg-emerald-500", width: "w-3/4" };
  }
  return { score, label: "Excellent", color: "bg-emerald-400", width: "w-full" };
}

interface SetupScreenProps {
  onComplete: () => void;
}

export function SetupScreen({ onComplete }: SetupScreenProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => evaluateStrength(passphrase), [passphrase]);

  const isValid = useMemo(() => {
    return (
      passphrase.length >= 12 &&
      passphrase === confirmPassphrase &&
      strength.score >= 3
    );
  }, [passphrase, confirmPassphrase, strength.score]);

  const mismatch =
    confirmPassphrase.length > 0 && passphrase !== confirmPassphrase;

  const handleInitialize = useCallback(async () => {
    if (!isValid) return;
    setError(null);
    setIsInitializing(true);
    try {
      await initializeDatabase(passphrase);
      onComplete();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to initialize database";
      setError(message);
    } finally {
      setIsInitializing(false);
    }
  }, [isValid, passphrase, onComplete]);

  return (
    <div className="setup-screen flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="setup-glow absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="setup-glow-secondary absolute right-1/4 bottom-1/4 h-[400px] w-[400px] rounded-full bg-sky-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Branding */}
        <div className="mb-10 text-center">
          <div className="mb-6 flex items-center justify-center gap-3">
            <div className="setup-logo-ring flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 overflow-hidden">
              <img src="/t6logo.png" alt="Talosix" className="h-12 w-12 object-contain" />
            </div>
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">
            Welcome to TalOS SiteConnect
          </h1>
          <p className="text-base text-slate-400">
            On-premise clinical trial screening, powered by AI
          </p>
        </div>

        {/* Value Props */}
        <div className="mb-8 grid grid-cols-3 gap-3">
          <ValueProp
            icon={<Cpu className="h-4 w-4" />}
            label="100% Offline"
          />
          <ValueProp
            icon={<Lock className="h-4 w-4" />}
            label="AES-256 Encrypted"
          />
          <ValueProp
            icon={<Shield className="h-4 w-4" />}
            label="HIPAA Compliant"
          />
        </div>

        {/* Setup Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-black/20 backdrop-blur-sm">
          <div className="mb-6">
            <div className="mb-1 flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Create Encryption Key
              </h2>
            </div>
            <p className="text-sm text-slate-500">
              Choose a strong passphrase to encrypt your local database.
            </p>
          </div>

          {/* Passphrase Input */}
          <div className="mb-4">
            <label
              htmlFor="passphrase"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Passphrase
            </label>
            <div className="relative">
              <input
                id="passphrase"
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Minimum 12 characters"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 pr-11 text-sm text-white placeholder-slate-500 transition-colors focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                autoFocus
                autoComplete="new-password"
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

            {/* Strength Indicator */}
            {passphrase.length > 0 && (
              <div className="mt-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${strength.color} ${strength.width}`}
                  />
                </div>
                <p
                  className={`mt-1 text-xs ${
                    strength.score <= 2
                      ? "text-red-400"
                      : strength.score <= 4
                        ? "text-amber-400"
                        : "text-emerald-400"
                  }`}
                >
                  {strength.label}
                  {passphrase.length < 12 && (
                    <span className="text-slate-500">
                      {" "}
                      &mdash; {12 - passphrase.length} more characters needed
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Confirm Passphrase */}
          <div className="mb-6">
            <label
              htmlFor="confirm-passphrase"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Confirm Passphrase
            </label>
            <div className="relative">
              <input
                id="confirm-passphrase"
                type={showConfirm ? "text" : "password"}
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder="Re-enter your passphrase"
                className={`w-full rounded-lg border bg-slate-800/50 px-4 py-3 pr-11 text-sm text-white placeholder-slate-500 transition-colors focus:outline-none focus:ring-1 ${
                  mismatch
                    ? "border-red-500/50 focus:border-red-500/50 focus:ring-red-500/30"
                    : confirmPassphrase && passphrase === confirmPassphrase
                      ? "border-emerald-500/50 focus:border-emerald-500/50 focus:ring-emerald-500/30"
                      : "border-slate-700 focus:border-emerald-500/50 focus:ring-emerald-500/30"
                }`}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                tabIndex={-1}
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {mismatch && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-400">
                <AlertTriangle className="h-3 w-3" />
                Passphrases do not match
              </p>
            )}
            {confirmPassphrase && passphrase === confirmPassphrase && (
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Passphrases match
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Initialize Button */}
          <button
            onClick={handleInitialize}
            disabled={!isValid || isInitializing}
            className="setup-button relative w-full overflow-hidden rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:from-emerald-500 hover:to-emerald-400 hover:shadow-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:from-emerald-600 disabled:hover:to-emerald-500"
          >
            {isInitializing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="setup-spinner h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
                Initializing Database...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Database className="h-4 w-4" />
                Initialize Database
              </span>
            )}
          </button>

          {/* Security Note */}
          <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-800/50 px-4 py-3">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
            <p className="text-xs leading-relaxed text-slate-500">
              All data is encrypted with AES-256 and never leaves this device.
              Your passphrase is the only way to access your data — there is no
              recovery mechanism by design.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-600">
          TalOS SiteConnect v0.1.0
        </p>
      </div>

      <style>{`
        .setup-glow {
          animation: setup-pulse 8s ease-in-out infinite alternate;
        }
        .setup-glow-secondary {
          animation: setup-pulse 10s ease-in-out infinite alternate-reverse;
        }
        @keyframes setup-pulse {
          0% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.15); }
        }
        .setup-logo-ring {
          animation: setup-ring-glow 4s ease-in-out infinite alternate;
        }
        @keyframes setup-ring-glow {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 20px 2px rgba(16, 185, 129, 0.1); }
        }
        .setup-spinner {
          animation: setup-spin 0.8s linear infinite;
        }
        @keyframes setup-spin {
          to { transform: rotate(360deg); }
        }
        .setup-button:not(:disabled)::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%);
          transform: translateX(-100%);
          animation: setup-shimmer 3s ease-in-out infinite;
        }
        @keyframes setup-shimmer {
          0% { transform: translateX(-100%); }
          40% { transform: translateX(100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

function ValueProp({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-4 text-center">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
        {icon}
      </div>
      <span className="text-xs font-medium text-slate-400">{label}</span>
    </div>
  );
}
