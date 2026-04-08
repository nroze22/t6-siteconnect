import { motion } from "framer-motion";
import { Trophy, Users } from "lucide-react";
import { useMatrixScreeningStore } from "@/stores/use-matrix-screening-store";
import type { ScreeningStatus } from "@/types";

const STATUS_DOT: Record<ScreeningStatus, string> = {
  eligible: "bg-emerald-400",
  potentially_eligible: "bg-amber-400",
  ineligible: "bg-red-400",
  needs_review: "bg-zinc-400",
};

const STATUS_LABEL: Record<ScreeningStatus, string> = {
  eligible: "Eligible",
  potentially_eligible: "Potential",
  ineligible: "Ineligible",
  needs_review: "Review",
};

interface BestMatchViewProps {
  onSelectMatch?: (patientId: string, studyId: string) => void;
}

export function BestMatchView({ onSelectMatch }: BestMatchViewProps) {
  const bestMatches = useMatrixScreeningStore((s) => s.getBestMatches());

  if (bestMatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
        <Trophy className="h-12 w-12 opacity-30" />
        <p className="text-sm">No matches to display</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 overflow-auto h-full">
      <div className="text-xs text-zinc-500 mb-1">
        <Users className="inline h-3.5 w-3.5 mr-1" />
        {bestMatches.length} patients ranked by multi-study eligibility
      </div>

      {bestMatches.map((patient, idx) => {
        const eligibleCount = patient.matches.filter(
          (m) => m.status === "eligible" || m.status === "potentially_eligible"
        ).length;

        return (
          <motion.div
            key={patient.patientId}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(idx * 0.03, 0.6) }}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
          >
            {/* Patient header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-xs font-mono">#{idx + 1}</span>
                <span className="font-mono text-sm text-zinc-200">
                  {patient.patientId.substring(0, 12)}
                </span>
                {eligibleCount > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                    {eligibleCount} match{eligibleCount !== 1 ? "es" : ""}
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-500">
                {patient.matches.length} stud{patient.matches.length !== 1 ? "ies" : "y"}
              </span>
            </div>

            {/* Study matches */}
            <div className="flex flex-col gap-1.5">
              {patient.matches.slice(0, 5).map((match) => (
                <button
                  key={match.studyId}
                  onClick={() => onSelectMatch?.(patient.patientId, match.studyId)}
                  className="flex items-center gap-2.5 text-left px-2.5 py-1.5 rounded hover:bg-zinc-800/60 transition-colors cursor-pointer group"
                >
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${STATUS_DOT[match.status]}`} />
                  <span className="flex-1 text-xs text-zinc-300 truncate group-hover:text-zinc-100">
                    {match.studyTitle}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {STATUS_LABEL[match.status]}
                  </span>
                  <span className="font-mono text-xs font-medium text-zinc-200 w-8 text-right">
                    {Math.round(match.score)}
                  </span>
                </button>
              ))}
              {patient.matches.length > 5 && (
                <span className="text-[10px] text-zinc-600 pl-7">
                  +{patient.matches.length - 5} more
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
