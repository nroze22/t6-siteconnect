import type { NavigationPage } from "@/types";

/**
 * Workspace modes tailor the app surface to a specific persona.
 * Each mode filters the sidebar, sets a landing route, and provides
 * a role-aware tagline. Data scope is never affected — all modes
 * read the same local database, except the isolated synthetic Data COUNTS rehearsal.
 *
 * Modes are persisted per-user in localStorage (see use-mode-store.ts).
 */
export type WorkspaceMode =
  | "data-counts"
  | "screening"
  | "feasibility"
  | "registry"
  | "analytics"
  | "admin";

export interface WorkspaceModeConfig {
  id: WorkspaceMode;
  label: string;
  tagline: string;
  description: string;
  /** Who this mode is primarily designed for. */
  persona: string;
  /** The page shown when switching into this mode. */
  landingPage: NavigationPage;
  /**
   * Pages visible in the sidebar for this mode.
   * Settings is always accessible via the pinned bottom button, regardless of mode.
   * `admin` mode shows every page — use `null` to signal "show all".
   */
  visiblePages: NavigationPage[] | null;
}

export const WORKSPACE_MODES: readonly WorkspaceModeConfig[] = [
  { id: "data-counts", label: "Data COUNTS", tagline: "Prepare an accountable laboratory release", description: "Synthetic laboratory rehearsal for the NIH Data COUNTS RFI.", persona: "Hospital data operations · Internal demo", landingPage: "dashboard", visiblePages: ["dashboard"] },
  {
    id: "screening",
    label: "Screening",
    tagline: "Match patients to open studies",
    description:
      "Pre-screen your clinic list against active study criteria. Built for coordinators and research nurses.",
    persona: "Clinical Research Coordinator · Research Nurse · PI",
    landingPage: "dashboard",
    visiblePages: ["screening", "import", "review", "trials", "pipeline"],
  },
  {
    id: "feasibility",
    label: "Feasibility & Revenue",
    tagline: "Find the trials worth pursuing",
    description:
      "See which trials your patient population can support and the revenue on the table. Built for site directors and BD.",
    persona: "Site Director · Business Development · Feasibility Lead",
    landingPage: "dashboard",
    visiblePages: [
      "intelligence",
      "performance",
      "trials",
      "analytics",
      "pipeline",
    ],
  },
  {
    id: "registry",
    label: "Registry & NAACCR",
    tagline: "Abstract and submit cases",
    description:
      "Case worklist, NAACCR abstraction, and consent management. Built for tumor registrars and registry coordinators.",
    persona: "Certified Tumor Registrar · Registry Coordinator",
    landingPage: "dashboard",
    visiblePages: ["naaccr", "registry", "import"],
  },
  {
    id: "analytics",
    label: "Cohort Analytics",
    tagline: "Explore your patient population",
    description:
      "Build cohorts, explore trends, and answer ad-hoc feasibility questions. Built for data managers and informaticists.",
    persona: "Data Manager · Research Informaticist",
    landingPage: "dashboard",
    visiblePages: ["analytics", "import", "trials", "performance"],
  },
  {
    id: "admin",
    label: "Full Access",
    tagline: "Every workspace, no filtering",
    description:
      "All features visible. Best for small sites where one person wears every hat, and for site administrators.",
    persona: "Site Administrator · Small-site generalist",
    landingPage: "dashboard",
    visiblePages: null,
  },
] as const;

const MODE_MAP: Record<WorkspaceMode, WorkspaceModeConfig> = WORKSPACE_MODES.reduce(
  (acc, mode) => {
    acc[mode.id] = mode;
    return acc;
  },
  {} as Record<WorkspaceMode, WorkspaceModeConfig>,
);

export function getWorkspaceMode(id: WorkspaceMode): WorkspaceModeConfig {
  return MODE_MAP[id];
}

/**
 * Pages that remain reachable in every mode regardless of `visiblePages`.
 * These are either navigation anchors (dashboard) or always-on utilities (settings).
 */
const ALWAYS_REACHABLE: readonly NavigationPage[] = ["dashboard", "settings"];

/**
 * Suggest a workspace mode from the onboarding workflow preferences.
 * Prefers the explicit `workspaceOptimization` choice, then falls back
 * to inferring from which roles the user said are primary.
 */
export function suggestModeFromWorkflow(input: {
  workspaceOptimization?: string;
  primaryUsers?: string[];
}): WorkspaceMode {
  switch (input.workspaceOptimization) {
    case "candidate_review":
      return "screening";
    case "financial_review":
    case "feasibility_packets":
      return "feasibility";
  }

  const roles = new Set(input.primaryUsers ?? []);
  if (roles.size === 0) return "admin";
  if (roles.size === 1) {
    if (roles.has("coordinator") || roles.has("pi")) return "screening";
    if (
      roles.has("research_director") ||
      roles.has("feasibility_lead") ||
      roles.has("finance_admin")
    ) {
      return "feasibility";
    }
  }
  return "admin";
}

export function isPageVisibleInMode(
  page: NavigationPage,
  mode: WorkspaceMode,
): boolean {
  if (ALWAYS_REACHABLE.includes(page)) return true;
  const config = MODE_MAP[mode];
  if (config.visiblePages === null) return true;
  return config.visiblePages.includes(page);
}
