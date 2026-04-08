import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Search,
  Shield,
  HeartPulse,
  FileCheck,
  Plus,
  Filter,
  Loader2,
} from "lucide-react";
import { useRegistryStore } from "@/stores/use-registry-store";
import { ConsentModal } from "./ConsentModal";
import { RegistryDashboard } from "./RegistryDashboard";
import { AutoMatchBanner } from "./AutoMatchBanner";
import { isTauri } from "@/lib/tauri";

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const CONSENT_BADGES: Record<string, { label: string; color: string }> = {
  general_research: { label: "General", color: "bg-blue-500/20 text-blue-300 ring-blue-500/30" },
  condition_specific: { label: "Condition", color: "bg-amber-500/20 text-amber-300 ring-amber-500/30" },
  full_record: { label: "Full Record", color: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30" },
  healthy_volunteer: { label: "Volunteer", color: "bg-purple-500/20 text-purple-300 ring-purple-500/30" },
};

const AVAILABILITY_DOT: Record<string, string> = {
  available: "bg-emerald-400",
  enrolled: "bg-blue-400",
  washout: "bg-amber-400",
  unavailable: "bg-zinc-500",
};

export function RegistryPage() {
  const {
    patients, isLoading, selectedPatientId, searchQuery, consentFilter, availabilityFilter,
    setPatients, setIsLoading, selectPatient, setSearchQuery, setConsentFilter,
    setAvailabilityFilter, setDashboard,
  } = useRegistryStore();

  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentPatientId, setConsentPatientId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "dashboard">("list");

  const loadPatients = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isTauri) {
        const result = await tauriInvoke<Array<{
          id: string; site_patient_id: string; date_of_birth: string | null;
          gender: string | null; race: string | null; ethnicity: string | null;
          insurance_type: string | null; imported_at: string; last_updated: string;
          primary_diagnosis: string | null; diagnosis_count: number;
          consent_status: string | null; consent_count: number;
          registry_status: string; availability: string;
        }>>("get_registry_patients", {
          filters: {
            search: searchQuery || null,
            consent_filter: consentFilter,
            availability_filter: availabilityFilter,
            limit: 500,
            offset: 0,
          },
        });
        setPatients(result.map((p) => ({
          id: p.id,
          sitePatientId: p.site_patient_id,
          dateOfBirth: p.date_of_birth,
          gender: p.gender,
          race: p.race,
          ethnicity: p.ethnicity,
          insuranceType: p.insurance_type,
          importedAt: p.imported_at,
          lastUpdated: p.last_updated,
          primaryDiagnosis: p.primary_diagnosis,
          diagnosisCount: p.diagnosis_count,
          consentStatus: p.consent_status,
          consentCount: p.consent_count,
          registryStatus: p.registry_status,
          availability: p.availability,
        })));
      }
    } catch (err) {
      console.error("[registry] Failed to load patients:", err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, consentFilter, availabilityFilter, setPatients, setIsLoading]);

  const loadDashboard = useCallback(async () => {
    if (!isTauri) return;
    try {
      const result = await tauriInvoke<{
        total_patients: number; with_consent: number;
        by_consent_type: Array<{ consent_type: string; count: number }>;
        by_availability: Array<{ availability: string; count: number }>;
        top_conditions: Array<{ icd10_prefix: string; description: string; count: number }>;
        recent_consents: unknown[];
      }>("get_registry_dashboard", {});
      setDashboard({
        totalPatients: result.total_patients,
        byConsentTier: {
          general_research: result.by_consent_type.find((c) => c.consent_type === "general_research")?.count ?? 0,
          condition_specific: result.by_consent_type.find((c) => c.consent_type === "condition_specific")?.count ?? 0,
          full_record: result.by_consent_type.find((c) => c.consent_type === "full_record")?.count ?? 0,
          healthy_volunteer: result.by_consent_type.find((c) => c.consent_type === "healthy_volunteer")?.count ?? 0,
        },
        byAvailability: {
          available: result.by_availability.find((a) => a.availability === "available")?.count ?? 0,
          enrolled: result.by_availability.find((a) => a.availability === "enrolled")?.count ?? 0,
          washout: result.by_availability.find((a) => a.availability === "washout")?.count ?? 0,
          unavailable: result.by_availability.find((a) => a.availability === "unavailable")?.count ?? 0,
        },
        topConditions: result.top_conditions.map((c) => ({
          icd10Prefix: c.icd10_prefix,
          description: c.description,
          count: c.count,
        })),
        recentUpdates: [],
      });
    } catch (err) {
      console.error("[registry] Failed to load dashboard:", err);
    }
  }, [setDashboard]);

  useEffect(() => {
    loadPatients();
    loadDashboard();
  }, [loadPatients, loadDashboard]);

  const computeAge = (dob: string | null): number | null => {
    if (!dob) return null;
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/50 px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/15 ring-1 ring-rose-500/25">
                <HeartPulse className="h-3.5 w-3.5 text-rose-400" />
              </div>
              <div>
                <h2 className="text-[13px] font-bold text-zinc-100">Patient Registry</h2>
                <p className="text-[11px] text-zinc-500">
                  {patients.length} patients &middot; Consent-tracked &middot; Auto-match ready
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex items-center rounded-lg border border-zinc-700/50 overflow-hidden">
                <button
                  onClick={() => setView("list")}
                  className={`flex items-center gap-1 px-3 py-1 text-[11px] font-medium ${
                    view === "list" ? "bg-zinc-700/50 text-zinc-200" : "text-zinc-500"
                  }`}
                >
                  <Users className="h-3 w-3" />
                  Patients
                </button>
                <button
                  onClick={() => setView("dashboard")}
                  className={`flex items-center gap-1 px-3 py-1 text-[11px] font-medium ${
                    view === "dashboard" ? "bg-zinc-700/50 text-zinc-200" : "text-zinc-500"
                  }`}
                >
                  <FileCheck className="h-3 w-3" />
                  Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>

        {view === "dashboard" ? (
          <RegistryDashboard />
        ) : (
          <>
            {/* Auto-match notifications */}
            <AutoMatchBanner />

            {/* Filters bar */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-zinc-800/50">
              {/* Search */}
              <div className="relative flex-1 max-w-[280px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search patients..."
                  className="w-full rounded-lg border border-zinc-700/50 bg-zinc-900 py-1.5 pl-8 pr-3 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-rose-500/30 focus:outline-none focus:ring-1 focus:ring-rose-500/20"
                />
              </div>

              {/* Consent filter */}
              <div className="flex items-center gap-1.5">
                <Filter className="h-3 w-3 text-zinc-500" />
                <select
                  value={consentFilter}
                  onChange={(e) => setConsentFilter(e.target.value as typeof consentFilter)}
                  className="rounded border border-zinc-700/50 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 focus:outline-none"
                >
                  <option value="all">All Consent</option>
                  <option value="none">No Consent</option>
                  <option value="general_research">General Research</option>
                  <option value="condition_specific">Condition-Specific</option>
                  <option value="full_record">Full Record</option>
                  <option value="healthy_volunteer">Healthy Volunteer</option>
                </select>
              </div>

              {/* Availability filter */}
              <select
                value={availabilityFilter}
                onChange={(e) => setAvailabilityFilter(e.target.value as typeof availabilityFilter)}
                className="rounded border border-zinc-700/50 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 focus:outline-none"
              >
                <option value="all">All Availability</option>
                <option value="available">Available</option>
                <option value="enrolled">Enrolled</option>
                <option value="washout">Washout</option>
                <option value="unavailable">Unavailable</option>
              </select>

              <button
                onClick={loadPatients}
                disabled={isLoading}
                className="ml-auto flex items-center gap-1 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-2.5 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                Refresh
              </button>
            </div>

            {/* Patient table */}
            <div className="flex-1 overflow-auto">
              {isLoading && patients.length === 0 ? (
                <div className="flex items-center justify-center h-full text-zinc-500">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading registry...
                </div>
              ) : patients.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                  <Users className="h-12 w-12 opacity-30" />
                  <p className="text-sm">No patients in registry</p>
                  <p className="text-xs text-zinc-600">Import patient data to populate the registry</p>
                </div>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-zinc-900">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Patient ID</th>
                      <th className="text-left py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Age / Gender</th>
                      <th className="text-left py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Primary Dx</th>
                      <th className="text-center py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Consent</th>
                      <th className="text-center py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Status</th>
                      <th className="text-right py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((p, idx) => {
                      const age = computeAge(p.dateOfBirth);
                      const isSelected = selectedPatientId === p.id;
                      const badge = p.consentStatus ? CONSENT_BADGES[p.consentStatus] : null;

                      return (
                        <motion.tr
                          key={p.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(idx * 0.01, 0.3) }}
                          onClick={() => selectPatient(p.id)}
                          className={`border-b border-zinc-800/50 cursor-pointer transition-colors ${
                            isSelected ? "bg-rose-500/10" : "hover:bg-zinc-800/30"
                          }`}
                        >
                          <td className="py-2 px-3 font-mono text-zinc-300">
                            {p.sitePatientId}
                          </td>
                          <td className="py-2 px-3 text-zinc-400">
                            {age != null ? `${age}y` : "—"} / {p.gender ?? "—"}
                          </td>
                          <td className="py-2 px-3 text-zinc-400 max-w-[200px] truncate">
                            {p.primaryDiagnosis || "—"}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {badge ? (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${badge.color}`}>
                                <Shield className="h-2.5 w-2.5" />
                                {badge.label}
                                {p.consentCount > 1 && <span className="text-[9px] opacity-60">+{p.consentCount - 1}</span>}
                              </span>
                            ) : (
                              <span className="text-zinc-600 text-[10px]">None</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${AVAILABILITY_DOT[p.availability] ?? "bg-zinc-500"}`} />
                              <span className="text-[10px] text-zinc-400 capitalize">{p.availability}</span>
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConsentPatientId(p.id);
                                setShowConsentModal(true);
                              }}
                              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                              <Plus className="h-2.5 w-2.5" />
                              Consent
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* Consent Modal */}
      {showConsentModal && consentPatientId && (
        <ConsentModal
          patientId={consentPatientId}
          onClose={() => {
            setShowConsentModal(false);
            setConsentPatientId(null);
          }}
          onSaved={() => {
            setShowConsentModal(false);
            setConsentPatientId(null);
            loadPatients();
            loadDashboard();
          }}
        />
      )}
    </>
  );
}
