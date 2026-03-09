// ─── Research Pack Types ───
// Versioned intelligence bundles shipped monthly to SiteConnect
// Contains real clinical trial data, pricing benchmarks, and competitive landscape

// ─── Pack Envelope ───
export interface ResearchPackManifest {
  packId: string;                    // e.g., "rp-2026-03"
  version: number;                   // monotonically increasing
  generatedAt: string;               // ISO 8601
  periodStart: string;               // coverage period start
  periodEnd: string;                 // coverage period end
  dataSourceVersions: DataSourceVersions;
  checksum: string;                  // SHA-256 of contents
  studyCount: number;
  benchmarkCount: number;
  landscapeRegions: string[];
}

export interface DataSourceVersions {
  clinicalTrialsGov: string;         // API version/date of pull
  cmsFeeSchedule: string;            // e.g., "CY2026-Q1"
  industryBenchmarks: string;        // publication reference
}

// ─── Module 1: Active Study Index ───
export interface PackStudy {
  nctId: string;
  title: string;
  briefTitle: string;
  acronym: string | null;
  sponsor: string;
  leadSponsorType: "industry" | "academic" | "nih" | "other";
  collaborators: string[];
  phase: string;
  status: "recruiting" | "not_yet_recruiting" | "active_not_recruiting" | "enrolling_by_invitation";
  therapeuticArea: string;
  indication: string;
  studyType: "interventional" | "observational";
  interventionType: "drug" | "biologic" | "device" | "procedure" | "behavioral" | "combination" | "other";

  // Interventions
  interventions: PackIntervention[];

  // Enrollment data
  enrollmentTarget: number;
  enrollmentActual: number | null;
  siteCount: number | null;

  // Structured criteria
  conditions: string[];
  keyInclusionCriteria: string[];
  keyExclusionCriteria: string[];
  ageRange: { minAge: number | null; maxAge: number | null };
  sex: "all" | "male" | "female";
  healthyVolunteers: boolean;

  // Dates
  startDate: string | null;
  primaryCompletionDate: string | null;
  estimatedCompletionDate: string | null;
  lastUpdateDate: string;

  // Endpoints
  primaryEndpoint: string | null;

  // Archetype mapping
  archetypeId: string;

  // Financial estimates (integer cents)
  estimatedPerPatientCents: number;
  estimatedPerPatientLowCents: number;
  estimatedPerPatientHighCents: number;
  estimatedStartupCents: number;
  financialConfidence: "low" | "medium" | "high";

  // Competition / saturation
  competition: CompetitionDensity;
}

export interface PackIntervention {
  name: string;
  type: "drug" | "biological" | "device" | "procedure" | "behavioral" | "other";
}

export interface CompetitionDensity {
  totalSitesRecruiting: number;
  competingStudyCount: number;       // same TA + same phase studies
  sponsorActiveStudyCount: number;
  enrollmentVelocity: "slow" | "moderate" | "fast" | "unknown";
  saturationLevel: "low" | "moderate" | "high" | "saturated";
}

// ─── Module 2: Pricing & Reimbursement Benchmarks ───
export interface ProcedureBenchmark {
  procedureId: string;
  procedureName: string;
  category: string;
  cptCode: string | null;
  cmsRateCents: number;              // CMS PFS/CLFS 2025 rate
  sponsorMedianCents: number;        // industry median budget rate
  sponsorP25Cents: number;
  sponsorP75Cents: number;
  sponsorMultiplier: number;         // typical sponsor rate / CMS rate
  byPhase: Record<string, number>;   // phase -> median cents
  byTA: Record<string, number>;      // therapeutic area -> adjustment factor
  source: string;
}

export interface ReimbursementModel {
  archetypeId: string;
  phase: string;
  therapeuticArea: string;
  perPatientMedianCents: number;
  perPatientP25Cents: number;
  perPatientP75Cents: number;
  startupMedianCents: number;
  startupP25Cents: number;
  startupP75Cents: number;
  screenFailureRate: number;         // 0-1 decimal
  screenFailPaymentPercent: number;  // % of per-patient paid on SF
  coordinatorHoursPerPatient: number;
  piHoursPerPatient: number;
  avgVisitsPerPatient: number;
  avgDurationMonths: number;
  source: string;
}

