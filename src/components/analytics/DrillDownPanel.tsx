"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Download,
  FileText,
  Users,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

import { useAnalyticsStore } from "@/stores/use-analytics-store";
import { getPatients } from "@/lib/data-provider";
import { calculateAge, formatNumber } from "@/lib/formatters";
import { exportCSV, objectsToExportData, exportReportDeck } from "@/lib/analytics-export";
import type { ParsedPatient } from "@/lib/epic-demo-data";

// ============================================================
// Sort State
// ============================================================

type SortKey = "mrn" | "name" | "age" | "sex" | "diagnosis" | "labs";
type SortDir = "asc" | "desc";

interface SortState {
  key: SortKey;
  dir: SortDir;
}

// ============================================================
// Column Definition
// ============================================================

interface Column {
  key: SortKey;
  label: string;
  width: string;
}

const COLUMNS: Column[] = [
  { key: "mrn", label: "MRN", width: "w-[72px]" },
  { key: "name", label: "Name", width: "w-[130px]" },
  { key: "age", label: "Age", width: "w-[52px]" },
  { key: "sex", label: "Sex", width: "w-[48px]" },
  { key: "diagnosis", label: "Primary Dx", width: "flex-1" },
  { key: "labs", label: "Key Labs", width: "w-[140px]" },
];

// ============================================================
// Helpers
// ============================================================

function primaryDiagnosis(p: ParsedPatient): string {
  const dx = p.diagnoses[0];
  return dx ? `${dx.icd10} ${dx.name}` : "—";
}

function keyLabs(p: ParsedPatient): string {
  const first = p.labs[0];
  if (!first) return "—";
  const abnFlag = first.abnormal ? " *" : "";
  return `${first.test}: ${first.value}${first.unit ? ` ${first.unit}` : ""}${abnFlag}`;
}

function sortValue(p: ParsedPatient, key: SortKey): string | number {
  switch (key) {
    case "mrn":
      return p.mrn;
    case "name":
      return `${p.lastName}, ${p.firstName}`;
    case "age":
      return calculateAge(p.dob);
    case "sex":
      return p.sex;
    case "diagnosis":
      return primaryDiagnosis(p);
    case "labs":
      return keyLabs(p);
  }
}

function comparePrimitive(a: string | number, b: string | number, dir: SortDir): number {
  if (a < b) return dir === "asc" ? -1 : 1;
  if (a > b) return dir === "asc" ? 1 : -1;
  return 0;
}

// ============================================================
// Component
// ============================================================

