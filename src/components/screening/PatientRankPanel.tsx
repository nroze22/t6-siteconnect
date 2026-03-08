import { useEffect, useCallback, useRef, useMemo } from "react";
import { Search, Users, ArrowUpDown, Sparkles, Check, X as XIcon, Clock } from "lucide-react";
import { useScreeningStore } from "@/stores/use-screening-store";
import { scoreColorClass } from "@/lib/formatters";
import type { ScreeningStatus } from "@/types";

const statusFilters: { value: ScreeningStatus | "all"; label: string; dot: string }[] = [
  { value: "all", label: "All", dot: "bg-slate-400" },
  { value: "eligible", label: "Eligible", dot: "bg-emerald-400" },
  { value: "potentially_eligible", label: "Potential", dot: "bg-amber-400" },
  { value: "ineligible", label: "Ineligible", dot: "bg-red-400" },
  { value: "needs_review", label: "Review", dot: "bg-blue-400" },
];

export function PatientRankPanel() {
  const allPatients = useScreeningStore((s) => s.patients);
  const selectedPatientId = useScreeningStore((s) => s.selectedPatientId);
  const selectPatient = useScreeningStore((s) => s.selectPatient);
  const searchQuery = useScreeningStore((s) => s.searchQuery);
  const setSearchQuery = useScreeningStore((s) => s.setSearchQuery);
  const statusFilter = useScreeningStore((s) => s.statusFilter);
  const setStatusFilter = useScreeningStore((s) => s.setStatusFilter);
  const scoreRange = useScreeningStore((s) => s.scoreRange);
  const listRef = useRef<HTMLDivElement>(null);

  const patients = useMemo(() => {
    return allPatients.filter((p) => {
      if (statusFilter !== "all" && p.overallStatus !== statusFilter) return false;
      if (p.score < scoreRange[0] || p.score > scoreRange[1]) return false;
      if (searchQuery && !p.sitePatientId.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    });
  }, [allPatients, statusFilter, scoreRange, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      eligible: 0,
      potentially_eligible: 0,
      ineligible: 0,
      needs_review: 0,
      total: allPatients.length,
    };
    for (const p of allPatients) {
      counts[p.overallStatus] = (counts[p.overallStatus] ?? 0) + 1;
    }
    return counts as Record<ScreeningStatus | "total", number>;
  }, [allPatients]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (patients.length === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const currentIndex = patients.findIndex((p) => p.id === selectedPatientId);
        let nextIndex: number;
        if (e.key === "ArrowDown") {
          nextIndex = currentIndex < patients.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : patients.length - 1;
        }
        const next = patients[nextIndex];
        if (next) selectPatient(next.id);
      }
    },
    [patients, selectedPatientId, selectPatient]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!selectedPatientId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-patient-id="${selectedPatientId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedPatientId]);

  return (
    <div className="flex h-full flex-col bg-[#0e1119]">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-400" />
            <h3 className="text-[13px] font-semibold text-white">Subjects</h3>
          </div>
          <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-400 ring-1 ring-white/[0.08]">
            {statusCounts.total}
          </span>
        </div>

        {/* Search */}
        <div className="relative mt-2.5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search subject ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] py-2 pl-9 pr-8 text-[12px] text-slate-200 placeholder-slate-600 transition-colors focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-300"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="mt-2.5 flex flex-wrap gap-1">
          {statusFilters.map((f) => {
            const count =
              f.value === "all"
                ? statusCounts.total
                : statusCounts[f.value] ?? 0;
            const isActive = statusFilter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                  isActive
                    ? "bg-white/[0.08] text-slate-200 ring-1 ring-white/[0.1]"
                    : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-400"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${f.dot} ${isActive ? "" : "opacity-50"}`} />
                {f.label}
                <span className="tabular-nums text-slate-600">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject List */}
      <div className="flex-1 overflow-y-auto" ref={listRef}>
        {patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <Sparkles className="h-6 w-6 text-indigo-400/60" />
            </div>
            <p className="text-[13px] font-semibold text-slate-300">
              {statusFilter !== "all" ? "No matches for this filter" : "No subjects yet"}
            </p>
            <p className="mt-1.5 max-w-[200px] text-[11px] leading-relaxed text-slate-500">
              {statusFilter !== "all"
                ? "Try \"All\" to see everyone, or import more subject data."
                : "Go to Import Data to load subject records, then run screening against a trial."}
            </p>
          </div>
        ) : (
          patients.map((patient, index) => {
            const isSelected = selectedPatientId === patient.id;
            const statusDot =
              patient.overallStatus === "eligible"
                ? "bg-emerald-400"
                : patient.overallStatus === "potentially_eligible"
                  ? "bg-amber-400"
                  : patient.overallStatus === "ineligible"
                    ? "bg-red-400"
                    : "bg-blue-400";

            return (
              <button
                key={patient.id}
                data-patient-id={patient.id}
                onClick={() => selectPatient(patient.id)}
                className={`group flex w-full items-center gap-3 border-b border-white/[0.04] px-4 py-3 text-left transition-all duration-100 ${
                  isSelected
                    ? "bg-indigo-500/10 border-l-2 border-l-indigo-500"
                    : "hover:bg-white/[0.03]"
                }`}
              >
                {/* Rank + status dot */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold tabular-nums text-slate-600">
                    {index + 1}
                  </span>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                </div>

                {/* Subject info */}
                <div className="flex-1 min-w-0">
                  <p className={`truncate text-[12px] font-semibold font-mono ${isSelected ? "text-indigo-300" : "text-slate-200"}`}>
                    {patient.sitePatientId}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {patient.age}y {patient.gender === "male" ? "M" : patient.gender === "female" ? "F" : "O"}
                    {patient.primaryDiagnosis ? ` \u00B7 ${patient.primaryDiagnosis}` : ""}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[9px] text-emerald-500/70 tabular-nums">
                      {patient.inclusionMet}/{patient.inclusionTotal} inc
                    </span>
                    {patient.exclusionTriggered > 0 && (
                      <span className="text-[9px] text-red-400/70 tabular-nums">
                        {patient.exclusionTriggered} exc
                      </span>
                    )}
                    {patient.missingDataCount > 0 && (
                      <span className="text-[9px] text-amber-400/70 tabular-nums">
                        {patient.missingDataCount} gaps
                      </span>
                    )}
                  </div>
                </div>

                {/* Score + review badge */}
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`rounded-lg px-2.5 py-1.5 text-[13px] font-black tabular-nums ${scoreColorClass(patient.score)}`}
                  >
                    {patient.score}
                  </span>
                  {patient.reviewStatus !== "pending" && (
                    <span className={`flex items-center gap-0.5 text-[9px] font-semibold ${
                      patient.reviewStatus === "accepted" ? "text-emerald-400"
                        : patient.reviewStatus === "rejected" ? "text-red-400"
                        : "text-amber-400"
                    }`}>
                      {patient.reviewStatus === "accepted" && <Check className="h-2.5 w-2.5" />}
                      {patient.reviewStatus === "rejected" && <XIcon className="h-2.5 w-2.5" />}
                      {patient.reviewStatus === "deferred" && <Clock className="h-2.5 w-2.5" />}
                      {patient.reviewStatus === "accepted" ? "ACC" : patient.reviewStatus === "rejected" ? "REJ" : "DEF"}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="border-t border-border px-4 py-1.5 flex items-center justify-center gap-1.5">
        <ArrowUpDown className="h-2.5 w-2.5 text-slate-600" />
        <p className="text-[9px] text-slate-600">
          Arrow keys to navigate
        </p>
      </div>
    </div>
  );
}
