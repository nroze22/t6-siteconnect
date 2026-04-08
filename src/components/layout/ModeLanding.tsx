import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Search,
  FileUp,
  ClipboardCheck,
  FlaskConical,
  Lightbulb,
  TrendingUp,
  BarChart3,
  GitBranch,
  HeartPulse,
  FileHeart,
  LayoutGrid,
} from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import { useModeStore } from "@/stores/use-mode-store";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useNaacrStore } from "@/stores/use-naaccr-store";
import { useRegistryStore } from "@/stores/use-registry-store";
import { useSiteProfileStore } from "@/stores/use-site-profile-store";
import { useResearchPackStore } from "@/stores/use-research-pack-store";
import { getWorkspaceMode } from "@/lib/workspace-modes";
import { formatCurrencyCompact } from "@/lib/formatters";
import type { NavigationPage } from "@/types";

/**
 * Role-tailored landing view shown on the "dashboard" route for every
 * workspace mode except `admin` (admin gets the full DashboardPage).
 *
 * Each mode shows:
 *   - a hero with the mode's tagline and one primary metric
 *   - a small row of secondary metrics
 *   - quick-action tiles pointing to the mode's visible pages
 *
 * All metrics are derived from existing Zustand stores, so no extra
 * data loading is required and nothing crosses the network.
 */

