use rusqlite::Connection;
use serde::Serialize;

/// Result of auto-populating NAACCR fields from patient data.
#[derive(Debug, Serialize)]
pub struct AutoPopulateResult {
    pub case_id: String,
    pub fields_populated: u32,
    pub fields_total: u32,
    pub completeness_score: f64,
    pub populated_fields: Vec<PopulatedField>,
}

#[derive(Debug, Serialize)]
pub struct PopulatedField {
    pub field_name: String,
    pub value: String,
    pub source: String, // "demographics" | "diagnosis" | "treatment" | "crosswalk"
}

/// Auto-populate NAACCR fields for a reportable case from existing patient data.
pub fn autopopulate_case(conn: &Connection, case_id: &str) -> Result<AutoPopulateResult, String> {
    // Load the case and patient
    let (patient_id, triggering_dx_id): (String, Option<String>) = conn.query_row(
        "SELECT patient_id, triggering_diagnosis_id FROM reportable_cases WHERE id = ?1",
        [case_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| format!("Case not found: {}", e))?;

    let mut fields = Vec::new();

    // Demographics from patients table
    let (dob, gender, race, ethnicity): (Option<String>, Option<String>, Option<String>, Option<String>) = conn.query_row(
        "SELECT date_of_birth, gender, race, ethnicity FROM patients WHERE id = ?1",
        [&patient_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).map_err(|e| format!("Patient not found: {}", e))?;

    if let Some(ref v) = dob {
        fields.push(PopulatedField { field_name: "dateOfBirth".into(), value: v.clone(), source: "demographics".into() });
    }
    if let Some(ref v) = gender {
        fields.push(PopulatedField { field_name: "sex".into(), value: map_gender_to_naaccr(v), source: "demographics".into() });
    }
    if let Some(ref v) = race {
        fields.push(PopulatedField { field_name: "race1".into(), value: v.clone(), source: "demographics".into() });
    }
    if let Some(ref v) = ethnicity {
        fields.push(PopulatedField { field_name: "spanishHispanicOrigin".into(), value: v.clone(), source: "demographics".into() });
    }

    // Diagnosis data
    if let Some(ref dx_id) = triggering_dx_id {
        let (icd10, desc, onset): (Option<String>, String, Option<String>) = conn.query_row(
            "SELECT icd10_code, description, onset_date FROM diagnoses WHERE id = ?1",
            [dx_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap_or((None, String::new(), None));

        if let Some(ref code) = icd10 {
            fields.push(PopulatedField { field_name: "primarySiteIcd10".into(), value: code.clone(), source: "diagnosis".into() });
        }
        if let Some(ref dt) = onset {
            fields.push(PopulatedField { field_name: "dateOfDiagnosis".into(), value: dt.clone(), source: "diagnosis".into() });
        }
        if !desc.is_empty() {
            fields.push(PopulatedField { field_name: "textDiagnosis".into(), value: desc, source: "diagnosis".into() });
        }
    }

    // Treatment flags from medications
    let has_chemo: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM medications WHERE patient_id = ?1 AND status = 'active' AND (
            LOWER(drug_name) LIKE '%carboplatin%' OR LOWER(drug_name) LIKE '%cisplatin%' OR
            LOWER(drug_name) LIKE '%doxorubicin%' OR LOWER(drug_name) LIKE '%paclitaxel%' OR
            LOWER(drug_name) LIKE '%gemcitabine%' OR LOWER(drug_name) LIKE '%docetaxel%' OR
            LOWER(drug_name) LIKE '%cyclophosphamide%' OR LOWER(drug_name) LIKE '%methotrexate%' OR
            LOWER(drug_name) LIKE '%5-fu%' OR LOWER(drug_name) LIKE '%fluorouracil%'
        )",
        [&patient_id],
        |row| row.get(0),
    ).unwrap_or(false);

    if has_chemo {
        fields.push(PopulatedField { field_name: "treatmentChemo".into(), value: "01".into(), source: "treatment".into() });
    }

    let has_immuno: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM medications WHERE patient_id = ?1 AND status = 'active' AND (
            LOWER(drug_name) LIKE '%pembrolizumab%' OR LOWER(drug_name) LIKE '%nivolumab%' OR
            LOWER(drug_name) LIKE '%atezolizumab%' OR LOWER(drug_name) LIKE '%durvalumab%' OR
            LOWER(drug_name) LIKE '%ipilimumab%'
        )",
        [&patient_id],
        |row| row.get(0),
    ).unwrap_or(false);

    if has_immuno {
        fields.push(PopulatedField { field_name: "treatmentImmuno".into(), value: "01".into(), source: "treatment".into() });
    }

    let has_hormone: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM medications WHERE patient_id = ?1 AND status = 'active' AND (
            LOWER(drug_name) LIKE '%tamoxifen%' OR LOWER(drug_name) LIKE '%letrozole%' OR
            LOWER(drug_name) LIKE '%anastrozole%' OR LOWER(drug_name) LIKE '%exemestane%' OR
            LOWER(drug_name) LIKE '%lupron%' OR LOWER(drug_name) LIKE '%leuprolide%'
        )",
        [&patient_id],
        |row| row.get(0),
    ).unwrap_or(false);

    if has_hormone {
        fields.push(PopulatedField { field_name: "treatmentHormone".into(), value: "01".into(), source: "treatment".into() });
    }

    // Surgery from procedures
    let has_surgery: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM procedures WHERE patient_id = ?1 AND (
            LOWER(description) LIKE '%resection%' OR LOWER(description) LIKE '%excision%' OR
            LOWER(description) LIKE '%lobectomy%' OR LOWER(description) LIKE '%mastectomy%' OR
            LOWER(description) LIKE '%colectomy%' OR LOWER(description) LIKE '%nephrectomy%' OR
            LOWER(description) LIKE '%prostatectomy%'
        )",
        [&patient_id],
        |row| row.get(0),
    ).unwrap_or(false);

    if has_surgery {
        fields.push(PopulatedField { field_name: "treatmentSurgery".into(), value: "01".into(), source: "treatment".into() });
    }

    // Update the case with auto-populated fields
    let fields_count = fields.len() as u32;
    let total_key_fields = 15u32; // approximate NAACCR key fields we track
    let completeness = fields_count as f64 / total_key_fields as f64;

    // Apply to reportable_cases row
    if has_chemo {
        let _ = conn.execute("UPDATE reportable_cases SET treatment_chemo = '01' WHERE id = ?1", [case_id]);
    }
    if has_immuno {
        let _ = conn.execute("UPDATE reportable_cases SET treatment_immuno = '01' WHERE id = ?1", [case_id]);
    }
    if has_hormone {
        let _ = conn.execute("UPDATE reportable_cases SET treatment_hormone = '01' WHERE id = ?1", [case_id]);
    }
    if has_surgery {
        let _ = conn.execute("UPDATE reportable_cases SET treatment_surgery = '01' WHERE id = ?1", [case_id]);
    }

    // Update completeness score
    let _ = conn.execute(
        "UPDATE reportable_cases SET completeness_score = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![completeness, case_id],
    );

    Ok(AutoPopulateResult {
        case_id: case_id.to_string(),
        fields_populated: fields_count,
        fields_total: total_key_fields,
        completeness_score: completeness,
        populated_fields: fields,
    })
}

