use serde::{Deserialize, Serialize};

/// Describes how source CSV columns map to target database fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnMapping {
    pub field_mappings: Vec<MappedField>,
}

/// A single column-to-field mapping with confidence score.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MappedField {
    /// The column header name from the source file
    pub source_column: String,
    /// The target field name in the database schema
    pub target_field: String,
    /// Confidence score from 0.0 to 1.0 for auto-mapped fields
    pub confidence: f64,
    /// Whether this mapping was auto-detected or user-specified
    pub auto_detected: bool,
}

/// Known target fields and their common aliases across EMR systems.
/// Covers Epic, Cerner, Athena, and generic CSV conventions.
const FIELD_ALIASES: &[(&str, &[&str])] = &[
    // Patient demographics
    ("site_patient_id", &[
        "patient id", "patient_id", "patientid", "pat_id", "mrn", "medical record number",
        "medical_record_number", "chart number", "chart_number", "chartno", "subject_id",
        "subject id", "subjectid", "patient number", "patient_number", "pat_mrn_id",
        // Epic
        "pat_id", "pat_enc_csn_id",
        // Cerner
        "person_id", "encntr_id",
        // Athena
        "patientid", "enterpriseid",
    ]),
    ("date_of_birth", &[
        "dob", "date of birth", "date_of_birth", "dateofbirth", "birth_date", "birth date",
        "birthdate", "birthday", "birth_dt",
        // Epic
        "birth_date",
        // Cerner
        "birth_dt_tm",
    ]),
    ("gender", &[
        "gender", "sex", "patient_sex", "patient_gender", "biological_sex",
        "sex_assigned_at_birth", "admin_sex",
        // Epic
        "sex_c", "patient_sex",
        // Cerner
        "sex_cd",
    ]),
    ("race", &[
        "race", "patient_race", "race_ethnicity",
        // Epic
        "patient_race_c",
        // Cerner
        "race_cd",
    ]),
    ("ethnicity", &[
        "ethnicity", "patient_ethnicity", "ethnic_group", "hispanic_latino",
        // Epic
        "ethnic_group_c",
    ]),
    ("insurance_type", &[
        "insurance", "insurance_type", "insurance type", "payer", "payer_name",
        "primary_insurance", "coverage_type", "plan_name", "benefit_plan",
    ]),

    // Diagnosis fields
    ("diagnosis_description", &[
        "diagnosis", "diagnosis_description", "dx_description", "dx_name",
        "condition", "problem", "problem_list", "problem_description",
        "diagnosis description", "clinical_diagnosis", "primary_diagnosis",
        "principal_diagnosis", "admitting_diagnosis",
    ]),
    ("icd10_code", &[
        "icd10", "icd10_code", "icd-10", "icd_10_code", "icd10_cm",
        "diagnosis_code", "dx_code", "icd_code", "problem_code",
        "icd10code", "icd", "diagnostic_code",
    ]),
    ("diagnosis_onset_date", &[
        "onset_date", "diagnosis_date", "dx_date", "problem_onset_date",
        "date_of_diagnosis", "condition_onset",
    ]),
    ("diagnosis_status", &[
        "diagnosis_status", "dx_status", "problem_status", "condition_status",
        "active_inactive",
    ]),

    // Medication fields
    ("drug_name", &[
        "medication", "drug_name", "drug", "medication_name", "med_name",
        "medication name", "rx_name", "prescription", "med", "generic_name",
        "brand_name", "ordered_medication",
    ]),
    ("rxnorm_code", &[
        "rxnorm", "rxnorm_code", "rxcui", "rx_code", "ndc", "ndc_code",
        "medication_code", "drug_code",
    ]),
    ("dose", &[
        "dose", "dosage", "dose_amount", "med_dose", "strength",
        "dose_strength", "medication_dose",
    ]),
    ("frequency", &[
        "frequency", "freq", "dosing_frequency", "med_frequency",
        "sig", "directions", "schedule",
    ]),
    ("medication_start_date", &[
        "med_start_date", "medication_start_date", "rx_start_date",
        "prescription_date", "order_date", "start_date",
    ]),
    ("medication_end_date", &[
        "med_end_date", "medication_end_date", "rx_end_date",
        "discontinue_date", "stop_date", "end_date",
    ]),
    ("medication_status", &[
        "med_status", "medication_status", "rx_status", "order_status",
    ]),

    // Lab result fields
    ("test_name", &[
        "test_name", "lab_test", "lab_name", "test", "lab test",
        "component_name", "result_name", "analyte", "lab_component",
        "procedure_name", "order_name",
    ]),
    ("loinc_code", &[
        "loinc", "loinc_code", "loinc_num", "lab_code", "test_code",
        "component_id", "order_code",
    ]),
    ("lab_value", &[
        "lab_value", "result_value", "value", "result", "numeric_value",
        "ord_value", "result_val", "observation_value",
    ]),
    ("lab_unit", &[
        "unit", "units", "lab_unit", "result_unit", "uom",
        "unit_of_measure", "reference_unit",
    ]),
    ("reference_range", &[
        "reference_range", "ref_range", "normal_range", "ref_low_high",
        "reference_low", "reference_high", "normal_low", "normal_high",
    ]),
    ("result_date", &[
        "result_date", "lab_date", "collection_date", "specimen_date",
        "observation_date", "test_date", "collected_date",
    ]),
    ("abnormal_flag", &[
        "abnormal_flag", "flag", "abnormal", "result_flag",
        "abnormal_yn", "critical_flag", "interpretation",
    ]),
];