interface QuickAction {
  page: NavigationPage;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const ACTION_DEFS: Record<NavigationPage, Omit<QuickAction, "page">> = {
  screening: {
    label: "Screen patients",
    description: "Review eligibility against active studies",
    icon: <Search className="h-4 w-4" />,
  },
  import: {
    label: "Import data",
    description: "Load CSV, FHIR, or HL7 records",
    icon: <FileUp className="h-4 w-4" />,
  },
  review: {
    label: "Review queue",
    description: "Decisions awaiting sign-off",
    icon: <ClipboardCheck className="h-4 w-4" />,
  },
  trials: {
    label: "Trial discovery",
    description: "Browse and match open studies",
    icon: <FlaskConical className="h-4 w-4" />,
  },
  intelligence: {
    label: "Site intelligence",
    description: "Readiness, ROI, missed opportunities",
    icon: <Lightbulb className="h-4 w-4" />,
  },
  pipeline: {
    label: "Enrollment pipeline",
    description: "Track subject outreach",
    icon: <GitBranch className="h-4 w-4" />,
  },
  analytics: {
    label: "Cohort analytics",
    description: "Feasibility and population queries",
    icon: <BarChart3 className="h-4 w-4" />,
  },
  performance: {
    label: "Performance",
    description: "Metrics and revenue tracking",
    icon: <TrendingUp className="h-4 w-4" />,
  },
  registry: {
    label: "Patient registry",
    description: "Consent and volunteer matching",
    icon: <HeartPulse className="h-4 w-4" />,
  },
  naaccr: {
    label: "Tumor registry",
    description: "NAACCR abstraction and submission",
    icon: <FileHeart className="h-4 w-4" />,
  },
  dashboard: {
    label: "Dashboard",
    description: "Site overview",
    icon: <LayoutGrid className="h-4 w-4" />,
  },
  settings: {
    label: "Settings",
    description: "Configure the app",
    icon: <LayoutGrid className="h-4 w-4" />,
  },
};

interface Metric {
  label: string;
  value: string;
  accent?: "indigo" | "emerald" | "amber" | "rose";
}

export function ModeLanding() {
  const currentMode = useModeStore((s) => s.currentMode);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const modeConfig = getWorkspaceMode(currentMode);

  // Pull store snapshots. All selectors are cheap (primitives / shallow refs).
  const patients = useScreeningStore((s) => s.patients);
  const statusCounts = useScreeningStore((s) => s.statusCounts);
  const cases = useNaacrStore((s) => s.cases);
  const registryPatients = useRegistryStore((s) => s.patients);
  const siteName = useSiteProfileStore((s) => s.profile.research.siteName);
  const packStudies = useResearchPackStore((s) => s.studies);
  const packLoaded = useResearchPackStore((s) => s.isLoaded);
  const loadPack = useResearchPackStore((s) => s.loadPack);

  // Lazy-load the research pack so feasibility metrics are available.
  // (useEffect, not useMemo, because this is a side effect.)
  React.useEffect(() => {
    if (!packLoaded && currentMode === "feasibility") loadPack();
  }, [packLoaded, currentMode, loadPack]);

  const hero = useMemo(() => {
    switch (currentMode) {
      case "screening": {
        const counts = statusCounts();
        const pending = counts.needs_review ?? 0;
        return {
          headline: pending > 0
            ? `${pending} candidate${pending === 1 ? "" : "s"} awaiting review`
            : patients.length > 0
              ? `${patients.length} patient${patients.length === 1 ? "" : "s"} loaded`
              : "Ready to start screening",
          sub: patients.length > 0
            ? "Pick up where you left off in the three-panel review."
            : "Import a patient list to begin matching against active studies.",
          primaryAction: patients.length > 0 ? "screening" : "import",
        } as const;
      }
      case "feasibility": {
        // Sum estimated per-patient values across all pack studies as a
        // rough opportunity figure. The real model runs on the Trials page.
        const totalEstCents = packStudies.reduce(
          (sum, s) => sum + (s.estimatedPerPatientCents ?? 0),
          0,
        );
        const hasRevenue = totalEstCents > 0 && patients.length > 0;
        return {
          headline: hasRevenue
            ? `${formatCurrencyCompact(totalEstCents)} in trial opportunity across ${packStudies.length} studies`
            : siteName
              ? `Opportunity view for ${siteName}`
              : `${packStudies.length} studies available for evaluation`,
          sub: patients.length > 0
            ? `${patients.length.toLocaleString()} patients loaded — see which trials your population can support.`
            : "Import patient data to see revenue potential for your population.",
          primaryAction: patients.length > 0 ? "intelligence" : "import",
        } as const;
      }
      case "registry": {
        const draft = cases.filter((c) => c.abstractStatus === "draft").length;
        const inProgress = cases.filter((c) => c.abstractStatus === "in_progress").length;
        const pending = draft + inProgress;
        return {
          headline: pending > 0
            ? `${pending} case${pending === 1 ? "" : "s"} awaiting abstraction`
            : cases.length > 0
              ? "All cases abstracted"
              : "No cases in the worklist yet",
          sub: cases.length > 0
            ? "Jump into the NAACCR workspace to continue abstracting."
            : "Import new diagnoses to populate your case worklist.",
          primaryAction: cases.length > 0 ? "naaccr" : "import",
        } as const;
      }
      case "analytics": {
        return {
          headline: patients.length > 0
            ? `${patients.length.toLocaleString()} patient${patients.length === 1 ? "" : "s"} in your population`
            : "No population loaded yet",
          sub: patients.length > 0
            ? "Build cohorts and explore feasibility against open trials."
            : "Import patient data to start building cohorts.",
          primaryAction: patients.length > 0 ? "analytics" : "import",
        } as const;
      }
      case "admin":
      default:
        return {
          headline: siteName ?? "SiteConnect",
          sub: "Full workspace — every feature is available.",
          primaryAction: "dashboard",
        } as const;
    }
  }, [currentMode, patients, statusCounts, cases, siteName]);

  const metrics = useMemo<Metric[]>(() => {
    switch (currentMode) {
      case "screening": {
        const counts = statusCounts();
        return [
          { label: "Total patients", value: patients.length.toLocaleString(), accent: "indigo" },
          { label: "Eligible", value: (counts.eligible ?? 0).toLocaleString(), accent: "emerald" },
          { label: "Needs review", value: (counts.needs_review ?? 0).toLocaleString(), accent: "amber" },
          { label: "Screen failures", value: (counts.ineligible ?? 0).toLocaleString(), accent: "rose" },
        ];
      }
      case "feasibility": {
        const totalEstCents = packStudies.reduce(
          (sum, s) => sum + (s.estimatedPerPatientCents ?? 0),
          0,
        );
        return [
          { label: "Available studies", value: packStudies.length.toLocaleString(), accent: "indigo" },
          { label: "Patient population", value: patients.length.toLocaleString(), accent: "emerald" },
          ...(totalEstCents > 0
            ? [{ label: "Est. per-patient total", value: formatCurrencyCompact(totalEstCents), accent: "amber" as const }]
            : []),
          { label: "Registry consented", value: registryPatients.length.toLocaleString(), accent: "indigo" },
        ];
      }
      case "registry": {
        const draft = cases.filter((c) => c.abstractStatus === "draft").length;
        const inProgress = cases.filter((c) => c.abstractStatus === "in_progress").length;
        const submitted = cases.filter(
          (c) => c.abstractStatus === "submitted" || c.abstractStatus === "accepted",
        ).length;
        return [
          { label: "Total cases", value: cases.length.toLocaleString(), accent: "indigo" },
          { label: "Draft", value: draft.toLocaleString(), accent: "amber" },
          { label: "In progress", value: inProgress.toLocaleString(), accent: "amber" },
          { label: "Submitted", value: submitted.toLocaleString(), accent: "emerald" },
        ];
      }
      case "analytics":
        return [
          { label: "Patients", value: patients.length.toLocaleString(), accent: "indigo" },
          { label: "Registry volunteers", value: registryPatients.length.toLocaleString(), accent: "emerald" },
        ];
      default:
        return [];
    }
  }, [currentMode, patients, statusCounts, cases, registryPatients]);

  const quickActions = useMemo<QuickAction[]>(() => {
    const pages = modeConfig.visiblePages ?? [];
    return pages
      .filter((p) => p !== "dashboard")
      .map((p) => ({ page: p, ...ACTION_DEFS[p] }));
  }, [modeConfig.visiblePages]);

  const accentClass = (accent?: Metric["accent"]) => {
    switch (accent) {
      case "emerald": return "text-emerald-400";
      case "amber":   return "text-amber-400";
      case "rose":    return "text-rose-400";
      case "indigo":
      default:        return "text-indigo-400";
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl px-8 py-10">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-400 ring-1 ring-indigo-400/20">
              <LayoutGrid className="h-3 w-3" />
              {modeConfig.label} workspace
            </span>
            <span className="text-[11px] text-dim/70">{modeConfig.persona}</span>
          </div>

          <h1 className="mt-3 text-[26px] font-bold leading-tight text-heading">
            {hero.headline}
          </h1>
          <p className="mt-1.5 text-[13px] text-dim">{hero.sub}</p>

          <div className="mt-5 flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(hero.primaryAction as NavigationPage)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-[12px] font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400"
            >
              {ACTION_DEFS[hero.primaryAction as NavigationPage]?.label ?? "Open"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>

        {/* Metric strip */}
        {metrics.length > 0 && (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-edge-2 bg-surface-2 px-4 py-3"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-dim/70">
                  {m.label}
                </div>
                <div className={`mt-1 text-[22px] font-bold tabular-nums ${accentClass(m.accent)}`}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick actions */}
        {quickActions.length > 0 && (
          <div className="mt-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-dim">
              Quick actions
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {quickActions.map((action) => (
                <button
                  key={action.page}
                  onClick={() => setCurrentPage(action.page)}
                  className="group flex items-center gap-3 rounded-xl border border-edge-2 bg-surface-2 p-3 text-left transition-all hover:border-indigo-400/30 hover:bg-indigo-500/[0.04]"
                >
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-surface-3 text-dim ring-1 ring-edge-3 group-hover:text-indigo-400 group-hover:ring-indigo-400/30">
                    {action.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-heading">
                      {action.label}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-dim">
                      {action.description}
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 flex-none text-dim/40 transition-all group-hover:translate-x-0.5 group-hover:text-indigo-400" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