fn map_gender_to_naaccr(gender: &str) -> String {
    match gender.to_lowercase().as_str() {
        "male" => "1".to_string(),
        "female" => "2".to_string(),
        "other" => "9".to_string(),
        _ => "9".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db_with_patient_and_case() -> (Connection, String) {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::init_test_db(&conn);

        // Patient with demographics
        conn.execute(
            "INSERT INTO patients (id, site_patient_id, date_of_birth, gender, race, ethnicity, imported_at, last_updated)
             VALUES ('p-auto', 'MRN-AUTO', '1958-05-10', 'female', 'White', 'Not Hispanic', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();

        // Diagnosis
        conn.execute(
            "INSERT INTO diagnoses (id, patient_id, icd10_code, description, onset_date, status, source, confidence)
             VALUES ('dx-auto', 'p-auto', 'C34.1', 'NSCLC right upper lobe', '2025-11-15', 'active', 'structured', 1.0)",
            [],
        ).unwrap();

        // Chemo medication
        conn.execute(
            "INSERT INTO medications (id, patient_id, drug_name, dose, status, source, confidence)
             VALUES ('med-chemo', 'p-auto', 'Carboplatin 450mg', '450mg', 'active', 'structured', 1.0)",
            [],
        ).unwrap();

        // Immunotherapy medication
        conn.execute(
            "INSERT INTO medications (id, patient_id, drug_name, dose, status, source, confidence)
             VALUES ('med-immuno', 'p-auto', 'Pembrolizumab 200mg', '200mg', 'active', 'structured', 1.0)",
            [],
        ).unwrap();

        // Surgery procedure
        conn.execute(
            "INSERT INTO procedures (id, patient_id, description, procedure_date, status)
             VALUES ('proc-surg', 'p-auto', 'Right upper lobectomy', '2025-12-01', 'completed')",
            [],
        ).unwrap();

        // Reportable case
        let case_id = "case-auto-1";
        conn.execute(
            "INSERT INTO reportable_cases (id, patient_id, detected_at, triggering_diagnosis_id, abstract_status)
             VALUES (?1, 'p-auto', '2026-03-01', 'dx-auto', 'draft')",
            [case_id],
        ).unwrap();

        (conn, case_id.to_string())
    }

    #[test]
    fn test_autopopulate_demographics() {
        let (conn, case_id) = setup_db_with_patient_and_case();
        let result = autopopulate_case(&conn, &case_id).unwrap();

        assert!(result.fields_populated > 0);
        assert!(result.completeness_score > 0.0);

        let field_names: Vec<&str> = result.populated_fields.iter().map(|f| f.field_name.as_str()).collect();
        assert!(field_names.contains(&"dateOfBirth"), "Should populate DOB");
        assert!(field_names.contains(&"sex"), "Should populate sex");
        assert!(field_names.contains(&"race1"), "Should populate race");

        // Check gender mapping
        let sex_field = result.populated_fields.iter().find(|f| f.field_name == "sex").unwrap();
        assert_eq!(sex_field.value, "2", "Female should map to NAACCR code 2");
    }

    #[test]
    fn test_autopopulate_treatments() {
        let (conn, case_id) = setup_db_with_patient_and_case();
        let result = autopopulate_case(&conn, &case_id).unwrap();

        let field_names: Vec<&str> = result.populated_fields.iter().map(|f| f.field_name.as_str()).collect();
        assert!(field_names.contains(&"treatmentChemo"), "Should detect carboplatin as chemo");
        assert!(field_names.contains(&"treatmentImmuno"), "Should detect pembrolizumab as immuno");
        assert!(field_names.contains(&"treatmentSurgery"), "Should detect lobectomy as surgery");

        // Verify the DB was updated
        let tx_chemo: String = conn.query_row(
            "SELECT treatment_chemo FROM reportable_cases WHERE id = ?1",
            [&case_id], |row| row.get(0),
        ).unwrap();
        assert_eq!(tx_chemo, "01");
    }

    #[test]
    fn test_autopopulate_diagnosis_fields() {
        let (conn, case_id) = setup_db_with_patient_and_case();
        let result = autopopulate_case(&conn, &case_id).unwrap();

        let field_names: Vec<&str> = result.populated_fields.iter().map(|f| f.field_name.as_str()).collect();
        assert!(field_names.contains(&"primarySiteIcd10"), "Should populate ICD-10 code");
        assert!(field_names.contains(&"dateOfDiagnosis"), "Should populate diagnosis date");
        assert!(field_names.contains(&"textDiagnosis"), "Should populate diagnosis description");

        let dx_date = result.populated_fields.iter().find(|f| f.field_name == "dateOfDiagnosis").unwrap();
        assert_eq!(dx_date.value, "2025-11-15");
    }

    #[test]
    fn test_autopopulate_no_treatment_patient() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::init_test_db(&conn);

        conn.execute(
            "INSERT INTO patients (id, site_patient_id, date_of_birth, gender, imported_at, last_updated)
             VALUES ('p-none', 'MRN-NONE', '1970-01-01', 'male', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO reportable_cases (id, patient_id, detected_at, abstract_status)
             VALUES ('case-none', 'p-none', '2026-03-01', 'draft')",
            [],
        ).unwrap();

        let result = autopopulate_case(&conn, "case-none").unwrap();
        let field_names: Vec<&str> = result.populated_fields.iter().map(|f| f.field_name.as_str()).collect();

        // Should still get demographics
        assert!(field_names.contains(&"dateOfBirth"));
        assert!(field_names.contains(&"sex"));

        // Should NOT have treatment fields
        assert!(!field_names.contains(&"treatmentChemo"));
        assert!(!field_names.contains(&"treatmentImmuno"));
        assert!(!field_names.contains(&"treatmentSurgery"));
    }
}