/// Normalize a header string for comparison: lowercase, strip non-alphanumeric,
/// collapse whitespace/underscores.
fn normalize(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
}

/// Compute similarity between a normalized header and a normalized alias.
/// Returns a score between 0.0 and 1.0.
fn similarity(header: &str, alias: &str) -> f64 {
    let h = normalize(header);
    let a = normalize(alias);

    if h == a {
        return 1.0;
    }

    // Check if one contains the other
    if h.contains(&a) || a.contains(&h) {
        let longer = h.len().max(a.len()) as f64;
        let shorter = h.len().min(a.len()) as f64;
        return shorter / longer;
    }

    // Token overlap
    let h_tokens: Vec<&str> = h.split_whitespace().collect();
    let a_tokens: Vec<&str> = a.split_whitespace().collect();

    if h_tokens.is_empty() || a_tokens.is_empty() {
        return 0.0;
    }

    let matching = h_tokens
        .iter()
        .filter(|ht| a_tokens.iter().any(|at| *ht == at))
        .count();

    let total = h_tokens.len().max(a_tokens.len()) as f64;
    matching as f64 / total
}

/// Auto-map CSV column headers to target database fields.
/// Returns a ColumnMapping with confidence-scored suggestions.
pub fn auto_map_columns(headers: &[String]) -> ColumnMapping {
    let mut field_mappings = Vec::new();
    // Track which target fields have already been mapped to avoid duplicates
    let mut mapped_targets: Vec<(String, f64, usize)> = Vec::new(); // (target, confidence, header_idx)

    // For each header, find the best matching target field
    let mut candidates: Vec<(usize, String, f64)> = Vec::new(); // (header_idx, target_field, confidence)

    for (header_idx, header) in headers.iter().enumerate() {
        let mut best_target: Option<String> = None;
        let mut best_score: f64 = 0.0;

        for &(target_field, aliases) in FIELD_ALIASES {
            for &alias in aliases {
                let score = similarity(header, alias);
                if score > best_score && score >= 0.5 {
                    best_score = score;
                    best_target = Some(target_field.to_string());
                }
            }
        }

        if let Some(target) = best_target {
            candidates.push((header_idx, target, best_score));
        }
    }

    // Sort by confidence descending so higher-confidence mappings win
    candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    let mut used_targets: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut used_headers: std::collections::HashSet<usize> = std::collections::HashSet::new();

    for (header_idx, target, confidence) in candidates {
        if used_targets.contains(&target) || used_headers.contains(&header_idx) {
            continue;
        }
        used_targets.insert(target.clone());
        used_headers.insert(header_idx);
        field_mappings.push(MappedField {
            source_column: headers[header_idx].clone(),
            target_field: target,
            confidence,
            auto_detected: true,
        });
    }

    // Sort by target field for consistent output
    field_mappings.sort_by(|a, b| a.target_field.cmp(&b.target_field));

    ColumnMapping { field_mappings }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize() {
        assert_eq!(normalize("Patient ID"), "patient id");
        assert_eq!(normalize("patient_id"), "patient id");
        assert_eq!(normalize("  DOB  "), "dob");
        assert_eq!(normalize("ICD-10 Code"), "icd 10 code");
    }

    #[test]
    fn test_exact_match() {
        let score = similarity("patient_id", "patient_id");
        assert!((score - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_auto_map_common_headers() {
        let headers = vec![
            "Patient ID".to_string(),
            "DOB".to_string(),
            "Gender".to_string(),
            "ICD-10".to_string(),
            "Diagnosis".to_string(),
            "Medication".to_string(),
        ];

        let mapping = auto_map_columns(&headers);

        let find_target = |target: &str| -> Option<&MappedField> {
            mapping.field_mappings.iter().find(|m| m.target_field == target)
        };

        let pid = find_target("site_patient_id");
        assert!(pid.is_some(), "Should map Patient ID to site_patient_id");
        assert!(pid.unwrap().confidence >= 0.5);

        let dob = find_target("date_of_birth");
        assert!(dob.is_some(), "Should map DOB to date_of_birth");

        let gender = find_target("gender");
        assert!(gender.is_some(), "Should map Gender to gender");

        let icd = find_target("icd10_code");
        assert!(icd.is_some(), "Should map ICD-10 to icd10_code");
    }

    #[test]
    fn test_auto_map_epic_headers() {
        let headers = vec![
            "PAT_MRN_ID".to_string(),
            "BIRTH_DATE".to_string(),
            "SEX_C".to_string(),
        ];

        let mapping = auto_map_columns(&headers);

        let find_target = |target: &str| -> Option<&MappedField> {
            mapping.field_mappings.iter().find(|m| m.target_field == target)
        };

        assert!(find_target("site_patient_id").is_some(), "Should map PAT_MRN_ID");
        assert!(find_target("date_of_birth").is_some(), "Should map BIRTH_DATE");
        assert!(find_target("gender").is_some(), "Should map SEX_C");
    }

    #[test]
    fn test_no_duplicate_target_mappings() {
        let headers = vec![
            "Patient ID".to_string(),
            "MRN".to_string(), // Both should want to map to site_patient_id
            "Gender".to_string(),
        ];

        let mapping = auto_map_columns(&headers);

        let patient_id_count = mapping
            .field_mappings
            .iter()
            .filter(|m| m.target_field == "site_patient_id")
            .count();

        assert_eq!(patient_id_count, 1, "Should only map one column to site_patient_id");
    }
}
