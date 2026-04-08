import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  HeartPulse,
  Loader2,
  Plus,
  Plug,
  PlugZap,
  Trash2,
  X,
} from "lucide-react";
import { CohortPullDialog } from "./CohortPullDialog";
import {
  listEpicConnections,
  upsertEpicConnection,
  deleteEpicConnection,
  testEpicConnection,
  connectEpicConnection,
  disconnectEpicConnection,
  generateEpicKeypair,
  getEpicPublicJwk,
  connectEpicBackendServices,
  type EpicConnection,
  type UpsertEpicConnectionInput,
} from "@/lib/tauri";
import { useToast } from "@/components/ui/Toast";

/**
 * Phase-1 Settings panel for managing per-site Epic / FHIR connection
 * profiles. CRUD only — the actual SMART OAuth flow + FHIR client land
 * in Phase 1B. The "Test connection" button surfaces an honest "pending"
 * status until the wire-level integration is in place.
 */
export function EpicConnectionsPanel() {
  const [connections, setConnections] = useState<EpicConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EpicConnection | "new" | null>(null);
  const [pullingFor, setPullingFor] = useState<EpicConnection | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listEpicConnections();
      setConnections(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSave = useCallback(
    async (input: UpsertEpicConnectionInput) => {
      try {
        await upsertEpicConnection(input);
        toast.success(
          input.id ? "Connection updated" : "Connection added",
          input.site_label,
        );
        setEditing(null);
        await refresh();
      } catch (err) {
        toast.error("Save failed", err instanceof Error ? err.message : String(err));
      }
    },
    [toast, refresh],
  );

  const handleDelete = useCallback(
    async (conn: EpicConnection) => {
      if (
        !window.confirm(
          `Remove the Epic connection profile for "${conn.site_label}"? This does not affect the Epic instance itself.`,
        )
      ) {
        return;
      }
      setBusyId(conn.id);
      try {
        await deleteEpicConnection(conn.id);
        toast.success("Connection removed", conn.site_label);
        await refresh();
      } catch (err) {
        toast.error("Delete failed", err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [toast, refresh],
  );

  const handleTest = useCallback(
    async (conn: EpicConnection) => {
      setBusyId(conn.id);
      try {
        const result = await testEpicConnection(conn.id);
        if (result.ok) {
          toast.success(
            "Connection live",
            `${result.software ?? "FHIR server"} — ${result.supported_resources.length} resources`,
          );
        } else {
          toast.error("Test failed", result.message);
        }
        await refresh();
      } catch (err) {
        toast.error("Test failed", err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [toast, refresh],
  );

  const handleConnect = useCallback(
    async (conn: EpicConnection) => {
      if (!conn.client_id?.trim()) {
        toast.error(
          "Client ID missing",
          "Add the client_id from your Epic vendor registration before connecting.",
        );
        return;
      }
      setBusyId(conn.id);
      try {
        const result =
          conn.auth_mode === "backend_services"
            ? await connectEpicBackendServices(conn.id)
            : await connectEpicConnection(conn.id);
        toast.success(
          "Connected to Epic",
          `${result.software ?? "FHIR server"} — ${result.supported_resources.length} resources`,
        );
        await refresh();
      } catch (err) {
        toast.error("Connection failed", err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [toast, refresh],
  );

  const handleGenerateKeypair = useCallback(
    async (conn: EpicConnection) => {
      setBusyId(conn.id);
      try {
        const jwks = await generateEpicKeypair(conn.id);
        const jwksJson = JSON.stringify(jwks, null, 2);
        await navigator.clipboard.writeText(jwksJson);
        toast.success(
          "Keypair generated — JWKS copied",
          "Paste this into your Epic vendor configuration. The private key is stored securely in the OS keychain.",
        );
        await refresh();
      } catch (err) {
        toast.error("Keypair failed", err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [toast, refresh],
  );

  const handleCopyJwk = useCallback(
    async (conn: EpicConnection) => {
      try {
        const jwks = await getEpicPublicJwk(conn.id);
        if (!jwks) {
          toast.warning("No keypair", "Generate a keypair first.");
          return;
        }
        await navigator.clipboard.writeText(JSON.stringify(jwks, null, 2));
        toast.success("JWKS copied to clipboard", "Paste into your Epic vendor configuration.");
      } catch (err) {
        toast.error("Copy failed", err instanceof Error ? err.message : String(err));
      }
    },
    [toast],
  );

  const handleDisconnect = useCallback(
    async (conn: EpicConnection) => {
      if (
        !window.confirm(
          `Disconnect "${conn.site_label}"? Stored tokens will be removed; the connection profile stays.`,
        )
      ) {
        return;
      }
      setBusyId(conn.id);
      try {
        await disconnectEpicConnection(conn.id);
        toast.success("Disconnected", conn.site_label);
        await refresh();
      } catch (err) {
        toast.error("Disconnect failed", err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [toast, refresh],
  );

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 ring-1 ring-rose-400/25">
            <HeartPulse className="h-4 w-4 text-rose-300" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-heading">Epic / FHIR connections</h3>
            <p className="mt-0.5 text-[11px] text-dim">
              Per-site SMART on FHIR connection profiles. Each Epic instance is its own OAuth server, so every site needs its own profile.
            </p>
          </div>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400"
        >
          <Plus className="h-3.5 w-3.5" />
          Add site
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-dim">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading connections…
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && connections.length === 0 && (
          <EmptyState onAdd={() => setEditing("new")} />
        )}

        {!loading && !error && connections.length > 0 && (
          <ul className="space-y-2">
            {connections.map((conn) => (
              <ConnectionRow
                key={conn.id}
                conn={conn}
                busy={busyId === conn.id}
                onEdit={() => setEditing(conn)}
                onDelete={() => handleDelete(conn)}
                onTest={() => handleTest(conn)}
                onConnect={() => handleConnect(conn)}
                onDisconnect={() => handleDisconnect(conn)}
                onPullCohort={() => setPullingFor(conn)}
                onGenerateKeypair={() => handleGenerateKeypair(conn)}
                onCopyJwk={() => handleCopyJwk(conn)}
              />
            ))}
          </ul>
        )}

        {/* Footer note */}
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-edge-2 bg-surface-2 px-3 py-2.5 text-[11px] text-dim">
          <Activity className="mt-0.5 h-3.5 w-3.5 flex-none text-indigo-400" />
          <div>
            <span className="font-semibold text-body">SMART on FHIR ready.</span>{" "}
            Click <strong>Connect</strong> on any profile to launch the OAuth flow in your browser. Tokens are stored in the OS keychain — never in the database.
          </div>
        </div>
      </div>

      {/* Editor modal */}
      <AnimatePresence>
        {editing && (
          <ConnectionEditor
            initial={editing === "new" ? null : editing}
            onSave={handleSave}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>

      {/* Cohort pull dialog */}
      <AnimatePresence>
        {pullingFor && (
          <CohortPullDialog
            connection={pullingFor}
            onClose={() => setPullingFor(null)}
            onComplete={(summary) => {
              toast.success(
                "Cohort imported",
                `${(summary.patients_inserted + summary.patients_updated).toLocaleString()} patients · ${summary.diagnoses_inserted.toLocaleString()} conditions`,
              );
              void refresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Row ---

function ConnectionRow({
  conn,
  busy,
  onEdit,
  onDelete,
  onTest,
  onConnect,
  onDisconnect,
  onPullCohort,
  onGenerateKeypair,
  onCopyJwk,
}: {
  conn: EpicConnection;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onPullCohort: () => void;
  onGenerateKeypair: () => void;
  onCopyJwk: () => void;
}) {
  const isConnected = conn.status === "connected";
  const isBackendServices = conn.auth_mode === "backend_services";
  return (
    <li className="rounded-lg border border-edge-2 bg-surface-2 px-4 py-3 transition-colors hover:border-edge-4">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onEdit} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-heading">
              {conn.site_label}
            </span>
            <StatusPill status={conn.status} />
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-dim">
            {conn.fhir_base_url}
          </div>
          {conn.last_test_error && (
            <div className="mt-1 line-clamp-2 text-[10px] text-amber-300/80">
              {conn.last_test_error}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-dim/70">
            <span className="rounded bg-surface-3 px-1 py-0.5 text-[9px] font-medium ring-1 ring-edge-3">
              {isBackendServices ? "Backend Services" : "Standalone"}
            </span>
            {conn.jwk_thumbprint && (
              <span className="font-mono text-[9px]">kid: {conn.jwk_thumbprint.slice(0, 12)}…</span>
            )}
            {conn.last_sync_at && (
              <span>Last sync: {conn.last_sync_at}</span>
            )}
          </div>
        </button>
        <div className="flex flex-none items-center gap-1">
          {isBackendServices && !isConnected && (
            <button
              onClick={conn.jwk_thumbprint ? onCopyJwk : onGenerateKeypair}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-1 text-[10px] font-semibold text-dim ring-1 ring-edge-3 transition-colors hover:text-body disabled:opacity-50"
              title={conn.jwk_thumbprint ? "Copy JWKS to clipboard" : "Generate P-256 signing key"}
            >
              {conn.jwk_thumbprint ? "Copy JWK" : "Gen keypair"}
            </button>
          )}
          {isConnected ? (
            <>
              <button
                onClick={onPullCohort}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/25 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                title="Run a Bulk Data $export against this site"
              >
                <Download className="h-3 w-3" />
                Pull cohort
              </button>
              <button
                onClick={onDisconnect}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-1 text-[10px] font-semibold text-dim ring-1 ring-edge-3 transition-colors hover:text-body disabled:opacity-50"
                title="Clear stored tokens for this site"
              >
                <Plug className="h-3 w-3" />
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={onConnect}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-1 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-400/25 transition-colors hover:bg-indigo-500/25 disabled:opacity-50"
              title="Launch SMART OAuth flow in your browser"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlugZap className="h-3 w-3" />}
              Connect
            </button>
          )}
          <button
            onClick={onTest}
            disabled={busy}
            className="rounded-md bg-surface-3 px-2 py-1 text-[10px] font-semibold text-dim ring-1 ring-edge-3 transition-colors hover:text-body disabled:opacity-50"
            title="GET /metadata against the FHIR base URL"
          >
            Test
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="rounded-md p-1 text-dim/50 transition-colors hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
            aria-label="Remove connection"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg =
    status === "connected"
      ? { label: "Connected", cls: "text-emerald-300 bg-emerald-500/10 ring-emerald-400/25", icon: <CheckCircle2 className="h-2.5 w-2.5" /> }
      : status === "error"
        ? { label: "Error", cls: "text-rose-300 bg-rose-500/10 ring-rose-400/25", icon: <AlertTriangle className="h-2.5 w-2.5" /> }
        : { label: "Unconfigured", cls: "text-dim bg-surface-3 ring-edge-3", icon: <Activity className="h-2.5 w-2.5" /> };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// --- Empty state ---

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-edge-3 bg-surface-2 px-4 py-6 text-center">
      <HeartPulse className="mx-auto h-6 w-6 text-dim/50" />
      <p className="mt-2 text-[12px] font-semibold text-heading">
        No Epic connections yet
      </p>
      <p className="mt-0.5 text-[11px] text-dim">
        Add your first site's Epic FHIR endpoint to get started.
      </p>
      <button
        onClick={onAdd}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-400"
      >
        <Plus className="h-3 w-3" />
        Add a site
      </button>
    </div>
  );
}

// --- Editor modal ---

const inputCls =
  "w-full rounded-lg border border-edge-3 bg-surface-1 px-3 py-2 text-[12px] text-body placeholder:text-dim/50 focus:border-indigo-400/40 focus:outline-none focus:ring-1 focus:ring-indigo-400/30";

function ConnectionEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: EpicConnection | null;
  onSave: (input: UpsertEpicConnectionInput) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<UpsertEpicConnectionInput>({
    id: initial?.id ?? null,
    site_label: initial?.site_label ?? "",
    fhir_base_url: initial?.fhir_base_url ?? "",
    authorize_url: initial?.authorize_url ?? "",
    token_url: initial?.token_url ?? "",
    client_id: initial?.client_id ?? "",
    scopes:
      initial?.scopes ??
      "system/Patient.read system/Condition.read system/Observation.read system/MedicationRequest.read",
    auth_mode: initial?.auth_mode ?? "standalone",
    notes: initial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const setField = <K extends keyof UpsertEpicConnectionInput>(
    key: K,
    value: UpsertEpicConnectionInput[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    setValidationError(null);
    if (!form.site_label.trim()) {
      setValidationError("Site label is required.");
      return;
    }
    if (!form.fhir_base_url.trim()) {
      setValidationError("FHIR base URL is required.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...form,
        site_label: form.site_label.trim(),
        fhir_base_url: form.fhir_base_url.trim(),
        authorize_url: form.authorize_url?.trim() || null,
        token_url: form.token_url?.trim() || null,
        client_id: form.client_id?.trim() || null,
        scopes: form.scopes?.trim() || null,
        notes: form.notes?.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9994] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="fixed left-1/2 top-1/2 z-[9995] flex h-[min(86vh,720px)] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-edge-2 bg-surface-1 shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-edge-2 px-6 py-4">
          <div>
            <h2 className="text-[14px] font-bold text-heading">
              {initial ? "Edit Epic connection" : "Add Epic connection"}
            </h2>
            <p className="mt-0.5 text-[11px] text-dim">
              One profile per site. Tokens and signing keys are stored separately in the OS keychain.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-dim transition-colors hover:bg-surface-3 hover:text-body"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <Field label="Site label" required>
            <input
              value={form.site_label}
              onChange={(e) => setField("site_label", e.target.value)}
              placeholder="Mayo Clinic Cancer Center"
              className={inputCls}
            />
          </Field>
          <Field label="FHIR base URL" required hint="The R4 endpoint your site's Epic admin gives you.">
            <input
              value={form.fhir_base_url}
              onChange={(e) => setField("fhir_base_url", e.target.value)}
              placeholder="https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4"
              className={`${inputCls} font-mono text-[11px]`}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Authorize URL" hint="Discovered automatically if blank.">
              <input
                value={form.authorize_url ?? ""}
                onChange={(e) => setField("authorize_url", e.target.value)}
                placeholder="https://…/oauth2/authorize"
                className={`${inputCls} font-mono text-[11px]`}
              />
            </Field>
            <Field label="Token URL" hint="Discovered automatically if blank.">
              <input
                value={form.token_url ?? ""}
                onChange={(e) => setField("token_url", e.target.value)}
                placeholder="https://…/oauth2/token"
                className={`${inputCls} font-mono text-[11px]`}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client ID" hint="Issued when this app is registered in the site's Epic vendor config.">
              <input
                value={form.client_id ?? ""}
                onChange={(e) => setField("client_id", e.target.value)}
                placeholder="abcd-1234-…"
                className={`${inputCls} font-mono text-[11px]`}
              />
            </Field>
            <Field label="Auth mode">
              <select
                value={form.auth_mode ?? "standalone"}
                onChange={(e) => setField("auth_mode", e.target.value)}
                className={inputCls}
              >
                <option value="standalone">SMART standalone (user)</option>
                <option value="backend_services">Backend services (JWKS)</option>
              </select>
            </Field>
          </div>
          <Field
            label="Scopes"
            hint="Space-separated SMART scopes. Defaults cover screening read access."
          >
            <textarea
              value={form.scopes ?? ""}
              onChange={(e) => setField("scopes", e.target.value)}
              rows={3}
              className={`${inputCls} resize-none font-mono text-[11px]`}
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
              placeholder="e.g. Contact: Jane in IT — registered 2026-04-01"
              className={`${inputCls} resize-none`}
            />
          </Field>

          {validationError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-edge-2 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-1.5 text-[12px] font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Save profile
              </>
            )}
          </button>
        </div>
      </motion.div>
    </>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-dim">
        {label}
        {required && <span className="text-rose-400">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-dim/60">{hint}</span>}
    </label>
  );
}
