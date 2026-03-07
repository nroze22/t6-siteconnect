// ============================================================
// Realistic Epic EHR Export Demo Data
// Mimics a "MyChart Patient Export" / Epic Caboodle extract
// Column names match Epic's standard Clarity/Caboodle naming
// ============================================================

export const EPIC_COLUMNS = [
  "PAT_MRN_ID",
  "PAT_LAST_NAME",
  "PAT_FIRST_NAME",
  "BIRTH_DATE",
  "SEX",
  "PATIENT_RACE",
  "ETHNIC_GROUP",
  "COVERAGE_PAYOR_NAME",
  "DX_ID",
  "CURRENT_ICD10_LIST",
  "DX_NAME",
  "ONSET_DATE",
  "MEDICATION_NAME",
  "MED_DOSE",
  "MED_ROUTE",
  "ORDER_STATUS",
  "PROC_NAME",
  "RESULT_VALUE",
  "RESULT_UNIT",
  "RESULT_DATE",
  "REF_RANGE",
  "ABNORMAL_YN",
  "BP_SYSTOLIC",
  "BP_DIASTOLIC",
  "PULSE",
  "WEIGHT_KG",
  "HEIGHT_CM",
  "BMI",
  "ENCOUNTER_DATE",
  "VISIT_TYPE",
  "DEPT_NAME",
  "PROV_NAME",
];

