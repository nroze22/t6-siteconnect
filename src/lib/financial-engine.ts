/**
 * Financial Modeling Engine for TalOS SiteConnect
 *
 * Three-tier estimation system:
 *   Tier 1 — Study card: fast directional range + burden badges
 *   Tier 2 — Study detail: modeled estimate using protocol structure
 *   Tier 3 — Budget wizard: site-specific assumptions and overrides
 *
 * All monetary values in integer cents (USD).
 * Procedure baselines anchored to CMS physician/outpatient fee schedules.
 */

// ───────────────────── Types ─────────────────────

export type ConfidenceLevel = "low" | "medium" | "high";
export type BurdenLevel = "low" | "medium" | "high" | "very_high";
export type RiskLevel = "low" | "medium" | "high";

export interface ValueRange {
  lowCents: number;
  baseCents: number;
  highCents: number;
}

export interface StudyFinancialModel {
  // Identity
  studyId: string;
  archetype: StudyArchetypeId;
  confidence: ConfidenceLevel;

  // Tier 1 — card-level
  perPatientRange: ValueRange;
  startupRange: ValueRange;
  burdenScore: BurdenScore;
  screenFailRisk: RiskLevel;
  enrollmentFit: RiskLevel; // inverted: "high" = good fit
  timeIntensity: "short" | "medium" | "long";

  // Tier 2 — detail-level
  revenueDrivers: RevenueDriver[];
  costDrivers: CostDriver[];
  visitModel: VisitModel;
  scenarioOutputs: ScenarioOutputs;

  // Explanation
  methodology: string;
}

export interface BurdenScore {
  overall: BurdenLevel;
  operational: number; // 0–100
  startup: number;     // 0–100
  screening: number;   // 0–100
  details: {
    visitLoad: number;
    procedureIntensity: number;
    dataComplexity: number;
    logisticsComplexity: number;
    regulatoryWeight: number;
  };
}

export interface RevenueDriver {
  category: string;
  label: string;
  unitValueCents: number;
  quantity: number;
  totalCents: number;
  source: "cms_anchored" | "archetype_default" | "site_override";
}

export interface CostDriver {
  category: string;
  label: string;
  hoursPerUnit: number;
  quantity: number;
  totalHours: number;
  estimatedCostCents: number;
}

export interface VisitModel {
  screeningVisits: number;
  treatmentVisits: number;
  followUpVisits: number;
  totalVisits: number;
  avgVisitComplexity: number; // 1.0–5.0 scale
  estimatedDurationMonths: number;
  visitCadence: string; // e.g., "every 3 weeks"
}

export interface ScenarioOutputs {
  conservative: ScenarioCase;
  base: ScenarioCase;
  optimistic: ScenarioCase;
}

export interface ScenarioCase {
  label: string;
  perPatientGrossCents: number;
  perPatientNetCents: number;
  startupRevenueCents: number;
  startupCostCents: number;
  enrollmentCount: number;
  screenFailRate: number;
  completionRate: number;
  totalGrossRevenueCents: number;
  totalNetContributionCents: number;
  breakEvenEnrollment: number;
  staffingHours: number;
}

// ───────────────────── Site Assumptions ─────────────────────

export interface SiteAssumptions {
  coordinatorHourlyRateCents: number; // default 3500 ($35/hr)
  piHourlyRateCents: number;         // default 15000 ($150/hr)
  nurseHourlyRateCents: number;      // default 4500 ($45/hr)
  overheadPercent: number;           // default 25
  screenFailRatePercent: number;     // default varies by archetype
  enrollmentTarget: number;          // default from study metadata
  expectedCompletionPercent: number; // default 80
  labMarkupPercent: number;          // default 0 (pass-through)
  imagingMarkupPercent: number;      // default 0
  pharmacyHandlingCents: number;     // default 15000 ($150)
  regulatoryStartupHours: number;    // default varies by archetype
  siteOverrides: Record<string, number>; // line-item overrides in cents
}

export const DEFAULT_SITE_ASSUMPTIONS: SiteAssumptions = {
  coordinatorHourlyRateCents: 3500,
  piHourlyRateCents: 15000,
  nurseHourlyRateCents: 4500,
  overheadPercent: 25,
  screenFailRatePercent: 25,
  enrollmentTarget: 10,
  expectedCompletionPercent: 80,
  labMarkupPercent: 0,
  imagingMarkupPercent: 0,
  pharmacyHandlingCents: 15000,
  regulatoryStartupHours: 40,
  siteOverrides: {},
};

// ───────────────────── Study Archetypes ─────────────────────

export type StudyArchetypeId =
  | "simple_observational"
  | "vaccine_followup"
  | "primary_care_metabolic"
  | "cardiology_moderate"
  | "cardiology_device"
  | "gi_biologic"
  | "gi_device"
  | "oncology_infusion"
  | "oncology_immunotherapy"
  | "oncology_oral_targeted"
  | "oncology_combo_regimen"
  | "neurology_long_duration"
  | "neurology_acute"
  | "rare_disease_high_touch"
  | "autoimmune_biologic"
  | "respiratory_biologic"
  | "respiratory_inhaled"
  | "ophthalmology_injection"
  | "endocrinology_hormone"
  | "hematology_infusion"
  | "infectious_disease_vaccine"
  | "infectious_disease_antiviral"
  | "pain_management"
  | "psychiatry_oral"
  | "dermatology_biologic"
  | "dermatology_topical"
  | "renal_progressive"
  | "hepatology_oral"
  | "gene_cell_therapy"
  | "surgical_device";

export interface StudyArchetype {
  id: StudyArchetypeId;
  label: string;
  category: string;
  // Revenue benchmarks (per enrolled patient, cents)
  revenuePerPatientRange: ValueRange;
  startupRange: ValueRange;
  // Visit structure defaults
  defaultVisits: number;
  visitCadence: string;
  avgVisitComplexityUnits: number; // 1.0-5.0
  estimatedDurationMonths: number;
  // Procedure defaults
  defaultProcedures: ProcedureBundle[];
  // Burden defaults
  screenFailRangePercent: [number, number];
  coordinatorMinutesPerVisit: number;
  piMinutesPerVisit: number;
  regulatoryStartupHours: number;
  dataEntryBurden: BurdenLevel;
  vendorCoordinationBurden: BurdenLevel;
  // Multipliers
  specialtyMultiplier: number; // 1.0 = baseline
}

interface ProcedureBundle {
  procedureId: string;
  label: string;
  frequency: "every_visit" | "screening_only" | "quarterly" | "semi_annual" | "annual" | "one_time" | "select_visits";
  count: number;
}

// ───────────────────── Procedure Value Library ─────────────────────
// Anchored to CMS physician fee schedule / outpatient rates as baseline

export interface ProcedureDefinition {
  id: string;
  label: string;
  category: "office_visit" | "lab" | "imaging" | "procedure" | "infusion" | "pharmacy" | "assessment" | "specimen" | "monitoring" | "regulatory";
  cmsBaselineCents: number; // CMS reimbursement anchor
  sponsorTypicalCents: number; // Typical sponsor budget (1.3-2.5x CMS)
  complexityUnits: number; // 0.1 – 5.0
  coordinatorMinutes: number;
  piMinutes: number;
  nurseMinutes: number;
}

