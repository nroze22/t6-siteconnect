use rusqlite::Connection;
use uuid::Uuid;

use super::DbError;

/// Seed the database with the KEYNOTE-789 NSCLC study and its eligibility criteria.
/// Only runs when the `studies` table is empty (first launch).
pub fn seed_if_empty(conn: &Connection) -> Result<(), DbError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM studies",
        [],
        |row| row.get(0),
    )?;

    if count > 0 {
        tracing::info!("Studies table already populated, skipping seed");
        return Ok(());
    }

    tracing::info!("Seeding database with KEYNOTE-789 study data");

    let study_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO studies (
            id, nct_number, title, short_title, sponsor, phase, status,
            therapeutic_area, indication, study_type, summary, source,
            estimated_per_patient_value, estimated_site_startup, currency,
            payment_model, financial_details
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        rusqlite::params![
            study_id,
            "NCT05502237",
            "KEYNOTE-789: Pembrolizumab + Chemotherapy vs Placebo + Chemotherapy in Previously Treated Metastatic Non-Small Cell Lung Cancer",
            "KEYNOTE-789",
            "Merck Sharp & Dohme LLC",
            "Phase 3",
            "recruiting",
            "Oncology",
            "Non-Small Cell Lung Cancer (NSCLC)",
            "interventional",
            "A randomized, double-blind, phase 3 study of pembrolizumab plus pemetrexed and platinum chemotherapy versus placebo plus pemetrexed and platinum chemotherapy for the first-line treatment of metastatic NSCLC with EGFR wild-type tumors.",
            "curated",
            4_200_000_i64,   // $42,000.00 per patient in cents
            3_500_000_i64,   // $35,000.00 site startup in cents
            "USD",
            "per_procedure",
            r#"{"total_enrollment_target":858,"estimated_duration_months":36,"procedures_per_patient":24,"payment_schedule":"milestone"}"#,
        ],
    )?;

    // --- Inclusion criteria (10) ---

    let inclusion_criteria: Vec<(i32, &str, &str, &str)> = vec![
        (
            1,
            "Age >= 18 years at time of informed consent",
            "structured",
            r#"{"type":"AgeRange","min":18,"max":null}"#,
        ),
        (
            2,
            "Histologically or cytologically confirmed diagnosis of non-small cell lung cancer (NSCLC)",
            "structured",
            r#"{"type":"HasDiagnosis","icd10_prefix":"C34","status":"active"}"#,
        ),
        (
            3,
            "No prior systemic therapy for metastatic NSCLC",
            "structured",
            r#"{"type":"NoMedication","drug_name_contains":"chemotherapy"}"#,
        ),
        (
            4,
            "At least one measurable lesion per RECIST v1.1",
            "structured",
            r#"{"type":"HasDiagnosis","icd10_prefix":"C34","status":"active"}"#,
        ),
        (
            5,
            "ECOG Performance Status 0 or 1",
            "llm_required",
            "",
        ),
        (
            6,
            "PD-L1 tumor expression assessed by immunohistochemistry using PD-L1 IHC 22C3 pharmDx assay",
            "llm_required",
            "",
        ),
        (
            7,
            "Adequate hematologic function: Absolute Neutrophil Count (ANC) >= 1,500/uL",
            "structured",
            r#"{"type":"LabValueRange","test_name":"ANC","min":1500.0,"max":null}"#,
        ),
        (
            8,
            "Adequate hematologic function: Platelet count >= 100,000/uL",
            "structured",
            r#"{"type":"LabValueRange","test_name":"Platelets","min":100000.0,"max":null}"#,
        ),
        (
            9,
            "Adequate hematologic function: Hemoglobin >= 9.0 g/dL",
            "structured",
            r#"{"type":"LabValueRange","test_name":"Hemoglobin","min":9.0,"max":null}"#,
        ),
        (
            10,
            "Adequate renal function: eGFR >= 30 mL/min/1.73m2",
            "structured",
            r#"{"type":"LabValueRange","test_name":"eGFR","min":30.0,"max":null}"#,
        ),
    ];

    for (num, text, rule_type, rule_json) in &inclusion_criteria {
        let crit_id = Uuid::new_v4().to_string();
        let structured_rule: Option<&str> = if rule_json.is_empty() { None } else { Some(rule_json) };
        conn.execute(
            "INSERT INTO study_criteria (id, study_id, type, criterion_number, criterion_text, structured_rule, rule_type)
             VALUES (?1, ?2, 'inclusion', ?3, ?4, ?5, ?6)",
            rusqlite::params![crit_id, study_id, num, text, structured_rule, rule_type],
        )?;
    }

    // --- Exclusion criteria (6) ---

    let exclusion_criteria: Vec<(i32, &str, &str, &str)> = vec![
        (
            1,
            "Tumor harboring EGFR sensitizing mutations or ALK translocations",
            "structured",
            r#"{"type":"Or","rules":[{"type":"HasDiagnosis","icd10_prefix":"Z15.0","status":"active"},{"type":"HasMedication","drug_name_contains":"erlotinib"},{"type":"HasMedication","drug_name_contains":"crizotinib"}]}"#,
        ),
        (
            2,
            "Active autoimmune disease requiring systemic treatment (e.g., rheumatoid arthritis, lupus)",
            "structured",
            r#"{"type":"Or","rules":[{"type":"HasDiagnosis","icd10_prefix":"M05","status":"active"},{"type":"HasDiagnosis","icd10_prefix":"M06","status":"active"}]}"#,
        ),
        (
            3,
            "Active central nervous system (CNS) metastases and/or carcinomatous meningitis",
            "structured",
            r#"{"type":"HasDiagnosis","icd10_prefix":"C79.3","status":"active"}"#,
        ),
        (
            4,
            "Prior therapy with an anti-PD-1, anti-PD-L1, or anti-PD-L2 agent or prior therapy directed to another stimulatory or co-inhibitory T-cell receptor",
            "llm_required",
            "",
        ),
        (
            5,
            "Active infection requiring systemic therapy",
            "llm_required",
            "",
        ),
        (
            6,
            "Known history of HIV, Hepatitis B, or Hepatitis C infection",
            "structured",
            r#"{"type":"Or","rules":[{"type":"HasDiagnosis","icd10_prefix":"B20","status":"active"},{"type":"HasDiagnosis","icd10_prefix":"B18","status":"active"}]}"#,
        ),
    ];

    for (num, text, rule_type, rule_json) in &exclusion_criteria {
        let crit_id = Uuid::new_v4().to_string();
        let structured_rule: Option<&str> = if rule_json.is_empty() { None } else { Some(rule_json) };
        conn.execute(
            "INSERT INTO study_criteria (id, study_id, type, criterion_number, criterion_text, structured_rule, rule_type)
             VALUES (?1, ?2, 'exclusion', ?3, ?4, ?5, ?6)",
            rusqlite::params![crit_id, study_id, num, text, structured_rule, rule_type],
        )?;
    }

    tracing::info!("Seeded KEYNOTE-789 study with {} inclusion and {} exclusion criteria",
        inclusion_criteria.len(), exclusion_criteria.len());

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seed_if_empty_inserts_data() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::init_test_db(&conn);

        seed_if_empty(&conn).unwrap();

        let study_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM studies", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(study_count, 1);

        let criteria_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM study_criteria", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(criteria_count, 16); // 10 inclusion + 6 exclusion

        // Verify NCT number
        let nct: String = conn.query_row(
            "SELECT nct_number FROM studies LIMIT 1", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(nct, "NCT05502237");
    }

    #[test]
    fn test_seed_if_empty_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::init_test_db(&conn);

        seed_if_empty(&conn).unwrap();
        seed_if_empty(&conn).unwrap(); // second call should be a no-op

        let study_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM studies", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(study_count, 1);
    }
}