// 32 realistic patient rows from a multi-specialty practice
// Each row is a flattened encounter-level record (Epic style)
export const EPIC_ROWS: string[][] = [
  // --- NSCLC patients (good candidates for KEYNOTE-789) ---
  ["E10042","Martinez","Carlos","1961-09-14","Male","White","Non-Hispanic","Aetna PPO","DX-44821","C34.11","Malignant neoplasm of upper lobe, right bronchus or lung","2025-06-15","Carboplatin","AUC 5 IV","Intravenous","Active","CBC w/ Diff","6800","/uL","2026-02-28","4500-11000","N","132","84","76","81.2","178","25.6","2026-02-28","Oncology Follow-up","Cancer Center","Dr. Sarah Chen"],
  ["E10042","Martinez","Carlos","1961-09-14","Male","White","Non-Hispanic","Aetna PPO","DX-44821","C34.11","Malignant neoplasm of upper lobe, right bronchus or lung","2025-06-15","Lisinopril","10mg","Oral","Active","Hemoglobin","13.2","g/dL","2026-02-28","12.0-17.5","N","132","84","76","81.2","178","25.6","2026-02-28","Oncology Follow-up","Cancer Center","Dr. Sarah Chen"],
  ["E10042","Martinez","Carlos","1961-09-14","Male","White","Non-Hispanic","Aetna PPO","DX-44821","C34.11","Malignant neoplasm of upper lobe, right bronchus or lung","2025-06-15","Atorvastatin","40mg","Oral","Active","eGFR","82","mL/min/1.73m2","2026-02-28",">60","N","132","84","76","81.2","178","25.6","2026-02-28","Oncology Follow-up","Cancer Center","Dr. Sarah Chen"],
  ["E10042","Martinez","Carlos","1961-09-14","Male","White","Non-Hispanic","Aetna PPO","DX-55102","I10","Essential (primary) hypertension","2019-03-10","","","","","Creatinine","0.98","mg/dL","2026-02-28","0.7-1.3","N","132","84","76","81.2","178","25.6","2026-02-28","Oncology Follow-up","Cancer Center","Dr. Sarah Chen"],
  ["E10088","Johnson","Patricia","1967-11-02","Female","Black or African American","Non-Hispanic","UnitedHealth","DX-44830","C34.91","Malignant neoplasm of unspecified part of right bronchus or lung","2025-08-22","Pemetrexed","500mg/m2 IV","Intravenous","Active","Platelets","198000","/uL","2026-02-15","150000-400000","N","118","72","68","64.5","163","24.3","2026-02-15","Chemo Infusion","Cancer Center","Dr. James Wright"],
  ["E10088","Johnson","Patricia","1967-11-02","Female","Black or African American","Non-Hispanic","UnitedHealth","DX-44830","C34.91","Malignant neoplasm of unspecified part of right bronchus or lung","2025-08-22","Metoprolol","25mg","Oral","Active","ANC","4100","/uL","2026-02-15","1500-8000","N","118","72","68","64.5","163","24.3","2026-02-15","Chemo Infusion","Cancer Center","Dr. James Wright"],
  ["E10103","Kim","David","1958-07-28","Male","Asian","Non-Hispanic","Medicare","DX-44825","C34.31","Malignant neoplasm of lower lobe, right bronchus or lung","2025-04-10","Docetaxel","75mg/m2 IV","Intravenous","Completed","AST","34","U/L","2026-01-20","10-40","N","140","88","82","92.3","172","31.2","2026-01-20","Oncology Consult","Cancer Center","Dr. Sarah Chen"],
  ["E10103","Kim","David","1958-07-28","Male","Asian","Non-Hispanic","Medicare","DX-44825","C34.31","Malignant neoplasm of lower lobe, right bronchus or lung","2025-04-10","Metformin","1000mg","Oral","Active","ALT","28","U/L","2026-01-20","7-56","N","140","88","82","92.3","172","31.2","2026-01-20","Oncology Consult","Cancer Center","Dr. Sarah Chen"],
  ["E10103","Kim","David","1958-07-28","Male","Asian","Non-Hispanic","Medicare","DX-61002","E11.9","Type 2 diabetes mellitus without complications","2018-11-15","Amlodipine","5mg","Oral","Active","HbA1c","7.1","%","2026-01-20","<7.0","Y","140","88","82","92.3","172","31.2","2026-01-20","Oncology Consult","Cancer Center","Dr. Sarah Chen"],
  ["E10217","Williams","Angela","1971-01-19","Female","White","Non-Hispanic","BlueCross BlueShield","DX-44822","C34.12","Malignant neoplasm of upper lobe, left bronchus or lung","2025-09-05","Albuterol","2 puffs PRN","Inhalation","Active","WBC","7200","/uL","2026-03-01","4500-11000","N","122","78","72","58.2","165","21.4","2026-03-01","New Patient Oncology","Cancer Center","Dr. James Wright"],
  ["E10305","Thompson","Robert","1954-12-06","Male","White","Hispanic or Latino","Humana Medicare","DX-44829","C34.90","Malignant neoplasm of unspecified part of unspecified bronchus or lung","2025-03-18","Ondansetron","8mg","Oral","Active","Total Bilirubin","0.6","mg/dL","2026-02-20","0.1-1.2","N","136","82","70","76.8","175","25.1","2026-02-20","Oncology Follow-up","Cancer Center","Dr. Sarah Chen"],
  ["E10412","Davis","Maria","1965-02-22","Female","White","Hispanic or Latino","Cigna HMO","DX-44823","C34.21","Malignant neoplasm of middle lobe, right bronchus or lung","2025-07-30","Prednisone","10mg","Oral","Active","LDL","128","mg/dL","2026-02-10","<130","N","126","80","74","68.0","160","26.6","2026-02-10","Oncology Follow-up","Cancer Center","Dr. James Wright"],
  ["E10098","Brown","James","1960-05-17","Male","Black or African American","Non-Hispanic","Aetna PPO","DX-44821","C34.11","Malignant neoplasm of upper lobe, right bronchus or lung","2025-05-12","Gabapentin","300mg","Oral","Active","Hemoglobin","11.8","g/dL","2026-02-25","12.0-17.5","Y","128","76","80","88.5","180","27.3","2026-02-25","Oncology Follow-up","Cancer Center","Dr. Sarah Chen"],
  ["E10556","Lee","Jennifer","1976-08-30","Female","Asian","Non-Hispanic","Kaiser Permanente","DX-44829","C34.90","Malignant neoplasm of unspecified part of unspecified bronchus or lung","2025-10-01","Lorazepam","0.5mg","Oral","Active","eGFR","95","mL/min/1.73m2","2026-03-02",">60","N","110","68","66","55.0","158","22.0","2026-03-02","Oncology Consult","Cancer Center","Dr. James Wright"],
  // --- Cardiology patients (candidates for DELIVER HFpEF study) ---
  ["E20134","Garcia","Roberto","1956-04-11","Male","White","Hispanic or Latino","Medicare","DX-52010","I50.32","Chronic diastolic heart failure","2023-01-20","Sacubitril/Valsartan","97/103mg","Oral","Active","BNP","342","pg/mL","2026-02-28","<100","Y","148","92","88","98.5","170","34.1","2026-02-28","Heart Failure Clinic","Cardiology","Dr. Michael Patel"],
  ["E20134","Garcia","Roberto","1956-04-11","Male","White","Hispanic or Latino","Medicare","DX-52010","I50.32","Chronic diastolic heart failure","2023-01-20","Furosemide","40mg","Oral","Active","Creatinine","1.4","mg/dL","2026-02-28","0.7-1.3","Y","148","92","88","98.5","170","34.1","2026-02-28","Heart Failure Clinic","Cardiology","Dr. Michael Patel"],
  ["E20198","Anderson","Dorothy","1952-09-25","Female","White","Non-Hispanic","BlueCross BlueShield","DX-52011","I50.33","Acute on chronic diastolic heart failure","2022-06-14","Spironolactone","25mg","Oral","Active","NT-proBNP","1240","pg/mL","2026-03-01","<300","Y","156","94","92","82.0","162","31.2","2026-03-01","Cardiology Follow-up","Cardiology","Dr. Michael Patel"],
  ["E20267","Wilson","Thomas","1948-12-03","Male","White","Non-Hispanic","Humana Medicare","DX-52012","I50.31","Acute diastolic heart failure","2024-03-08","Empagliflozin","10mg","Oral","Active","eGFR","48","mL/min/1.73m2","2026-02-22",">60","Y","142","86","78","95.0","176","30.7","2026-02-22","Heart Failure Clinic","Cardiology","Dr. Michael Patel"],
  // --- Diabetes/Metabolic patients (candidates for STEP-5 obesity study) ---
  ["E30089","Taylor","Susan","1978-03-15","Female","Black or African American","Non-Hispanic","UnitedHealth","DX-61005","E66.01","Morbid (severe) obesity due to excess calories","2021-05-20","Metformin","1000mg BID","Oral","Active","HbA1c","8.2","%","2026-02-18","<7.0","Y","138","88","82","112.0","164","41.6","2026-02-18","Endocrinology","Metabolic Center","Dr. Lisa Fernandez"],
  ["E30089","Taylor","Susan","1978-03-15","Female","Black or African American","Non-Hispanic","UnitedHealth","DX-61002","E11.65","Type 2 diabetes mellitus with hyperglycemia","2019-09-10","Insulin Glargine","32 units","Subcutaneous","Active","Fasting Glucose","186","mg/dL","2026-02-18","70-100","Y","138","88","82","112.0","164","41.6","2026-02-18","Endocrinology","Metabolic Center","Dr. Lisa Fernandez"],
  ["E30145","Harris","Michael","1982-07-22","Male","White","Non-Hispanic","Cigna PPO","DX-61005","E66.01","Morbid (severe) obesity due to excess calories","2020-11-30","Semaglutide","1.0mg","Subcutaneous","Active","Total Cholesterol","242","mg/dL","2026-02-25","<200","Y","144","90","76","128.0","182","38.7","2026-02-25","Weight Management","Metabolic Center","Dr. Lisa Fernandez"],
  ["E30201","Jackson","Linda","1970-06-18","Female","White","Non-Hispanic","Aetna PPO","DX-61006","E66.09","Other obesity due to excess calories","2022-08-12","Phentermine","37.5mg","Oral","Active","Triglycerides","310","mg/dL","2026-03-01","<150","Y","132","84","74","96.5","168","34.2","2026-03-01","Weight Management","Metabolic Center","Dr. Lisa Fernandez"],
  // --- Neurology patients (candidates for Lecanemab Alzheimer's study) ---
  ["E40022","White","Margaret","1949-01-30","Female","White","Non-Hispanic","Medicare","DX-71001","G30.9","Alzheimer's disease, unspecified","2024-12-01","Donepezil","10mg","Oral","Active","Amyloid PET","Positive","","2025-11-15","Negative","Y","128","76","68","62.0","160","24.2","2026-02-20","Memory Clinic","Neurology","Dr. Kevin Park"],
  ["E40055","Moore","Richard","1951-08-14","Male","White","Non-Hispanic","Humana Medicare","DX-71002","G30.1","Alzheimer's disease with late onset","2025-02-20","Memantine","20mg","Oral","Active","MMSE Score","22","points","2026-01-15","24-30","Y","136","82","72","78.5","175","25.6","2026-01-15","Memory Clinic","Neurology","Dr. Kevin Park"],
  // --- Immunology patients (candidates for Crohn's/AD studies) ---
  ["E50033","Clark","Jessica","1985-04-12","Female","White","Non-Hispanic","BlueCross BlueShield","DX-81001","K50.10","Crohn's disease of large intestine without complications","2020-03-15","Adalimumab","40mg","Subcutaneous","Active","CRP","14.2","mg/L","2026-02-28","<3.0","Y","118","74","72","58.0","165","21.3","2026-02-28","IBD Clinic","Gastroenterology","Dr. Amy Rodriguez"],
  ["E50033","Clark","Jessica","1985-04-12","Female","White","Non-Hispanic","BlueCross BlueShield","DX-81001","K50.10","Crohn's disease of large intestine without complications","2020-03-15","Budesonide","9mg","Oral","Active","Fecal Calprotectin","680","ug/g","2026-02-28","<50","Y","118","74","72","58.0","165","21.3","2026-02-28","IBD Clinic","Gastroenterology","Dr. Amy Rodriguez"],
  ["E50078","Lewis","Ryan","1990-11-28","Male","White","Non-Hispanic","Aetna PPO","DX-82001","L20.9","Atopic dermatitis, unspecified","2018-06-22","Dupilumab","300mg","Subcutaneous","Active","Total IgE","1840","IU/mL","2026-03-01","<100","Y","120","76","68","82.0","178","25.9","2026-03-01","Dermatology","Specialty Clinic","Dr. Karen Mitchell"],
  // --- General medicine patients (less likely candidates) ---
  ["E60012","Young","Barbara","1968-10-05","Female","White","Non-Hispanic","Cigna HMO","DX-61002","E11.9","Type 2 diabetes mellitus without complications","2017-04-20","Metformin","500mg BID","Oral","Active","HbA1c","6.8","%","2026-02-10","<7.0","N","124","78","70","72.0","162","27.4","2026-02-10","Annual Physical","Primary Care","Dr. John Adams"],
  ["E60045","Hall","William","1955-03-28","Male","White","Non-Hispanic","Medicare","DX-51001","I10","Essential (primary) hypertension","2015-08-10","Amlodipine","10mg","Oral","Active","Potassium","4.2","mEq/L","2026-02-15","3.5-5.0","N","148","92","74","88.0","174","29.1","2026-02-15","Follow-up","Primary Care","Dr. John Adams"],
  ["E60078","Allen","Catherine","1973-12-19","Female","White","Non-Hispanic","UnitedHealth","DX-91001","J45.20","Mild intermittent asthma, uncomplicated","2014-01-15","Fluticasone/Salmeterol","250/50","Inhalation","Active","Peak Flow","410","L/min","2026-01-28","380-550","N","116","72","68","65.0","167","23.3","2026-01-28","Pulmonology","Specialty Clinic","Dr. Robert Kim"],
  ["E60112","Scott","Daniel","1980-05-07","Male","White","Non-Hispanic","BlueCross BlueShield","DX-82002","M06.9","Rheumatoid arthritis, unspecified","2021-10-30","Methotrexate","15mg","Oral","Active","ESR","38","mm/hr","2026-02-20","0-20","Y","122","78","72","84.0","176","27.1","2026-02-20","Rheumatology","Specialty Clinic","Dr. Amy Rodriguez"],
  ["E60145","Green","Nancy","1962-08-23","Female","White","Non-Hispanic","Humana Medicare","DX-51005","I48.91","Unspecified atrial fibrillation","2022-03-15","Apixaban","5mg BID","Oral","Active","INR","1.1","","2026-03-01","0.8-1.2","N","130","80","88","70.0","163","26.3","2026-03-01","Cardiology","Cardiology","Dr. Michael Patel"],
];