const PROCEDURE_LIBRARY: Record<string, ProcedureDefinition> = {
  // Office visits
  office_visit_simple: { id: "office_visit_simple", label: "Simple Office Visit (99213)", category: "office_visit", cmsBaselineCents: 11000, sponsorTypicalCents: 22000, complexityUnits: 1.0, coordinatorMinutes: 30, piMinutes: 15, nurseMinutes: 15 },
  office_visit_moderate: { id: "office_visit_moderate", label: "Moderate Office Visit (99214)", category: "office_visit", cmsBaselineCents: 15500, sponsorTypicalCents: 30000, complexityUnits: 1.5, coordinatorMinutes: 45, piMinutes: 20, nurseMinutes: 20 },
  office_visit_complex: { id: "office_visit_complex", label: "Complex Office Visit (99215)", category: "office_visit", cmsBaselineCents: 21500, sponsorTypicalCents: 42000, complexityUnits: 2.0, coordinatorMinutes: 60, piMinutes: 30, nurseMinutes: 30 },

  // Labs
  cbc: { id: "cbc", label: "CBC with Differential", category: "lab", cmsBaselineCents: 1100, sponsorTypicalCents: 3500, complexityUnits: 0.2, coordinatorMinutes: 5, piMinutes: 2, nurseMinutes: 10 },
  cmp: { id: "cmp", label: "Comprehensive Metabolic Panel", category: "lab", cmsBaselineCents: 1400, sponsorTypicalCents: 4000, complexityUnits: 0.3, coordinatorMinutes: 5, piMinutes: 2, nurseMinutes: 10 },
  lipid_panel: { id: "lipid_panel", label: "Lipid Panel", category: "lab", cmsBaselineCents: 1800, sponsorTypicalCents: 3500, complexityUnits: 0.2, coordinatorMinutes: 5, piMinutes: 2, nurseMinutes: 5 },
  hba1c: { id: "hba1c", label: "Hemoglobin A1c", category: "lab", cmsBaselineCents: 1300, sponsorTypicalCents: 3000, complexityUnits: 0.2, coordinatorMinutes: 5, piMinutes: 2, nurseMinutes: 5 },
  urinalysis: { id: "urinalysis", label: "Urinalysis with Micro", category: "lab", cmsBaselineCents: 400, sponsorTypicalCents: 2000, complexityUnits: 0.1, coordinatorMinutes: 5, piMinutes: 1, nurseMinutes: 5 },
  coagulation_panel: { id: "coagulation_panel", label: "Coagulation Panel (PT/INR/aPTT)", category: "lab", cmsBaselineCents: 1200, sponsorTypicalCents: 3500, complexityUnits: 0.3, coordinatorMinutes: 5, piMinutes: 2, nurseMinutes: 5 },
  thyroid_panel: { id: "thyroid_panel", label: "Thyroid Function Panel", category: "lab", cmsBaselineCents: 2500, sponsorTypicalCents: 4500, complexityUnits: 0.3, coordinatorMinutes: 5, piMinutes: 2, nurseMinutes: 5 },
  hepatic_panel: { id: "hepatic_panel", label: "Hepatic Function Panel", category: "lab", cmsBaselineCents: 1100, sponsorTypicalCents: 3500, complexityUnits: 0.3, coordinatorMinutes: 5, piMinutes: 2, nurseMinutes: 5 },
  tumor_markers: { id: "tumor_markers", label: "Tumor Markers (CEA/AFP/PSA)", category: "lab", cmsBaselineCents: 3000, sponsorTypicalCents: 8000, complexityUnits: 0.5, coordinatorMinutes: 10, piMinutes: 5, nurseMinutes: 5 },
  pk_draw_series: { id: "pk_draw_series", label: "PK Draw Series (multi-timepoint)", category: "lab", cmsBaselineCents: 5000, sponsorTypicalCents: 15000, complexityUnits: 1.2, coordinatorMinutes: 30, piMinutes: 5, nurseMinutes: 45 },
  biomarker_panel: { id: "biomarker_panel", label: "Specialized Biomarker Panel", category: "lab", cmsBaselineCents: 8000, sponsorTypicalCents: 18000, complexityUnits: 0.8, coordinatorMinutes: 15, piMinutes: 5, nurseMinutes: 10 },
  pregnancy_test: { id: "pregnancy_test", label: "Pregnancy Test (serum)", category: "lab", cmsBaselineCents: 1000, sponsorTypicalCents: 2000, complexityUnits: 0.1, coordinatorMinutes: 3, piMinutes: 0, nurseMinutes: 5 },
  viral_load: { id: "viral_load", label: "Viral Load / PCR", category: "lab", cmsBaselineCents: 5500, sponsorTypicalCents: 12000, complexityUnits: 0.6, coordinatorMinutes: 10, piMinutes: 3, nurseMinutes: 10 },

  // Imaging
  xray: { id: "xray", label: "X-Ray (2-view)", category: "imaging", cmsBaselineCents: 4500, sponsorTypicalCents: 12000, complexityUnits: 0.5, coordinatorMinutes: 15, piMinutes: 5, nurseMinutes: 10 },
  ct_scan: { id: "ct_scan", label: "CT Scan (with contrast)", category: "imaging", cmsBaselineCents: 25000, sponsorTypicalCents: 50000, complexityUnits: 1.5, coordinatorMinutes: 30, piMinutes: 10, nurseMinutes: 20 },
  mri: { id: "mri", label: "MRI (with contrast)", category: "imaging", cmsBaselineCents: 35000, sponsorTypicalCents: 75000, complexityUnits: 2.5, coordinatorMinutes: 45, piMinutes: 15, nurseMinutes: 20 },
  pet_ct: { id: "pet_ct", label: "PET/CT Scan", category: "imaging", cmsBaselineCents: 65000, sponsorTypicalCents: 120000, complexityUnits: 3.5, coordinatorMinutes: 60, piMinutes: 15, nurseMinutes: 30 },
  dexa: { id: "dexa", label: "DEXA Bone Density", category: "imaging", cmsBaselineCents: 7500, sponsorTypicalCents: 18000, complexityUnits: 0.5, coordinatorMinutes: 15, piMinutes: 5, nurseMinutes: 10 },
  echocardiogram: { id: "echocardiogram", label: "Echocardiogram (TTE)", category: "imaging", cmsBaselineCents: 22000, sponsorTypicalCents: 45000, complexityUnits: 1.5, coordinatorMinutes: 30, piMinutes: 10, nurseMinutes: 15 },
  ultrasound: { id: "ultrasound", label: "Ultrasound (diagnostic)", category: "imaging", cmsBaselineCents: 12000, sponsorTypicalCents: 25000, complexityUnits: 0.8, coordinatorMinutes: 20, piMinutes: 5, nurseMinutes: 10 },

  // Procedures
  ecg: { id: "ecg", label: "12-Lead ECG", category: "procedure", cmsBaselineCents: 2600, sponsorTypicalCents: 8000, complexityUnits: 0.3, coordinatorMinutes: 10, piMinutes: 5, nurseMinutes: 10 },
  holter_monitor: { id: "holter_monitor", label: "24hr Holter Monitor", category: "procedure", cmsBaselineCents: 8500, sponsorTypicalCents: 20000, complexityUnits: 1.0, coordinatorMinutes: 30, piMinutes: 10, nurseMinutes: 20 },
  biopsy_skin: { id: "biopsy_skin", label: "Skin Biopsy (punch)", category: "procedure", cmsBaselineCents: 12000, sponsorTypicalCents: 35000, complexityUnits: 2.0, coordinatorMinutes: 30, piMinutes: 20, nurseMinutes: 20 },
  biopsy_core: { id: "biopsy_core", label: "Core Needle Biopsy", category: "procedure", cmsBaselineCents: 25000, sponsorTypicalCents: 65000, complexityUnits: 4.0, coordinatorMinutes: 45, piMinutes: 30, nurseMinutes: 30 },
  biopsy_surgical: { id: "biopsy_surgical", label: "Surgical Biopsy", category: "procedure", cmsBaselineCents: 45000, sponsorTypicalCents: 120000, complexityUnits: 5.0, coordinatorMinutes: 60, piMinutes: 60, nurseMinutes: 45 },
  spirometry: { id: "spirometry", label: "Spirometry / PFT", category: "procedure", cmsBaselineCents: 6000, sponsorTypicalCents: 15000, complexityUnits: 0.8, coordinatorMinutes: 20, piMinutes: 5, nurseMinutes: 15 },
  endoscopy: { id: "endoscopy", label: "Endoscopy", category: "procedure", cmsBaselineCents: 45000, sponsorTypicalCents: 95000, complexityUnits: 4.0, coordinatorMinutes: 60, piMinutes: 45, nurseMinutes: 60 },
  colonoscopy: { id: "colonoscopy", label: "Colonoscopy", category: "procedure", cmsBaselineCents: 55000, sponsorTypicalCents: 110000, complexityUnits: 4.5, coordinatorMinutes: 60, piMinutes: 60, nurseMinutes: 60 },
  lumbar_puncture: { id: "lumbar_puncture", label: "Lumbar Puncture / CSF Collection", category: "procedure", cmsBaselineCents: 30000, sponsorTypicalCents: 75000, complexityUnits: 3.5, coordinatorMinutes: 45, piMinutes: 30, nurseMinutes: 30 },
  bone_marrow_biopsy: { id: "bone_marrow_biopsy", label: "Bone Marrow Aspirate/Biopsy", category: "procedure", cmsBaselineCents: 35000, sponsorTypicalCents: 85000, complexityUnits: 4.5, coordinatorMinutes: 60, piMinutes: 45, nurseMinutes: 30 },

  // Infusions
  infusion_simple: { id: "infusion_simple", label: "IV Infusion (≤1 hr)", category: "infusion", cmsBaselineCents: 15000, sponsorTypicalCents: 45000, complexityUnits: 2.0, coordinatorMinutes: 30, piMinutes: 10, nurseMinutes: 90 },
  infusion_complex: { id: "infusion_complex", label: "IV Infusion (>1 hr, with monitoring)", category: "infusion", cmsBaselineCents: 25000, sponsorTypicalCents: 75000, complexityUnits: 3.5, coordinatorMinutes: 45, piMinutes: 15, nurseMinutes: 180 },
  subq_injection: { id: "subq_injection", label: "Subcutaneous Injection", category: "infusion", cmsBaselineCents: 5000, sponsorTypicalCents: 15000, complexityUnits: 0.5, coordinatorMinutes: 15, piMinutes: 5, nurseMinutes: 15 },
  intravitreal_injection: { id: "intravitreal_injection", label: "Intravitreal Injection", category: "infusion", cmsBaselineCents: 35000, sponsorTypicalCents: 80000, complexityUnits: 3.0, coordinatorMinutes: 30, piMinutes: 30, nurseMinutes: 30 },

  // Assessments
  informed_consent: { id: "informed_consent", label: "Informed Consent Process", category: "assessment", cmsBaselineCents: 0, sponsorTypicalCents: 10000, complexityUnits: 0.5, coordinatorMinutes: 45, piMinutes: 15, nurseMinutes: 0 },
  physical_exam: { id: "physical_exam", label: "Full Physical Examination", category: "assessment", cmsBaselineCents: 8000, sponsorTypicalCents: 15000, complexityUnits: 0.8, coordinatorMinutes: 15, piMinutes: 20, nurseMinutes: 15 },
  vitals: { id: "vitals", label: "Vital Signs Collection", category: "assessment", cmsBaselineCents: 500, sponsorTypicalCents: 3000, complexityUnits: 0.1, coordinatorMinutes: 5, piMinutes: 0, nurseMinutes: 10 },
  pro_questionnaire: { id: "pro_questionnaire", label: "PRO/ePRO Questionnaire", category: "assessment", cmsBaselineCents: 0, sponsorTypicalCents: 5000, complexityUnits: 0.3, coordinatorMinutes: 15, piMinutes: 0, nurseMinutes: 5 },
  cognitive_assessment: { id: "cognitive_assessment", label: "Cognitive Assessment (MMSE/MoCA)", category: "assessment", cmsBaselineCents: 4500, sponsorTypicalCents: 12000, complexityUnits: 0.8, coordinatorMinutes: 30, piMinutes: 15, nurseMinutes: 0 },
  qol_assessment: { id: "qol_assessment", label: "Quality of Life Assessment", category: "assessment", cmsBaselineCents: 0, sponsorTypicalCents: 5000, complexityUnits: 0.3, coordinatorMinutes: 15, piMinutes: 0, nurseMinutes: 0 },
  pain_assessment: { id: "pain_assessment", label: "Pain Scale / NRS / VAS", category: "assessment", cmsBaselineCents: 0, sponsorTypicalCents: 3000, complexityUnits: 0.2, coordinatorMinutes: 10, piMinutes: 5, nurseMinutes: 5 },
  diary_review: { id: "diary_review", label: "Patient Diary / Device Review", category: "assessment", cmsBaselineCents: 0, sponsorTypicalCents: 5000, complexityUnits: 0.3, coordinatorMinutes: 20, piMinutes: 5, nurseMinutes: 0 },
  body_surface_assessment: { id: "body_surface_assessment", label: "Body Surface Assessment (BSA/EASI/PASI)", category: "assessment", cmsBaselineCents: 3000, sponsorTypicalCents: 10000, complexityUnits: 0.6, coordinatorMinutes: 20, piMinutes: 15, nurseMinutes: 5 },

  // Specimen handling
  specimen_processing: { id: "specimen_processing", label: "Specimen Processing & Shipping", category: "specimen", cmsBaselineCents: 0, sponsorTypicalCents: 8000, complexityUnits: 0.4, coordinatorMinutes: 20, piMinutes: 0, nurseMinutes: 15 },
  biobank_collection: { id: "biobank_collection", label: "Biobank / Exploratory Sample Collection", category: "specimen", cmsBaselineCents: 0, sponsorTypicalCents: 10000, complexityUnits: 0.5, coordinatorMinutes: 25, piMinutes: 0, nurseMinutes: 15 },

  // Monitoring / safety
  ae_sae_reporting: { id: "ae_sae_reporting", label: "AE/SAE Assessment & Reporting", category: "monitoring", cmsBaselineCents: 0, sponsorTypicalCents: 8000, complexityUnits: 0.4, coordinatorMinutes: 30, piMinutes: 10, nurseMinutes: 5 },
  conmed_review: { id: "conmed_review", label: "Concomitant Medication Review", category: "monitoring", cmsBaselineCents: 0, sponsorTypicalCents: 4000, complexityUnits: 0.2, coordinatorMinutes: 15, piMinutes: 5, nurseMinutes: 0 },
  dose_modification: { id: "dose_modification", label: "Dose Modification / Titration", category: "monitoring", cmsBaselineCents: 0, sponsorTypicalCents: 8000, complexityUnits: 0.5, coordinatorMinutes: 20, piMinutes: 15, nurseMinutes: 10 },
  dsmb_unblinding: { id: "dsmb_unblinding", label: "Unblinding / Emergency Procedures", category: "monitoring", cmsBaselineCents: 0, sponsorTypicalCents: 15000, complexityUnits: 1.0, coordinatorMinutes: 30, piMinutes: 20, nurseMinutes: 15 },

  // Regulatory / startup
  irb_submission: { id: "irb_submission", label: "IRB/EC Submission", category: "regulatory", cmsBaselineCents: 0, sponsorTypicalCents: 50000, complexityUnits: 0.0, coordinatorMinutes: 0, piMinutes: 0, nurseMinutes: 0 },
  site_initiation: { id: "site_initiation", label: "Site Initiation Visit", category: "regulatory", cmsBaselineCents: 0, sponsorTypicalCents: 35000, complexityUnits: 0.0, coordinatorMinutes: 0, piMinutes: 0, nurseMinutes: 0 },
  closeout_visit: { id: "closeout_visit", label: "Closeout Visit", category: "regulatory", cmsBaselineCents: 0, sponsorTypicalCents: 25000, complexityUnits: 0.0, coordinatorMinutes: 0, piMinutes: 0, nurseMinutes: 0 },
};

// ───────────────────── Archetype Definitions ─────────────────────

