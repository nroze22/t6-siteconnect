import { useState, useMemo } from "react";
import {
  Check,
  X as XIcon,
  Clock,
  Download,
  FileSpreadsheet,
  ClipboardList,
  ChevronDown,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Filter,
  Search,
} from "lucide-react";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useAppStore } from "@/stores/use-app-store";
import { useToast } from "@/components/ui/Toast";
import { scoreColorClass, formatStatus } from "@/lib/formatters";
import { buildScreeningCSV, buildDetailedCSV, downloadCSV } from "@/lib/export-csv";
import type { ReviewStatus } from "@/types";

const STUDY_NAMES: Record<string, string> = {
  "study-1": "KEYNOTE-789: Pembro + Chemo in NSCLC",
  "study-2": "DELIVER: Dapagliflozin in HFpEF",
  "study-3": "STEP-5: Semaglutide Weight Management",
  "study-4": "Lecanemab in Early Alzheimer's",
  "study-5": "Risankizumab in Crohn's Disease",
  "study-6": "Dupilumab in Atopic Dermatitis",
};

type ReviewFilter = ReviewStatus | "all";

const filterConfig: { value: ReviewFilter; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "all", label: "All Patients", icon: <Users className="h-3.5 w-3.5" />, color: "text-slate-400" },
  { value: "accepted", label: "Accepted", icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: "text-emerald-400" },
  { value: "rejected", label: "Rejected", icon: <XCircle className="h-3.5 w-3.5" />, color: "text-red-400" },
  { value: "deferred", label: "Deferred", icon: <Clock className="h-3.5 w-3.5" />, color: "text-amber-400" },
  { value: "pending", label: "Pending Review", icon: <AlertCircle className="h-3.5 w-3.5" />, color: "text-blue-400" },
];

