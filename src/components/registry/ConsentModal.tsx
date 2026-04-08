import { useState } from "react";
import { motion } from "framer-motion";
import { X, Shield, Loader2 } from "lucide-react";
import { isTauri } from "@/lib/tauri";

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}
import { useToast } from "@/components/ui/Toast";

interface ConsentModalProps {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}

const CONSENT_TYPES = [
  { value: "general_research", label: "General Research", desc: "Broad consent for any research study" },
  { value: "condition_specific", label: "Condition-Specific", desc: "Consent limited to a specific condition" },
  { value: "full_record", label: "Full Record Sharing", desc: "Complete medical record access for research" },
  { value: "healthy_volunteer", label: "Healthy Volunteer", desc: "Volunteer for studies requiring healthy participants" },
];

export function ConsentModal({ patientId, onClose, onSaved }: ConsentModalProps) {
  const [consentType, setConsentType] = useState("general_research");
  const [conditionScope, setConditionScope] = useState("");
  const [grantedDate, setGrantedDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [documentedBy, setDocumentedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isTauri) {
        await tauriInvoke("upsert_patient_consent", {
          request: {
            patient_id: patientId,
            consent_type: consentType,
            condition_scope: consentType === "condition_specific" ? conditionScope || null : null,
            granted_date: grantedDate,
            expiry_date: expiryDate || null,
            documented_by: documentedBy || null,
            notes: notes || null,
          },
        });
        toast.success("Consent recorded", `${CONSENT_TYPES.find((t) => t.value === consentType)?.label} consent granted`);
      }
      onSaved();
    } catch (err) {
      toast.error("Failed to save consent", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 w-[440px] rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-rose-400" />
            <h3 className="text-sm font-bold text-zinc-100">Grant Research Consent</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 mb-4">
          Patient: <span className="font-mono text-zinc-300">{patientId.substring(0, 12)}</span>
        </p>

        <div className="flex flex-col gap-3">
          {/* Consent type */}
          <div>
            <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Consent Type</label>
            <div className="flex flex-col gap-1.5">
              {CONSENT_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => setConsentType(ct.value)}
                  className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                    consentType === ct.value
                      ? "border-rose-500/40 bg-rose-500/10"
                      : "border-zinc-700/50 hover:border-zinc-600"
                  }`}
                >
                  <div className={`mt-0.5 h-3 w-3 rounded-full border-2 flex-shrink-0 ${
                    consentType === ct.value ? "border-rose-400 bg-rose-400" : "border-zinc-600"
                  }`} />
                  <div>
                    <p className="text-[11px] font-medium text-zinc-200">{ct.label}</p>
                    <p className="text-[10px] text-zinc-500">{ct.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Condition scope (conditional) */}
          {consentType === "condition_specific" && (
            <div>
              <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Condition Scope (ICD-10 prefix)</label>
              <input
                type="text"
                value={conditionScope}
                onChange={(e) => setConditionScope(e.target.value)}
                placeholder="e.g., C34 for lung cancer"
                className="w-full rounded-lg border border-zinc-700/50 bg-zinc-800 px-3 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-rose-500/30 focus:outline-none"
              />
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Granted Date</label>
              <input
                type="date"
                value={grantedDate}
                onChange={(e) => setGrantedDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-700/50 bg-zinc-800 px-3 py-1.5 text-[12px] text-zinc-200 focus:border-rose-500/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Expiry Date (optional)</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-700/50 bg-zinc-800 px-3 py-1.5 text-[12px] text-zinc-200 focus:border-rose-500/30 focus:outline-none"
              />
            </div>
          </div>

          {/* Documented by */}
          <div>
            <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Documented By</label>
            <input
              type="text"
              value={documentedBy}
              onChange={(e) => setDocumentedBy(e.target.value)}
              placeholder="Name of person documenting consent"
              className="w-full rounded-lg border border-zinc-700/50 bg-zinc-800 px-3 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-rose-500/30 focus:outline-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes about this consent"
              className="w-full rounded-lg border border-zinc-700/50 bg-zinc-800 px-3 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-rose-500/30 focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-rose-500 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
            Grant Consent
          </button>
        </div>
      </motion.div>
    </div>
  );
}
