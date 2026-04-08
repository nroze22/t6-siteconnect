use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

/// A reportable cancer case detected from patient diagnoses.
#[derive(Debug, Serialize)]
pub struct DetectedCase {
    pub id: String,
    pub patient_id: String,
    pub site_patient_id: String,
    pub triggering_diagnosis_id: String,
    pub icd10_code: String,
    pub description: String,
    pub icdo3_topography: Option<String>,
    pub date_of_diagnosis: Option<String>,
}

/// Scan all patient diagnoses for reportable cancer cases (ICD-10 C00-C96, D00-D09).
/// Only creates new reportable_cases entries for diagnoses not already tracked.
pub fn detect_reportable_cases(conn: &Connection) -> Result<Vec<DetectedCase>, String> {
    // Find diagnoses with cancer ICD-10 codes that don't already have a reportable case
    let mut stmt = conn.prepare(
        "SELECT d.id, d.patient_id, d.icd10_code, d.description, d.onset_date, p.site_patient_id
         FROM diagnoses d
         JOIN patients p ON p.id = d.patient_id
         WHERE d.icd10_code IS NOT NULL
           AND (
               (d.icd10_code >= 'C00' AND d.icd10_code < 'C97')
               OR (d.icd10_code LIKE 'C%' AND LENGTH(d.icd10_code) > 3 AND SUBSTR(d.icd10_code, 1, 3) >= 'C00' AND SUBSTR(d.icd10_code, 1, 3) < 'C97')
               OR (d.icd10_code >= 'D00' AND d.icd10_code < 'D10')
               OR (d.icd10_code LIKE 'D0%' AND LENGTH(d.icd10_code) > 3)
           )
           AND NOT EXISTS (
               SELECT 1 FROM reportable_cases rc WHERE rc.triggering_diagnosis_id = d.id
           )
         ORDER BY d.patient_id, d.onset_date"
    ).map_err(|e| format!("Query error: {}", e))?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,  // diagnosis_id
            row.get::<_, String>(1)?,  // patient_id
            row.get::<_, String>(2)?,  // icd10_code
            row.get::<_, String>(3)?,  // description
            row.get::<_, Option<String>>(4)?,  // onset_date
            row.get::<_, String>(5)?,  // site_patient_id
        ))
    }).map_err(|e| format!("Query error: {}", e))?;

    let mut detected = Vec::new();
    let now = chrono::Utc::now().to_rfc3339();

    for row in rows {
        let (dx_id, patient_id, icd10_code, description, onset_date, site_patient_id) =
            row.map_err(|e| format!("Row error: {}", e))?;

        // Look up ICD-O-3 topography from crosswalk
        let icd10_prefix = if icd10_code.len() >= 3 { &icd10_code[..3] } else { &icd10_code };
        let icdo3_topography: Option<String> = conn.query_row(
            "SELECT icdo3_topography FROM icd10_icdo3_crosswalk WHERE icd10_code = ?1 LIMIT 1",
            [icd10_prefix],
            |row| row.get(0),
        ).ok();

        let case_id = Uuid::new_v4().to_string();

        // Insert the reportable case
        conn.execute(
            "INSERT INTO reportable_cases (id, patient_id, detected_at, detection_method, triggering_diagnosis_id,
                primary_site_icdo3, date_of_diagnosis, abstract_status)
             VALUES (?1, ?2, ?3, 'auto', ?4, ?5, ?6, 'draft')",
            rusqlite::params![case_id, patient_id, now, dx_id, icdo3_topography, onset_date],
        ).map_err(|e| format!("Failed to insert case: {}", e))?;

        detected.push(DetectedCase {
            id: case_id,
            patient_id,
            site_patient_id,
            triggering_diagnosis_id: dx_id,
            icd10_code,
            description,
            icdo3_topography,
            date_of_diagnosis: onset_date,
        });
    }

    Ok(detected)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::init_test_db(&conn);

        // Insert a patient with a cancer diagnosis
        conn.execute(
            "INSERT INTO patients (id, site_patient_id, date_of_birth, gender, imported_at, last_updated)
             VALUES ('p-onc', 'MRN-ONC', '1958-05-10', 'female', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO diagnoses (id, patient_id, icd10_code, description, onset_date, status, source, confidence)
             VALUES ('dx-lung', 'p-onc', 'C34.1', 'NSCLC right upper lobe', '2025-11-15', 'active', 'structured', 1.0)",
            [],
        ).unwrap();

        // Non-cancer diagnosis — should NOT be detected
        conn.execute(
            "INSERT INTO diagnoses (id, patient_id, icd10_code, description, onset_date, status, source, confidence)
             VALUES ('dx-dm', 'p-onc', 'E11', 'Type 2 diabetes', '2020-03-01', 'active', 'structured', 1.0)",
            [],
        ).unwrap();

        // In-situ carcinoma (D00-D09) — SHOULD be detected
        conn.execute(
            "INSERT INTO diagnoses (id, patient_id, icd10_code, description, onset_date, status, source, confidence)
             VALUES ('dx-insitu', 'p-onc', 'D05.1', 'Intraductal carcinoma in situ of breast', '2025-06-01', 'active', 'structured', 1.0)",
            [],
        ).unwrap();

        // Seed crosswalk entry
        conn.execute(
            "INSERT INTO icd10_icdo3_crosswalk (id, icd10_code, icdo3_topography, description, reportable)
             VALUES ('xw-c34', 'C34', 'C34.9', 'Lung/bronchus', 1)",
            [],
        ).unwrap();

        conn
    }

    #[test]
    fn test_detect_reportable_cases() {
        let conn = setup_db();
        let cases = detect_reportable_cases(&conn).unwrap();

        // Should detect C34.1 and D05.1, but NOT E11
        assert_eq!(cases.len(), 2);

        let lung = cases.iter().find(|c| c.icd10_code == "C34.1").unwrap();
        assert_eq!(lung.patient_id, "p-onc");
        assert_eq!(lung.icdo3_topography.as_deref(), Some("C34.9"));

        let breast = cases.iter().find(|c| c.icd10_code == "D05.1").unwrap();
        assert_eq!(breast.patient_id, "p-onc");
        assert!(breast.icdo3_topography.is_none()); // No crosswalk for D05
    }

    #[test]
    fn test_detect_idempotent() {
        let conn = setup_db();

        // First detection
        let cases1 = detect_reportable_cases(&conn).unwrap();
        assert_eq!(cases1.len(), 2);

        // Second detection — should find nothing new
        let cases2 = detect_reportable_cases(&conn).unwrap();
        assert_eq!(cases2.len(), 0);
    }
}