const STUDY_ARCHETYPES: Record<StudyArchetypeId, StudyArchetype> = {
  simple_observational: {
    id: "simple_observational", label: "Simple Observational", category: "Observational",
    revenuePerPatientRange: { lowCents: 200000, baseCents: 350000, highCents: 500000 },
    startupRange: { lowCents: 800000, baseCents: 1200000, highCents: 1600000 },
    defaultVisits: 6, visitCadence: "every 3 months", avgVisitComplexityUnits: 1.2, estimatedDurationMonths: 18,
    defaultProcedures: [
      { procedureId: "office_visit_simple", label: "Office Visit", frequency: "every_visit", count: 6 },
      { procedureId: "vitals", label: "Vitals", frequency: "every_visit", count: 6 },
      { procedureId: "cbc", label: "CBC", frequency: "quarterly", count: 4 },
      { procedureId: "pro_questionnaire", label: "PRO", frequency: "every_visit", count: 6 },
    ],
    screenFailRangePercent: [10, 20], coordinatorMinutesPerVisit: 30, piMinutesPerVisit: 10, regulatoryStartupHours: 20,
    dataEntryBurden: "low", vendorCoordinationBurden: "low", specialtyMultiplier: 1.0,
  },
  vaccine_followup: {
    id: "vaccine_followup", label: "Vaccine Follow-Up", category: "Infectious Disease",
    revenuePerPatientRange: { lowCents: 300000, baseCents: 500000, highCents: 800000 },
    startupRange: { lowCents: 1000000, baseCents: 1500000, highCents: 2000000 },
    defaultVisits: 8, visitCadence: "days 1, 7, 28, then monthly", avgVisitComplexityUnits: 1.5, estimatedDurationMonths: 12,
    defaultProcedures: [
      { procedureId: "office_visit_simple", label: "Office Visit", frequency: "every_visit", count: 8 },
      { procedureId: "vitals", label: "Vitals", frequency: "every_visit", count: 8 },
      { procedureId: "cbc", label: "CBC", frequency: "select_visits", count: 4 },
      { procedureId: "subq_injection", label: "Injection", frequency: "one_time", count: 2 },
      { procedureId: "specimen_processing", label: "Serology Samples", frequency: "select_visits", count: 5 },
    ],
    screenFailRangePercent: [15, 25], coordinatorMinutesPerVisit: 35, piMinutesPerVisit: 10, regulatoryStartupHours: 30,
    dataEntryBurden: "medium", vendorCoordinationBurden: "low", specialtyMultiplier: 1.0,
  },
  primary_care_metabolic: {
    id: "primary_care_metabolic", label: "Primary Care Metabolic", category: "Diabetes/Metabolic",
    revenuePerPatientRange: { lowCents: 600000, baseCents: 1000000, highCents: 1600000 },
    startupRange: { lowCents: 1500000, baseCents: 2000000, highCents: 2800000 },
    defaultVisits: 12, visitCadence: "every 4 weeks", avgVisitComplexityUnits: 1.5, estimatedDurationMonths: 12,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 12 },
      { procedureId: "vitals", label: "Vitals", frequency: "every_visit", count: 12 },
      { procedureId: "cbc", label: "CBC", frequency: "quarterly", count: 4 },
      { procedureId: "cmp", label: "CMP", frequency: "quarterly", count: 4 },
      { procedureId: "hba1c", label: "HbA1c", frequency: "quarterly", count: 4 },
      { procedureId: "lipid_panel", label: "Lipid Panel", frequency: "semi_annual", count: 2 },
      { procedureId: "ecg", label: "ECG", frequency: "screening_only", count: 1 },
      { procedureId: "physical_exam", label: "Physical Exam", frequency: "screening_only", count: 1 },
      { procedureId: "pro_questionnaire", label: "PRO", frequency: "every_visit", count: 12 },
    ],
    screenFailRangePercent: [15, 30], coordinatorMinutesPerVisit: 40, piMinutesPerVisit: 15, regulatoryStartupHours: 30,
    dataEntryBurden: "medium", vendorCoordinationBurden: "low", specialtyMultiplier: 1.0,
  },
  cardiology_moderate: {
    id: "cardiology_moderate", label: "Cardiology Moderate Complexity", category: "Cardiology",
    revenuePerPatientRange: { lowCents: 1000000, baseCents: 1800000, highCents: 2500000 },
    startupRange: { lowCents: 2000000, baseCents: 2800000, highCents: 3500000 },
    defaultVisits: 14, visitCadence: "every 4 weeks", avgVisitComplexityUnits: 2.0, estimatedDurationMonths: 18,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 14 },
      { procedureId: "vitals", label: "Vitals", frequency: "every_visit", count: 14 },
      { procedureId: "ecg", label: "12-Lead ECG", frequency: "every_visit", count: 14 },
      { procedureId: "cbc", label: "CBC", frequency: "quarterly", count: 6 },
      { procedureId: "cmp", label: "CMP", frequency: "quarterly", count: 6 },
      { procedureId: "echocardiogram", label: "Echo", frequency: "semi_annual", count: 3 },
      { procedureId: "holter_monitor", label: "Holter Monitor", frequency: "annual", count: 1 },
      { procedureId: "physical_exam", label: "Physical Exam", frequency: "semi_annual", count: 3 },
      { procedureId: "pro_questionnaire", label: "PRO/QoL", frequency: "every_visit", count: 14 },
      { procedureId: "ae_sae_reporting", label: "AE Assessment", frequency: "every_visit", count: 14 },
    ],
    screenFailRangePercent: [20, 35], coordinatorMinutesPerVisit: 50, piMinutesPerVisit: 20, regulatoryStartupHours: 40,
    dataEntryBurden: "medium", vendorCoordinationBurden: "medium", specialtyMultiplier: 1.15,
  },
  cardiology_device: {
    id: "cardiology_device", label: "Cardiology Device Trial", category: "Cardiology",
    revenuePerPatientRange: { lowCents: 2000000, baseCents: 3500000, highCents: 5000000 },
    startupRange: { lowCents: 3500000, baseCents: 5000000, highCents: 7000000 },
    defaultVisits: 16, visitCadence: "variable", avgVisitComplexityUnits: 3.0, estimatedDurationMonths: 24,
    defaultProcedures: [
      { procedureId: "office_visit_complex", label: "Office Visit", frequency: "every_visit", count: 16 },
      { procedureId: "ecg", label: "ECG", frequency: "every_visit", count: 16 },
      { procedureId: "echocardiogram", label: "Echo", frequency: "quarterly", count: 8 },
      { procedureId: "ct_scan", label: "CT Scan", frequency: "semi_annual", count: 4 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 16 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 16 },
      { procedureId: "coagulation_panel", label: "Coag Panel", frequency: "quarterly", count: 8 },
    ],
    screenFailRangePercent: [25, 40], coordinatorMinutesPerVisit: 60, piMinutesPerVisit: 30, regulatoryStartupHours: 60,
    dataEntryBurden: "high", vendorCoordinationBurden: "high", specialtyMultiplier: 1.4,
  },
  gi_biologic: {
    id: "gi_biologic", label: "GI Biologic Therapy", category: "Gastroenterology",
    revenuePerPatientRange: { lowCents: 1500000, baseCents: 2800000, highCents: 3800000 },
    startupRange: { lowCents: 2500000, baseCents: 3200000, highCents: 4000000 },
    defaultVisits: 14, visitCadence: "induction q2w, maintenance q4-8w", avgVisitComplexityUnits: 2.5, estimatedDurationMonths: 15,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 14 },
      { procedureId: "infusion_complex", label: "IV Infusion", frequency: "select_visits", count: 6 },
      { procedureId: "subq_injection", label: "SC Injection", frequency: "select_visits", count: 8 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 14 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 14 },
      { procedureId: "endoscopy", label: "Endoscopy", frequency: "select_visits", count: 2 },
      { procedureId: "specimen_processing", label: "Stool Samples", frequency: "quarterly", count: 4 },
      { procedureId: "pro_questionnaire", label: "PRO/CDAI", frequency: "every_visit", count: 14 },
    ],
    screenFailRangePercent: [25, 40], coordinatorMinutesPerVisit: 55, piMinutesPerVisit: 20, regulatoryStartupHours: 40,
    dataEntryBurden: "high", vendorCoordinationBurden: "medium", specialtyMultiplier: 1.2,
  },
  gi_device: {
    id: "gi_device", label: "GI Device Study", category: "Gastroenterology",
    revenuePerPatientRange: { lowCents: 2500000, baseCents: 4000000, highCents: 5500000 },
    startupRange: { lowCents: 3000000, baseCents: 4500000, highCents: 6000000 },
    defaultVisits: 12, visitCadence: "variable with procedure windows", avgVisitComplexityUnits: 3.5, estimatedDurationMonths: 18,
    defaultProcedures: [
      { procedureId: "office_visit_complex", label: "Office Visit", frequency: "every_visit", count: 12 },
      { procedureId: "endoscopy", label: "Endoscopy", frequency: "select_visits", count: 3 },
      { procedureId: "colonoscopy", label: "Colonoscopy", frequency: "select_visits", count: 2 },
      { procedureId: "ct_scan", label: "CT Scan", frequency: "semi_annual", count: 3 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 12 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 12 },
    ],
    screenFailRangePercent: [30, 45], coordinatorMinutesPerVisit: 60, piMinutesPerVisit: 30, regulatoryStartupHours: 50,
    dataEntryBurden: "high", vendorCoordinationBurden: "high", specialtyMultiplier: 1.4,
  },
  oncology_infusion: {
    id: "oncology_infusion", label: "Oncology Infusion-Heavy", category: "Oncology",
    revenuePerPatientRange: { lowCents: 3000000, baseCents: 4500000, highCents: 6500000 },
    startupRange: { lowCents: 3000000, baseCents: 4000000, highCents: 5500000 },
    defaultVisits: 18, visitCadence: "q2-3 weeks during treatment", avgVisitComplexityUnits: 3.0, estimatedDurationMonths: 24,
    defaultProcedures: [
      { procedureId: "office_visit_complex", label: "Office Visit", frequency: "every_visit", count: 18 },
      { procedureId: "infusion_complex", label: "Chemo Infusion", frequency: "select_visits", count: 12 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 18 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 18 },
      { procedureId: "tumor_markers", label: "Tumor Markers", frequency: "quarterly", count: 6 },
      { procedureId: "ct_scan", label: "CT (RECIST)", frequency: "quarterly", count: 6 },
      { procedureId: "ecg", label: "ECG", frequency: "quarterly", count: 6 },
      { procedureId: "pk_draw_series", label: "PK Draws", frequency: "select_visits", count: 4 },
      { procedureId: "biopsy_core", label: "Tumor Biopsy", frequency: "select_visits", count: 2 },
      { procedureId: "specimen_processing", label: "Biospecimens", frequency: "every_visit", count: 18 },
      { procedureId: "ae_sae_reporting", label: "AE/SAE", frequency: "every_visit", count: 18 },
      { procedureId: "conmed_review", label: "Conmeds", frequency: "every_visit", count: 18 },
    ],
    screenFailRangePercent: [30, 50], coordinatorMinutesPerVisit: 75, piMinutesPerVisit: 25, regulatoryStartupHours: 50,
    dataEntryBurden: "very_high", vendorCoordinationBurden: "high", specialtyMultiplier: 1.5,
  },
  oncology_immunotherapy: {
    id: "oncology_immunotherapy", label: "Oncology Immunotherapy", category: "Oncology",
    revenuePerPatientRange: { lowCents: 2500000, baseCents: 4200000, highCents: 6000000 },
    startupRange: { lowCents: 3000000, baseCents: 3800000, highCents: 5000000 },
    defaultVisits: 16, visitCadence: "q3 weeks (6 cycles) then q6 weeks", avgVisitComplexityUnits: 2.8, estimatedDurationMonths: 24,
    defaultProcedures: [
      { procedureId: "office_visit_complex", label: "Office Visit", frequency: "every_visit", count: 16 },
      { procedureId: "infusion_simple", label: "IO Infusion", frequency: "select_visits", count: 10 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 16 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 16 },
      { procedureId: "thyroid_panel", label: "Thyroid Panel", frequency: "quarterly", count: 6 },
      { procedureId: "ct_scan", label: "CT (RECIST)", frequency: "quarterly", count: 6 },
      { procedureId: "biopsy_core", label: "Tumor Biopsy", frequency: "select_visits", count: 2 },
      { procedureId: "biomarker_panel", label: "Biomarkers (PD-L1)", frequency: "select_visits", count: 3 },
      { procedureId: "ae_sae_reporting", label: "AE/SAE", frequency: "every_visit", count: 16 },
    ],
    screenFailRangePercent: [30, 50], coordinatorMinutesPerVisit: 70, piMinutesPerVisit: 25, regulatoryStartupHours: 50,
    dataEntryBurden: "very_high", vendorCoordinationBurden: "high", specialtyMultiplier: 1.5,
  },
  oncology_oral_targeted: {
    id: "oncology_oral_targeted", label: "Oncology Oral Targeted", category: "Oncology",
    revenuePerPatientRange: { lowCents: 1800000, baseCents: 3000000, highCents: 4200000 },
    startupRange: { lowCents: 2500000, baseCents: 3500000, highCents: 4500000 },
    defaultVisits: 14, visitCadence: "q4 weeks", avgVisitComplexityUnits: 2.2, estimatedDurationMonths: 18,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 14 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 14 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 14 },
      { procedureId: "ct_scan", label: "CT (RECIST)", frequency: "quarterly", count: 5 },
      { procedureId: "ecg", label: "ECG", frequency: "quarterly", count: 5 },
      { procedureId: "pk_draw_series", label: "PK Draws", frequency: "select_visits", count: 3 },
      { procedureId: "ae_sae_reporting", label: "AE/SAE", frequency: "every_visit", count: 14 },
      { procedureId: "diary_review", label: "Adherence Diary", frequency: "every_visit", count: 14 },
    ],
    screenFailRangePercent: [25, 40], coordinatorMinutesPerVisit: 55, piMinutesPerVisit: 20, regulatoryStartupHours: 40,
    dataEntryBurden: "high", vendorCoordinationBurden: "medium", specialtyMultiplier: 1.4,
  },
  oncology_combo_regimen: {
    id: "oncology_combo_regimen", label: "Oncology Combo Regimen", category: "Oncology",
    revenuePerPatientRange: { lowCents: 3500000, baseCents: 5500000, highCents: 8000000 },
    startupRange: { lowCents: 3500000, baseCents: 5000000, highCents: 6500000 },
    defaultVisits: 22, visitCadence: "q2-3 weeks induction, then q3-4 weeks", avgVisitComplexityUnits: 3.5, estimatedDurationMonths: 30,
    defaultProcedures: [
      { procedureId: "office_visit_complex", label: "Office Visit", frequency: "every_visit", count: 22 },
      { procedureId: "infusion_complex", label: "Chemo + IO Infusion", frequency: "select_visits", count: 16 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 22 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 22 },
      { procedureId: "tumor_markers", label: "Tumor Markers", frequency: "quarterly", count: 8 },
      { procedureId: "ct_scan", label: "CT (RECIST)", frequency: "quarterly", count: 8 },
      { procedureId: "pet_ct", label: "PET/CT", frequency: "semi_annual", count: 4 },
      { procedureId: "biopsy_core", label: "Tumor Biopsy", frequency: "select_visits", count: 3 },
      { procedureId: "pk_draw_series", label: "PK Draws", frequency: "select_visits", count: 6 },
      { procedureId: "specimen_processing", label: "Biospecimens", frequency: "every_visit", count: 22 },
      { procedureId: "ae_sae_reporting", label: "AE/SAE", frequency: "every_visit", count: 22 },
      { procedureId: "dose_modification", label: "Dose Mods", frequency: "select_visits", count: 8 },
    ],
    screenFailRangePercent: [35, 55], coordinatorMinutesPerVisit: 90, piMinutesPerVisit: 30, regulatoryStartupHours: 60,
    dataEntryBurden: "very_high", vendorCoordinationBurden: "very_high", specialtyMultiplier: 1.6,
  },
  neurology_long_duration: {
    id: "neurology_long_duration", label: "Neurology Long Duration", category: "Neurology",
    revenuePerPatientRange: { lowCents: 2000000, baseCents: 3500000, highCents: 5000000 },
    startupRange: { lowCents: 3000000, baseCents: 4200000, highCents: 5500000 },
    defaultVisits: 16, visitCadence: "q4-8 weeks", avgVisitComplexityUnits: 2.5, estimatedDurationMonths: 24,
    defaultProcedures: [
      { procedureId: "office_visit_complex", label: "Office Visit", frequency: "every_visit", count: 16 },
      { procedureId: "cognitive_assessment", label: "Cognitive Testing", frequency: "every_visit", count: 16 },
      { procedureId: "mri", label: "Brain MRI", frequency: "semi_annual", count: 4 },
      { procedureId: "pet_ct", label: "Amyloid PET", frequency: "annual", count: 2 },
      { procedureId: "lumbar_puncture", label: "Lumbar Puncture", frequency: "select_visits", count: 2 },
      { procedureId: "cbc", label: "CBC", frequency: "quarterly", count: 8 },
      { procedureId: "cmp", label: "CMP", frequency: "quarterly", count: 8 },
      { procedureId: "infusion_complex", label: "IV Infusion", frequency: "select_visits", count: 10 },
      { procedureId: "physical_exam", label: "Neurological Exam", frequency: "quarterly", count: 8 },
      { procedureId: "qol_assessment", label: "QoL / ADL", frequency: "every_visit", count: 16 },
    ],
    screenFailRangePercent: [35, 55], coordinatorMinutesPerVisit: 70, piMinutesPerVisit: 30, regulatoryStartupHours: 50,
    dataEntryBurden: "high", vendorCoordinationBurden: "high", specialtyMultiplier: 1.4,
  },
  neurology_acute: {
    id: "neurology_acute", label: "Neurology Acute / CNS", category: "Neurology",
    revenuePerPatientRange: { lowCents: 1500000, baseCents: 2500000, highCents: 3500000 },
    startupRange: { lowCents: 2000000, baseCents: 3000000, highCents: 4000000 },
    defaultVisits: 10, visitCadence: "acute window then q4 weeks", avgVisitComplexityUnits: 2.5, estimatedDurationMonths: 6,
    defaultProcedures: [
      { procedureId: "office_visit_complex", label: "Office Visit", frequency: "every_visit", count: 10 },
      { procedureId: "mri", label: "Brain MRI", frequency: "select_visits", count: 3 },
      { procedureId: "ct_scan", label: "CT Head", frequency: "select_visits", count: 2 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 10 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 10 },
      { procedureId: "cognitive_assessment", label: "NIHSS / Cognitive", frequency: "every_visit", count: 10 },
    ],
    screenFailRangePercent: [30, 50], coordinatorMinutesPerVisit: 60, piMinutesPerVisit: 30, regulatoryStartupHours: 40,
    dataEntryBurden: "high", vendorCoordinationBurden: "medium", specialtyMultiplier: 1.3,
  },
  rare_disease_high_touch: {
    id: "rare_disease_high_touch", label: "Rare Disease High Touch", category: "Rare Disease",
    revenuePerPatientRange: { lowCents: 4000000, baseCents: 7000000, highCents: 12000000 },
    startupRange: { lowCents: 5000000, baseCents: 7000000, highCents: 10000000 },
    defaultVisits: 20, visitCadence: "q2-4 weeks", avgVisitComplexityUnits: 3.5, estimatedDurationMonths: 24,
    defaultProcedures: [
      { procedureId: "office_visit_complex", label: "Office Visit", frequency: "every_visit", count: 20 },
      { procedureId: "infusion_complex", label: "IV Infusion", frequency: "select_visits", count: 14 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 20 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 20 },
      { procedureId: "biomarker_panel", label: "Specialty Biomarkers", frequency: "quarterly", count: 8 },
      { procedureId: "mri", label: "MRI", frequency: "semi_annual", count: 4 },
      { procedureId: "specimen_processing", label: "Biospecimens", frequency: "every_visit", count: 20 },
      { procedureId: "pk_draw_series", label: "PK Draws", frequency: "select_visits", count: 6 },
      { procedureId: "physical_exam", label: "Specialist Exam", frequency: "every_visit", count: 20 },
      { procedureId: "pro_questionnaire", label: "PRO", frequency: "every_visit", count: 20 },
    ],
    screenFailRangePercent: [40, 65], coordinatorMinutesPerVisit: 90, piMinutesPerVisit: 35, regulatoryStartupHours: 60,
    dataEntryBurden: "very_high", vendorCoordinationBurden: "very_high", specialtyMultiplier: 2.0,
  },
  autoimmune_biologic: {
    id: "autoimmune_biologic", label: "Autoimmune Biologic", category: "Immunology",
    revenuePerPatientRange: { lowCents: 1500000, baseCents: 2500000, highCents: 3500000 },
    startupRange: { lowCents: 2000000, baseCents: 3000000, highCents: 4000000 },
    defaultVisits: 14, visitCadence: "q4 weeks", avgVisitComplexityUnits: 2.0, estimatedDurationMonths: 15,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 14 },
      { procedureId: "subq_injection", label: "SC Injection", frequency: "every_visit", count: 14 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 14 },
      { procedureId: "cmp", label: "CMP", frequency: "quarterly", count: 5 },
      { procedureId: "biomarker_panel", label: "Autoimmune Panel", frequency: "quarterly", count: 5 },
      { procedureId: "pro_questionnaire", label: "PRO/Disease Activity", frequency: "every_visit", count: 14 },
      { procedureId: "physical_exam", label: "Joint/Disease Exam", frequency: "every_visit", count: 14 },
    ],
    screenFailRangePercent: [20, 35], coordinatorMinutesPerVisit: 50, piMinutesPerVisit: 20, regulatoryStartupHours: 35,
    dataEntryBurden: "medium", vendorCoordinationBurden: "medium", specialtyMultiplier: 1.2,
  },
  respiratory_biologic: {
    id: "respiratory_biologic", label: "Respiratory Biologic", category: "Respiratory",
    revenuePerPatientRange: { lowCents: 1200000, baseCents: 2000000, highCents: 2800000 },
    startupRange: { lowCents: 1800000, baseCents: 2500000, highCents: 3200000 },
    defaultVisits: 12, visitCadence: "q4 weeks", avgVisitComplexityUnits: 1.8, estimatedDurationMonths: 12,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 12 },
      { procedureId: "subq_injection", label: "SC Injection", frequency: "every_visit", count: 12 },
      { procedureId: "spirometry", label: "Spirometry", frequency: "every_visit", count: 12 },
      { procedureId: "cbc", label: "CBC", frequency: "quarterly", count: 4 },
      { procedureId: "pro_questionnaire", label: "ACQ / AQLQ", frequency: "every_visit", count: 12 },
      { procedureId: "diary_review", label: "Symptom Diary", frequency: "every_visit", count: 12 },
    ],
    screenFailRangePercent: [20, 35], coordinatorMinutesPerVisit: 45, piMinutesPerVisit: 15, regulatoryStartupHours: 30,
    dataEntryBurden: "medium", vendorCoordinationBurden: "low", specialtyMultiplier: 1.1,
  },
  respiratory_inhaled: {
    id: "respiratory_inhaled", label: "Respiratory Inhaled Therapy", category: "Respiratory",
    revenuePerPatientRange: { lowCents: 800000, baseCents: 1400000, highCents: 2000000 },
    startupRange: { lowCents: 1500000, baseCents: 2000000, highCents: 2800000 },
    defaultVisits: 10, visitCadence: "q4-6 weeks", avgVisitComplexityUnits: 1.5, estimatedDurationMonths: 12,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 10 },
      { procedureId: "spirometry", label: "Spirometry", frequency: "every_visit", count: 10 },
      { procedureId: "cbc", label: "CBC", frequency: "quarterly", count: 3 },
      { procedureId: "pro_questionnaire", label: "PRO", frequency: "every_visit", count: 10 },
      { procedureId: "diary_review", label: "eDiary / Peak Flow", frequency: "every_visit", count: 10 },
    ],
    screenFailRangePercent: [15, 30], coordinatorMinutesPerVisit: 40, piMinutesPerVisit: 12, regulatoryStartupHours: 25,
    dataEntryBurden: "medium", vendorCoordinationBurden: "low", specialtyMultiplier: 1.0,
  },
  ophthalmology_injection: {
    id: "ophthalmology_injection", label: "Ophthalmology Intravitreal", category: "Ophthalmology",
    revenuePerPatientRange: { lowCents: 2000000, baseCents: 3500000, highCents: 5000000 },
    startupRange: { lowCents: 2500000, baseCents: 3500000, highCents: 4500000 },
    defaultVisits: 14, visitCadence: "q4 weeks loading then q8-12 weeks", avgVisitComplexityUnits: 2.5, estimatedDurationMonths: 18,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 14 },
      { procedureId: "intravitreal_injection", label: "IVT Injection", frequency: "select_visits", count: 8 },
      { procedureId: "cbc", label: "CBC", frequency: "quarterly", count: 5 },
      { procedureId: "cmp", label: "CMP", frequency: "quarterly", count: 5 },
      { procedureId: "physical_exam", label: "Ophthalmic Exam", frequency: "every_visit", count: 14 },
    ],
    screenFailRangePercent: [20, 35], coordinatorMinutesPerVisit: 45, piMinutesPerVisit: 25, regulatoryStartupHours: 35,
    dataEntryBurden: "medium", vendorCoordinationBurden: "medium", specialtyMultiplier: 1.3,
  },
  endocrinology_hormone: {
    id: "endocrinology_hormone", label: "Endocrinology Hormone Therapy", category: "Endocrinology",
    revenuePerPatientRange: { lowCents: 800000, baseCents: 1500000, highCents: 2200000 },
    startupRange: { lowCents: 1500000, baseCents: 2200000, highCents: 3000000 },
    defaultVisits: 10, visitCadence: "q4-8 weeks", avgVisitComplexityUnits: 1.5, estimatedDurationMonths: 12,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 10 },
      { procedureId: "cbc", label: "CBC", frequency: "quarterly", count: 4 },
      { procedureId: "cmp", label: "CMP", frequency: "quarterly", count: 4 },
      { procedureId: "thyroid_panel", label: "Endocrine Panel", frequency: "quarterly", count: 4 },
      { procedureId: "hba1c", label: "HbA1c", frequency: "quarterly", count: 4 },
      { procedureId: "dexa", label: "DEXA Scan", frequency: "annual", count: 1 },
      { procedureId: "ecg", label: "ECG", frequency: "semi_annual", count: 2 },
    ],
    screenFailRangePercent: [15, 30], coordinatorMinutesPerVisit: 40, piMinutesPerVisit: 15, regulatoryStartupHours: 30,
    dataEntryBurden: "medium", vendorCoordinationBurden: "low", specialtyMultiplier: 1.1,
  },
  hematology_infusion: {
    id: "hematology_infusion", label: "Hematology / BMT Infusion", category: "Hematology",
    revenuePerPatientRange: { lowCents: 3000000, baseCents: 5000000, highCents: 8000000 },
    startupRange: { lowCents: 3500000, baseCents: 5000000, highCents: 7000000 },
    defaultVisits: 20, visitCadence: "q1-2 weeks during treatment", avgVisitComplexityUnits: 3.5, estimatedDurationMonths: 24,
    defaultProcedures: [
      { procedureId: "office_visit_complex", label: "Office Visit", frequency: "every_visit", count: 20 },
      { procedureId: "infusion_complex", label: "IV Infusion", frequency: "select_visits", count: 14 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 20 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 20 },
      { procedureId: "coagulation_panel", label: "Coag Panel", frequency: "every_visit", count: 20 },
      { procedureId: "bone_marrow_biopsy", label: "BM Biopsy", frequency: "select_visits", count: 3 },
      { procedureId: "ct_scan", label: "CT Scan", frequency: "quarterly", count: 6 },
      { procedureId: "specimen_processing", label: "Biospecimens", frequency: "every_visit", count: 20 },
    ],
    screenFailRangePercent: [30, 50], coordinatorMinutesPerVisit: 80, piMinutesPerVisit: 30, regulatoryStartupHours: 55,
    dataEntryBurden: "very_high", vendorCoordinationBurden: "high", specialtyMultiplier: 1.5,
  },
  infectious_disease_vaccine: {
    id: "infectious_disease_vaccine", label: "Infectious Disease Vaccine", category: "Infectious Disease",
    revenuePerPatientRange: { lowCents: 300000, baseCents: 550000, highCents: 900000 },
    startupRange: { lowCents: 1000000, baseCents: 1800000, highCents: 2500000 },
    defaultVisits: 8, visitCadence: "days 0, 7, 28, 56, 180, 365", avgVisitComplexityUnits: 1.3, estimatedDurationMonths: 12,
    defaultProcedures: [
      { procedureId: "office_visit_simple", label: "Office Visit", frequency: "every_visit", count: 8 },
      { procedureId: "subq_injection", label: "Vaccination", frequency: "select_visits", count: 2 },
      { procedureId: "vitals", label: "Vitals", frequency: "every_visit", count: 8 },
      { procedureId: "cbc", label: "CBC", frequency: "select_visits", count: 4 },
      { procedureId: "specimen_processing", label: "Serology Samples", frequency: "select_visits", count: 5 },
      { procedureId: "diary_review", label: "Reactogenicity Diary", frequency: "select_visits", count: 3 },
    ],
    screenFailRangePercent: [10, 20], coordinatorMinutesPerVisit: 30, piMinutesPerVisit: 10, regulatoryStartupHours: 30,
    dataEntryBurden: "low", vendorCoordinationBurden: "low", specialtyMultiplier: 1.0,
  },
  infectious_disease_antiviral: {
    id: "infectious_disease_antiviral", label: "Infectious Disease Antiviral", category: "Infectious Disease",
    revenuePerPatientRange: { lowCents: 800000, baseCents: 1500000, highCents: 2200000 },
    startupRange: { lowCents: 1500000, baseCents: 2200000, highCents: 3000000 },
    defaultVisits: 10, visitCadence: "q2-4 weeks", avgVisitComplexityUnits: 1.8, estimatedDurationMonths: 12,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 10 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 10 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 10 },
      { procedureId: "hepatic_panel", label: "LFTs", frequency: "every_visit", count: 10 },
      { procedureId: "viral_load", label: "Viral Load", frequency: "every_visit", count: 10 },
      { procedureId: "pk_draw_series", label: "PK Draws", frequency: "select_visits", count: 3 },
    ],
    screenFailRangePercent: [20, 35], coordinatorMinutesPerVisit: 40, piMinutesPerVisit: 15, regulatoryStartupHours: 35,
    dataEntryBurden: "medium", vendorCoordinationBurden: "medium", specialtyMultiplier: 1.1,
  },
  pain_management: {
    id: "pain_management", label: "Pain Management", category: "Pain/Anesthesiology",
    revenuePerPatientRange: { lowCents: 600000, baseCents: 1200000, highCents: 1800000 },
    startupRange: { lowCents: 1200000, baseCents: 1800000, highCents: 2500000 },
    defaultVisits: 10, visitCadence: "q2-4 weeks", avgVisitComplexityUnits: 1.5, estimatedDurationMonths: 8,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 10 },
      { procedureId: "vitals", label: "Vitals", frequency: "every_visit", count: 10 },
      { procedureId: "pain_assessment", label: "Pain Assessment", frequency: "every_visit", count: 10 },
      { procedureId: "pro_questionnaire", label: "PRO", frequency: "every_visit", count: 10 },
      { procedureId: "cbc", label: "CBC", frequency: "quarterly", count: 3 },
      { procedureId: "cmp", label: "CMP", frequency: "quarterly", count: 3 },
      { procedureId: "urinalysis", label: "Urine Drug Screen", frequency: "quarterly", count: 3 },
      { procedureId: "diary_review", label: "Pain Diary", frequency: "every_visit", count: 10 },
    ],
    screenFailRangePercent: [15, 30], coordinatorMinutesPerVisit: 40, piMinutesPerVisit: 15, regulatoryStartupHours: 25,
    dataEntryBurden: "medium", vendorCoordinationBurden: "low", specialtyMultiplier: 1.0,
  },
  psychiatry_oral: {
    id: "psychiatry_oral", label: "Psychiatry Oral Medication", category: "Psychiatry",
    revenuePerPatientRange: { lowCents: 600000, baseCents: 1100000, highCents: 1800000 },
    startupRange: { lowCents: 1200000, baseCents: 1800000, highCents: 2500000 },
    defaultVisits: 12, visitCadence: "q2-4 weeks", avgVisitComplexityUnits: 1.5, estimatedDurationMonths: 10,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 12 },
      { procedureId: "vitals", label: "Vitals", frequency: "every_visit", count: 12 },
      { procedureId: "ecg", label: "ECG", frequency: "quarterly", count: 3 },
      { procedureId: "cbc", label: "CBC", frequency: "quarterly", count: 3 },
      { procedureId: "cmp", label: "CMP", frequency: "quarterly", count: 3 },
      { procedureId: "pro_questionnaire", label: "Rating Scales", frequency: "every_visit", count: 12 },
      { procedureId: "cognitive_assessment", label: "Cognitive Assessment", frequency: "quarterly", count: 3 },
      { procedureId: "diary_review", label: "Mood Diary", frequency: "every_visit", count: 12 },
    ],
    screenFailRangePercent: [20, 40], coordinatorMinutesPerVisit: 45, piMinutesPerVisit: 20, regulatoryStartupHours: 30,
    dataEntryBurden: "medium", vendorCoordinationBurden: "low", specialtyMultiplier: 1.1,
  },
  dermatology_biologic: {
    id: "dermatology_biologic", label: "Dermatology Biologic", category: "Dermatology",
    revenuePerPatientRange: { lowCents: 1000000, baseCents: 1800000, highCents: 2500000 },
    startupRange: { lowCents: 1500000, baseCents: 2200000, highCents: 3000000 },
    defaultVisits: 12, visitCadence: "q2-4 weeks", avgVisitComplexityUnits: 1.8, estimatedDurationMonths: 12,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 12 },
      { procedureId: "subq_injection", label: "SC Injection", frequency: "every_visit", count: 12 },
      { procedureId: "body_surface_assessment", label: "EASI/PASI Score", frequency: "every_visit", count: 12 },
      { procedureId: "cbc", label: "CBC", frequency: "quarterly", count: 4 },
      { procedureId: "cmp", label: "CMP", frequency: "quarterly", count: 4 },
      { procedureId: "biopsy_skin", label: "Skin Biopsy", frequency: "select_visits", count: 2 },
      { procedureId: "pro_questionnaire", label: "DLQI / PRO", frequency: "every_visit", count: 12 },
    ],
    screenFailRangePercent: [15, 30], coordinatorMinutesPerVisit: 45, piMinutesPerVisit: 20, regulatoryStartupHours: 30,
    dataEntryBurden: "medium", vendorCoordinationBurden: "low", specialtyMultiplier: 1.1,
  },
  dermatology_topical: {
    id: "dermatology_topical", label: "Dermatology Topical", category: "Dermatology",
    revenuePerPatientRange: { lowCents: 400000, baseCents: 700000, highCents: 1100000 },
    startupRange: { lowCents: 1000000, baseCents: 1500000, highCents: 2000000 },
    defaultVisits: 8, visitCadence: "q2-4 weeks", avgVisitComplexityUnits: 1.2, estimatedDurationMonths: 8,
    defaultProcedures: [
      { procedureId: "office_visit_simple", label: "Office Visit", frequency: "every_visit", count: 8 },
      { procedureId: "body_surface_assessment", label: "IGA/BSA Score", frequency: "every_visit", count: 8 },
      { procedureId: "vitals", label: "Vitals", frequency: "every_visit", count: 8 },
      { procedureId: "cbc", label: "CBC", frequency: "quarterly", count: 2 },
      { procedureId: "pro_questionnaire", label: "DLQI", frequency: "every_visit", count: 8 },
    ],
    screenFailRangePercent: [10, 25], coordinatorMinutesPerVisit: 30, piMinutesPerVisit: 12, regulatoryStartupHours: 20,
    dataEntryBurden: "low", vendorCoordinationBurden: "low", specialtyMultiplier: 0.9,
  },
  renal_progressive: {
    id: "renal_progressive", label: "Renal / CKD Progressive", category: "Nephrology",
    revenuePerPatientRange: { lowCents: 1200000, baseCents: 2200000, highCents: 3200000 },
    startupRange: { lowCents: 2000000, baseCents: 2800000, highCents: 3500000 },
    defaultVisits: 14, visitCadence: "q4 weeks", avgVisitComplexityUnits: 2.0, estimatedDurationMonths: 18,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 14 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 14 },
      { procedureId: "cmp", label: "CMP/eGFR", frequency: "every_visit", count: 14 },
      { procedureId: "urinalysis", label: "Urinalysis", frequency: "every_visit", count: 14 },
      { procedureId: "biomarker_panel", label: "Renal Biomarkers", frequency: "quarterly", count: 5 },
      { procedureId: "ultrasound", label: "Renal Ultrasound", frequency: "semi_annual", count: 3 },
      { procedureId: "ecg", label: "ECG", frequency: "semi_annual", count: 3 },
      { procedureId: "physical_exam", label: "Physical Exam", frequency: "semi_annual", count: 3 },
    ],
    screenFailRangePercent: [20, 35], coordinatorMinutesPerVisit: 45, piMinutesPerVisit: 18, regulatoryStartupHours: 35,
    dataEntryBurden: "medium", vendorCoordinationBurden: "medium", specialtyMultiplier: 1.2,
  },
  hepatology_oral: {
    id: "hepatology_oral", label: "Hepatology / NASH Oral", category: "Hepatology",
    revenuePerPatientRange: { lowCents: 1500000, baseCents: 2500000, highCents: 3500000 },
    startupRange: { lowCents: 2200000, baseCents: 3000000, highCents: 4000000 },
    defaultVisits: 14, visitCadence: "q4 weeks", avgVisitComplexityUnits: 2.2, estimatedDurationMonths: 18,
    defaultProcedures: [
      { procedureId: "office_visit_moderate", label: "Office Visit", frequency: "every_visit", count: 14 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 14 },
      { procedureId: "hepatic_panel", label: "LFTs", frequency: "every_visit", count: 14 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 14 },
      { procedureId: "biomarker_panel", label: "Fibrosis Markers", frequency: "quarterly", count: 5 },
      { procedureId: "ultrasound", label: "FibroScan / US", frequency: "semi_annual", count: 3 },
      { procedureId: "biopsy_core", label: "Liver Biopsy", frequency: "select_visits", count: 2 },
      { procedureId: "mri", label: "MRI-PDFF", frequency: "semi_annual", count: 3 },
    ],
    screenFailRangePercent: [25, 40], coordinatorMinutesPerVisit: 50, piMinutesPerVisit: 20, regulatoryStartupHours: 40,
    dataEntryBurden: "high", vendorCoordinationBurden: "medium", specialtyMultiplier: 1.3,
  },
  gene_cell_therapy: {
    id: "gene_cell_therapy", label: "Gene / Cell Therapy", category: "Advanced Therapy",
    revenuePerPatientRange: { lowCents: 6000000, baseCents: 10000000, highCents: 18000000 },
    startupRange: { lowCents: 6000000, baseCents: 10000000, highCents: 15000000 },
    defaultVisits: 24, visitCadence: "intensive early, then q4-12 weeks", avgVisitComplexityUnits: 4.5, estimatedDurationMonths: 36,
    defaultProcedures: [
      { procedureId: "office_visit_complex", label: "Office Visit", frequency: "every_visit", count: 24 },
      { procedureId: "infusion_complex", label: "Cell/Gene Infusion", frequency: "one_time", count: 1 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 24 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 24 },
      { procedureId: "biomarker_panel", label: "Gene Expression", frequency: "every_visit", count: 24 },
      { procedureId: "mri", label: "MRI", frequency: "quarterly", count: 10 },
      { procedureId: "biopsy_core", label: "Biopsy", frequency: "select_visits", count: 4 },
      { procedureId: "bone_marrow_biopsy", label: "BM Aspirate", frequency: "select_visits", count: 3 },
      { procedureId: "pk_draw_series", label: "Pharmacodynamic", frequency: "select_visits", count: 8 },
      { procedureId: "specimen_processing", label: "Biospecimens", frequency: "every_visit", count: 24 },
    ],
    screenFailRangePercent: [40, 65], coordinatorMinutesPerVisit: 100, piMinutesPerVisit: 40, regulatoryStartupHours: 80,
    dataEntryBurden: "very_high", vendorCoordinationBurden: "very_high", specialtyMultiplier: 2.5,
  },
  surgical_device: {
    id: "surgical_device", label: "Surgical / Implantable Device", category: "Surgical",
    revenuePerPatientRange: { lowCents: 3000000, baseCents: 5000000, highCents: 8000000 },
    startupRange: { lowCents: 4000000, baseCents: 6000000, highCents: 8000000 },
    defaultVisits: 14, visitCadence: "pre-op, surgery, then q4-12 weeks", avgVisitComplexityUnits: 3.5, estimatedDurationMonths: 24,
    defaultProcedures: [
      { procedureId: "office_visit_complex", label: "Office Visit", frequency: "every_visit", count: 14 },
      { procedureId: "biopsy_surgical", label: "Surgical Procedure", frequency: "one_time", count: 1 },
      { procedureId: "ct_scan", label: "CT Scan", frequency: "quarterly", count: 6 },
      { procedureId: "xray", label: "X-Ray", frequency: "every_visit", count: 14 },
      { procedureId: "cbc", label: "CBC", frequency: "every_visit", count: 14 },
      { procedureId: "cmp", label: "CMP", frequency: "every_visit", count: 14 },
      { procedureId: "physical_exam", label: "Physical Exam", frequency: "every_visit", count: 14 },
      { procedureId: "pro_questionnaire", label: "PRO/Function", frequency: "every_visit", count: 14 },
    ],
    screenFailRangePercent: [25, 40], coordinatorMinutesPerVisit: 60, piMinutesPerVisit: 35, regulatoryStartupHours: 50,
    dataEntryBurden: "high", vendorCoordinationBurden: "high", specialtyMultiplier: 1.5,
  },
};

