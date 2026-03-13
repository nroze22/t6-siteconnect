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
  ShieldAlert,
  Copy,
  Check,
  KeyRound,
  ArrowRight,
  Brain,
  FileUp,
  TrendingUp,
  FlaskConical,
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
  const [setupPhase, setSetupPhase] = useState<"intro" | "create">("intro");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeySaveConfirm, setShowKeySaveConfirm] = useState(false);
  const [keyConfirmStep, setKeyConfirmStep] = useState(0);
  const [confirmText, setConfirmText] = useState("");
  const [checklist, setChecklist] = useState([false, false, false]);
  const [showKeyInModal, setShowKeyInModal] = useState(false);
  const [copied, setCopied] = useState(false);

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
      setShowKeySaveConfirm(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to initialize database";
      setError(message);
    } finally {
      setIsInitializing(false);
    }
  }, [isValid, passphrase]);

  const handleCopyKey = useCallback(async () => {
    await navigator.clipboard.writeText(passphrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [passphrase]);

  const handleChecklistToggle = useCallback((index: number) => {
    setChecklist((prev) => {
      const next = [...prev];
      const item = next[index];
      if (item !== undefined) {
        next[index] = !item;
      }
      return next;
    });
  }, []);

  const allChecked = checklist.every(Boolean);

  const handleFinalConfirm = useCallback(() => {
    if (confirmText === "I SAVED MY KEY") {
      onComplete();
    }
  }, [confirmText, onComplete]);

  // ── Intro welcome slide ──
  if (setupPhase === "intro") {
    return (
      <div className="setup-screen flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="setup-glow absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/5 blur-3xl" />
          <div className="setup-glow-secondary absolute right-1/4 bottom-1/4 h-[400px] w-[400px] rounded-full bg-cyan-500/5 blur-3xl" />
        </div>

        <div className="intro-fade-in relative z-10 w-full max-w-xl">
          {/* Logo + title */}
          <div className="mb-10 text-center">
            <div className="mb-6 flex items-center justify-center">
              <div className="setup-logo-ring flex h-20 w-20 items-center justify-center rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-600 to-blue-700 shadow-xl shadow-indigo-500/20 overflow-hidden">
                <img src="/t6logo.png" alt="Talosix" className="h-14 w-14 object-contain" />
              </div>
            </div>
            <h1 className="mb-2 text-4xl font-bold tracking-tight text-heading">
              TalOS SiteConnect
            </h1>
            <p className="text-lg text-dim">
              The intelligent screening platform for research sites
            </p>
          </div>

          {/* Feature highlights */}
          <div className="mb-8 grid grid-cols-2 gap-3">
            {[
              { icon: <Brain className="h-5 w-5 text-indigo-400" />, bg: "bg-indigo-500/10 ring-1 ring-indigo-500/20", title: "AI-Powered Screening", desc: "Screen every patient against every active study in seconds" },
              { icon: <FlaskConical className="h-5 w-5 text-blue-400" />, bg: "bg-blue-500/10 ring-1 ring-blue-500/20", title: "Trial Discovery", desc: "Revenue intelligence and protocol feasibility analysis" },
              { icon: <TrendingUp className="h-5 w-5 text-emerald-400" />, bg: "bg-emerald-500/10 ring-1 ring-emerald-500/20", title: "Site Intelligence", desc: "Performance metrics, diversity dashboards, and enrollment forecasting" },
              { icon: <FileUp className="h-5 w-5 text-cyan-400" />, bg: "bg-cyan-500/10 ring-1 ring-cyan-500/20", title: "EMR Integration", desc: "Import from Epic, Cerner, or any EMR via CSV, FHIR, or HL7" },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-3 rounded-xl bg-surface-1 p-4 ring-1 ring-edge-2">
                <div className={`flex-shrink-0 rounded-lg p-2 ${f.bg}`}>{f.icon}</div>
                <div>
                  <span className="text-[13px] font-semibold text-body block">{f.title}</span>
                  <span className="text-[12px] text-dim leading-relaxed block mt-0.5">{f.desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Stats row */}
          <div className="mb-8 grid grid-cols-3 gap-3">
            {[
              { value: "100%", label: "On-Premise", sub: "Zero cloud exposure", color: "text-emerald-400" },
              { value: "10x", label: "Faster Screening", sub: "vs. manual chart review", color: "text-blue-400" },
              { value: "AES-256", label: "Encrypted", sub: "HIPAA-ready", color: "text-indigo-400" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-surface-2 p-3.5 text-center ring-1 ring-edge-2">
                <span className={`text-[18px] font-bold ${stat.color}`}>{stat.value}</span>
                <p className="text-[12px] font-semibold text-body mt-0.5">{stat.label}</p>
                <p className="text-[9px] text-dim">{stat.sub}</p>
              </div>
            ))}
          </div>

          {/* Security banner */}
          <div className="mb-8 flex items-center gap-3 rounded-xl bg-emerald-500/5 px-5 py-3.5 ring-1 ring-emerald-500/15">
            <Shield className="h-5 w-5 text-emerald-400 flex-shrink-0" />
            <p className="text-[12px] text-emerald-400/90 leading-relaxed">
              <span className="font-semibold">HIPAA-ready architecture.</span> All patient data stays encrypted on this device. No PHI ever leaves your machine.
            </p>
          </div>

          {/* CTA button */}
          <button
            onClick={() => setSetupPhase("create")}
            className="setup-button relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 text-[15px] font-bold text-heading shadow-lg shadow-indigo-500/25 transition-all hover:from-indigo-500 hover:to-indigo-400 hover:shadow-indigo-500/35"
          >
            <span className="flex items-center justify-center gap-2.5">
              Get Started
              <ArrowRight className="h-5 w-5" />
            </span>
          </button>

          <p className="mt-5 text-center text-xs text-dim">
            TalOS SiteConnect v0.1.0 &mdash; by Talosix
          </p>
        </div>

        <style>{`
          .setup-glow { animation: setup-pulse 8s ease-in-out infinite alternate; }
          .setup-glow-secondary { animation: setup-pulse 10s ease-in-out infinite alternate-reverse; }
          @keyframes setup-pulse {
            0% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.15); }
          }
          .setup-logo-ring { animation: setup-ring-glow 4s ease-in-out infinite alternate; }
          @keyframes setup-ring-glow {
            0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
            100% { box-shadow: 0 0 30px 4px rgba(99, 102, 241, 0.15); }
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
          .intro-fade-in {
            animation: intro-enter 0.6s ease-out both;
          }
          @keyframes intro-enter {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  // ── Key creation phase ──
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
            <div className="setup-logo-ring flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-600 to-blue-700 shadow-lg shadow-indigo-500/20 overflow-hidden">
              <img src="/t6logo.png" alt="Talosix" className="h-12 w-12 object-contain" />
            </div>
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-heading">
            Create Your Encryption Key
          </h1>
          <p className="text-base text-dim">
            This key protects all data on this device
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
              <Database className="h-4 w-4 text-dim" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-body">
                Create Encryption Key
              </h2>
            </div>
            <p className="text-sm text-dim">
              Choose a strong passphrase to encrypt your local database.
            </p>
          </div>

          {/* Passphrase Input */}
          <div className="mb-4">
            <label
              htmlFor="passphrase"
              className="mb-1.5 block text-sm font-medium text-body"
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
                className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 pr-11 text-sm text-heading placeholder-dim transition-colors focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                autoFocus
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dim transition-colors hover:text-body"
                tabIndex={-1}
              >
                {showPassphrase ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Strength Indicator — always rendered to prevent shift */}
            <div className={`mt-2 transition-opacity duration-200 ${passphrase.length > 0 ? "opacity-100" : "opacity-0"}`}>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${strength.color} ${strength.width}`}
                />
              </div>
              <p
                className={`mt-1 h-4 text-xs ${
                  strength.score <= 2
                    ? "text-red-400"
                    : strength.score <= 4
                      ? "text-amber-400"
                      : "text-emerald-400"
                }`}
              >
                {passphrase.length > 0 && (
                  <>
                    {strength.label}
                    {passphrase.length < 12 && (
                      <span className="text-dim">
                        {" "}
                        &mdash; {12 - passphrase.length} more characters needed
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Confirm Passphrase */}
          <div className="mb-6">
            <label
              htmlFor="confirm-passphrase"
              className="mb-1.5 block text-sm font-medium text-body"
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
                className={`w-full rounded-lg border bg-slate-800/50 px-4 py-3 pr-11 text-sm text-heading placeholder-dim transition-colors focus:outline-none focus:ring-1 ${
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dim transition-colors hover:text-body"
                tabIndex={-1}
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {/* Fixed-height slot for match/mismatch to prevent layout shift */}
            <div className="mt-1 h-5">
              {mismatch && (
                <p className="flex items-center gap-1 text-xs text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  Passphrases do not match
                </p>
              )}
              {confirmPassphrase && passphrase === confirmPassphrase && (
                <p className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Passphrases match
                </p>
              )}
            </div>
          </div>

          {/* Error — animated to prevent layout shift */}
          <div className={`overflow-hidden transition-all duration-200 ease-out ${error ? "mb-4 max-h-20 opacity-100" : "max-h-0 opacity-0"}`}>
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          </div>

          {/* Initialize Button */}
          <button
            onClick={handleInitialize}
            disabled={!isValid || isInitializing}
            className="setup-button relative w-full overflow-hidden rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-3 text-sm font-semibold text-heading shadow-lg shadow-emerald-500/20 transition-all hover:from-emerald-500 hover:to-emerald-400 hover:shadow-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:from-emerald-600 disabled:hover:to-emerald-500"
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
            <p className="text-xs leading-relaxed text-dim">
              All data is encrypted with AES-256 and never leaves this device.
              Your passphrase is the only way to access your data — there is no
              recovery mechanism by design.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-dim">
          TalOS SiteConnect v0.1.0
        </p>
      </div>

      {/* Key Save Confirmation Modal */}
      {showKeySaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="keysave-modal-enter relative w-full max-w-lg mx-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/40">
            {keyConfirmStep === 0 ? (
              <>
                {/* Amber gradient header */}
                <div className="bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-b border-amber-500/20 px-8 py-6 text-center">
                  <div className="mb-3 flex justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 ring-2 ring-amber-500/30">
                      <ShieldAlert className="h-7 w-7 text-amber-400" />
                    </div>
                  </div>
                  <h2 className="text-xl font-bold text-heading">
                    Save Your Encryption Key
                  </h2>
                  <p className="mt-1.5 text-sm text-amber-200/70">
                    This is the <span className="font-semibold text-amber-200">ONLY</span> way to access your data. There is no recovery.
                  </p>
                </div>

                <div className="px-8 py-6 space-y-5">
                  {/* Passphrase display */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-dim">
                      Your Encryption Key
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3">
                          <KeyRound className="h-4 w-4 shrink-0 text-amber-400" />
                          <code className="flex-1 text-sm font-mono text-heading break-all">
                            {showKeyInModal
                              ? passphrase
                              : "\u2022".repeat(Math.min(passphrase.length, 32))}
                          </code>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowKeyInModal(!showKeyInModal)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-dim transition-colors hover:bg-slate-700 hover:text-heading"
                        title={showKeyInModal ? "Hide key" : "Reveal key"}
                      >
                        {showKeyInModal ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyKey}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-dim transition-colors hover:bg-slate-700 hover:text-heading"
                        title="Copy to clipboard"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Warning box */}
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <p className="text-xs leading-relaxed text-amber-200/80">
                        This passphrase works like a cryptocurrency wallet key.
                        If you lose it, your data is permanently inaccessible.
                        No one — not even Talosix — can recover it.
                      </p>
                    </div>
                  </div>

                  {/* Checklist */}
                  <div className="space-y-2.5">
                    {[
                      "I have written down or securely stored my encryption key",
                      "I understand there is no password recovery option",
                      "I understand losing this key means permanent data loss",
                    ].map((text, i) => (
                      <label
                        key={i}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 bg-slate-800/30 px-4 py-3 transition-colors hover:bg-slate-800/60"
                      >
                        <div className="relative mt-0.5 flex shrink-0">
                          <input
                            type="checkbox"
                            checked={checklist[i] ?? false}
                            onChange={() => handleChecklistToggle(i)}
                            className="sr-only"
                          />
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                              checklist[i]
                                ? "border-emerald-500 bg-emerald-500"
                                : "border-slate-600 bg-slate-800"
                            }`}
                          >
                            {checklist[i] && (
                              <Check className="h-3.5 w-3.5 text-heading" />
                            )}
                          </div>
                        </div>
                        <span className="text-sm text-body">{text}</span>
                      </label>
                    ))}
                  </div>

                  {/* Proceed button */}
                  <button
                    onClick={() => setKeyConfirmStep(1)}
                    disabled={!allChecked}
                    className="w-full rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 px-6 py-3 text-sm font-semibold text-heading shadow-lg shadow-amber-500/20 transition-all hover:from-amber-500 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <ShieldAlert className="h-4 w-4" />
                      I&apos;ve Saved My Key
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Red/amber gradient header for final confirmation */}
                <div className="bg-gradient-to-r from-red-600/20 to-amber-600/20 border-b border-red-500/20 px-8 py-6 text-center">
                  <div className="mb-3 flex justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 ring-2 ring-red-500/30">
                      <KeyRound className="h-7 w-7 text-red-400" />
                    </div>
                  </div>
                  <h2 className="text-xl font-bold text-heading">
                    Final Confirmation
                  </h2>
                  <p className="mt-1.5 text-sm text-red-200/70">
                    Type the confirmation phrase to complete setup
                  </p>
                </div>

                <div className="px-8 py-6 space-y-5">
                  <div>
                    <label
                      htmlFor="confirm-key-text"
                      className="mb-2 block text-sm text-body"
                    >
                      Type{" "}
                      <span className="font-mono font-semibold text-amber-400">
                        I SAVED MY KEY
                      </span>{" "}
                      to confirm
                    </label>
                    <input
                      id="confirm-key-text"
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="I SAVED MY KEY"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-heading placeholder-dim transition-colors focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30 font-mono tracking-wide"
                      autoFocus
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {/* Fixed-height slot for validation message */}
                    <div className="mt-1.5 h-4">
                      {confirmText.length > 0 &&
                        confirmText !== "I SAVED MY KEY" && (
                          <p className="text-xs text-red-400">
                            Text does not match. Please type exactly: I SAVED MY
                            KEY
                          </p>
                        )}
                    </div>
                  </div>

                  <button
                    onClick={handleFinalConfirm}
                    disabled={confirmText !== "I SAVED MY KEY"}
                    className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-3 text-sm font-semibold text-heading shadow-lg shadow-emerald-500/20 transition-all hover:from-emerald-500 hover:to-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Complete Setup
                    </span>
                  </button>

                  <p className="text-center text-xs text-dim">
                    You can change your passphrase later from Settings if
                    needed.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
        .keysave-modal-enter {
          animation: keysave-enter 0.3s ease-out;
        }
        @keyframes keysave-enter {
          0% { opacity: 0; transform: scale(0.95) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
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
      <span className="text-xs font-medium text-dim">{label}</span>
    </div>
  );
}
