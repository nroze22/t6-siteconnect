import { useRegistryStore } from "@/stores/use-registry-store";
import { Users, Shield, HeartPulse, Activity } from "lucide-react";

const CONSENT_COLORS: Record<string, string> = {
  general_research: "bg-blue-500",
  condition_specific: "bg-amber-500",
  full_record: "bg-emerald-500",
  healthy_volunteer: "bg-purple-500",
};

const CONSENT_LABELS: Record<string, string> = {
  general_research: "General Research",
  condition_specific: "Condition-Specific",
  full_record: "Full Record",
  healthy_volunteer: "Healthy Volunteer",
};

const AVAIL_COLORS: Record<string, string> = {
  available: "bg-emerald-500",
  enrolled: "bg-blue-500",
  washout: "bg-amber-500",
  unavailable: "bg-zinc-500",
};

export function RegistryDashboard() {
  const dashboard = useRegistryStore((s) => s.dashboard);

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <p className="text-sm">Loading dashboard...</p>
      </div>
    );
  }

  const totalConsents = Object.values(dashboard.byConsentTier).reduce((a, b) => a + b, 0);
  const totalAvail = Object.values(dashboard.byAvailability).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 overflow-auto h-full">
      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <DashCard
          icon={<Users className="h-4 w-4 text-blue-400" />}
          label="Total Patients"
          value={dashboard.totalPatients}
          color="blue"
        />
        <DashCard
          icon={<Shield className="h-4 w-4 text-emerald-400" />}
          label="With Consent"
          value={totalConsents}
          color="emerald"
        />
        <DashCard
          icon={<HeartPulse className="h-4 w-4 text-rose-400" />}
          label="Available"
          value={dashboard.byAvailability.available ?? 0}
          color="rose"
        />
        <DashCard
          icon={<Activity className="h-4 w-4 text-amber-400" />}
          label="Conditions Tracked"
          value={dashboard.topConditions.length}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Consent tier breakdown */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-xs font-semibold text-zinc-300 mb-3">Consent by Type</h3>
          <div className="flex flex-col gap-2">
            {Object.entries(dashboard.byConsentTier).map(([type, count]) => {
              const pct = totalConsents > 0 ? (count / totalConsents) * 100 : 0;
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-[11px] text-zinc-400 w-28 truncate">
                    {CONSENT_LABELS[type] ?? type}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${CONSENT_COLORS[type] ?? "bg-zinc-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-zinc-300 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Availability breakdown */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-xs font-semibold text-zinc-300 mb-3">Patient Availability</h3>
          <div className="flex flex-col gap-2">
            {Object.entries(dashboard.byAvailability).map(([status, count]) => {
              const pct = totalAvail > 0 ? (count / totalAvail) * 100 : 0;
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-[11px] text-zinc-400 w-24 capitalize">{status}</span>
                  <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${AVAIL_COLORS[status] ?? "bg-zinc-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-zinc-300 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top conditions */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 col-span-2">
          <h3 className="text-xs font-semibold text-zinc-300 mb-3">Top Conditions (Active Diagnoses)</h3>
          {dashboard.topConditions.length === 0 ? (
            <p className="text-[11px] text-zinc-500">No diagnoses recorded yet</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {dashboard.topConditions.map((c) => (
                <div key={c.icd10Prefix} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] text-zinc-500 w-8">{c.icd10Prefix}</span>
                    <span className="text-[11px] text-zinc-300 truncate">{c.description}</span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 ml-2">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DashCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[11px] text-zinc-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-100 font-mono">{value}</p>
    </div>
  );
}