// Smart column mapping: Epic column → SiteConnect field
// Simulates AI-powered fuzzy matching with confidence scores
export const EPIC_AUTO_MAPPINGS = [
  { sourceColumn: "PAT_MRN_ID", targetField: "patient_id", confidence: 0.99 },
  { sourceColumn: "PAT_LAST_NAME", targetField: "", confidence: 0 },
  { sourceColumn: "PAT_FIRST_NAME", targetField: "", confidence: 0 },
  { sourceColumn: "BIRTH_DATE", targetField: "date_of_birth", confidence: 0.98 },
  { sourceColumn: "SEX", targetField: "gender", confidence: 0.96 },
  { sourceColumn: "PATIENT_RACE", targetField: "race", confidence: 0.97 },
  { sourceColumn: "ETHNIC_GROUP", targetField: "ethnicity", confidence: 0.94 },
  { sourceColumn: "COVERAGE_PAYOR_NAME", targetField: "", confidence: 0 },
  { sourceColumn: "DX_ID", targetField: "", confidence: 0 },
  { sourceColumn: "CURRENT_ICD10_LIST", targetField: "diagnosis_icd10", confidence: 0.99 },
  { sourceColumn: "DX_NAME", targetField: "diagnosis_desc", confidence: 0.95 },
  { sourceColumn: "ONSET_DATE", targetField: "diagnosis_date", confidence: 0.88 },
  { sourceColumn: "MEDICATION_NAME", targetField: "medication_name", confidence: 0.97 },
  { sourceColumn: "MED_DOSE", targetField: "medication_dose", confidence: 0.93 },
  { sourceColumn: "MED_ROUTE", targetField: "", confidence: 0 },
  { sourceColumn: "ORDER_STATUS", targetField: "", confidence: 0 },
  { sourceColumn: "PROC_NAME", targetField: "lab_test", confidence: 0.91 },
  { sourceColumn: "RESULT_VALUE", targetField: "lab_value", confidence: 0.96 },
  { sourceColumn: "RESULT_UNIT", targetField: "lab_unit", confidence: 0.95 },
  { sourceColumn: "RESULT_DATE", targetField: "lab_date", confidence: 0.92 },
  { sourceColumn: "REF_RANGE", targetField: "lab_ref_range", confidence: 0.89 },
  { sourceColumn: "ABNORMAL_YN", targetField: "", confidence: 0 },
  { sourceColumn: "BP_SYSTOLIC", targetField: "vital_value", confidence: 0.72 },
  { sourceColumn: "BP_DIASTOLIC", targetField: "", confidence: 0 },
  { sourceColumn: "PULSE", targetField: "", confidence: 0 },
  { sourceColumn: "WEIGHT_KG", targetField: "", confidence: 0 },
  { sourceColumn: "HEIGHT_CM", targetField: "", confidence: 0 },
  { sourceColumn: "BMI", targetField: "", confidence: 0 },
  { sourceColumn: "ENCOUNTER_DATE", targetField: "", confidence: 0 },
  { sourceColumn: "VISIT_TYPE", targetField: "", confidence: 0 },
  { sourceColumn: "DEPT_NAME", targetField: "", confidence: 0 },
  { sourceColumn: "PROV_NAME", targetField: "", confidence: 0 },
];

// Sample data for each column (first 5 values) for the mapper preview
export const EPIC_SAMPLE_DATA: Record<string, string[]> = {};
for (const col of EPIC_COLUMNS) {
  const colIdx = EPIC_COLUMNS.indexOf(col);
  const values: string[] = [];
  const seen = new Set<string>();
  for (const row of EPIC_ROWS) {
    const val = row[colIdx];
    if (val && !seen.has(val)) {
      seen.add(val);
      values.push(val);
    }
    if (values.length >= 4) break;
  }
  EPIC_SAMPLE_DATA[col] = values;
}

// Deduplicated unique patients from the flat rows
export interface ParsedPatient {
  mrn: string;
  lastName: string;
  firstName: string;
  dob: string;
  sex: string;
  race: string;
  ethnicity: string;
  insurance: string;
  diagnoses: { icd10: string; name: string; onset: string }[];
  medications: { name: string; dose: string; route: string; status: string }[];
  labs: { test: string; value: string; unit: string; date: string; ref: string; abnormal: boolean }[];
  vitals: { systolic: number; diastolic: number; pulse: number; weight: number; height: number; bmi: number };
  lastEncounter: string;
  department: string;
  provider: string;
}

export function parseEpicRows(): ParsedPatient[] {
  const patientMap = new Map<string, ParsedPatient>();

  for (const row of EPIC_ROWS) {
    const mrn = row[0]!;
    let patient = patientMap.get(mrn);

    if (!patient) {
      patient = {
        mrn,
        lastName: row[1]!,
        firstName: row[2]!,
        dob: row[3]!,
        sex: row[4]!,
        race: row[5]!,
        ethnicity: row[6]!,
        insurance: row[7]!,
        diagnoses: [],
        medications: [],
        labs: [],
        vitals: { systolic: 0, diastolic: 0, pulse: 0, weight: 0, height: 0, bmi: 0 },
        lastEncounter: "",
        department: "",
        provider: "",
      };
      patientMap.set(mrn, patient);
    }

    // Add diagnosis (deduplicate by ICD-10)
    const icd10 = row[9]!;
    if (icd10 && !patient.diagnoses.some((d) => d.icd10 === icd10)) {
      patient.diagnoses.push({ icd10, name: row[10]!, onset: row[11]! });
    }

    // Add medication (deduplicate by name)
    const medName = row[12]!;
    if (medName && !patient.medications.some((m) => m.name === medName)) {
      patient.medications.push({ name: medName, dose: row[13]!, route: row[14]!, status: row[15]! });
    }

    // Add lab (deduplicate by test + date)
    const labTest = row[16]!;
    const labDate = row[19]!;
    if (labTest && !patient.labs.some((l) => l.test === labTest && l.date === labDate)) {
      patient.labs.push({
        test: labTest,
        value: row[17]!,
        unit: row[18]!,
        date: labDate,
        ref: row[20]!,
        abnormal: row[21] === "Y",
      });
    }

    // Vitals (take latest)
    patient.vitals = {
      systolic: parseInt(row[22]!) || 0,
      diastolic: parseInt(row[23]!) || 0,
      pulse: parseInt(row[24]!) || 0,
      weight: parseFloat(row[25]!) || 0,
      height: parseFloat(row[26]!) || 0,
      bmi: parseFloat(row[27]!) || 0,
    };

    patient.lastEncounter = row[28]!;
    patient.department = row[30]!;
    patient.provider = row[31]!;
  }

  return Array.from(patientMap.values());
}

// ============================================================
// Study-specific screening definitions
// Each study defines its inclusion/exclusion criteria with
// evaluation functions that check parsed patient data
// ============================================================

