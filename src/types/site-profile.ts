/**
 * Site Intelligence Profile
 *
 * Collected during onboarding and refined over time.
 * Powers study recommendations, financial modeling, burden thresholds,
 * and ranking preferences throughout the application.
 */

// ───────────────────── Research Profile ─────────────────────

export interface SiteResearchProfile {
  siteName: string;
  siteType: "single_site" | "multi_site_group" | "health_system" | "";
  activeTherapeuticAreas: string[];
  growthTherapeuticAreas: string[];
  studyTypes: StudyTypePreference[];
  acceptedPhases: string[];
  avoidedStudyTypes: string[];
}

export type StudyTypePreference = "drug" | "device" | "observational" | "registry" | "investigator_initiated";

// ───────────────────── Operational Capacity ─────────────────────

export interface SiteOperationalCapacity {
  coordinatorCount: number;
  coordinatorsFTE: number;
  piCount: number;
  hasDedicatedRegulatory: boolean;
  hasDedicatedRecruitment: boolean;
  hasInHouseLab: boolean;
  hasInHousePharmacy: boolean;
  hasImagingSupport: boolean;
  hasInfusionCapability: boolean;
  hasInpatientCapability: boolean;
  newStudiesPerQuarter: number;
  maxActiveStudies: number;
}

// ───────────────────── Financial Defaults ─────────────────────

export interface SiteFinancialDefaults {
  coordinatorHourlyRateCents: number;
  piHourlyRateCents: number;
  regulatoryHourlyRateCents: number;
  nurseHourlyRateCents: number;
  overheadPercent: number;
  includeFringeBenefits: boolean;
  minimumMarginPercent: number;
  requireStartupFees: boolean;
  expectScreenFailReimbursement: boolean;
  defaultScreenFailPercent: number;
  defaultCompletionPercent: number;
  showScenarios: boolean;
}

// ───────────────────── Study Preferences ─────────────────────

export type RankingFactor =
  | "revenue"
  | "low_burden"
  | "enrollment_potential"
  | "sponsor_relationship"
  | "therapeutic_alignment"
  | "short_duration"
  | "low_startup_complexity";

export interface SiteStudyPreferences {
  rankingFactors: RankingFactor[]; // ordered by priority
  topDeclineReasons: string[];
  idealDurationMonths: number;
  maxVisitBurden: number; // visits per month threshold
  unattractiveProcedures: string[];
  studyComplexityPreference: "easier_lower_yield" | "balanced" | "complex_higher_upside";
}

// ───────────────────── Patient Population ─────────────────────

export interface SitePatientPopulation {
  strongDiseaseAreas: string[];
  referralSpecialties: string[];
  hardToRecruitPopulations: string[];
  recruitmentChannels: RecruitmentChannel[];
  geographicStrengths: string;
  diversityPriority: boolean;
}

export type RecruitmentChannel = "own_database" | "provider_referrals" | "community_outreach" | "advertising";

// ───────────────────── Data Readiness ─────────────────────

export interface SiteDataReadiness {
  ehrSystem: string;
  canExportDirectly: boolean;
  exportTypes: ExportType[];
  availableDomains: DataDomain[];
  refreshFrequency: "daily" | "weekly" | "monthly" | "ad_hoc" | "";
  exportOwner: string;
  useWatchFolder: boolean;
  reliableFields: string[];
  unreliableFields: string[];
}

export type ExportType = "csv" | "excel" | "report" | "flat_file" | "fhir" | "hl7";
export type DataDomain = "demographics" | "diagnoses" | "medications" | "labs" | "encounters" | "providers" | "locations";

// ───────────────────── Workflow ─────────────────────

export interface SiteWorkflowPreferences {
  primaryUsers: UserRole[];
  studyApprover: string;
  needsFinancePackets: boolean;
  needsFeasibilitySummaries: boolean;
  defaultOutputs: OutputType[];
  workspaceOptimization: "browsing" | "financial_review" | "feasibility_packets" | "candidate_review";
}

export type UserRole = "coordinator" | "research_director" | "feasibility_lead" | "finance_admin" | "pi";
export type OutputType = "internal_review" | "sponsor_outreach" | "budget_negotiation";

// ───────────────────── Complete Profile ─────────────────────

export interface SiteIntelligenceProfile {
  version: number;
  createdAt: string;
  updatedAt: string;
  onboardingComplete: boolean;

  research: SiteResearchProfile;
  operations: SiteOperationalCapacity;
  financials: SiteFinancialDefaults;
  preferences: SiteStudyPreferences;
  population: SitePatientPopulation;
  dataReadiness: SiteDataReadiness;
  workflow: SiteWorkflowPreferences;
}