// ───────────────────── Phase & TA Multipliers ─────────────────────

const PHASE_MULTIPLIER: Record<string, number> = {
  "Phase 1": 1.5,
  "Phase 1/2": 1.35,
  "Phase 2": 1.2,
  "Phase 2/3": 1.1,
  "Phase 3": 1.0,
  "Phase 4": 0.8,
};

const TA_MULTIPLIER: Record<string, number> = {
  "Oncology": 1.5,
  "Neurology": 1.3,
  "Rare Disease": 2.0,
  "Immunology": 1.15,
  "Cardiology": 1.15,
  "Gastroenterology": 1.1,
  "Dermatology": 0.95,
  "Diabetes/Metabolic": 1.0,
  "Respiratory": 1.0,
  "Psychiatry": 1.0,
  "Pain/Anesthesiology": 0.95,
  "Infectious Disease": 1.0,
  "Ophthalmology": 1.25,
  "Nephrology": 1.15,
  "Hepatology": 1.2,
  "Endocrinology": 1.0,
  "Hematology": 1.4,
  "Advanced Therapy": 2.2,
  "Surgical": 1.3,
};

// ───────────────────── Archetype Auto-Detection ─────────────────────

export function detectArchetype(study: {
  therapeuticArea: string;
  indication: string;
  phase: string;
  studyType: string;
  financialDetails?: string | null;
}): StudyArchetypeId {
  const ta = study.therapeuticArea.toLowerCase();
  const ind = study.indication.toLowerCase();
  const details = study.financialDetails ? JSON.parse(study.financialDetails) : {};

  // Oncology sub-types
  if (ta.includes("oncology") || ta.includes("hematology")) {
    if (ind.includes("leukemia") || ind.includes("lymphoma") || ind.includes("myeloma") || ta.includes("hematology"))
      return "hematology_infusion";
    if (details.estimatedVisits > 18 || ind.includes("combo")) return "oncology_combo_regimen";
    if (ind.includes("immunotherapy") || ind.includes("pembrolizumab") || ind.includes("nivolumab") || ind.includes("pd-1") || ind.includes("pd-l1"))
      return "oncology_immunotherapy";
    if (ind.includes("oral") || ind.includes("tablet") || ind.includes("capsule") || ind.includes("kinase"))
      return "oncology_oral_targeted";
    return "oncology_infusion";
  }

  // Neurology
  if (ta.includes("neuro")) {
    if (ind.includes("alzheimer") || ind.includes("parkinson") || ind.includes("ms ") || ind.includes("multiple sclerosis") || ind.includes("huntington"))
      return "neurology_long_duration";
    return "neurology_acute";
  }

  // Cardiology
  if (ta.includes("cardio")) {
    if (ind.includes("device") || ind.includes("valve") || ind.includes("stent") || ind.includes("pacemaker"))
      return "cardiology_device";
    return "cardiology_moderate";
  }

  // GI
  if (ta.includes("gastro") || ind.includes("crohn") || ind.includes("colitis") || ind.includes("ibd")) {
    if (ind.includes("device")) return "gi_device";
    return "gi_biologic";
  }

  // Immunology / Autoimmune
  if (ta.includes("immuno") || ta.includes("rheum")) {
    if (ind.includes("dermatitis") || ind.includes("eczema") || ind.includes("psoriasis"))
      return "dermatology_biologic";
    return "autoimmune_biologic";
  }

  // Dermatology
  if (ta.includes("derm")) {
    if (ind.includes("biologic") || ind.includes("dupilumab") || ind.includes("moderate") || ind.includes("severe"))
      return "dermatology_biologic";
    return "dermatology_topical";
  }

  // Respiratory
  if (ta.includes("respir") || ta.includes("pulm") || ind.includes("asthma") || ind.includes("copd")) {
    if (ind.includes("biologic") || ind.includes("antibody")) return "respiratory_biologic";
    return "respiratory_inhaled";
  }

  // Metabolic / Diabetes / Obesity
  if (ta.includes("diabet") || ta.includes("metabol") || ind.includes("obesity") || ind.includes("weight") || ind.includes("diabetes"))
    return "primary_care_metabolic";

  // Infectious Disease
  if (ta.includes("infect") || ind.includes("vaccine") || ind.includes("hiv") || ind.includes("hbv") || ind.includes("hcv")) {
    if (ind.includes("vaccine")) return "infectious_disease_vaccine";
    return "infectious_disease_antiviral";
  }

  // Rare Disease
  if (ta.includes("rare") || ind.includes("orphan")) return "rare_disease_high_touch";

  // Ophthalmology
  if (ta.includes("ophthal") || ind.includes("macular") || ind.includes("retina")) return "ophthalmology_injection";

  // Hepatology
  if (ta.includes("hepat") || ind.includes("nash") || ind.includes("nafld") || ind.includes("hepatitis"))
    return "hepatology_oral";

  // Nephrology
  if (ta.includes("neph") || ta.includes("renal") || ind.includes("ckd") || ind.includes("kidney"))
    return "renal_progressive";

  // Endocrinology
  if (ta.includes("endo") || ind.includes("thyroid") || ind.includes("growth hormone"))
    return "endocrinology_hormone";

  // Psychiatry
  if (ta.includes("psych") || ind.includes("depression") || ind.includes("schizophrenia") || ind.includes("bipolar"))
    return "psychiatry_oral";

  // Pain
  if (ta.includes("pain") || ind.includes("migraine") || ind.includes("fibromyalgia"))
    return "pain_management";

  // Gene/Cell Therapy
  if (ind.includes("gene therapy") || ind.includes("car-t") || ind.includes("cell therapy"))
    return "gene_cell_therapy";

  // Surgical/Device
  if (ind.includes("surgical") || ind.includes("implant") || ind.includes("prosthesis"))
    return "surgical_device";

  // Observational fallback
  if (study.studyType === "observational") return "simple_observational";

  // Default
  return "primary_care_metabolic";
}