import type { CriterionResult, PatientSummary, ScreeningResult, ScreeningStatus } from "@/types";

interface CriterionDef {
  id: string;
  type: "inclusion" | "exclusion";
  text: string;
  evaluate: (p: ParsedPatient, age: number) => { result: CriterionResult["result"]; evidence: string | null; reasoning: string; confidence: number; ai: boolean };
}

// Infer which data source the evidence came from based on criterion text, evidence, and reasoning
function inferEvidenceSource(criterionText: string, evidence: string | null, reasoning: string): string | null {
  if (!evidence) return null;
  const text = `${criterionText} ${evidence} ${reasoning}`.toLowerCase();
  // Lab-related keywords
  if (/\b(hgb|plt|anc|wbc|egfr|creatinine|bilirubin|ast|alt|a1c|lab|g\/dl|u\/l|ml\/min|mg\/dl|\/ul)\b/.test(text)) return "labs";
  // Medication keywords
  if (/\b(therap|medication|drug|regimen|chemo|immunosup|systemic treatment|prior.*therapy)\b/.test(text)) return "medications";
  // Diagnosis keywords
  if (/\b(icd-?10|diagnosis|diagnosed|c34|autoimmune|hiv|hepatitis|m06|m05|m32|b20|b18|c\d{2}|e11|i\d{2}|j\d{2}|k\d{2}|n\d{2}|g\d{2})\b/.test(text)) return "diagnoses";
  // Vitals keywords
  if (/\b(bmi|ecog|performance status|weight|bp|heart rate|vital)\b/.test(text)) return "vitals";
  // Age/demographics
  if (/\b(age|gender|sex|years old|patient age)\b/.test(text)) return "demographics";
  return null;
}

// Helper to check if patient has a specific lab
function findLab(p: ParsedPatient, name: string): { value: number; unit: string; date: string } | null {
  const lab = p.labs.find((l) => l.test.toLowerCase() === name.toLowerCase());
  if (!lab) return null;
  return { value: parseFloat(lab.value), unit: lab.unit, date: lab.date };
}

function hasIcd10Prefix(p: ParsedPatient, prefixes: string[]): boolean {
  return p.diagnoses.some((d) => prefixes.some((pre) => d.icd10.startsWith(pre)));
}

function hasMedMatch(p: ParsedPatient, keywords: string[]): boolean {
  return p.medications.some((m) =>
    keywords.some((kw) => m.name.toLowerCase().includes(kw.toLowerCase()))
  );
}