export function ReviewQueuePage() {
  const patients = useScreeningStore((s) => s.patients);
  const screeningResults = useScreeningStore((s) => s.screeningResults);
  const criteriaResults = useScreeningStore((s) => s.criteriaResults);
  const selectedStudyId = useScreeningStore((s) => s.selectedStudyId);
  const reviewPatient = useScreeningStore((s) => s.reviewPatient);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const selectPatient = useScreeningStore((s) => s.selectPatient);
  const toast = useToast();

  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);

  const studyName = selectedStudyId ? (STUDY_NAMES[selectedStudyId] ?? selectedStudyId) : "No Study Selected";

  const filteredPatients = useMemo(() => {
    return patients
      .filter((p) => {
        if (filter !== "all" && p.reviewStatus !== filter) return false;
        if (searchQuery && !p.sitePatientId.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        // Sort by review status: accepted first, then rejected, deferred, pending
        const order: Record<string, number> = { accepted: 0, rejected: 1, deferred: 2, pending: 3 };
        const diff = (order[a.reviewStatus] ?? 3) - (order[b.reviewStatus] ?? 3);
        if (diff !== 0) return diff;
        return b.score - a.score;
      });
  }, [patients, filter, searchQuery]);

  const counts = useMemo(() => {
    const c = { accepted: 0, rejected: 0, deferred: 0, pending: 0, total: patients.length };
    for (const p of patients) {
      if (p.reviewStatus === "accepted") c.accepted++;
      else if (p.reviewStatus === "rejected") c.rejected++;
      else if (p.reviewStatus === "deferred") c.deferred++;
      else c.pending++;
    }
    return c;
  }, [patients]);

  const progressPercent = patients.length > 0
    ? Math.round(((counts.accepted + counts.rejected + counts.deferred) / patients.length) * 100)
    : 0;

  const handleExportSummary = () => {
    const csv = buildScreeningCSV(patients, screeningResults, criteriaResults, filter !== "all" ? filter : undefined);
    if (csv) {
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadCSV(csv, `screening-summary-${timestamp}.csv`);
      toast.success("Summary exported", "Screening summary CSV downloaded");
    }
    setShowExportMenu(false);
  };

  const handleExportDetailed = () => {
    const csv = buildDetailedCSV(patients, screeningResults, criteriaResults, filter !== "all" ? filter : undefined);
    if (csv) {
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadCSV(csv, `screening-detailed-${timestamp}.csv`);
      toast.success("Detailed export ready", "Full criteria breakdown CSV downloaded");
    }
    setShowExportMenu(false);
  };

  const handleGoToPatient = (patientId: string) => {
    selectPatient(patientId);
    setCurrentPage("screening");
  };

  if (patients.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background p-8 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/8 ring-1 ring-indigo-500/15">
          <ClipboardList className="h-7 w-7 text-indigo-400/50" />
        </div>
        <h3 className="text-[14px] font-semibold text-slate-200">No Screening Data Yet</h3>
        <p className="mt-2 max-w-[300px] text-[12px] leading-relaxed text-slate-500">
          Import patient data and run screening against a study first. Your review decisions will appear here.
        </p>
        <button
          onClick={() => setCurrentPage("import")}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-indigo-500"
        >
          Import Patient Data
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-white">Review Queue</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {studyName}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] font-medium text-slate-300 transition-colors hover:bg-white/[0.06]"
              >
                <Download className="h-3.5 w-3.5" />
                Export
                <ChevronDown className="h-3 w-3" />
              </button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-white/[0.08] bg-[#1a1f2e] p-1 shadow-xl">
                    <button
                      onClick={handleExportSummary}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[12px] text-slate-300 hover:bg-white/[0.06]"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                      <div>
                        <p className="font-medium">Summary CSV</p>
                        <p className="text-[10px] text-slate-500">One row per patient with scores</p>
                      </div>
                    </button>
                    <button
                      onClick={handleExportDetailed}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[12px] text-slate-300 hover:bg-white/[0.06]"
                    >
                      <ClipboardList className="h-3.5 w-3.5 text-indigo-400" />
                      <div>
                        <p className="font-medium">Detailed CSV</p>
                        <p className="text-[10px] text-slate-500">One row per criterion per patient</p>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progress + Stats Bar */}
      <div className="shrink-0 border-b border-border bg-card/30 px-6 py-3">
        <div className="flex items-center gap-6">
          {/* Progress */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-slate-400">Review Progress</span>
              <span className="text-[11px] font-bold tabular-nums text-slate-300">{progressPercent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Stat pills */}
          <div className="flex items-center gap-2">
            <StatPill icon={<CheckCircle2 className="h-3 w-3" />} count={counts.accepted} label="Accepted" color="emerald" />
            <StatPill icon={<XCircle className="h-3 w-3" />} count={counts.rejected} label="Rejected" color="red" />
            <StatPill icon={<Clock className="h-3 w-3" />} count={counts.deferred} label="Deferred" color="amber" />
            <StatPill icon={<AlertCircle className="h-3 w-3" />} count={counts.pending} label="Pending" color="blue" />
          </div>
        </div>
      </div>

      {/* Filter + Search Bar */}
      <div className="shrink-0 border-b border-border px-6 py-2.5">
        <div className="flex items-center gap-3">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          {filterConfig.map((f) => {
            const isActive = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                  isActive
                    ? "bg-white/[0.08] text-slate-200 ring-1 ring-white/[0.1]"
                    : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-400"
                }`}
              >
                <span className={isActive ? f.color : ""}>{f.icon}</span>
                {f.label}
              </button>
            );
          })}
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-44 rounded-md border border-white/[0.06] bg-white/[0.03] py-1.5 pl-8 pr-3 text-[11px] text-slate-200 placeholder-slate-600 focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
            />
          </div>
        </div>
      </div>

      {/* Patient Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-[#0e1119]">
            <tr className="border-b border-white/[0.06]">
              <th className="px-6 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Patient</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Diagnosis</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Score</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Criteria</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Decision</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map((p) => (
              <tr
                key={p.id}
                className="group border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
              >
                <td className="px-6 py-3">
                  <p className="text-[12px] font-semibold font-mono text-slate-200">{p.sitePatientId}</p>
                  <p className="text-[10px] text-slate-500">{p.age}y {p.gender === "male" ? "M" : p.gender === "female" ? "F" : "O"}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="max-w-[200px] truncate text-[11px] text-slate-400">{p.primaryDiagnosis ?? "—"}</p>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block rounded-lg px-2.5 py-1 text-[12px] font-black tabular-nums ${scoreColorClass(p.score)}`}>
                    {p.score}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-[10px]">
                    <span className="text-emerald-400 tabular-nums">{p.inclusionMet}/{p.inclusionTotal} inc</span>
                    {p.exclusionTriggered > 0 && (
                      <span className="text-red-400 tabular-nums">{p.exclusionTriggered} exc</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(p.overallStatus)}`}>
                    {formatStatus(p.overallStatus)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <DecisionBadge status={p.reviewStatus} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {p.reviewStatus === "pending" ? (
                      <>
                        <button
                          onClick={() => reviewPatient(p.id, "accepted")}
                          className="rounded-md bg-emerald-600/80 p-1.5 text-white transition-colors hover:bg-emerald-500"
                          title="Accept"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => reviewPatient(p.id, "rejected")}
                          className="rounded-md bg-red-600/80 p-1.5 text-white transition-colors hover:bg-red-500"
                          title="Reject"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => reviewPatient(p.id, "deferred")}
                          className="rounded-md bg-amber-600/80 p-1.5 text-white transition-colors hover:bg-amber-500"
                          title="Defer"
                        >
                          <Clock className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => reviewPatient(p.id, "pending")}
                        className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
                      >
                        Undo
                      </button>
                    )}
                    <button
                      onClick={() => handleGoToPatient(p.id)}
                      className="ml-1 rounded-md border border-white/[0.08] p-1.5 text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300"
                      title="View in Screening"
                    >
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredPatients.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[13px] font-semibold text-slate-300">No patients match this filter</p>
            <p className="mt-1 text-[11px] text-slate-500">Try changing the filter or reviewing more patients in the Screening view.</p>
          </div>
        )}
      </div>

      {/* Footer Summary */}
      <div className="shrink-0 border-t border-border bg-card/50 px-6 py-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            Showing {filteredPatients.length} of {patients.length} patients
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage("screening")}
              className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300"
            >
              Continue Screening
            </button>
            <button
              onClick={handleExportSummary}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-300"
            >
              <Download className="h-3 w-3" />
              Quick Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatPill({ icon, count, label, color }: { icon: React.ReactNode; count: number; label: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20",
    red: "text-red-400 bg-red-500/10 ring-1 ring-red-500/20",
    amber: "text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/20",
    blue: "text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/20",
  };
  return (
    <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-semibold ${colorMap[color] ?? ""}`}>
      {icon}
      <span className="tabular-nums">{count}</span>
      <span className="opacity-60">{label}</span>
    </div>
  );
}

function DecisionBadge({ status }: { status: ReviewStatus }) {
  if (status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
        <Check className="h-2.5 w-2.5" />
        Accepted
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400 ring-1 ring-red-500/20">
        <XIcon className="h-2.5 w-2.5" />
        Rejected
      </span>
    );
  }
  if (status === "deferred") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/20">
        <Clock className="h-2.5 w-2.5" />
        Deferred
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-white/[0.06]">
      Pending
    </span>
  );
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "eligible": return "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20";
    case "potentially_eligible": return "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20";
    case "ineligible": return "bg-red-500/10 text-red-400 ring-1 ring-red-500/20";
    default: return "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20";
  }
}