// ───────────────────── Core Calculation Engine ─────────────────────

function burdenLevelFromScore(score: number): BurdenLevel {
  if (score < 25) return "low";
  if (score < 50) return "medium";
  if (score < 75) return "high";
  return "very_high";
}

function riskLevelFromRange(range: [number, number]): RiskLevel {
  const avg = (range[0] + range[1]) / 2;
  if (avg < 20) return "low";
  if (avg < 40) return "medium";
  return "high";
}

function computeBurdenScore(archetype: StudyArchetype): BurdenScore {
  // Sub-scores 0–100
  const visitLoad = Math.min(100, (archetype.defaultVisits / 24) * 100);
  const procIntensity = Math.min(100, (archetype.avgVisitComplexityUnits / 5.0) * 100);
  const dataBurdenMap: Record<BurdenLevel, number> = { low: 15, medium: 40, high: 65, very_high: 90 };
  const dataComplexity = dataBurdenMap[archetype.dataEntryBurden];
  const logisticsComplexity = dataBurdenMap[archetype.vendorCoordinationBurden];
  const regulatoryWeight = Math.min(100, (archetype.regulatoryStartupHours / 80) * 100);

  const overall = Math.round(
    visitLoad * 0.25 +
    procIntensity * 0.25 +
    dataComplexity * 0.20 +
    logisticsComplexity * 0.15 +
    regulatoryWeight * 0.15
  );

  return {
    overall: burdenLevelFromScore(overall),
    operational: Math.round(visitLoad * 0.4 + procIntensity * 0.3 + logisticsComplexity * 0.3),
    startup: Math.round(regulatoryWeight * 0.6 + logisticsComplexity * 0.4),
    screening: Math.round(((archetype.screenFailRangePercent[0]! + archetype.screenFailRangePercent[1]!) / 2 / 65) * 100),
    details: {
      visitLoad: Math.round(visitLoad),
      procedureIntensity: Math.round(procIntensity),
      dataComplexity: Math.round(dataComplexity),
      logisticsComplexity: Math.round(logisticsComplexity),
      regulatoryWeight: Math.round(regulatoryWeight),
    },
  };
}

