import { useState, useMemo, useCallback } from "react";
import {
  Check,
  X as XIcon,
  Clock,
  Download,
  FileSpreadsheet,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  ArrowUpDown,
  Filter,
  Search,
} from "lucide-react";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useAppStore } from "@/stores/use-app-store";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { scoreColorClass, formatStatus } from "@/lib/formatters";
import { buildScreeningCSV, buildDetailedCSV, downloadCSV } from "@/lib/export-csv";
import type { ReviewStatus, PatientSummary } from "@/types";

const STUDY_NAMES: Record<string, string> = {
  "study-1": "KEYNOTE-789: Pembro + Chemo in NSCLC",
  "study-2": "DELIVER: Dapagliflozin in HFpEF",
  "study-3": "STEP-5: Semaglutide Weight Management",
  "study-4": "Lecanemab in Early Alzheimer's",
  "study-5": "Risankizumab in Crohn's Disease",
  "study-6": "Dupilumab in Atopic Dermatitis",
};

type ReviewFilter = ReviewStatus | "all";
type SortField = "subject" | "score" | "status" | "decision";
type SortDir = "asc" | "desc";

const filterConfig: { value: ReviewFilter; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "all", label: "All Subjects", icon: <Users className="h-3.5 w-3.5" />, color: "text-dim" },
  { value: "accepted", label: "Accepted", icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: "text-emerald-400" },
  { value: "rejected", label: "Rejected", icon: <XCircle className="h-3.5 w-3.5" />, color: "text-red-400" },
  { value: "deferred", label: "Deferred", icon: <Clock className="h-3.5 w-3.5" />, color: "text-amber-400" },
  { value: "pending", label: "Pending Review", icon: <AlertCircle className="h-3.5 w-3.5" />, color: "text-blue-400" },
];

const statusOrder: Record<string, number> = { eligible: 0, potentially_eligible: 1, needs_review: 2, ineligible: 3 };
const decisionOrder: Record<string, number> = { accepted: 0, rejected: 1, deferred: 2, pending: 3 };

