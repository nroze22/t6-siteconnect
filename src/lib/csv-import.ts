// ============================================================
// Browser-side CSV import: maps arbitrary CSV data to patient
// records using the user's column mappings.
// Used when running in web mode (non-Tauri) with real CSVs.
// ============================================================

import type { ColumnMapping } from "@/types";
import type { ParsedPatient } from "./epic-demo-data";

// ---------------------------------------------------------------------------
// Auto-mapping: match CSV headers to target fields
// ---------------------------------------------------------------------------

const HEADER_ALIASES: Record<string, { target: string; confidence: number }[]> = {
  // Patient ID
  patient_id: [{ target: "patient_id", confidence: 0.99 }],
  pat_id: [{ target: "patient_id", confidence: 0.97 }],
  pat_mrn_id: [{ target: "patient_id", confidence: 0.99 }],
  mrn: [{ target: "patient_id", confidence: 0.98 }],
  medical_record_number: [{ target: "patient_id", confidence: 0.98 }],
  subject_id: [{ target: "patient_id", confidence: 0.96 }],
  id: [{ target: "patient_id", confidence: 0.70 }],
  patient_number: [{ target: "patient_id", confidence: 0.95 }],

  // Date of birth
  date_of_birth: [{ target: "date_of_birth", confidence: 0.99 }],
  dob: [{ target: "date_of_birth", confidence: 0.98 }],
  birth_date: [{ target: "date_of_birth", confidence: 0.98 }],
  birthdate: [{ target: "date_of_birth", confidence: 0.97 }],
  pat_dob: [{ target: "date_of_birth", confidence: 0.97 }],

  // Gender/Sex
  sex: [{ target: "gender", confidence: 0.96 }],
  gender: [{ target: "gender", confidence: 0.99 }],
  patient_sex: [{ target: "gender", confidence: 0.96 }],

  // Race
  race: [{ target: "race", confidence: 0.99 }],
  patient_race: [{ target: "race", confidence: 0.97 }],

  // Ethnicity
  ethnicity: [{ target: "ethnicity", confidence: 0.99 }],
  ethnic_group: [{ target: "ethnicity", confidence: 0.94 }],

  // Names
  first_name: [{ target: "first_name", confidence: 0.95 }],
  pat_first_name: [{ target: "first_name", confidence: 0.95 }],
  last_name: [{ target: "last_name", confidence: 0.95 }],
  pat_last_name: [{ target: "last_name", confidence: 0.95 }],

  // Diagnosis
  icd10: [{ target: "diagnosis_icd10", confidence: 0.98 }],
  icd_10: [{ target: "diagnosis_icd10", confidence: 0.98 }],
  icd10_code: [{ target: "diagnosis_icd10", confidence: 0.98 }],
  current_icd10_list: [{ target: "diagnosis_icd10", confidence: 0.99 }],
  diagnosis_code: [{ target: "diagnosis_icd10", confidence: 0.95 }],
  dx_code: [{ target: "diagnosis_icd10", confidence: 0.95 }],
  dx_name: [{ target: "diagnosis_desc", confidence: 0.95 }],
  diagnosis: [{ target: "diagnosis_desc", confidence: 0.90 }],
  diagnosis_name: [{ target: "diagnosis_desc", confidence: 0.95 }],
  diagnosis_description: [{ target: "diagnosis_desc", confidence: 0.95 }],
  condition: [{ target: "diagnosis_desc", confidence: 0.85 }],
  problem: [{ target: "diagnosis_desc", confidence: 0.80 }],
  onset_date: [{ target: "diagnosis_date", confidence: 0.88 }],
  diagnosis_date: [{ target: "diagnosis_date", confidence: 0.95 }],

  // Medications
  medication: [{ target: "medication_name", confidence: 0.95 }],
  medication_name: [{ target: "medication_name", confidence: 0.97 }],
  drug_name: [{ target: "medication_name", confidence: 0.95 }],
  med_name: [{ target: "medication_name", confidence: 0.95 }],
  drug: [{ target: "medication_name", confidence: 0.85 }],
  med_dose: [{ target: "medication_dose", confidence: 0.93 }],
  dose: [{ target: "medication_dose", confidence: 0.85 }],
  dosage: [{ target: "medication_dose", confidence: 0.85 }],

  // Labs
  lab_test: [{ target: "lab_test", confidence: 0.95 }],
  test_name: [{ target: "lab_test", confidence: 0.93 }],
  proc_name: [{ target: "lab_test", confidence: 0.91 }],
  result_value: [{ target: "lab_value", confidence: 0.96 }],
  lab_value: [{ target: "lab_value", confidence: 0.96 }],
  value: [{ target: "lab_value", confidence: 0.70 }],
  result_unit: [{ target: "lab_unit", confidence: 0.95 }],
  lab_unit: [{ target: "lab_unit", confidence: 0.95 }],
  unit: [{ target: "lab_unit", confidence: 0.70 }],
  result_date: [{ target: "lab_date", confidence: 0.92 }],
  lab_date: [{ target: "lab_date", confidence: 0.95 }],
  ref_range: [{ target: "lab_ref_range", confidence: 0.89 }],
  reference_range: [{ target: "lab_ref_range", confidence: 0.92 }],

  // Vitals
  bp_systolic: [{ target: "vital_value", confidence: 0.72 }],
  systolic: [{ target: "vital_value", confidence: 0.70 }],
  weight: [{ target: "weight", confidence: 0.85 }],
  weight_kg: [{ target: "weight", confidence: 0.90 }],
  height: [{ target: "height", confidence: 0.85 }],
  height_cm: [{ target: "height", confidence: 0.90 }],
  bmi: [{ target: "bmi", confidence: 0.95 }],
};

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function generateAutoMappings(headers: string[]): ColumnMapping[] {
  const usedTargets = new Set<string>();

  return headers.map((header) => {
    const normalized = normalizeHeader(header);
    const candidates = HEADER_ALIASES[normalized];

    if (candidates) {
      for (const candidate of candidates) {
        if (!usedTargets.has(candidate.target)) {
          usedTargets.add(candidate.target);
          return {
            sourceColumn: header,
            targetField: candidate.target,
            confidence: candidate.confidence,
          };
        }
      }
    }

    return {
      sourceColumn: header,
      targetField: "",
      confidence: 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Parse CSV rows into ParsedPatient[] using column mappings
// ---------------------------------------------------------------------------

function getCol(row: string[], headers: string[], mappings: ColumnMapping[], target: string): string {
  const mapping = mappings.find((m) => m.targetField === target);
  if (!mapping) return "";
  const idx = headers.indexOf(mapping.sourceColumn);
  return idx >= 0 ? (row[idx] ?? "") : "";
}

export function parseCsvWithMappings(
  headers: string[],
  rows: string[][],
  mappings: ColumnMapping[],
): ParsedPatient[] {
  const patientMap = new Map<string, ParsedPatient>();

  // Find the patient ID column index
  const patientIdMapping = mappings.find((m) => m.targetField === "patient_id");
  const patientIdIdx = patientIdMapping ? headers.indexOf(patientIdMapping.sourceColumn) : -1;

  // If no patient ID mapped, use row index as ID
  let rowCounter = 0;

  for (const row of rows) {
    const rawId = patientIdIdx >= 0 ? (row[patientIdIdx] ?? "") : "";
    const id = rawId || `ROW-${++rowCounter}`;

    let patient = patientMap.get(id);

    if (!patient) {
      patient = {
        mrn: id,
        lastName: getCol(row, headers, mappings, "last_name"),
        firstName: getCol(row, headers, mappings, "first_name"),
        dob: getCol(row, headers, mappings, "date_of_birth"),
        sex: getCol(row, headers, mappings, "gender"),
        race: getCol(row, headers, mappings, "race"),
        ethnicity: getCol(row, headers, mappings, "ethnicity"),
        insurance: "",
        diagnoses: [],
        medications: [],
        labs: [],
        vitals: { systolic: 0, diastolic: 0, pulse: 0, weight: 0, height: 0, bmi: 0 },
        lastEncounter: "",
        department: "",
        provider: "",
      };
      patientMap.set(id, patient);
    }

    // Diagnosis
    const icd10 = getCol(row, headers, mappings, "diagnosis_icd10");
    const dxDesc = getCol(row, headers, mappings, "diagnosis_desc");
    if ((icd10 || dxDesc) && !patient.diagnoses.some((d) => d.icd10 === icd10 && d.name === dxDesc)) {
      patient.diagnoses.push({
        icd10: icd10,
        name: dxDesc,
        onset: getCol(row, headers, mappings, "diagnosis_date"),
      });
    }

    // Medication
    const medName = getCol(row, headers, mappings, "medication_name");
    if (medName && !patient.medications.some((m) => m.name === medName)) {
      patient.medications.push({
        name: medName,
        dose: getCol(row, headers, mappings, "medication_dose"),
        route: "",
        status: "Active",
      });
    }

    // Labs
    const labTest = getCol(row, headers, mappings, "lab_test");
    const labDate = getCol(row, headers, mappings, "lab_date");
    if (labTest && !patient.labs.some((l) => l.test === labTest && l.date === labDate)) {
      patient.labs.push({
        test: labTest,
        value: getCol(row, headers, mappings, "lab_value"),
        unit: getCol(row, headers, mappings, "lab_unit"),
        date: labDate,
        ref: getCol(row, headers, mappings, "lab_ref_range"),
        abnormal: false,
      });
    }

    // Vitals
    const weightStr = getCol(row, headers, mappings, "weight");
    const heightStr = getCol(row, headers, mappings, "height");
    const bmiStr = getCol(row, headers, mappings, "bmi");
    if (weightStr) patient.vitals.weight = parseFloat(weightStr) || 0;
    if (heightStr) patient.vitals.height = parseFloat(heightStr) || 0;
    if (bmiStr) patient.vitals.bmi = parseFloat(bmiStr) || 0;
  }

  return Array.from(patientMap.values());
}

// ---------------------------------------------------------------------------
// Generate sample data for column mapper preview
// ---------------------------------------------------------------------------

export function generateSampleData(
  headers: string[],
  rows: string[][],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    const header = headers[colIdx]!;
    const values: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const val = row[colIdx];
      if (val && !seen.has(val)) {
        seen.add(val);
        values.push(val);
      }
      if (values.length >= 4) break;
    }
    result[header] = values;
  }
  return result;
}