function computeRevenueDrivers(archetype: StudyArchetype, phaseMult: number, taMult: number): RevenueDriver[] {
  const drivers: RevenueDriver[] = [];

  for (const bundle of archetype.defaultProcedures) {
    const proc = PROCEDURE_LIBRARY[bundle.procedureId];
    if (!proc) continue;

    const unitValue = Math.round(proc.sponsorTypicalCents * phaseMult * taMult);
    drivers.push({
      category: proc.category,
      label: bundle.label,
      unitValueCents: unitValue,
      quantity: bundle.count,
      totalCents: unitValue * bundle.count,
      source: "cms_anchored",
    });
  }

  // Add startup-related items
  drivers.push({
    category: "regulatory",
    label: "IRB/EC Submission & Review",
    unitValueCents: PROCEDURE_LIBRARY.irb_submission!.sponsorTypicalCents,
    quantity: 1,
    totalCents: PROCEDURE_LIBRARY.irb_submission!.sponsorTypicalCents,
    source: "archetype_default",
  });
  drivers.push({
    category: "regulatory",
    label: "Site Initiation Visit",
    unitValueCents: PROCEDURE_LIBRARY.site_initiation!.sponsorTypicalCents,
    quantity: 1,
    totalCents: PROCEDURE_LIBRARY.site_initiation!.sponsorTypicalCents,
    source: "archetype_default",
  });

  return drivers;
}