export function DrillDownPanel() {
  const drillDown = useAnalyticsStore((s) => s.drillDown);
  const closeDrillDown = useAnalyticsStore((s) => s.closeDrillDown);

  const [allPatients, setAllPatients] = useState<ParsedPatient[]>([]);
  const [sort, setSort] = useState<SortState | null>(null);

  // Load patients once when panel opens
  useEffect(() => {
    if (!drillDown) {
      setAllPatients([]);
      return;
    }
    let cancelled = false;
    void getPatients().then((pts) => {
      if (!cancelled) setAllPatients(pts);
    });
    return () => {
      cancelled = true;
    };
  }, [drillDown]);

  // Filter to matching patient IDs
  const patients = useMemo(() => {
    if (!drillDown) return [];
    const idSet = new Set(drillDown.patientIds);
    return allPatients.filter((p) => idSet.has(p.mrn));
  }, [allPatients, drillDown]);

  // Sorted patients
  const sortedPatients = useMemo(() => {
    if (!sort) return patients;
    const sorted = [...patients];
    sorted.sort((a, b) =>
      comparePrimitive(sortValue(a, sort.key), sortValue(b, sort.key), sort.dir),
    );
    return sorted;
  }, [patients, sort]);

  // Summary stats
  const stats = useMemo(() => {
    if (patients.length === 0) {
      return { avgAge: 0, maleCount: 0, femaleCount: 0, topDx: "—" };
    }
    const ages = patients.map((p) => calculateAge(p.dob));
    const avgAge = Math.round(ages.reduce((s, a) => s + a, 0) / ages.length);
    const maleCount = patients.filter((p) => p.sex === "Male").length;
    const femaleCount = patients.filter((p) => p.sex === "Female").length;

    // Top diagnosis by frequency
    const dxCounts = new Map<string, number>();
    for (const p of patients) {
      const dx = p.diagnoses[0];
      if (dx) {
        const key = dx.name;
        dxCounts.set(key, (dxCounts.get(key) ?? 0) + 1);
      }
    }
    let topDx = "—";
    let topCount = 0;
    for (const [name, count] of dxCounts) {
      if (count > topCount) {
        topDx = name;
        topCount = count;
      }
    }

    return { avgAge, maleCount, femaleCount, topDx };
  }, [patients]);

  // Sort toggle handler
  const handleSort = useCallback(
    (key: SortKey) => {
      setSort((prev) => {
        if (!prev || prev.key !== key) return { key, dir: "asc" };
        if (prev.dir === "asc") return { key, dir: "desc" };
        return null; // cycle back to no sort
      });
    },
    [],
  );

  // Export handlers
  const handleExportCSV = useCallback(() => {
    if (!drillDown) return;
    const exportData = objectsToExportData(
      sortedPatients.map((p) => ({
        mrn: p.mrn,
        name: `${p.lastName}, ${p.firstName}`,
        age: calculateAge(p.dob),
        sex: p.sex,
        race: p.race,
        diagnosis: primaryDiagnosis(p),
        labs: keyLabs(p),
        insurance: p.insurance,
      })),
      [
        { key: "mrn", header: "MRN" },
        { key: "name", header: "Name" },
        { key: "age", header: "Age" },
        { key: "sex", header: "Sex" },
        { key: "race", header: "Race" },
        { key: "diagnosis", header: "Primary Dx" },
        { key: "labs", header: "Key Labs" },
        { key: "insurance", header: "Insurance" },
      ],
    );
    const safeName = drillDown.title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    exportCSV({
      filename: `drilldown-${safeName}`,
      headers: exportData.headers,
      rows: exportData.rows,
      includeTimestamp: true,
    });
  }, [drillDown, sortedPatients]);

  const handleExportPDF = useCallback(() => {
    if (!drillDown) return;
    exportReportDeck({
      title: drillDown.title,
      subtitle: drillDown.description,
      confidential: true,
      sections: [
        {
          type: "metrics",
          title: "Cohort Summary",
          columns: 4,
          metrics: [
            { label: "Subjects", value: String(patients.length), accent: true },
            { label: "Avg Age", value: String(stats.avgAge) },
            { label: "Male", value: String(stats.maleCount) },
            { label: "Female", value: String(stats.femaleCount) },
          ],
        },
        {
          type: "text",
          title: "Source",
          text: `Chart: ${drillDown.sourceChart} | Value: ${drillDown.sourceValue}`,
        },
        {
          type: "table",
          title: "Patient List",
          headers: ["MRN", "Name", "Age", "Sex", "Primary Dx", "Key Labs"],
          rows: sortedPatients.map((p) => [
            p.mrn,
            `${p.lastName}, ${p.firstName}`,
            calculateAge(p.dob),
            p.sex,
            primaryDiagnosis(p),
            keyLabs(p),
          ]),
        },
      ],
    });
  }, [drillDown, patients.length, sortedPatients, stats]);

  // Keyboard escape
  useEffect(() => {
    if (!drillDown) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrillDown();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [drillDown, closeDrillDown]);

  // Sort icon for column header
  function SortIcon({ column }: { column: SortKey }) {
    if (!sort || sort.key !== column) {
      return <ArrowUpDown className="h-3 w-3 text-slate-500" />;
    }
    return sort.dir === "asc" ? (
      <ChevronUp className="h-3 w-3 text-indigo-400" />
    ) : (
      <ChevronDown className="h-3 w-3 text-indigo-400" />
    );
  }

  return (
    <AnimatePresence>
      {drillDown && (
        <>
          {/* Backdrop */}
          <motion.div
            key="drilldown-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={closeDrillDown}
          />

          {/* Panel */}
          <motion.div
            key="drilldown-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-full w-[520px] flex-col bg-[#111318] shadow-2xl border-l border-white/[0.06]"
          >
            {/* ---- Header ---- */}
            <div className="flex-shrink-0 border-b border-white/[0.06] px-6 py-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-slate-200 truncate">
                    {drillDown.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400 line-clamp-2">
                    {drillDown.description}
                  </p>
                </div>
                <button
                  onClick={closeDrillDown}
                  className="ml-4 flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 transition-colors"
                  aria-label="Close panel"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Badges */}
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-400 ring-1 ring-indigo-500/30">
                  From: {drillDown.sourceChart}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30">
                  <Users className="h-3 w-3" />
                  {formatNumber(patients.length)} subjects
                </span>
              </div>
            </div>

            {/* ---- Export Bar ---- */}
            <div className="flex-shrink-0 flex items-center gap-2 border-b border-white/[0.06] px-6 py-3">
              <button
                onClick={handleExportCSV}
                disabled={patients.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.1] hover:text-slate-100 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
              <button
                onClick={handleExportPDF}
                disabled={patients.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.1] hover:text-slate-100 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <FileText className="h-3.5 w-3.5" />
                Export PDF
              </button>
            </div>

            {/* ---- Summary Stats ---- */}
            {patients.length > 0 && (
              <div className="flex-shrink-0 grid grid-cols-3 gap-3 border-b border-white/[0.06] px-6 py-4">
                <div className="rounded-lg bg-card px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    Avg Age
                  </div>
                  <div className="text-lg font-semibold text-slate-200">
                    {stats.avgAge}
                  </div>
                </div>
                <div className="rounded-lg bg-card px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    Gender Split
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-blue-400" />
                      <span className="text-xs text-slate-300">
                        {stats.maleCount}M
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-pink-400" />
                      <span className="text-xs text-slate-300">
                        {stats.femaleCount}F
                      </span>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg bg-card px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    Top Dx
                  </div>
                  <div className="text-xs font-medium text-slate-300 truncate" title={stats.topDx}>
                    {stats.topDx}
                  </div>
                </div>
              </div>
            )}

            {/* ---- Patient Table ---- */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              {/* Table header */}
              <div className="flex-shrink-0 flex items-center gap-0 border-b border-white/[0.06] px-6 py-2">
                {COLUMNS.map((col) => (
                  <button
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`flex items-center gap-1 text-[11px] uppercase tracking-wider font-medium text-slate-500 hover:text-slate-300 transition-colors ${col.width} truncate`}
                  >
                    {col.label}
                    <SortIcon column={col.key} />
                  </button>
                ))}
              </div>

              {/* Table body */}
              <div className="flex-1 overflow-y-auto">
                {sortedPatients.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <Users className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm font-medium">No patients found</p>
                    <p className="text-xs mt-1">
                      No matching subjects for this selection.
                    </p>
                  </div>
                ) : (
                  sortedPatients.map((p) => (
                    <div
                      key={p.mrn}
                      className="flex items-center gap-0 border-b border-white/[0.04] px-6 py-2.5 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className={`${COLUMNS[0]!.width} text-xs font-mono text-slate-400 truncate`}>
                        {p.mrn}
                      </div>
                      <div className={`${COLUMNS[1]!.width} text-xs text-slate-300 truncate`}>
                        {p.lastName}, {p.firstName}
                      </div>
                      <div className={`${COLUMNS[2]!.width} text-xs text-slate-400 tabular-nums`}>
                        {calculateAge(p.dob)}
                      </div>
                      <div className={`${COLUMNS[3]!.width} text-xs text-slate-400`}>
                        {p.sex.charAt(0)}
                      </div>
                      <div className={`${COLUMNS[4]!.width} text-xs text-slate-300 truncate`} title={primaryDiagnosis(p)}>
                        {primaryDiagnosis(p)}
                      </div>
                      <div className={`${COLUMNS[5]!.width} text-xs text-slate-400 truncate`} title={keyLabs(p)}>
                        {keyLabs(p)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
