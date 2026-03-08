"use client";

import { Filter, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAnalyticsStore } from "@/stores/use-analytics-store";
import type { AnalyticsFilters } from "@/stores/use-analytics-store";

// ============================================================
// Filter metadata — label + value formatter per filter key
// ============================================================

interface FilterMeta {
  label: string;
  format: (value: NonNullable<AnalyticsFilters[keyof AnalyticsFilters]>) => string;
}

const FILTER_META: Record<keyof AnalyticsFilters, FilterMeta> = {
  ageRange: {
    label: "Age",
    format: (v) => {
      const range = v as [number, number];
      return `${range[0]}–${range[1]}`;
    },
  },
  sex: {
    label: "Sex",
    format: (v) => String(v),
  },
  race: {
    label: "Race",
    format: (v) => String(v),
  },
  ethnicity: {
    label: "Ethnicity",
    format: (v) => String(v),
  },
  diagnosisCode: {
    label: "Diagnosis",
    format: (v) => String(v),
  },
  medicationClass: {
    label: "Medication",
    format: (v) => String(v),
  },
  labName: {
    label: "Lab",
    format: (v) => String(v),
  },
  studyId: {
    label: "Study",
    format: (v) => String(v),
  },
  eligibilityStatus: {
    label: "Status",
    format: (v) => String(v),
  },
  timeRange: {
    label: "Time Range",
    format: (v) => {
      const range = v as { start: Date; end: Date };
      const fmt = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${fmt(range.start)} – ${fmt(range.end)}`;
    },
  },
};

// ============================================================
// Chip animation variants
// ============================================================

const chipVariants = {
  initial: { opacity: 0, scale: 0.85, x: -8 },
  animate: { opacity: 1, scale: 1, x: 0 },
  exit: { opacity: 0, scale: 0.85, x: -8 },
};

// ============================================================
// ActiveFiltersBar
// ============================================================

export function ActiveFiltersBar() {
  const filters = useAnalyticsStore((s) => s.filters);
  const clearFilter = useAnalyticsStore((s) => s.clearFilter);
  const clearAllFilters = useAnalyticsStore((s) => s.clearAllFilters);
  const activeFilterCount = useAnalyticsStore((s) => s.activeFilterCount);
  const count = activeFilterCount();

  if (count === 0) return null;

  // Build list of active filter entries
  const activeEntries: Array<{
    key: keyof AnalyticsFilters;
    label: string;
    displayValue: string;
  }> = [];

  for (const rawKey of Object.keys(filters) as Array<keyof AnalyticsFilters>) {
    const value = filters[rawKey];
    if (value === null) continue;

    const meta = FILTER_META[rawKey];
    activeEntries.push({
      key: rawKey,
      label: meta.label,
      displayValue: meta.format(value),
    });
  }

  return (
    <div
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg
        bg-indigo-500/5 px-4 py-2 ring-1 ring-indigo-500/15"
    >
      {/* Filter icon + count */}
      <div className="flex items-center gap-1.5 text-sm text-indigo-300/70">
        <Filter className="h-3.5 w-3.5" />
        <span>
          {count} {count === 1 ? "filter" : "filters"} active
        </span>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-indigo-500/20" />

      {/* Filter chips */}
      <AnimatePresence mode="popLayout">
        {activeEntries.map((entry) => (
          <motion.button
            key={entry.key}
            variants={chipVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            layout
            onClick={() => clearFilter(entry.key)}
            className="group inline-flex items-center gap-1.5 rounded-full
              bg-indigo-500/15 px-3 py-1 text-xs font-medium text-indigo-300
              transition-colors hover:bg-indigo-500/25"
          >
            <span className="text-indigo-400/60">{entry.label}:</span>
            <span>{entry.displayValue}</span>
            <X
              className="h-3 w-3 text-indigo-400/40 transition-colors
                group-hover:text-indigo-300"
            />
          </motion.button>
        ))}
      </AnimatePresence>

      {/* Clear All — only shown when more than one filter is active */}
      {count > 1 && (
        <button
          onClick={clearAllFilters}
          className="ml-auto text-xs font-medium text-indigo-400/60
            transition-colors hover:text-indigo-300"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