function computeCostDrivers(archetype: StudyArchetype, assumptions: SiteAssumptions): CostDriver[] {
  const drivers: CostDriver[] = [];
  const totalVisits = archetype.defaultVisits;

  // Coordinator time
  const coordHoursPerVisit = archetype.coordinatorMinutesPerVisit / 60;
  const coordTotalHours = coordHoursPerVisit * totalVisits;
  drivers.push({
    category: "staffing",
    label: "Study Coordinator",
    hoursPerUnit: coordHoursPerVisit,
    quantity: totalVisits,
    totalHours: coordTotalHours,
    estimatedCostCents: Math.round(coordTotalHours * assumptions.coordinatorHourlyRateCents),
  });

  // PI time
  const piHoursPerVisit = archetype.piMinutesPerVisit / 60;
  const piTotalHours = piHoursPerVisit * totalVisits;
  drivers.push({
    category: "staffing",
    label: "Principal Investigator",
    hoursPerUnit: piHoursPerVisit,
    quantity: totalVisits,
    totalHours: piTotalHours,
    estimatedCostCents: Math.round(piTotalHours * assumptions.piHourlyRateCents),
  });

  // Nursing/clinical support
  const nurseHours = totalVisits * 0.5; // avg 30 min per visit
  drivers.push({
    category: "staffing",
    label: "Nursing / Clinical Support",
    hoursPerUnit: 0.5,
    quantity: totalVisits,
    totalHours: nurseHours,
    estimatedCostCents: Math.round(nurseHours * assumptions.nurseHourlyRateCents),
  });

  // Regulatory startup
  drivers.push({
    category: "regulatory",
    label: "Regulatory / Startup",
    hoursPerUnit: assumptions.regulatoryStartupHours,
    quantity: 1,
    totalHours: assumptions.regulatoryStartupHours,
    estimatedCostCents: Math.round(assumptions.regulatoryStartupHours * assumptions.coordinatorHourlyRateCents),
  });

  // Data entry / query resolution
  const dataHours = totalVisits * (archetype.dataEntryBurden === "very_high" ? 1.5 : archetype.dataEntryBurden === "high" ? 1.0 : archetype.dataEntryBurden === "medium" ? 0.5 : 0.25);
  drivers.push({
    category: "operations",
    label: "Data Entry / Query Resolution",
    hoursPerUnit: dataHours / totalVisits,
    quantity: totalVisits,
    totalHours: dataHours,
    estimatedCostCents: Math.round(dataHours * assumptions.coordinatorHourlyRateCents),
  });

  // Pharmacy handling
  const hasInfusion = archetype.defaultProcedures.some(p => p.procedureId.includes("infusion"));
  if (hasInfusion) {
    drivers.push({
      category: "operations",
      label: "Pharmacy / Drug Handling",
      hoursPerUnit: 0,
      quantity: 1,
      totalHours: 0,
      estimatedCostCents: assumptions.pharmacyHandlingCents * totalVisits,
    });
  }

  return drivers;
}

function computeVisitModel(archetype: StudyArchetype): VisitModel {
  const screeningVisits = Math.max(1, Math.round(archetype.defaultVisits * 0.1));
  const followUpVisits = Math.round(archetype.defaultVisits * 0.15);
  const treatmentVisits = archetype.defaultVisits - screeningVisits - followUpVisits;

  return {
    screeningVisits,
    treatmentVisits,
    followUpVisits,
    totalVisits: archetype.defaultVisits,
    avgVisitComplexity: archetype.avgVisitComplexityUnits,
    estimatedDurationMonths: archetype.estimatedDurationMonths,
    visitCadence: archetype.visitCadence,
  };
}

function computeScenarios(
  revenueDrivers: RevenueDriver[],
  costDrivers: CostDriver[],
  archetype: StudyArchetype,
  assumptions: SiteAssumptions,
  startupRange: ValueRange,
): ScenarioOutputs {
  const totalProcedureRevenue = revenueDrivers
    .filter(d => d.category !== "regulatory")
    .reduce((sum, d) => sum + d.totalCents, 0);

  const startupRevenue = revenueDrivers
    .filter(d => d.category === "regulatory")
    .reduce((sum, d) => sum + d.totalCents, 0);

  const totalStaffCost = costDrivers.reduce((sum, d) => sum + d.estimatedCostCents, 0);
  const overheadMultiplier = 1 + assumptions.overheadPercent / 100;
  const totalCostPerPatient = Math.round(totalStaffCost * overheadMultiplier);

  const sfMid = (archetype.screenFailRangePercent[0]! + archetype.screenFailRangePercent[1]!) / 2;

  const makeScenario = (
    label: string,
    revenueMultiplier: number,
    sfRate: number,
    completion: number,
    enrollmentMult: number,
  ): ScenarioCase => {
    const adjRevenue = Math.round(totalProcedureRevenue * revenueMultiplier);
    const netPerPatient = adjRevenue - totalCostPerPatient;
    const enrollment = Math.round(assumptions.enrollmentTarget * enrollmentMult);
    const totalGross = adjRevenue * enrollment;
    const totalNet = netPerPatient * enrollment;
    const totalStaffHours = costDrivers.reduce((sum, d) => sum + d.totalHours, 0);

    // Break-even: how many patients to cover startup costs
    const startupCost = Math.round(startupRange.baseCents * 0.7); // assume 70% of startup paid
    const breakEven = netPerPatient > 0 ? Math.ceil((startupCost - startupRevenue) / netPerPatient) : 999;

    return {
      label,
      perPatientGrossCents: adjRevenue,
      perPatientNetCents: netPerPatient,
      startupRevenueCents: startupRevenue,
      startupCostCents: startupCost,
      enrollmentCount: enrollment,
      screenFailRate: sfRate,
      completionRate: completion,
      totalGrossRevenueCents: totalGross,
      totalNetContributionCents: totalNet,
      breakEvenEnrollment: Math.max(1, breakEven),
      staffingHours: Math.round(totalStaffHours * enrollment),
    };
  };

  return {
    conservative: makeScenario("Conservative", 0.85, sfMid + 10, assumptions.expectedCompletionPercent - 10, 0.7),
    base: makeScenario("Base Case", 1.0, sfMid, assumptions.expectedCompletionPercent, 1.0),
    optimistic: makeScenario("Optimistic", 1.15, Math.max(5, sfMid - 10), Math.min(95, assumptions.expectedCompletionPercent + 10), 1.3),
  };
}

// ───────────────────── Public API ─────────────────────

export function getArchetype(id: StudyArchetypeId): StudyArchetype {
  return STUDY_ARCHETYPES[id];
}

export function getAllArchetypes(): StudyArchetype[] {
  return Object.values(STUDY_ARCHETYPES);
}

export function getProcedure(id: string): ProcedureDefinition | undefined {
  return PROCEDURE_LIBRARY[id];
}

export function getAllProcedures(): ProcedureDefinition[] {
  return Object.values(PROCEDURE_LIBRARY);
}

/**
 * Generate a complete financial model for a study.
 * This is the main entry point — returns Tier 1 + Tier 2 data.
 */