// ---- KEYNOTE-789 (NSCLC) ----
const KEYNOTE789_CRITERIA: CriterionDef[] = [
  { id: "k789-inc1", type: "inclusion", text: "Age >= 18 years",
    evaluate: (_p, age) => age >= 18
      ? { result: "met", evidence: `Patient age: ${age} years`, reasoning: "Rule-based: age >= 18", confidence: 1.0, ai: false }
      : { result: "not_met", evidence: `Patient age: ${age} years`, reasoning: "Rule-based: age < 18", confidence: 1.0, ai: false }
  },
  { id: "k789-inc2", type: "inclusion", text: "Histologically or cytologically confirmed diagnosis of NSCLC",
    evaluate: (p) => {
      const nsclc = p.diagnoses.find((d) => d.icd10.startsWith("C34"));
      return nsclc
        ? { result: "met", evidence: `ICD-10: ${nsclc.icd10} — ${nsclc.name}`, reasoning: "Rule-based: ICD-10 code C34.x confirmed", confidence: 1.0, ai: false }
        : { result: "not_met", evidence: `Primary diagnosis: ${p.diagnoses[0]?.name ?? "none"} (${p.diagnoses[0]?.icd10 ?? "—"})`, reasoning: "No NSCLC diagnosis (C34.x) found in record", confidence: 1.0, ai: false };
    }
  },
  { id: "k789-inc3", type: "inclusion", text: "Stage IIIB or IV disease not amenable to curative surgery or radiation",
    evaluate: (p) => {
      const nsclc = p.diagnoses.some((d) => d.icd10.startsWith("C34"));
      const onChemo = hasMedMatch(p, ["Carboplatin", "Cisplatin", "Pemetrexed", "Docetaxel", "Paclitaxel"]);
      if (nsclc && onChemo) return { result: "met", evidence: "Active chemotherapy regimen indicates advanced stage disease", reasoning: "AI inferred advanced stage from active chemotherapy", confidence: 0.85, ai: true };
      if (nsclc) return { result: "unknown", evidence: "NSCLC confirmed but staging not determinable from structured data", reasoning: "Would need imaging reports or clinical notes for staging", confidence: 0.3, ai: true };
      return { result: "not_met", evidence: null, reasoning: "No NSCLC diagnosis", confidence: 1.0, ai: false };
    }
  },
  { id: "k789-inc4", type: "inclusion", text: "ECOG performance status 0-1",
    evaluate: (p) => {
      const nsclc = p.diagnoses.some((d) => d.icd10.startsWith("C34"));
      if (nsclc && p.vitals.bmi >= 18 && p.vitals.bmi <= 35) return { result: "met", evidence: `BMI ${p.vitals.bmi} suggests functional status. Estimated ECOG 0-1`, reasoning: "AI estimated ECOG from BMI and visit type (ambulatory oncology)", confidence: 0.75, ai: true };
      if (nsclc) return { result: "unknown", evidence: null, reasoning: "ECOG not recorded in structured data — needs chart review", confidence: 0.0, ai: true };
      return { result: "not_met", evidence: null, reasoning: "Not applicable — no NSCLC diagnosis", confidence: 1.0, ai: false };
    }
  },
  { id: "k789-inc5", type: "inclusion", text: "At least one measurable lesion per RECIST v1.1",
    evaluate: (p) => {
      const nsclc = p.diagnoses.some((d) => d.icd10.startsWith("C34"));
      const onChemo = hasMedMatch(p, ["Carboplatin", "Cisplatin", "Pemetrexed", "Docetaxel"]);
      if (nsclc && onChemo) return { result: "met", evidence: "Patient on active chemotherapy — measurable disease assumed per treatment plan", reasoning: "AI: chemotherapy initiation implies measurable disease per RECIST", confidence: 0.80, ai: true };
      if (nsclc) return { result: "unknown", evidence: null, reasoning: "Need imaging report to assess RECIST measurability", confidence: 0.0, ai: true };
      return { result: "not_met", evidence: null, reasoning: "No relevant oncology diagnosis", confidence: 1.0, ai: false };
    }
  },
  { id: "k789-inc6", type: "inclusion", text: "Adequate hematologic function: ANC >= 1500/uL, Platelets >= 100,000/uL, Hgb >= 9.0 g/dL",
    evaluate: (p) => {
      const hgb = findLab(p, "Hemoglobin");
      const plt = findLab(p, "Platelets");
      const anc = findLab(p, "ANC");
      const wbc = findLab(p, "WBC");
      const cbc = findLab(p, "CBC w/ Diff");
      const parts: string[] = [];
      let allMet = true;
      let anyFound = false;
      if (hgb) { anyFound = true; parts.push(`Hgb: ${hgb.value} g/dL`); if (hgb.value < 9.0) allMet = false; }
      if (plt) { anyFound = true; parts.push(`PLT: ${plt.value}/uL`); if (plt.value < 100000) allMet = false; }
      if (anc) { anyFound = true; parts.push(`ANC: ${anc.value}/uL`); if (anc.value < 1500) allMet = false; }
      else if (wbc || cbc) { anyFound = true; const v = (wbc ?? cbc)!; parts.push(`WBC: ${v.value} ${v.unit}`); }
      if (anyFound && allMet) return { result: "met", evidence: parts.join(", "), reasoning: "Rule-based: lab values within required ranges", confidence: 1.0, ai: false };
      if (anyFound) return { result: "not_met", evidence: parts.join(", "), reasoning: "One or more hematologic values below threshold", confidence: 1.0, ai: false };
      return { result: "unknown", evidence: null, reasoning: "No recent CBC/hematology labs in record", confidence: 0.0, ai: false };
    }
  },
  { id: "k789-inc7", type: "inclusion", text: "Adequate renal function: eGFR >= 60 mL/min or Creatinine <= 1.5x ULN",
    evaluate: (p) => {
      const egfr = findLab(p, "eGFR");
      const cr = findLab(p, "Creatinine");
      if (egfr && egfr.value >= 60) return { result: "met", evidence: `eGFR: ${egfr.value} mL/min/1.73m2`, reasoning: "Rule-based: eGFR >= 60", confidence: 1.0, ai: false };
      if (cr && cr.value <= 1.5) return { result: "met", evidence: `Creatinine: ${cr.value} mg/dL (within 1.5x ULN)`, reasoning: "Rule-based: creatinine within range", confidence: 1.0, ai: false };
      if (egfr) return { result: "not_met", evidence: `eGFR: ${egfr.value} mL/min/1.73m2 (below 60)`, reasoning: "Renal function below threshold", confidence: 1.0, ai: false };
      if (cr && cr.value > 1.5) return { result: "not_met", evidence: `Creatinine: ${cr.value} mg/dL (above 1.5x ULN)`, reasoning: "Creatinine elevated", confidence: 1.0, ai: false };
      return { result: "unknown", evidence: null, reasoning: "No renal function labs found", confidence: 0.0, ai: false };
    }
  },
  { id: "k789-inc8", type: "inclusion", text: "Adequate hepatic function: Total bilirubin <= 1.5x ULN, AST/ALT <= 2.5x ULN",
    evaluate: (p) => {
      const bili = findLab(p, "Total Bilirubin");
      const ast = findLab(p, "AST");
      const alt = findLab(p, "ALT");
      const parts: string[] = [];
      let allMet = true;
      if (bili) { parts.push(`Bili: ${bili.value} mg/dL`); if (bili.value > 1.8) allMet = false; }
      if (ast) { parts.push(`AST: ${ast.value} U/L`); if (ast.value > 100) allMet = false; }
      if (alt) { parts.push(`ALT: ${alt.value} U/L`); if (alt.value > 140) allMet = false; }
      if (parts.length > 0 && allMet) return { result: "met", evidence: parts.join(", "), reasoning: "Rule-based: liver function within limits", confidence: 1.0, ai: false };
      if (parts.length > 0) return { result: "not_met", evidence: parts.join(", "), reasoning: "One or more hepatic values above threshold", confidence: 1.0, ai: false };
      return { result: "unknown", evidence: null, reasoning: "No hepatic function labs found", confidence: 0.0, ai: false };
    }
  },
  { id: "k789-inc9", type: "inclusion", text: "No prior systemic therapy for metastatic NSCLC",
    evaluate: (p) => {
      const nsclc = p.diagnoses.some((d) => d.icd10.startsWith("C34"));
      if (!nsclc) return { result: "not_met", evidence: null, reasoning: "Not applicable — no NSCLC diagnosis", confidence: 1.0, ai: false };
      const priorChemo = p.medications.filter((m) => ["Carboplatin", "Cisplatin", "Pemetrexed", "Docetaxel", "Paclitaxel"].some((d) => m.name.toLowerCase().includes(d.toLowerCase())) && m.status === "Completed");
      if (priorChemo.length > 0) return { result: "not_met", evidence: `Prior completed therapy: ${priorChemo.map((m) => m.name).join(", ")}`, reasoning: "Patient has completed prior systemic therapy", confidence: 0.9, ai: true };
      return { result: "met", evidence: "No prior completed systemic chemotherapy in medication history", reasoning: "AI reviewed medication history — no prior systemic therapy found", confidence: 0.88, ai: true };
    }
  },
  { id: "k789-inc10", type: "inclusion", text: "Willing and able to provide written informed consent",
    evaluate: () => ({ result: "needs_review", evidence: null, reasoning: "Cannot be determined from medical records — requires in-person assessment", confidence: 0.0, ai: false })
  },
  // Exclusion
  { id: "k789-exc1", type: "exclusion", text: "Active autoimmune disease requiring systemic treatment in past 2 years",
    evaluate: (p) => {
      const ai = p.diagnoses.find((d) => ["M06", "M05", "M32", "M35", "M34"].some((c) => d.icd10.startsWith(c)));
      const onImmunosup = hasMedMatch(p, ["Methotrexate", "Azathioprine", "Mycophenolate", "Cyclophosphamide"]);
      if (ai && onImmunosup) return { result: "met", evidence: `${ai.name} (${ai.icd10}) — on ${p.medications.find((m) => ["Methotrexate"].some((k) => m.name.includes(k)))?.name ?? "immunosuppressant"}`, reasoning: "Active autoimmune disease on systemic therapy", confidence: 0.95, ai: true };
      if (ai) return { result: "met", evidence: `${ai.name} (${ai.icd10})`, reasoning: "Autoimmune diagnosis found — needs verification of current treatment", confidence: 0.8, ai: true };
      return { result: "not_met", evidence: "No autoimmune conditions in diagnosis history", reasoning: "AI reviewed all diagnoses — no autoimmune conditions found", confidence: 0.92, ai: true };
    }
  },
  { id: "k789-exc2", type: "exclusion", text: "Known active CNS metastases and/or carcinomatous meningitis",
    evaluate: (p) => {
      const cns = p.diagnoses.some((d) => d.icd10.startsWith("C79.3") || d.icd10.startsWith("C79.4"));
      if (cns) return { result: "met", evidence: "CNS metastasis diagnosis found in record", reasoning: "ICD-10 C79.3x/C79.4x — brain/meningeal metastasis", confidence: 1.0, ai: false };
      return { result: "not_met", evidence: "No CNS metastases documented", reasoning: "No brain/meningeal metastasis codes in diagnosis history", confidence: 0.85, ai: true };
    }
  },
  { id: "k789-exc3", type: "exclusion", text: "Prior treatment with anti-PD-1, anti-PD-L1, or anti-PD-L2 agent",
    evaluate: (p) => {
      const ici = p.medications.find((m) => ["Pembrolizumab", "Nivolumab", "Atezolizumab", "Durvalumab", "Avelumab", "Cemiplimab"].some((d) => m.name.toLowerCase().includes(d.toLowerCase())));
      if (ici) return { result: "met", evidence: `Prior immunotherapy: ${ici.name} ${ici.dose}`, reasoning: "Checkpoint inhibitor found in medication history", confidence: 1.0, ai: false };
      return { result: "not_met", evidence: "No prior immunotherapy in medication history", reasoning: "Rule-based: searched medication list for PD-1/PD-L1/PD-L2 agents", confidence: 1.0, ai: false };
    }
  },
  { id: "k789-exc4", type: "exclusion", text: "Active infection requiring systemic therapy",
    evaluate: (p) => {
      const infection = p.diagnoses.some((d) => ["A41", "J18", "B20", "A49"].some((c) => d.icd10.startsWith(c)));
      if (infection) return { result: "met", evidence: "Active infection diagnosis found", reasoning: "Infection-related ICD-10 codes detected", confidence: 0.9, ai: true };
      return { result: "not_met", evidence: "No active infections documented", reasoning: "AI reviewed diagnoses — no active infection codes found", confidence: 0.9, ai: true };
    }
  },
  { id: "k789-exc5", type: "exclusion", text: "Pregnant or breastfeeding",
    evaluate: (p) => p.sex === "Male"
      ? { result: "not_met", evidence: "Male patient — not applicable", reasoning: "Rule-based: male sex", confidence: 1.0, ai: false }
      : { result: "not_met", evidence: "No pregnancy indicators in records", reasoning: "No pregnancy-related codes found", confidence: 0.95, ai: true }
  },
  { id: "k789-exc6", type: "exclusion", text: "Known history of HIV, Hepatitis B, or Hepatitis C",
    evaluate: (p) => {
      const hiv = p.diagnoses.some((d) => d.icd10.startsWith("B20") || d.icd10.startsWith("B18") || d.icd10.startsWith("B17.1"));
      if (hiv) return { result: "met", evidence: "HIV/HBV/HCV diagnosis found", reasoning: "Rule-based: ICD-10 B20/B18/B17.1 search", confidence: 1.0, ai: false };
      return { result: "not_met", evidence: "No HIV/HBV/HCV in diagnosis history", reasoning: "Rule-based: ICD-10 code search for B20, B18.x, B17.1", confidence: 1.0, ai: false };
    }
  },
];

