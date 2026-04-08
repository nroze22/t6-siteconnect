use rusqlite::Connection;
use serde::Serialize;

/// A validation error found in a reportable case.
#[derive(Debug, Serialize)]
pub struct ValidationError {
    pub rule_code: String,
    pub rule_name: String,
    pub level: String,  // "error" | "warning" | "info"
    pub message: String,
    pub fields: Vec<String>,
}

/// Validate a reportable case against inter-field rules.
/// Returns a list of validation errors/warnings.
pub fn validate_case(conn: &Connection, case_id: &str) -> Result<Vec<ValidationError>, String> {
    let case = conn.query_row(
        "SELECT primary_site_icdo3, histology_icdo3, behavior_code, grade, date_of_diagnosis,
                clinical_stage_group, pathologic_stage_group, treatment_surgery, treatment_radiation,
                treatment_chemo, treatment_hormone, treatment_immuno, date_first_treatment, vital_status,
                laterality, diagnostic_confirmation
         FROM reportable_cases WHERE id = ?1",
        [case_id],
        |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, Option<String>>(12)?,
                row.get::<_, String>(13)?,
                row.get::<_, Option<String>>(14)?,
                row.get::<_, Option<String>>(15)?,
            ))
        },
    ).map_err(|e| format!("Case not found: {}", e))?;

    let (primary_site, histology, behavior, grade, dx_date,
         clin_stage, path_stage, tx_surgery, tx_radiation,
         tx_chemo, tx_hormone, tx_immuno, tx_date, vital_status,
         laterality, dx_confirm) = case;

    let mut errors = Vec::new();

    // Required field checks
    if primary_site.is_none() {
        errors.push(ValidationError {
            rule_code: "REQ001".into(), rule_name: "Primary Site Required".into(),
            level: "error".into(), message: "Primary site (ICD-O-3 topography) is required".into(),
            fields: vec!["primary_site_icdo3".into()],
        });
    }

    if histology.is_none() {
        errors.push(ValidationError {
            rule_code: "REQ002".into(), rule_name: "Histology Required".into(),
            level: "error".into(), message: "Histology (ICD-O-3 morphology) is required".into(),
            fields: vec!["histology_icdo3".into()],
        });
    }

    if behavior.is_none() {
        errors.push(ValidationError {
            rule_code: "REQ003".into(), rule_name: "Behavior Code Required".into(),
            level: "error".into(), message: "Behavior code (/0, /1, /2, /3) is required".into(),
            fields: vec!["behavior_code".into()],
        });
    }

    if dx_date.is_none() {
        errors.push(ValidationError {
            rule_code: "REQ004".into(), rule_name: "Diagnosis Date Required".into(),
            level: "error".into(), message: "Date of diagnosis is required".into(),
            fields: vec!["date_of_diagnosis".into()],
        });
    }

    if dx_confirm.is_none() {
        errors.push(ValidationError {
            rule_code: "REQ005".into(), rule_name: "Diagnostic Confirmation Required".into(),
            level: "warning".into(), message: "Diagnostic confirmation method should be documented".into(),
            fields: vec!["diagnostic_confirmation".into()],
        });
    }

    // Inter-field validation
    if let Some(ref beh) = behavior {
        if beh == "/2" || beh == "2" {
            // In situ — stage should be 0 or 0is
            if let Some(ref stage) = clin_stage {
                if stage != "0" && stage != "0is" && !stage.is_empty() {
                    errors.push(ValidationError {
                        rule_code: "IF001".into(), rule_name: "In Situ Stage Check".into(),
                        level: "warning".into(),
                        message: format!("Behavior is in situ (/2) but clinical stage is '{}' — expected '0' or '0is'", stage),
                        fields: vec!["behavior_code".into(), "clinical_stage_group".into()],
                    });
                }
            }
        }
    }

    // Treatment date vs diagnosis date
    if let (Some(ref dx_dt), Some(ref tx_dt)) = (&dx_date, &tx_date) {
        if tx_dt < dx_dt {
            errors.push(ValidationError {
                rule_code: "IF002".into(), rule_name: "Treatment Before Diagnosis".into(),
                level: "error".into(),
                message: "Date of first treatment is before date of diagnosis".into(),
                fields: vec!["date_of_diagnosis".into(), "date_first_treatment".into()],
            });
        }
    }

    // No treatment recorded warning
    if tx_surgery == "00" && tx_radiation == "00" && tx_chemo == "00"
        && tx_hormone == "00" && tx_immuno == "00"
    {
        errors.push(ValidationError {
            rule_code: "IF003".into(), rule_name: "No Treatment Recorded".into(),
            level: "warning".into(),
            message: "No first-course treatment is recorded. Verify if treatment has not yet started.".into(),
            fields: vec!["treatment_surgery".into(), "treatment_chemo".into()],
        });
    }

    // Paired organ laterality
    if let Some(ref site) = primary_site {
        let is_paired = matches!(
            site.get(..3).unwrap_or(""),
            "C34" | "C50" | "C62" | "C64" | "C69" | "C74" | "C07" | "C09"
        );
        if is_paired && laterality.is_none() {
            errors.push(ValidationError {
                rule_code: "IF004".into(), rule_name: "Laterality Required for Paired Organ".into(),
                level: "warning".into(),
                message: format!("Primary site {} is a paired organ — laterality should be specified", site),
                fields: vec!["laterality".into(), "primary_site_icdo3".into()],
            });
        }
    }

    // Staging completeness
    if clin_stage.is_none() && path_stage.is_none() {
        errors.push(ValidationError {
            rule_code: "IF005".into(), rule_name: "No Staging Recorded".into(),
            level: "warning".into(),
            message: "Neither clinical nor pathologic stage group is recorded".into(),
            fields: vec!["clinical_stage_group".into(), "pathologic_stage_group".into()],
        });
    }

    // Grade check
    if grade.is_none() {
        errors.push(ValidationError {
            rule_code: "IF006".into(), rule_name: "Grade Not Recorded".into(),
            level: "info".into(),
            message: "Histologic grade is not recorded — will default to 9 (unknown)".into(),
            fields: vec!["grade".into()],
        });
    }

    // Update validation errors on the case
    let errors_json = serde_json::to_string(&errors).unwrap_or_default();
    let _ = conn.execute(
        "UPDATE reportable_cases SET validation_errors = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![errors_json, case_id],
    );

    Ok(errors)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db_with_case() -> (Connection, String) {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::init_test_db(&conn);

        // Insert patient
        conn.execute(
            "INSERT INTO patients (id, site_patient_id, date_of_birth, gender, imported_at, last_updated)
             VALUES ('p-val', 'MRN-VAL', '1960-01-01', 'female', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();

        // Insert a reportable case with minimal fields
        let case_id = "case-val-1";
        conn.execute(
            "INSERT INTO reportable_cases (id, patient_id, detected_at, abstract_status)
             VALUES (?1, 'p-val', '2026-03-01', 'draft')",
            [case_id],
        ).unwrap();

        (conn, case_id.to_string())
    }

    #[test]
    fn test_validate_empty_case_has_required_errors() {
        let (conn, case_id) = setup_db_with_case();
        let errors = validate_case(&conn, &case_id).unwrap();

        // Should have errors for missing required fields
        let error_codes: Vec<&str> = errors.iter().map(|e| e.rule_code.as_str()).collect();
        assert!(error_codes.contains(&"REQ001"), "Missing primary site error");
        assert!(error_codes.contains(&"REQ002"), "Missing histology error");
        assert!(error_codes.contains(&"REQ003"), "Missing behavior error");
        assert!(error_codes.contains(&"REQ004"), "Missing dx date error");
        assert!(error_codes.contains(&"IF003"), "No treatment recorded warning");
        assert!(error_codes.contains(&"IF005"), "No staging recorded warning");
    }

    #[test]
    fn test_validate_complete_case_fewer_errors() {
        let (conn, case_id) = setup_db_with_case();

        // Fill in required fields
        conn.execute(
            "UPDATE reportable_cases SET
                primary_site_icdo3 = 'C34.1',
                histology_icdo3 = '8140/3',
                behavior_code = '/3',
                grade = '2',
                date_of_diagnosis = '2025-11-15',
                diagnostic_confirmation = '1',
                clinical_stage_group = 'IIA',
                treatment_chemo = '01'
             WHERE id = ?1",
            [&case_id],
        ).unwrap();

        let errors = validate_case(&conn, &case_id).unwrap();
        let error_codes: Vec<&str> = errors.iter().map(|e| e.rule_code.as_str()).collect();

        // Should NOT have required field errors
        assert!(!error_codes.contains(&"REQ001"));
        assert!(!error_codes.contains(&"REQ002"));
        assert!(!error_codes.contains(&"REQ003"));
        assert!(!error_codes.contains(&"REQ004"));
        assert!(!error_codes.contains(&"IF003")); // chemo = 01
        assert!(!error_codes.contains(&"IF005")); // stage present

        // Should have laterality warning (C34 is paired organ)
        assert!(error_codes.contains(&"IF004"), "Expected laterality warning for C34");
    }

    #[test]
    fn test_validate_in_situ_stage_mismatch() {
        let (conn, case_id) = setup_db_with_case();

        conn.execute(
            "UPDATE reportable_cases SET
                primary_site_icdo3 = 'C50.9',
                histology_icdo3 = '8500/2',
                behavior_code = '/2',
                date_of_diagnosis = '2025-06-01',
                clinical_stage_group = 'IIA',
                treatment_surgery = '01',
                laterality = '1'
             WHERE id = ?1",
            [&case_id],
        ).unwrap();

        let errors = validate_case(&conn, &case_id).unwrap();
        let error_codes: Vec<&str> = errors.iter().map(|e| e.rule_code.as_str()).collect();

        // In situ (/2) with stage IIA should trigger IF001
        assert!(error_codes.contains(&"IF001"), "Expected in situ stage mismatch");
    }

    #[test]
    fn test_validate_treatment_before_diagnosis() {
        let (conn, case_id) = setup_db_with_case();

        conn.execute(
            "UPDATE reportable_cases SET
                primary_site_icdo3 = 'C18.0',
                histology_icdo3 = '8140/3',
                behavior_code = '/3',
                date_of_diagnosis = '2025-06-01',
                date_first_treatment = '2025-01-01',
                treatment_surgery = '01'
             WHERE id = ?1",
            [&case_id],
        ).unwrap();

        let errors = validate_case(&conn, &case_id).unwrap();
        let error_codes: Vec<&str> = errors.iter().map(|e| e.rule_code.as_str()).collect();

        assert!(error_codes.contains(&"IF002"), "Expected treatment-before-diagnosis error");
    }
}