export function modelStudyFinancials(
  study: {
    id: string;
    therapeuticArea: string;
    indication: string;
    phase: string;
    studyType: string;
    estimatedPerPatientValueCents?: number | null;
    financialDetails?: string | null;
  },
  siteAssumptions: SiteAssumptions = DEFAULT_SITE_ASSUMPTIONS,
  archetypeOverride?: StudyArchetypeId,
): StudyFinancialModel {
  const archetypeId = archetypeOverride ?? detectArchetype(study);
  const archetype = STUDY_ARCHETYPES[archetypeId];

  const phaseMult = PHASE_MULTIPLIER[study.phase] ?? 1.0;
  const taMult = TA_MULTIPLIER[study.therapeuticArea] ?? (TA_MULTIPLIER[archetype.category] ?? 1.0);
  const combinedMult = phaseMult * taMult * archetype.specialtyMultiplier;

  // Determine confidence
  let confidence: ConfidenceLevel = "low";
  if (study.estimatedPerPatientValueCents && study.estimatedPerPatientValueCents > 0) {
    confidence = "high"; // has sponsor/budget data
  } else if (archetype.defaultProcedures.length > 4) {
    confidence = "medium"; // protocol + modeled procedures
  }

  // Per-patient range
  const perPatientRange: ValueRange = {
    lowCents: Math.round(archetype.revenuePerPatientRange.lowCents * combinedMult),
    baseCents: Math.round(archetype.revenuePerPatientRange.baseCents * combinedMult),
    highCents: Math.round(archetype.revenuePerPatientRange.highCents * combinedMult),
  };

  // If we have sponsor data, anchor the range around it
  if (study.estimatedPerPatientValueCents && study.estimatedPerPatientValueCents > 0) {
    const anchor = study.estimatedPerPatientValueCents;
    perPatientRange.lowCents = Math.round(anchor * 0.8);
    perPatientRange.baseCents = anchor;
    perPatientRange.highCents = Math.round(anchor * 1.2);
  }

  const startupRange: ValueRange = {
    lowCents: Math.round(archetype.startupRange.lowCents * phaseMult),
    baseCents: Math.round(archetype.startupRange.baseCents * phaseMult),
    highCents: Math.round(archetype.startupRange.highCents * phaseMult),
  };

  const burdenScore = computeBurdenScore(archetype);
  const revenueDrivers = computeRevenueDrivers(archetype, phaseMult, taMult);
  const costDrivers = computeCostDrivers(archetype, siteAssumptions);
  const visitModel = computeVisitModel(archetype);
  const scenarioOutputs = computeScenarios(revenueDrivers, costDrivers, archetype, siteAssumptions, startupRange);

  // Time intensity
  let timeIntensity: "short" | "medium" | "long" = "medium";
  if (archetype.estimatedDurationMonths <= 8) timeIntensity = "short";
  else if (archetype.estimatedDurationMonths >= 20) timeIntensity = "long";

  return {
    studyId: study.id,
    archetype: archetypeId,
    confidence,
    perPatientRange,
    startupRange,
    burdenScore,
    screenFailRisk: riskLevelFromRange(archetype.screenFailRangePercent),
    enrollmentFit: "medium", // would be computed from site patient data
    timeIntensity,
    revenueDrivers,
    costDrivers,
    visitModel,
    scenarioOutputs,
    methodology: `Estimate based on ${archetype.label} archetype (${archetype.category}), ${study.phase} multiplier (${phaseMult}×), ${study.therapeuticArea} premium (${taMult}×), and ${archetype.defaultProcedures.length} modeled procedures anchored to CMS fee schedules.`,
  };
}

/**
 * Recalculate a financial model with updated site assumptions (Tier 3).
 */
export function recalculateWithAssumptions(
  model: StudyFinancialModel,
  _study: {
    id: string;
    therapeuticArea: string;
    phase: string;
    estimatedPerPatientValueCents?: number | null;
  },
  assumptions: SiteAssumptions,
): StudyFinancialModel {
  const archetype = STUDY_ARCHETYPES[model.archetype];

  const costDrivers = computeCostDrivers(archetype, assumptions);

  // Apply any line-item overrides
  const revenueDrivers = model.revenueDrivers.map(d => {
    const override = assumptions.siteOverrides[d.label];
    if (override !== undefined) {
      return { ...d, unitValueCents: override, totalCents: override * d.quantity, source: "site_override" as const };
    }
    return d;
  });

  const scenarioOutputs = computeScenarios(revenueDrivers, costDrivers, archetype, assumptions, model.startupRange);

  return {
    ...model,
    confidence: model.confidence === "low" ? "medium" : model.confidence,
    revenueDrivers,
    costDrivers,
    scenarioOutputs,
    methodology: model.methodology + " Refined with site-specific staffing rates, overhead, and enrollment assumptions.",
  };
}

// ───────────────────── Site Profile Integration ─────────────────────

/**
 * Convert a SiteIntelligenceProfile into SiteAssumptions for financial modeling.
 */
export function profileToAssumptions(profile: {
  financials: {
    coordinatorHourlyRateCents: number;
    piHourlyRateCents: number;
    nurseHourlyRateCents: number;
    overheadPercent: number;
    defaultScreenFailPercent: number;
    defaultCompletionPercent: number;
  };
  operations?: {
    hasInHousePharmacy?: boolean;
  };
}): SiteAssumptions {
  const f = profile.financials;
  return {
    ...DEFAULT_SITE_ASSUMPTIONS,
    coordinatorHourlyRateCents: f.coordinatorHourlyRateCents,
    piHourlyRateCents: f.piHourlyRateCents,
    nurseHourlyRateCents: f.nurseHourlyRateCents,
    overheadPercent: f.overheadPercent,
    screenFailRatePercent: f.defaultScreenFailPercent,
    expectedCompletionPercent: f.defaultCompletionPercent,
    pharmacyHandlingCents: profile.operations?.hasInHousePharmacy ? 8000 : 15000,
  };
}

/**
 * Compute a study-site fit score (0–100) using the site profile.
 * Higher = better fit.
 */
export function computeSiteFitScore(
  study: {
    therapeuticArea: string;
    phase: string;
    studyType: string;
  },
  archetype: StudyArchetype,
  profile: {
    research: {
      activeTherapeuticAreas: string[];
      growthTherapeuticAreas: string[];
      acceptedPhases: string[];
      studyTypes: string[];
    };
    operations: {
      hasInfusionCapability: boolean;
      hasInHouseLab: boolean;
      hasImagingSupport: boolean;
      hasInpatientCapability: boolean;
      maxActiveStudies: number;
    };
    preferences: {
      studyComplexityPreference: string;
      maxVisitBurden: number;
    };
  },
): { score: number; fit: "low" | "medium" | "high"; reasons: string[] } {
  let score = 50; // baseline
  const reasons: string[] = [];

  // TA alignment
  if (profile.research.activeTherapeuticAreas.includes(study.therapeuticArea)) {
    score += 20;
    reasons.push("Active therapeutic area");
  } else if (profile.research.growthTherapeuticAreas.includes(study.therapeuticArea)) {
    score += 10;
    reasons.push("Growth area target");
  } else {
    score -= 10;
    reasons.push("Outside current focus");
  }

  // Phase
  if (profile.research.acceptedPhases.includes(study.phase)) {
    score += 10;
  } else if (profile.research.acceptedPhases.length > 0) {
    score -= 15;
    reasons.push("Phase not typically accepted");
  }

  // Capability match
  const needsInfusion = archetype.defaultProcedures.some(p => p.procedureId.includes("infusion"));
  if (needsInfusion && !profile.operations.hasInfusionCapability) {
    score -= 15;
    reasons.push("Requires infusion capability");
  }
  if (needsInfusion && profile.operations.hasInfusionCapability) {
    score += 5;
    reasons.push("Infusion-capable site");
  }

  const needsImaging = archetype.defaultProcedures.some(p =>
    ["mri", "ct_scan", "pet_ct", "echocardiogram"].includes(p.procedureId)
  );
  if (needsImaging && !profile.operations.hasImagingSupport) {
    score -= 10;
    reasons.push("Limited imaging support");
  }

  // Complexity preference
  const complexity = archetype.avgVisitComplexityUnits;
  if (profile.preferences.studyComplexityPreference === "easier_lower_yield" && complexity > 2.5) {
    score -= 10;
    reasons.push("Higher complexity than preferred");
  } else if (profile.preferences.studyComplexityPreference === "complex_higher_upside" && complexity < 1.5) {
    score -= 5;
    reasons.push("Lower complexity than preferred");
  }

  // Visit burden check
  const visitsPerMonth = archetype.defaultVisits / Math.max(1, archetype.estimatedDurationMonths);
  if (visitsPerMonth > profile.preferences.maxVisitBurden) {
    score -= 10;
    reasons.push("Visit burden exceeds threshold");
  }

  score = Math.max(0, Math.min(100, score));
  const fit: "low" | "medium" | "high" = score >= 65 ? "high" : score >= 40 ? "medium" : "low";

  return { score, fit, reasons };
}

/**
 * Rank studies using the site's ranking factor preferences.
 */
export function rankStudies<T extends { id: string }>(
  studies: T[],
  models: Map<string, StudyFinancialModel>,
  eligibleCounts: Map<string, number>,
  rankingFactors: string[],
): T[] {
  const getWeight = (factor: string): number => {
    const idx = rankingFactors.indexOf(factor);
    if (idx < 0) return 0;
    return rankingFactors.length - idx; // higher weight = higher priority
  };

  return [...studies].sort((a, b) => {
    const mA = models.get(a.id);
    const mB = models.get(b.id);
    if (!mA || !mB) return 0;

    let scoreA = 0;
    let scoreB = 0;

    const wRevenue = getWeight("revenue");
    if (wRevenue > 0) {
      scoreA += (mA.perPatientRange.baseCents / 1000000) * wRevenue;
      scoreB += (mB.perPatientRange.baseCents / 1000000) * wRevenue;
    }

    const wBurden = getWeight("low_burden");
    if (wBurden > 0) {
      const burdenMap: Record<string, number> = { low: 4, medium: 3, high: 2, very_high: 1 };
      scoreA += (burdenMap[mA.burdenScore.overall] ?? 2) * wBurden;
      scoreB += (burdenMap[mB.burdenScore.overall] ?? 2) * wBurden;
    }

    const wEnrollment = getWeight("enrollment_potential");
    if (wEnrollment > 0) {
      scoreA += (eligibleCounts.get(a.id) ?? 0) * wEnrollment * 0.1;
      scoreB += (eligibleCounts.get(b.id) ?? 0) * wEnrollment * 0.1;
    }

    const wDuration = getWeight("short_duration");
    if (wDuration > 0) {
      scoreA += (36 - mA.visitModel.estimatedDurationMonths) * wDuration * 0.1;
      scoreB += (36 - mB.visitModel.estimatedDurationMonths) * wDuration * 0.1;
    }

    return scoreB - scoreA;
  });
}

// ───────────────────── Formatting Helpers ─────────────────────

export function formatRangeCurrency(range: ValueRange): string {
  const formatK = (cents: number) => {
    const k = cents / 100000;
    if (k >= 100) return `$${Math.round(k / 10) * 10}K`;
    if (k >= 10) return `$${Math.round(k)}K`;
    return `$${k.toFixed(1)}K`;
  };
  return `${formatK(range.lowCents)}–${formatK(range.highCents)}`;
}

export function burdenColor(level: BurdenLevel): string {
  switch (level) {
    case "low": return "text-emerald-400 bg-emerald-500/12 ring-emerald-500/20";
    case "medium": return "text-amber-400 bg-amber-500/12 ring-amber-500/20";
    case "high": return "text-orange-400 bg-orange-500/12 ring-orange-500/20";
    case "very_high": return "text-red-400 bg-red-500/12 ring-red-500/20";
  }
}

export function confidenceColor(level: ConfidenceLevel): string {
  switch (level) {
    case "low": return "text-slate-400 bg-slate-500/12 ring-slate-500/20";
    case "medium": return "text-blue-400 bg-blue-500/12 ring-blue-500/20";
    case "high": return "text-emerald-400 bg-emerald-500/12 ring-emerald-500/20";
  }
}

export function riskColor(level: RiskLevel): string {
  switch (level) {
    case "low": return "text-emerald-400 bg-emerald-500/12 ring-emerald-500/20";
    case "medium": return "text-amber-400 bg-amber-500/12 ring-amber-500/20";
    case "high": return "text-red-400 bg-red-500/12 ring-red-500/20";
  }
}