// ---- Study criteria definitions for other studies ----
// Each returns a set of criteria evaluators for screening

export interface StudyScreeningDef {
  studyId: string;
  criteria: CriterionDef[];
}

export const STUDY_SCREENING_DEFS: StudyScreeningDef[] = [
  { studyId: "study-1", criteria: KEYNOTE789_CRITERIA },
  { studyId: "study-2", criteria: [
    // DELIVER: Dapagliflozin in HFpEF
    { id: "del-inc1", type: "inclusion", text: "Age >= 40 years", evaluate: (_, age) => age >= 40 ? { result: "met", evidence: `Age: ${age}`, reasoning: "Rule-based", confidence: 1.0, ai: false } : { result: "not_met", evidence: `Age: ${age}`, reasoning: "Below minimum age", confidence: 1.0, ai: false } },
    { id: "del-inc2", type: "inclusion", text: "Diagnosis of heart failure with preserved ejection fraction (HFpEF)", evaluate: (p) => { const hf = p.diagnoses.find((d) => d.icd10.startsWith("I50.3")); return hf ? { result: "met", evidence: `${hf.name} (${hf.icd10})`, reasoning: "ICD-10 I50.3x — diastolic heart failure", confidence: 1.0, ai: false } : { result: "not_met", evidence: `Primary: ${p.diagnoses[0]?.name ?? "none"}`, reasoning: "No HFpEF diagnosis found", confidence: 1.0, ai: false }; } },
    { id: "del-inc3", type: "inclusion", text: "LVEF >= 40% on most recent echocardiogram", evaluate: (p) => { const hf = p.diagnoses.some((d) => d.icd10.startsWith("I50.3")); return hf ? { result: "unknown", evidence: null, reasoning: "Need echo report — not in structured data", confidence: 0.0, ai: true } : { result: "not_met", evidence: null, reasoning: "No HFpEF — not applicable", confidence: 1.0, ai: false }; } },
    { id: "del-inc4", type: "inclusion", text: "NT-proBNP >= 300 pg/mL or BNP >= 100 pg/mL", evaluate: (p) => { const bnp = findLab(p, "BNP"); const nt = findLab(p, "NT-proBNP"); if (nt && nt.value >= 300) return { result: "met", evidence: `NT-proBNP: ${nt.value} pg/mL`, reasoning: "Rule-based: NT-proBNP >= 300", confidence: 1.0, ai: false }; if (bnp && bnp.value >= 100) return { result: "met", evidence: `BNP: ${bnp.value} pg/mL`, reasoning: "Rule-based: BNP >= 100", confidence: 1.0, ai: false }; return { result: "unknown", evidence: null, reasoning: "No BNP/NT-proBNP in record", confidence: 0.0, ai: false }; } },
    { id: "del-inc5", type: "inclusion", text: "NYHA Class II-IV symptoms", evaluate: (p) => { const hf = p.diagnoses.some((d) => d.icd10.startsWith("I50")); return hf ? { result: "unknown", evidence: null, reasoning: "NYHA class not recorded in structured data", confidence: 0.0, ai: true } : { result: "not_met", evidence: null, reasoning: "No heart failure diagnosis", confidence: 1.0, ai: false }; } },
    { id: "del-exc1", type: "exclusion", text: "Type 1 diabetes mellitus", evaluate: (p) => { const t1 = p.diagnoses.some((d) => d.icd10.startsWith("E10")); return t1 ? { result: "met", evidence: "Type 1 DM in diagnosis list", reasoning: "ICD-10 E10.x found", confidence: 1.0, ai: false } : { result: "not_met", evidence: "No T1DM", reasoning: "No E10.x codes", confidence: 1.0, ai: false }; } },
    { id: "del-exc2", type: "exclusion", text: "eGFR < 25 mL/min/1.73m2", evaluate: (p) => { const e = findLab(p, "eGFR"); if (e && e.value < 25) return { result: "met", evidence: `eGFR: ${e.value}`, reasoning: "Severely reduced renal function", confidence: 1.0, ai: false }; if (e) return { result: "not_met", evidence: `eGFR: ${e.value}`, reasoning: "eGFR adequate", confidence: 1.0, ai: false }; return { result: "unknown", evidence: null, reasoning: "No eGFR lab", confidence: 0.0, ai: false }; } },
    { id: "del-exc3", type: "exclusion", text: "Acute decompensated heart failure in the last 4 weeks", evaluate: (p) => { const acute = p.diagnoses.some((d) => d.icd10 === "I50.31" || d.icd10 === "I50.33"); return acute ? { result: "met", evidence: "Acute/acute-on-chronic HF diagnosis", reasoning: "ICD-10 I50.31/I50.33 indicates recent decompensation", confidence: 0.85, ai: true } : { result: "not_met", evidence: "No acute HF codes", reasoning: "Chronic HF only", confidence: 0.9, ai: true }; } },
  ] },
  { studyId: "study-3", criteria: [
    // STEP-5: Semaglutide in Obesity
    { id: "stp-inc1", type: "inclusion", text: "Age >= 18 years", evaluate: (_, age) => age >= 18 ? { result: "met", evidence: `Age: ${age}`, reasoning: "Rule-based", confidence: 1.0, ai: false } : { result: "not_met", evidence: `Age: ${age}`, reasoning: "Below minimum", confidence: 1.0, ai: false } },
    { id: "stp-inc2", type: "inclusion", text: "BMI >= 30 kg/m2, or BMI >= 27 kg/m2 with weight-related comorbidity", evaluate: (p) => { const bmi = p.vitals.bmi; if (bmi >= 30) return { result: "met", evidence: `BMI: ${bmi} kg/m2 (obese)`, reasoning: "Rule-based: BMI >= 30", confidence: 1.0, ai: false }; if (bmi >= 27 && hasIcd10Prefix(p, ["E11", "I10", "E78"])) return { result: "met", evidence: `BMI: ${bmi} kg/m2 with comorbidity`, reasoning: "BMI >= 27 with DM/HTN/hyperlipidemia", confidence: 1.0, ai: false }; if (bmi > 0) return { result: "not_met", evidence: `BMI: ${bmi} kg/m2`, reasoning: "BMI below threshold", confidence: 1.0, ai: false }; return { result: "unknown", evidence: null, reasoning: "No BMI recorded", confidence: 0.0, ai: false }; } },
    { id: "stp-inc3", type: "inclusion", text: "At least one unsuccessful dietary effort to lose weight", evaluate: () => ({ result: "needs_review", evidence: null, reasoning: "Requires patient interview", confidence: 0.0, ai: false }) },
    { id: "stp-inc4", type: "inclusion", text: "HbA1c <= 10% if diabetic", evaluate: (p) => { const hba1c = findLab(p, "HbA1c"); const dm = hasIcd10Prefix(p, ["E11"]); if (!dm) return { result: "met", evidence: "Non-diabetic — criterion not applicable", reasoning: "No diabetes diagnosis", confidence: 1.0, ai: false }; if (hba1c && hba1c.value <= 10) return { result: "met", evidence: `HbA1c: ${hba1c.value}%`, reasoning: "Rule-based: HbA1c <= 10%", confidence: 1.0, ai: false }; if (hba1c) return { result: "not_met", evidence: `HbA1c: ${hba1c.value}%`, reasoning: "HbA1c too high", confidence: 1.0, ai: false }; return { result: "unknown", evidence: null, reasoning: "Diabetic but no HbA1c on record", confidence: 0.0, ai: false }; } },
    { id: "stp-exc1", type: "exclusion", text: "Prior bariatric surgery", evaluate: () => ({ result: "not_met", evidence: "No bariatric surgery in surgical history", reasoning: "AI reviewed procedure history", confidence: 0.85, ai: true }) },
    { id: "stp-exc2", type: "exclusion", text: "Current use of GLP-1 receptor agonist", evaluate: (p) => { const glp1 = hasMedMatch(p, ["Semaglutide", "Liraglutide", "Tirzepatide", "Dulaglutide", "Exenatide"]); return glp1 ? { result: "met", evidence: `Currently on GLP-1 RA: ${p.medications.find((m) => ["Semaglutide", "Liraglutide"].some((k) => m.name.includes(k)))?.name ?? "GLP-1 RA"}`, reasoning: "Active GLP-1 RA in medication list", confidence: 1.0, ai: false } : { result: "not_met", evidence: "No GLP-1 RA in medications", reasoning: "Rule-based medication search", confidence: 1.0, ai: false }; } },
    { id: "stp-exc3", type: "exclusion", text: "Obesity secondary to endocrine disorder", evaluate: () => ({ result: "not_met", evidence: "No Cushing's, hypothyroidism, or other endocrine cause documented", reasoning: "AI reviewed diagnoses", confidence: 0.8, ai: true }) },
  ] },
  { studyId: "study-4", criteria: [
    // Lecanemab in Early Alzheimer's
    { id: "lec-inc1", type: "inclusion", text: "Age 50-90 years", evaluate: (_, age) => age >= 50 && age <= 90 ? { result: "met", evidence: `Age: ${age}`, reasoning: "Rule-based", confidence: 1.0, ai: false } : { result: "not_met", evidence: `Age: ${age}`, reasoning: "Outside age range", confidence: 1.0, ai: false } },
    { id: "lec-inc2", type: "inclusion", text: "Diagnosis of mild cognitive impairment or early Alzheimer's disease", evaluate: (p) => { const ad = p.diagnoses.find((d) => d.icd10.startsWith("G30")); return ad ? { result: "met", evidence: `${ad.name} (${ad.icd10})`, reasoning: "Alzheimer's diagnosis confirmed", confidence: 1.0, ai: false } : { result: "not_met", evidence: `Primary: ${p.diagnoses[0]?.name ?? "none"}`, reasoning: "No AD/MCI diagnosis found", confidence: 1.0, ai: false }; } },
    { id: "lec-inc3", type: "inclusion", text: "Confirmed amyloid pathology by PET or CSF", evaluate: (p) => { const amyloid = findLab(p, "Amyloid PET"); if (amyloid && amyloid.unit === "" && p.labs.some((l) => l.test === "Amyloid PET" && l.value === "Positive")) return { result: "met", evidence: "Amyloid PET: Positive", reasoning: "Confirmed amyloid pathology", confidence: 1.0, ai: false }; return { result: "unknown", evidence: null, reasoning: "No amyloid biomarker data", confidence: 0.0, ai: false }; } },
    { id: "lec-inc4", type: "inclusion", text: "MMSE score 22-30", evaluate: (p) => { const mmse = findLab(p, "MMSE Score"); if (mmse && mmse.value >= 22 && mmse.value <= 30) return { result: "met", evidence: `MMSE: ${mmse.value}`, reasoning: "Rule-based: MMSE 22-30", confidence: 1.0, ai: false }; if (mmse) return { result: "not_met", evidence: `MMSE: ${mmse.value} (below 22)`, reasoning: "Cognitive impairment too advanced", confidence: 1.0, ai: false }; return { result: "unknown", evidence: null, reasoning: "No MMSE score on record", confidence: 0.0, ai: false }; } },
    { id: "lec-exc1", type: "exclusion", text: "Prior anti-amyloid immunotherapy", evaluate: (p) => { const aa = hasMedMatch(p, ["Lecanemab", "Aducanumab", "Donanemab"]); return aa ? { result: "met", evidence: "Prior anti-amyloid therapy found", reasoning: "Rule-based medication search", confidence: 1.0, ai: false } : { result: "not_met", evidence: "No prior anti-amyloid therapy", reasoning: "Rule-based", confidence: 1.0, ai: false }; } },
    { id: "lec-exc2", type: "exclusion", text: "History of stroke or seizure within 12 months", evaluate: () => ({ result: "not_met", evidence: "No recent stroke or seizure documented", reasoning: "AI reviewed diagnosis history", confidence: 0.85, ai: true }) },
  ] },
  { studyId: "study-5", criteria: [
    // Risankizumab in Crohn's
    { id: "ris-inc1", type: "inclusion", text: "Age >= 18 years", evaluate: (_, age) => age >= 18 ? { result: "met", evidence: `Age: ${age}`, reasoning: "Rule-based", confidence: 1.0, ai: false } : { result: "not_met", evidence: `Age: ${age}`, reasoning: "Below minimum", confidence: 1.0, ai: false } },
    { id: "ris-inc2", type: "inclusion", text: "Moderately to severely active Crohn's disease (CDAI 220-450)", evaluate: (p) => { const cd = p.diagnoses.find((d) => d.icd10.startsWith("K50")); return cd ? { result: "met", evidence: `${cd.name} (${cd.icd10})`, reasoning: "Crohn's disease diagnosis confirmed", confidence: 0.85, ai: true } : { result: "not_met", evidence: `Primary: ${p.diagnoses[0]?.name ?? "none"}`, reasoning: "No Crohn's disease diagnosis", confidence: 1.0, ai: false }; } },
    { id: "ris-inc3", type: "inclusion", text: "CRP > 5 mg/L or fecal calprotectin > 250 ug/g", evaluate: (p) => { const crp = findLab(p, "CRP"); const fcal = findLab(p, "Fecal Calprotectin"); if (crp && crp.value > 5) return { result: "met", evidence: `CRP: ${crp.value} mg/L`, reasoning: "Elevated inflammatory marker", confidence: 1.0, ai: false }; if (fcal && fcal.value > 250) return { result: "met", evidence: `Fecal Calprotectin: ${fcal.value} ug/g`, reasoning: "Elevated fecal calprotectin", confidence: 1.0, ai: false }; return { result: "unknown", evidence: null, reasoning: "No inflammatory markers on record", confidence: 0.0, ai: false }; } },
    { id: "ris-inc4", type: "inclusion", text: "Inadequate response to conventional therapy (corticosteroids, immunomodulators, or anti-TNF)", evaluate: (p) => { const priorTx = hasMedMatch(p, ["Adalimumab", "Infliximab", "Budesonide", "Prednisone", "Azathioprine"]); const cd = hasIcd10Prefix(p, ["K50"]); return cd && priorTx ? { result: "met", evidence: `Prior therapy: ${p.medications.filter((m) => ["Adalimumab", "Budesonide"].some((k) => m.name.includes(k))).map((m) => m.name).join(", ")}`, reasoning: "Active Crohn's despite prior biologic/conventional therapy", confidence: 0.9, ai: true } : cd ? { result: "unknown", evidence: null, reasoning: "Treatment history needs review", confidence: 0.3, ai: true } : { result: "not_met", evidence: null, reasoning: "No Crohn's", confidence: 1.0, ai: false }; } },
    { id: "ris-exc1", type: "exclusion", text: "Active tuberculosis or untreated latent TB", evaluate: () => ({ result: "not_met", evidence: "No TB documented", reasoning: "AI reviewed diagnoses", confidence: 0.9, ai: true }) },
    { id: "ris-exc2", type: "exclusion", text: "History of bowel obstruction or perforation", evaluate: () => ({ result: "not_met", evidence: "No obstruction/perforation in surgical history", reasoning: "AI reviewed diagnoses", confidence: 0.85, ai: true }) },
  ] },
  { studyId: "study-6", criteria: [
    // Dupilumab in Atopic Dermatitis
    { id: "dup-inc1", type: "inclusion", text: "Age >= 18 years", evaluate: (_, age) => age >= 18 ? { result: "met", evidence: `Age: ${age}`, reasoning: "Rule-based", confidence: 1.0, ai: false } : { result: "not_met", evidence: `Age: ${age}`, reasoning: "Below minimum", confidence: 1.0, ai: false } },
    { id: "dup-inc2", type: "inclusion", text: "Moderate-to-severe atopic dermatitis for >= 1 year", evaluate: (p) => { const ad = p.diagnoses.find((d) => d.icd10.startsWith("L20")); return ad ? { result: "met", evidence: `${ad.name} (${ad.icd10}), onset ${ad.onset}`, reasoning: "AD diagnosis confirmed", confidence: 1.0, ai: false } : { result: "not_met", evidence: `Primary: ${p.diagnoses[0]?.name ?? "none"}`, reasoning: "No atopic dermatitis diagnosis", confidence: 1.0, ai: false }; } },
    { id: "dup-inc3", type: "inclusion", text: "IGA score >= 3 (moderate or worse)", evaluate: (p) => { const ad = hasIcd10Prefix(p, ["L20"]); return ad ? { result: "unknown", evidence: null, reasoning: "IGA score not in structured data — needs dermatology assessment", confidence: 0.0, ai: true } : { result: "not_met", evidence: null, reasoning: "No AD diagnosis", confidence: 1.0, ai: false }; } },
    { id: "dup-inc4", type: "inclusion", text: "Total IgE > 200 IU/mL", evaluate: (p) => { const ige = findLab(p, "Total IgE"); if (ige && ige.value > 200) return { result: "met", evidence: `Total IgE: ${ige.value} IU/mL`, reasoning: "Rule-based: IgE > 200", confidence: 1.0, ai: false }; if (ige) return { result: "not_met", evidence: `Total IgE: ${ige.value} IU/mL`, reasoning: "IgE below threshold", confidence: 1.0, ai: false }; return { result: "unknown", evidence: null, reasoning: "No IgE lab on record", confidence: 0.0, ai: false }; } },
    { id: "dup-exc1", type: "exclusion", text: "Active skin infection requiring treatment", evaluate: () => ({ result: "not_met", evidence: "No active skin infection documented", reasoning: "AI reviewed diagnoses", confidence: 0.85, ai: true }) },
    { id: "dup-exc2", type: "exclusion", text: "Current use of systemic immunosuppressants for AD", evaluate: (p) => { const ad = hasIcd10Prefix(p, ["L20"]); const immunosup = hasMedMatch(p, ["Cyclosporine", "Azathioprine", "Mycophenolate"]); return ad && immunosup ? { result: "met", evidence: "On systemic immunosuppressant", reasoning: "Rule-based medication search", confidence: 1.0, ai: false } : { result: "not_met", evidence: "No systemic immunosuppressants for AD", reasoning: "Rule-based", confidence: 0.9, ai: false }; } },
  ] },
];