// ─── Module 3: Site Economics Templates ───
export interface StudyEconomicsTemplate {
  archetypeId: string;
  label: string;
  description: string;
  revenueBreakdown: TemplateLineItem[];
  costBreakdown: TemplateLineItem[];
  kpis: EconomicsKPIs;
  assumptions: string[];
}

export interface TemplateLineItem {
  category: string;
  label: string;
  perPatientCents: number;
  percentOfTotal: number;
}

export interface EconomicsKPIs {
  grossMarginPercent: number;
  breakEvenPatients: number;
  coordinatorHoursPerPatient: number;
  piHoursPerPatient: number;
  revenuePerCoordinatorHourCents: number;
  avgVisitRevenueCents: number;
  screenToEnrollRatio: number;
}

// ─── Module 4: Competitive Landscape ───
export interface SponsorProfile {
  sponsorName: string;
  sponsorType: "large_pharma" | "mid_pharma" | "biotech" | "academic" | "nih" | "other";
  activeStudyCount: number;
  recruitingStudyCount: number;
  activeSiteCount: number | null;
  topTherapeuticAreas: string[];
  phases: Record<string, number>;
  avgPerPatientCents: number | null;
  paymentReputation: "excellent" | "good" | "fair" | "poor" | "unknown";
  avgPaymentDays: number | null;     // days to payment
  recentActivity: string;
}

export interface TherapeuticAreaLandscape {
  therapeuticArea: string;
  activeStudyCount: number;
  recruitingStudyCount: number;
  avgEnrollmentTarget: number;
  totalEnrollmentTarget: number;
  dominantSponsors: string[];
  avgPerPatientCents: number;
  pipelineTrend: "growing" | "stable" | "declining";
  competitionLevel: "low" | "moderate" | "high" | "saturated";
  screenFailureRate: number;
  avgSitesPerStudy: number;
  topIndications: string[];
}

// ─── Module 5: Regulatory Context ───
export interface RegulatoryContext {
  irbMedianApprovalDays: number;
  irbP25Days: number;
  irbP75Days: number;
  contractMedianDays: number;
  contractP25Days: number;
  contractP75Days: number;
  siteActivationMedianDays: number;
  amendmentFrequencyPerYear: number;
  avgProtocolVersions: number;
  commonDelayReasons: string[];
  byPhase: Record<string, {
    irbMedianDays: number;
    amendmentRate: number;
    activationMedianDays: number;
  }>;
}

// ─── Industry Benchmarks ───
export interface IndustryBenchmarks {
  perPatientCostsByPhase: Record<string, {
    lowCents: number;
    medianCents: number;
    highCents: number;
  }>;
  screenFailureRatesByTA: Record<string, number>;
  coordinatorEconomics: {
    avgHourlyRateCents: number;
    billableRateCents: number;
    hoursPerSimpleVisit: number;
    hoursPerModerateVisit: number;
    hoursPerComplexVisit: number;
  };
  overheadRates: {
    independentSite: number;
    academicMedicalCenter: number;
    communityHospital: number;
  };
  sponsorMarkupByCategory: Record<string, {
    lowMultiplier: number;
    highMultiplier: number;
  }>;
}

// ─── Full Research Pack ───
export interface ResearchPack {
  manifest: ResearchPackManifest;
  studies: PackStudy[];
  procedureBenchmarks: ProcedureBenchmark[];
  reimbursementModels: ReimbursementModel[];
  economicsTemplates: StudyEconomicsTemplate[];
  sponsorProfiles: SponsorProfile[];
  therapeuticAreaLandscapes: TherapeuticAreaLandscape[];
  regulatoryContext: RegulatoryContext;
  industryBenchmarks: IndustryBenchmarks;
}
