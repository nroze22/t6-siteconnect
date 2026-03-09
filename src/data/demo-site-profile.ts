/**
 * Demo Site Profile — "Pinnacle Research Institute"
 *
 * A well-established multi-specialty clinical research site in Austin, TX.
 * Strong in oncology, cardiology, immunology, and CNS — perfectly complementing
 * the 30 studies in our March 2026 research pack.
 *
 * This profile activates personalized ranking, fit scoring, and financial modeling.
 */
import type { SiteIntelligenceProfile } from "@/types/site-profile";

export const DEMO_SITE_PROFILE: SiteIntelligenceProfile = {
  version: 1,
  createdAt: "2026-01-15T00:00:00Z",
  updatedAt: "2026-03-08T00:00:00Z",
  onboardingComplete: true,

  research: {
    siteName: "Pinnacle Research Institute",
    siteType: "multi_site_group",
    activeTherapeuticAreas: [
      "Oncology",
      "Cardiology",
      "Immunology",
      "Neurology",
    ],
    growthTherapeuticAreas: [
      "Rare Disease",
      "Diabetes/Metabolic",
    ],
    studyTypes: ["drug", "device", "observational"],
    acceptedPhases: [
      "Phase 1/2",
      "Phase 2",
      "Phase 2/3",
      "Phase 3",
    ],
    avoidedStudyTypes: [],
  },

  operations: {
    coordinatorCount: 8,
    coordinatorsFTE: 6.5,
    piCount: 3,
    hasDedicatedRegulatory: true,
    hasDedicatedRecruitment: true,
    hasInHouseLab: true,
    hasInHousePharmacy: true,
    hasImagingSupport: true,
    hasInfusionCapability: true,
    hasInpatientCapability: true,
    newStudiesPerQuarter: 4,
    maxActiveStudies: 18,
  },

  financials: {
    coordinatorHourlyRateCents: 3800,   // $38/hr
    piHourlyRateCents: 17500,           // $175/hr
    regulatoryHourlyRateCents: 3200,    // $32/hr
    nurseHourlyRateCents: 5000,         // $50/hr
    overheadPercent: 30,
    includeFringeBenefits: true,
    minimumMarginPercent: 18,
    requireStartupFees: true,
    expectScreenFailReimbursement: true,
    defaultScreenFailPercent: 28,
    defaultCompletionPercent: 82,
    showScenarios: true,
  },

  preferences: {
    rankingFactors: [
      "revenue",
      "therapeutic_alignment",
      "enrollment_potential",
      "sponsor_relationship",
      "low_burden",
      "short_duration",
      "low_startup_complexity",
    ],
    topDeclineReasons: [
      "Per-patient revenue too low",
      "Insufficient patient population",
      "Budget negotiation stalled",
    ],
    idealDurationMonths: 24,
    maxVisitBurden: 5,
    unattractiveProcedures: [
      "Bone marrow biopsy",
      "Complex PK draw series",
    ],
    studyComplexityPreference: "complex_higher_upside",
  },

  population: {
    strongDiseaseAreas: [
      "Non-Small Cell Lung Cancer",
      "Colorectal Cancer",
      "Heart Failure",
      "Rheumatoid Arthritis",
      "Alzheimer's Disease",
      "Multiple Sclerosis",
      "Atopic Dermatitis",
      "ASCVD",
      "Parkinson's Disease",
    ],
    referralSpecialties: [
      "Medical Oncology",
      "Cardiology",
      "Rheumatology",
      "Neurology",
      "Pulmonology",
    ],
    hardToRecruitPopulations: [
      "Rare Disease",
      "Pediatric",
    ],
    recruitmentChannels: [
      "own_database",
      "provider_referrals",
      "community_outreach",
      "advertising",
    ],
    geographicStrengths: "Greater Austin metro area, 2.3M population catchment",
    diversityPriority: true,
  },

  dataReadiness: {
    ehrSystem: "Epic",
    canExportDirectly: true,
    exportTypes: ["csv", "excel", "fhir"],
    availableDomains: [
      "demographics",
      "diagnoses",
      "medications",
      "labs",
      "encounters",
      "providers",
    ],
    refreshFrequency: "weekly",
    exportOwner: "Data Analytics Team",
    useWatchFolder: true,
    reliableFields: [
      "Age",
      "Sex",
      "ICD-10 Diagnosis",
      "Medications",
      "Lab Results",
      "BMI",
    ],
    unreliableFields: ["Smoking Status", "Race/Ethnicity"],
  },

  workflow: {
    primaryUsers: [
      "research_director",
      "feasibility_lead",
      "coordinator",
      "pi",
    ],
    studyApprover: "Dr. Sarah Chen, Research Director",
    needsFinancePackets: true,
    needsFeasibilitySummaries: true,
    defaultOutputs: [
      "internal_review",
      "sponsor_outreach",
      "budget_negotiation",
    ],
    workspaceOptimization: "financial_review",
  },
};