function sortPatients(patients: PatientSummary[], field: SortField, dir: SortDir): PatientSummary[] {
  return [...patients].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "subject": cmp = a.sitePatientId.localeCompare(b.sitePatientId); break;
      case "score": cmp = a.score - b.score; break;
      case "status": cmp = (statusOrder[a.overallStatus] ?? 9) - (statusOrder[b.overallStatus] ?? 9); break;
      case "decision": cmp = (decisionOrder[a.reviewStatus] ?? 9) - (decisionOrder[b.reviewStatus] ?? 9); break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

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
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{ action: ReviewStatus; count: number } | null>(null);

  const studyName = selectedStudyId ? (STUDY_NAMES[selectedStudyId] ?? selectedStudyId) : "No Study Selected";

  const filteredPatients = useMemo(() => {
    const filtered = patients.filter((p) => {
      if (filter !== "all" && p.reviewStatus !== filter) return false;
      if (searchQuery && !p.sitePatientId.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
    return sortPatients(filtered, sortField, sortDir);
  }, [patients, filter, searchQuery, sortField, sortDir]);

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

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => d === "asc" ? "desc" : "asc");
        return prev;
      }
      setSortDir(field === "score" ? "desc" : "asc");
      return field;
    });
  }, []);

  // Select/deselect
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selected.size === filteredPatients.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredPatients.map((p) => p.id)));
    }
  }, [selected.size, filteredPatients]);

  // Bulk actions
  const handleBulkAction = useCallback((action: ReviewStatus) => {
    const pendingSelected = filteredPatients.filter((p) => selected.has(p.id) && p.reviewStatus === "pending");
    if (pendingSelected.length === 0) {
      toast.warning("No pending subjects selected", "Bulk actions only apply to pending subjects");
      return;
    }
    setBulkConfirm({ action, count: pendingSelected.length });
  }, [selected, filteredPatients, toast]);

  const executeBulkAction = useCallback(() => {
    if (!bulkConfirm) return;
    const pendingSelected = filteredPatients.filter((p) => selected.has(p.id) && p.reviewStatus === "pending");
    for (const p of pendingSelected) {
      reviewPatient(p.id, bulkConfirm.action);
    }
    const labels: Record<string, string> = { accepted: "accepted", rejected: "rejected", deferred: "deferred" };
    toast.success(`${pendingSelected.length} subjects ${labels[bulkConfirm.action] ?? bulkConfirm.action}`, "Bulk action complete");
    setSelected(new Set());
    setBulkConfirm(null);
  }, [bulkConfirm, filteredPatients, selected, reviewPatient, toast]);

  if (patients.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background p-8 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/8 ring-1 ring-indigo-500/15">
          <ClipboardList className="h-7 w-7 text-indigo-400/50" />
        </div>
        <h3 className="text-[14px] font-semibold text-body">No Screening Data Yet</h3>
        <p className="mt-2 max-w-[300px] text-[12px] leading-relaxed text-dim">
          Import subject data and run screening against a study first. Your review decisions will appear here.
        </p>
        <button
          onClick={() => setCurrentPage("import")}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-indigo-500"
        >
          Import Subject Data
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const allSelected = selected.size === filteredPatients.length && filteredPatients.length > 0;
  const someSelected = selected.size > 0;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-dim">{studyName}</p>
          <div className="flex items-center gap-3">
            {/* Bulk actions (visible when selected) */}
            {someSelected && (
              <div className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 ring-1 ring-edge-3">
                <span className="text-[12px] font-medium text-body tabular-nums">{selected.size} selected</span>
                <div className="mx-1.5 h-4 w-px bg-surface-4" />
                <Tooltip content="Accept selected" side="bottom">
                  <button onClick={() => handleBulkAction("accepted")} className="rounded-md bg-emerald-600/80 p-1.5 text-white transition-colors hover:bg-emerald-500">
                    <Check className="h-3 w-3" />
                  </button>
                </Tooltip>
                <Tooltip content="Reject selected" side="bottom">
                  <button onClick={() => handleBulkAction("rejected")} className="rounded-md bg-red-600/80 p-1.5 text-white transition-colors hover:bg-red-500">
                    <XIcon className="h-3 w-3" />
                  </button>
                </Tooltip>
                <Tooltip content="Defer selected" side="bottom">
                  <button onClick={() => handleBulkAction("deferred")} className="rounded-md bg-amber-600/80 p-1.5 text-white transition-colors hover:bg-amber-500">
                    <Clock className="h-3 w-3" />
                  </button>
                </Tooltip>
                <button onClick={() => setSelected(new Set())} className="ml-1 rounded-md p-1 text-dim hover:text-body">
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="inline-flex items-center gap-2 rounded-lg border border-edge-3 bg-surface-2 px-4 py-2 text-[12px] font-medium text-body transition-colors hover:bg-surface-3"
              >
                <Download className="h-3.5 w-3.5" />
                Export
                <ChevronDown className="h-3 w-3" />
              </button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-edge-3 bg-popover p-1 shadow-xl">
                    <button
                      onClick={handleExportSummary}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[12px] text-body hover:bg-surface-3"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                      <div>
                        <p className="font-medium">Summary CSV</p>
                        <p className="text-[12px] text-dim">One row per subject with scores</p>
                      </div>
                    </button>
                    <button
                      onClick={handleExportDetailed}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[12px] text-body hover:bg-surface-3"
                    >
                      <ClipboardList className="h-3.5 w-3.5 text-indigo-400" />
                      <div>
                        <p className="font-medium">Detailed CSV</p>
                        <p className="text-[12px] text-dim">One row per criterion per subject</p>
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
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-medium text-dim">Review Progress</span>
              <span className="text-[12px] font-bold tabular-nums text-body">{progressPercent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
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
          <Filter className="h-3.5 w-3.5 text-dim" />
          {filterConfig.map((f) => {
            const isActive = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-all ${
                  isActive
                    ? "bg-surface-4 text-body ring-1 ring-edge-4"
                    : "text-dim hover:bg-surface-2 hover:text-dim"
                }`}
              >
                <span className={isActive ? f.color : ""}>{f.icon}</span>
                {f.label}
              </button>
            );
          })}
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-dim" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 rounded-md border border-edge-2 bg-surface-2 py-1.5 pl-8 pr-8 text-[12px] text-body placeholder-dim focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-dim hover:text-body"
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Patient Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-edge-2">
              {/* Select all */}
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-white/20 bg-transparent text-indigo-500 focus:ring-indigo-500/30 cursor-pointer"
                />
              </th>
              <SortHeader field="subject" label="Subject" current={sortField} dir={sortDir} onSort={handleSort} align="left" />
              <th className="px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wider text-dim">Diagnosis</th>
              <SortHeader field="score" label="Score" current={sortField} dir={sortDir} onSort={handleSort} align="center" />
              <th className="px-4 py-2.5 text-center text-[12px] font-semibold uppercase tracking-wider text-dim">Criteria</th>
              <SortHeader field="status" label="Status" current={sortField} dir={sortDir} onSort={handleSort} align="center" />
              <SortHeader field="decision" label="Decision" current={sortField} dir={sortDir} onSort={handleSort} align="center" />
              <th className="px-4 py-2.5 text-right text-[12px] font-semibold uppercase tracking-wider text-dim">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map((p) => {
              const isSelected = selected.has(p.id);
              return (
                <tr
                  key={p.id}
                  className={`group border-b border-edge-1 transition-colors ${isSelected ? "bg-indigo-500/[0.06]" : "hover:bg-surface-1"}`}
                >
                  <td className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(p.id)}
                      className="h-3.5 w-3.5 rounded border-white/20 bg-transparent text-indigo-500 focus:ring-indigo-500/30 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[12px] font-semibold font-mono text-body">{p.sitePatientId}</p>
                    <p className="text-[12px] text-dim">{p.age}y {p.gender === "male" ? "M" : p.gender === "female" ? "F" : "O"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[200px] truncate text-[12px] text-dim">{p.primaryDiagnosis ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-lg px-2.5 py-1 text-[12px] font-black tabular-nums ${scoreColorClass(p.score)}`}>
                      {p.score}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2 text-[12px]">
                      <span className="text-emerald-400 tabular-nums">{p.inclusionMet}/{p.inclusionTotal} inc</span>
                      {p.exclusionTriggered > 0 && (
                        <span className="text-red-400 tabular-nums">{p.exclusionTriggered} exc</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${statusBadgeClass(p.overallStatus)}`}>
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
                          <Tooltip content="Accept" side="top">
                            <button
                              onClick={() => { reviewPatient(p.id, "accepted"); toast.success(`${p.sitePatientId} accepted`); }}
                              className="rounded-md bg-emerald-600/80 p-1.5 text-white transition-colors hover:bg-emerald-500"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Reject" side="top">
                            <button
                              onClick={() => { reviewPatient(p.id, "rejected"); toast.error(`${p.sitePatientId} rejected`); }}
                              className="rounded-md bg-red-600/80 p-1.5 text-white transition-colors hover:bg-red-500"
                            >
                              <XIcon className="h-3 w-3" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Defer" side="top">
                            <button
                              onClick={() => { reviewPatient(p.id, "deferred"); toast.warning(`${p.sitePatientId} deferred`); }}
                              className="rounded-md bg-amber-600/80 p-1.5 text-white transition-colors hover:bg-amber-500"
                            >
                              <Clock className="h-3 w-3" />
                            </button>
                          </Tooltip>
                        </>
                      ) : (
                        <button
                          onClick={() => { reviewPatient(p.id, "pending"); toast.info(`${p.sitePatientId} reset to pending`); }}
                          className="rounded-md border border-edge-3 px-2 py-1 text-[12px] font-medium text-dim hover:bg-surface-2 hover:text-body"
                        >
                          Undo
                        </button>
                      )}
                      <Tooltip content="View in Screening" side="top">
                        <button
                          onClick={() => handleGoToPatient(p.id)}
                          className="ml-1 rounded-md border border-edge-3 p-1.5 text-dim transition-colors hover:bg-surface-2 hover:text-body"
                        >
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredPatients.length === 0 && (
          <EmptyState
            icon={<ClipboardList className="h-7 w-7" />}
            title={patients.length === 0 ? "No screening results yet" : "No subjects match this filter"}
            description={patients.length === 0
              ? "Screen subjects against a study in the Screening view first. Results will appear here for review and export."
              : "Try changing the filter above, or review more subjects in the Screening view."}
            action={patients.length === 0 ? {
              label: "Go to Screening",
              onClick: () => setCurrentPage("screening"),
            } : undefined}
          />
        )}
      </div>

      {/* Footer Summary */}
      <div className="shrink-0 border-t border-border bg-card/50 px-6 py-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-dim">
            Showing <span className="font-semibold text-dim tabular-nums">{filteredPatients.length}</span> of {patients.length} subjects
            {someSelected && <span className="ml-2 text-indigo-400">({selected.size} selected)</span>}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage("screening")}
              className="text-[12px] font-medium text-indigo-400 hover:text-indigo-300"
            >
              Continue Screening
            </button>
            <button
              onClick={handleExportSummary}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-dim hover:text-body"
            >
              <Download className="h-3 w-3" />
              Quick Export
            </button>
          </div>
        </div>
      </div>

      {/* Bulk action confirmation */}
      <ConfirmDialog
        open={bulkConfirm !== null}
        title={`Bulk ${bulkConfirm?.action ?? ""} ${bulkConfirm?.count ?? 0} subjects?`}
        description={`This will mark ${bulkConfirm?.count ?? 0} pending subjects as "${bulkConfirm?.action ?? ""}". You can undo individual decisions later.`}
        confirmLabel={`${bulkConfirm?.action === "accepted" ? "Accept" : bulkConfirm?.action === "rejected" ? "Reject" : "Defer"} All`}
        variant={bulkConfirm?.action === "rejected" ? "danger" : bulkConfirm?.action === "deferred" ? "warning" : "info"}
        onConfirm={executeBulkAction}
        onCancel={() => setBulkConfirm(null)}
      />
    </div>
  );
}

// Sortable column header
function SortHeader({ field, label, current, dir, onSort, align }: {
  field: SortField; label: string; current: SortField; dir: SortDir; onSort: (f: SortField) => void; align: "left" | "center" | "right";
}) {
  const isActive = current === field;
  return (
    <th className={`px-4 py-2.5 text-${align}`}>
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wider transition-colors ${
          isActive ? "text-indigo-400" : "text-dim hover:text-body"
        }`}
      >
        {label}
        {isActive ? (
          dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />
        )}
      </button>
    </th>
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
    <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-semibold ${colorMap[color] ?? ""}`}>
      {icon}
      <span className="tabular-nums">{count}</span>
      <span className="text-dim">{label}</span>
    </div>
  );
}

function DecisionBadge({ status }: { status: ReviewStatus }) {
  if (status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[12px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
        <Check className="h-2.5 w-2.5" />
        Accepted
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-[12px] font-semibold text-red-400 ring-1 ring-red-500/20">
        <XIcon className="h-2.5 w-2.5" />
        Rejected
      </span>
    );
  }
  if (status === "deferred") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[12px] font-semibold text-amber-400 ring-1 ring-amber-500/20">
        <Clock className="h-2.5 w-2.5" />
        Deferred
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-dim ring-1 ring-edge-2">
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