// ───────────────────── Defaults ─────────────────────

export const DEFAULT_SITE_PROFILE: SiteIntelligenceProfile = {
  version: 1,
  createdAt: "",
  updatedAt: "",
  onboardingComplete: false,

  research: {
    siteName: "",
    siteType: "",
    activeTherapeuticAreas: [],
    growthTherapeuticAreas: [],
    studyTypes: [],
    acceptedPhases: [],
    avoidedStudyTypes: [],
  },

  operations: {
    coordinatorCount: 0,
    coordinatorsFTE: 0,
    piCount: 0,
    hasDedicatedRegulatory: false,
    hasDedicatedRecruitment: false,
    hasInHouseLab: false,
    hasInHousePharmacy: false,
    hasImagingSupport: false,
    hasInfusionCapability: false,
    hasInpatientCapability: false,
    newStudiesPerQuarter: 2,
    maxActiveStudies: 5,
  },

  financials: {
    coordinatorHourlyRateCents: 3500,
    piHourlyRateCents: 15000,
    regulatoryHourlyRateCents: 3000,
    nurseHourlyRateCents: 4500,
    overheadPercent: 25,
    includeFringeBenefits: false,
    minimumMarginPercent: 15,
    requireStartupFees: true,
    expectScreenFailReimbursement: true,
    defaultScreenFailPercent: 25,
    defaultCompletionPercent: 80,
    showScenarios: true,
  },

  preferences: {
    rankingFactors: ["revenue", "enrollment_potential", "therapeutic_alignment", "low_burden", "short_duration", "sponsor_relationship", "low_startup_complexity"],
    topDeclineReasons: [],
    idealDurationMonths: 18,
    maxVisitBurden: 4,
    unattractiveProcedures: [],
    studyComplexityPreference: "balanced",
  },

  population: {
    strongDiseaseAreas: [],
    referralSpecialties: [],
    hardToRecruitPopulations: [],
    recruitmentChannels: [],
    geographicStrengths: "",
    diversityPriority: false,
  },

  dataReadiness: {
    ehrSystem: "",
    canExportDirectly: false,
    exportTypes: [],
    availableDomains: [],
    refreshFrequency: "",
    exportOwner: "",
    useWatchFolder: false,
    reliableFields: [],
    unreliableFields: [],
  },

  workflow: {
    primaryUsers: [],
    studyApprover: "",
    needsFinancePackets: false,
    needsFeasibilitySummaries: false,
    defaultOutputs: [],
    workspaceOptimization: "browsing",
  },
};

// ───────────────────── Reference Constants ─────────────────────

export const THERAPEUTIC_AREAS = [
  "Oncology",
  "Cardiology",
  "Neurology",
  "Immunology",
  "Diabetes/Metabolic",
  "Respiratory",
  "Gastroenterology",
  "Dermatology",
  "Ophthalmology",
  "Psychiatry",
  "Hematology",
  "Nephrology",
  "Hepatology",
  "Endocrinology",
  "Infectious Disease",
  "Rare Disease",
  "Pain/Anesthesiology",
  "Women's Health",
  "Pediatrics",
  "Urology",
  "Orthopedics",
] as const;

export const STUDY_PHASES = [
  "Phase 1",
  "Phase 1/2",
  "Phase 2",
  "Phase 2/3",
  "Phase 3",
  "Phase 4",
] as const;

export const EHR_SYSTEMS = [
  "Epic",
  "Cerner / Oracle Health",
  "MEDITECH",
  "Allscripts",
  "athenahealth",
  "eClinicalWorks",
  "NextGen",
  "Greenway Health",
  "DrChrono",
  "Practice Fusion",
  "Other",
] as const;

export const DECLINE_REASONS = [
  "Per-patient revenue too low",
  "Visit burden too high",
  "Study duration too long",
  "Insufficient patient population",
  "Complex inclusion/exclusion criteria",
  "Invasive procedures required",
  "Inadequate startup fees",
  "Sponsor/CRO reputation concerns",
  "Insufficient staffing capacity",
  "Regulatory complexity",
  "Budget negotiation stalled",
  "Competing study conflict",
] as const;

export const UNATTRACTIVE_PROCEDURES = [
  "Liver biopsy",
  "Bone marrow biopsy",
  "Lumbar puncture",
  "24hr Holter monitor",
  "PET/CT scan",
  "Colonoscopy",
  "Bronchoscopy",
  "Overnight observation",
  "Complex PK draw series",
  "Gene therapy infusion",
] as const;
