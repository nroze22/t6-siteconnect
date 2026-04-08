import { useMemo } from "react";
import { motion } from "framer-motion";
import { Grid3X3, ArrowUpDown, Users, FlaskConical } from "lucide-react";
import { useMatrixScreeningStore } from "@/stores/use-matrix-screening-store";
import type { ScreeningStatus } from "@/types";

const STATUS_COLORS: Record<ScreeningStatus, string> = {
  eligible: "bg-emerald-500/90 text-white",
  potentially_eligible: "bg-amber-500/80 text-white",
  ineligible: "bg-red-500/70 text-white",
  needs_review: "bg-zinc-500/60 text-white",
};

const STATUS_BG_HOVER: Record<ScreeningStatus, string> = {
  eligible: "hover:bg-emerald-400",
  potentially_eligible: "hover:bg-amber-400",
  ineligible: "hover:bg-red-400",
  needs_review: "hover:bg-zinc-400",
};

interface MatrixViewProps {
  onCellClick?: (patientId: string, studyId: string) => void;
}

export function MatrixView({ onCellClick }: MatrixViewProps) {
  const {
    matrixResults,
    selectedStudyIds,
    studyNames,
    selectedCellPatientId,
    selectedCellStudyId,
    selectCell,
    statusFilter,
  } = useMatrixScreeningStore();

  // Build sorted patient list: best aggregate score first
  const sortedPatients = useMemo(() => {
    const patients: Array<{
      patientId: string;
      sitePatientId: string;
      bestScore: number;
      eligibleCount: number;
    }> = [];

    for (const [patientId, studyMap] of matrixResults) {
      const cells = Array.from(studyMap.values());
      const first = cells[0];
      if (!first) continue;

      const eligibleCount = cells.filter(
        (c) => c.status === "eligible" || c.status === "potentially_eligible"
      ).length;

      // Apply status filter
      if (statusFilter !== "all") {
        const hasMatch = cells.some((c) => c.status === statusFilter);
        if (!hasMatch) continue;
      }

      patients.push({
        patientId,
        sitePatientId: first.patientId,
        bestScore: Math.max(...cells.map((c) => c.score)),
        eligibleCount,
      });
    }

    patients.sort((a, b) => {
      if (b.eligibleCount !== a.eligibleCount) return b.eligibleCount - a.eligibleCount;
      return b.bestScore - a.bestScore;
    });

    return patients;
  }, [matrixResults, statusFilter]);

  if (matrixResults.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
        <Grid3X3 className="h-12 w-12 opacity-30" />
        <p className="text-sm">Select studies and run multi-protocol screening</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-zinc-800 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {sortedPatients.length} patients
        </span>
        <span className="flex items-center gap-1.5">
          <FlaskConical className="h-3.5 w-3.5" />
          {selectedStudyIds.length} studies
        </span>
        <span className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5" />
          Sorted by eligibility count
        </span>
      </div>

      {/* Matrix table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-900">
            <tr>
              <th className="text-left py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800 min-w-[140px]">
                Patient
              </th>
              {selectedStudyIds.map((studyId) => (
                <th
                  key={studyId}
                  className="py-2 px-2 font-medium text-zinc-400 border-b border-zinc-800 text-center min-w-[90px] max-w-[120px] truncate"
                  title={studyNames[studyId] || studyId}
                >
                  {studyNames[studyId] || studyId}
                </th>
              ))}
              <th className="py-2 px-3 font-medium text-zinc-400 border-b border-zinc-800 text-center w-[60px]">
                Best
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPatients.map((patient, idx) => {
              const studyMap = matrixResults.get(patient.patientId);
              if (!studyMap) return null;

              const bestScore = patient.bestScore;

              return (
                <motion.tr
                  key={patient.patientId}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.02, 0.5) }}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                >
                  {/* Patient ID */}
                  <td className="py-1.5 px-3 font-mono text-zinc-300">
                    <span className="text-zinc-500 mr-1.5">{idx + 1}.</span>
                    {patient.patientId.substring(0, 12)}
                    <span className="ml-2 text-zinc-600">
                      ({patient.eligibleCount}/{selectedStudyIds.length})
                    </span>
                  </td>

                  {/* Study cells */}
                  {selectedStudyIds.map((studyId) => {
                    const cell = studyMap.get(studyId);
                    if (!cell) {
                      return (
                        <td key={studyId} className="py-1.5 px-1 text-center">
                          <span className="text-zinc-700">-</span>
                        </td>
                      );
                    }

                    const isSelected =
                      selectedCellPatientId === patient.patientId &&
                      selectedCellStudyId === studyId;

                    return (
                      <td key={studyId} className="py-1.5 px-1 text-center">
                        <button
                          onClick={() => {
                            selectCell(patient.patientId, studyId);
                            onCellClick?.(patient.patientId, studyId);
                          }}
                          className={`
                            inline-flex items-center justify-center rounded px-2 py-1 min-w-[56px]
                            font-mono text-[11px] font-medium transition-colors cursor-pointer
                            ${STATUS_COLORS[cell.status]}
                            ${STATUS_BG_HOVER[cell.status]}
                            ${isSelected ? "ring-2 ring-white/50 ring-offset-1 ring-offset-zinc-900" : ""}
                          `}
                          title={`${cell.status}: ${cell.inclusionMet}/${cell.inclusionTotal} inclusion, ${cell.exclusionTriggered} exclusions`}
                        >
                          {Math.round(cell.score)}
                        </button>
                      </td>
                    );
                  })}

                  {/* Best score */}
                  <td className="py-1.5 px-3 text-center font-mono font-semibold text-zinc-200">
                    {Math.round(bestScore)}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