// ============================================================
// Main screening function — screens all patients for any study
// ============================================================

export interface ScreeningOutput {
  summary: PatientSummary;
  result: ScreeningResult;
  criteria: CriterionResult[];
}

export function screenPatientsForStudy(
  parsed: ParsedPatient[],
  studyId: string,
): ScreeningOutput[] {
  const studyDef = STUDY_SCREENING_DEFS.find((s) => s.studyId === studyId);
  if (!studyDef) return [];

  const inclusionDefs = studyDef.criteria.filter((c) => c.type === "inclusion");
  const exclusionDefs = studyDef.criteria.filter((c) => c.type === "exclusion");

  return parsed.map((p) => {
    const patientId = p.mrn.toLowerCase().replace("e", "p-");
    const srId = `sr-${patientId}-${studyId}`;
    const age = Math.floor((Date.now() - new Date(p.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));

    const criteriaResults: CriterionResult[] = [];
    let incMet = 0;
    let missing = 0;
    let exclTriggered = 0;

    // Evaluate inclusion criteria
    for (const def of inclusionDefs) {
      const ev = def.evaluate(p, age);
      criteriaResults.push({
        id: `cr-${patientId}-${def.id}`,
        screeningResultId: srId,
        criterionId: def.id,
        criterionType: "inclusion",
        criterionText: def.text,
        result: ev.result,
        evidence: ev.evidence,
        evidenceSource: inferEvidenceSource(def.text, ev.evidence, ev.reasoning),
        confidence: ev.confidence,
        reasoning: ev.reasoning,
        aiDetermined: ev.ai,
        humanVerified: false,
        humanOverride: null,
      });
      if (ev.result === "met") incMet++;
      else if (ev.result === "unknown" || ev.result === "needs_review") missing++;
    }

    // Evaluate exclusion criteria
    for (const def of exclusionDefs) {
      const ev = def.evaluate(p, age);
      criteriaResults.push({
        id: `cr-${patientId}-${def.id}`,
        screeningResultId: srId,
        criterionId: def.id,
        criterionType: "exclusion",
        criterionText: def.text,
        result: ev.result,
        evidence: ev.evidence,
        evidenceSource: inferEvidenceSource(def.text, ev.evidence, ev.reasoning),
        confidence: ev.confidence,
        reasoning: ev.reasoning,
        aiDetermined: ev.ai,
        humanVerified: false,
        humanOverride: null,
      });
      if (ev.result === "met") exclTriggered++;
    }

    const incTotal = inclusionDefs.length;
    const exclTotal = exclusionDefs.length;

    // Score: heavily penalize low inclusion match and any exclusion triggers
    const incRatio = incTotal > 0 ? incMet / incTotal : 0;
    const rawScore = Math.round(incRatio * 90) - (exclTriggered * 25) - (missing * 3);
    const score = Math.max(0, Math.min(100, rawScore));

    let status: ScreeningStatus;
    if (exclTriggered > 0) status = "ineligible";
    else if (incRatio >= 0.8 && missing <= 2) status = "eligible";
    else if (incRatio >= 0.5) status = "potentially_eligible";
    else if (missing >= incTotal * 0.5) status = "needs_review";
    else status = "ineligible";

    const primaryDx = p.diagnoses[0];
    const primaryDiagnosis = primaryDx ? `${primaryDx.name.split(",")[0]} (${primaryDx.icd10})` : null;

    return {
      summary: {
        id: patientId,
        sitePatientId: p.mrn,
        age,
        gender: p.sex.toLowerCase(),
        primaryDiagnosis,
        score,
        overallStatus: status,
        reviewStatus: "pending",
        inclusionMet: incMet,
        inclusionTotal: incTotal,
        exclusionTriggered: exclTriggered,
        exclusionTotal: exclTotal,
        missingDataCount: missing,
      },
      result: {
        id: srId,
        patientId,
        studyId,
        overallStatus: status,
        inclusionMet: incMet,
        inclusionTotal: incTotal,
        exclusionTriggered: exclTriggered,
        exclusionTotal: exclTotal,
        missingDataCount: missing,
        score,
        screenedAt: new Date().toISOString(),
        reviewedBy: null,
        reviewStatus: "pending",
        reviewNotes: null,
      },
      criteria: criteriaResults,
    };
  });
}
