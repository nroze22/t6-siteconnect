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
        tracing::info!("Studies table already populated, skipping study seed");

        // Still seed registry demo + crosswalk if missing
        let patient_count: i64 = conn.query_row("SELECT COUNT(*) FROM patients", [], |row| row.get(0))?;
        if patient_count == 0 {
            // Need the study_id for auto-match notifications
            let study_id: String = conn.query_row("SELECT id FROM studies LIMIT 1", [], |row| row.get(0))?;
            seed_registry_demo(conn, &study_id)?;
        }
        seed_crosswalk(conn)?;
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

    // Seed demo patients for the registry
    seed_registry_demo(conn, &study_id)?;

    // Seed ICD-10 to ICD-O-3 crosswalk
    seed_crosswalk(conn)?;

    Ok(())
}

/// Seed demo patients with consents, diagnoses, medications, and NAACCR cases.
fn seed_registry_demo(conn: &Connection, study_id: &str) -> Result<(), DbError> {
    tracing::info!("Seeding registry demo data");

    // ─── Demo Patients ───
    struct DemoPatient {
        id: &'static str,
        mrn: &'static str,
        dob: &'static str,
        gender: &'static str,
        race: &'static str,
        ethnicity: &'static str,
        insurance: &'static str,
    }

    let patients = vec![
        DemoPatient { id: "p-demo-001", mrn: "MRN-2847591", dob: "1958-03-12", gender: "male", race: "White", ethnicity: "Not Hispanic", insurance: "Medicare" },
        DemoPatient { id: "p-demo-002", mrn: "MRN-3921047", dob: "1965-07-28", gender: "female", race: "Black or African American", ethnicity: "Not Hispanic", insurance: "Private" },
        DemoPatient { id: "p-demo-003", mrn: "MRN-1058234", dob: "1972-11-05", gender: "male", race: "Asian", ethnicity: "Not Hispanic", insurance: "Private" },
        DemoPatient { id: "p-demo-004", mrn: "MRN-5673812", dob: "1950-01-19", gender: "female", race: "White", ethnicity: "Hispanic or Latino", insurance: "Medicare" },
        DemoPatient { id: "p-demo-005", mrn: "MRN-8294561", dob: "1978-09-03", gender: "male", race: "White", ethnicity: "Not Hispanic", insurance: "Private" },
        DemoPatient { id: "p-demo-006", mrn: "MRN-4417823", dob: "1962-05-14", gender: "female", race: "Black or African American", ethnicity: "Not Hispanic", insurance: "Medicaid" },
        DemoPatient { id: "p-demo-007", mrn: "MRN-6839201", dob: "1945-12-30", gender: "male", race: "White", ethnicity: "Not Hispanic", insurance: "Medicare" },
        DemoPatient { id: "p-demo-008", mrn: "MRN-2156748", dob: "1983-04-22", gender: "female", race: "Asian", ethnicity: "Not Hispanic", insurance: "Private" },
        DemoPatient { id: "p-demo-009", mrn: "MRN-7392014", dob: "1970-08-11", gender: "male", race: "White", ethnicity: "Hispanic or Latino", insurance: "Private" },
        DemoPatient { id: "p-demo-010", mrn: "MRN-9041562", dob: "1955-06-07", gender: "female", race: "White", ethnicity: "Not Hispanic", insurance: "Medicare" },
        DemoPatient { id: "p-demo-011", mrn: "MRN-3285910", dob: "1968-02-17", gender: "male", race: "Black or African American", ethnicity: "Not Hispanic", insurance: "Private" },
        DemoPatient { id: "p-demo-012", mrn: "MRN-6104537", dob: "1990-10-25", gender: "female", race: "White", ethnicity: "Not Hispanic", insurance: "Private" },
    ];

    for p in &patients {
        conn.execute(
            "INSERT INTO patients (id, site_patient_id, date_of_birth, gender, race, ethnicity, insurance_type, imported_at, import_source, last_updated)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '2026-03-15T08:30:00Z', 'Epic CSV Export', '2026-03-15T08:30:00Z')",
            rusqlite::params![p.id, p.mrn, p.dob, p.gender, p.race, p.ethnicity, p.insurance],
        )?;
    }

    // ─── Diagnoses ───
    struct DemoDx { id: &'static str, pid: &'static str, icd10: &'static str, desc: &'static str, onset: &'static str, status: &'static str }
    let diagnoses = vec![
        // Oncology patients
        DemoDx { id: "dx-d001", pid: "p-demo-001", icd10: "C34.1", desc: "Non-small cell lung cancer, right upper lobe", onset: "2025-08-15", status: "active" },
        DemoDx { id: "dx-d002", pid: "p-demo-001", icd10: "J44.1", desc: "COPD with acute exacerbation", onset: "2020-03-10", status: "active" },
        DemoDx { id: "dx-d003", pid: "p-demo-001", icd10: "E11.9", desc: "Type 2 diabetes mellitus", onset: "2018-06-22", status: "active" },
        DemoDx { id: "dx-d004", pid: "p-demo-002", icd10: "C50.9", desc: "Invasive ductal carcinoma, right breast", onset: "2025-11-02", status: "active" },
        DemoDx { id: "dx-d005", pid: "p-demo-002", icd10: "I10", desc: "Essential hypertension", onset: "2019-01-15", status: "active" },
        DemoDx { id: "dx-d006", pid: "p-demo-003", icd10: "C18.0", desc: "Adenocarcinoma of cecum", onset: "2025-09-20", status: "active" },
        DemoDx { id: "dx-d007", pid: "p-demo-003", icd10: "E78.5", desc: "Hyperlipidemia", onset: "2021-04-11", status: "active" },
        DemoDx { id: "dx-d008", pid: "p-demo-004", icd10: "C34.9", desc: "NSCLC, unspecified", onset: "2025-06-10", status: "active" },
        DemoDx { id: "dx-d009", pid: "p-demo-004", icd10: "I25.10", desc: "Atherosclerotic heart disease", onset: "2015-09-01", status: "active" },
        DemoDx { id: "dx-d010", pid: "p-demo-005", icd10: "D05.1", desc: "Intraductal carcinoma in situ of right breast", onset: "2026-01-08", status: "active" },
        // Cardiology / other
        DemoDx { id: "dx-d011", pid: "p-demo-006", icd10: "I50.9", desc: "Heart failure, unspecified", onset: "2023-05-20", status: "active" },
        DemoDx { id: "dx-d012", pid: "p-demo-006", icd10: "E11.65", desc: "Type 2 DM with hyperglycemia", onset: "2019-11-03", status: "active" },
        DemoDx { id: "dx-d013", pid: "p-demo-007", icd10: "C61", desc: "Malignant neoplasm of prostate", onset: "2025-04-12", status: "active" },
        DemoDx { id: "dx-d014", pid: "p-demo-007", icd10: "N40.0", desc: "Benign prostatic hyperplasia", onset: "2018-08-20", status: "resolved" },
        DemoDx { id: "dx-d015", pid: "p-demo-008", icd10: "C73", desc: "Papillary thyroid carcinoma", onset: "2026-02-14", status: "active" },
        DemoDx { id: "dx-d016", pid: "p-demo-009", icd10: "I10", desc: "Essential hypertension", onset: "2020-07-01", status: "active" },
        DemoDx { id: "dx-d017", pid: "p-demo-009", icd10: "E11.9", desc: "Type 2 diabetes mellitus", onset: "2022-03-15", status: "active" },
        DemoDx { id: "dx-d018", pid: "p-demo-010", icd10: "C50.4", desc: "Invasive lobular carcinoma, left breast", onset: "2025-10-18", status: "active" },
        DemoDx { id: "dx-d019", pid: "p-demo-010", icd10: "M81.0", desc: "Age-related osteoporosis", onset: "2021-12-01", status: "active" },
        DemoDx { id: "dx-d020", pid: "p-demo-011", icd10: "C64.1", desc: "Renal cell carcinoma, right kidney", onset: "2025-12-05", status: "active" },
        DemoDx { id: "dx-d021", pid: "p-demo-012", icd10: "C56.1", desc: "Malignant neoplasm of right ovary", onset: "2026-01-22", status: "active" },
    ];

    for dx in &diagnoses {
        conn.execute(
            "INSERT INTO diagnoses (id, patient_id, icd10_code, description, onset_date, status, source, confidence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'structured', 1.0)",
            rusqlite::params![dx.id, dx.pid, dx.icd10, dx.desc, dx.onset, dx.status],
        )?;
    }

    // ─── Medications ───
    struct DemoMed { pid: &'static str, drug: &'static str, dose: &'static str, status: &'static str }
    let medications = vec![
        DemoMed { pid: "p-demo-001", drug: "Carboplatin", dose: "AUC 5 IV", status: "active" },
        DemoMed { pid: "p-demo-001", drug: "Pembrolizumab", dose: "200mg IV q3w", status: "active" },
        DemoMed { pid: "p-demo-001", drug: "Metformin", dose: "1000mg BID", status: "active" },
        DemoMed { pid: "p-demo-002", drug: "Tamoxifen", dose: "20mg daily", status: "active" },
        DemoMed { pid: "p-demo-002", drug: "Lisinopril", dose: "10mg daily", status: "active" },
        DemoMed { pid: "p-demo-003", drug: "Fluorouracil", dose: "400mg/m2", status: "active" },
        DemoMed { pid: "p-demo-003", drug: "Oxaliplatin", dose: "85mg/m2", status: "active" },
        DemoMed { pid: "p-demo-004", drug: "Nivolumab", dose: "240mg IV q2w", status: "active" },
        DemoMed { pid: "p-demo-006", drug: "Metoprolol", dose: "50mg BID", status: "active" },
        DemoMed { pid: "p-demo-006", drug: "Furosemide", dose: "40mg daily", status: "active" },
        DemoMed { pid: "p-demo-007", drug: "Leuprolide", dose: "22.5mg IM q3m", status: "active" },
        DemoMed { pid: "p-demo-008", drug: "Levothyroxine", dose: "100mcg daily", status: "active" },
        DemoMed { pid: "p-demo-010", drug: "Letrozole", dose: "2.5mg daily", status: "active" },
        DemoMed { pid: "p-demo-010", drug: "Paclitaxel", dose: "175mg/m2", status: "active" },
        DemoMed { pid: "p-demo-012", drug: "Cisplatin", dose: "75mg/m2", status: "active" },
    ];

    for (i, med) in medications.iter().enumerate() {
        let med_id = format!("med-d{:03}", i + 1);
        conn.execute(
            "INSERT INTO medications (id, patient_id, drug_name, dose, status, source, confidence)
             VALUES (?1, ?2, ?3, ?4, ?5, 'structured', 1.0)",
            rusqlite::params![med_id, med.pid, med.drug, med.dose, med.status],
        )?;
    }

    // ─── Lab Results ───
    struct DemoLab { pid: &'static str, test: &'static str, loinc: &'static str, val: f64, unit: &'static str, date: &'static str }
    let labs = vec![
        DemoLab { pid: "p-demo-001", test: "ANC", loinc: "26499-4", val: 3800.0, unit: "/uL", date: "2026-03-01" },
        DemoLab { pid: "p-demo-001", test: "Hemoglobin", loinc: "718-7", val: 11.2, unit: "g/dL", date: "2026-03-01" },
        DemoLab { pid: "p-demo-001", test: "Platelets", loinc: "777-3", val: 185000.0, unit: "/uL", date: "2026-03-01" },
        DemoLab { pid: "p-demo-001", test: "eGFR", loinc: "33914-3", val: 62.0, unit: "mL/min/1.73m2", date: "2026-03-01" },
        DemoLab { pid: "p-demo-002", test: "ANC", loinc: "26499-4", val: 4200.0, unit: "/uL", date: "2026-02-20" },
        DemoLab { pid: "p-demo-002", test: "Hemoglobin", loinc: "718-7", val: 12.8, unit: "g/dL", date: "2026-02-20" },
        DemoLab { pid: "p-demo-003", test: "CEA", loinc: "2039-6", val: 8.5, unit: "ng/mL", date: "2026-02-15" },
        DemoLab { pid: "p-demo-004", test: "ANC", loinc: "26499-4", val: 2100.0, unit: "/uL", date: "2026-03-05" },
        DemoLab { pid: "p-demo-004", test: "eGFR", loinc: "33914-3", val: 45.0, unit: "mL/min/1.73m2", date: "2026-03-05" },
        DemoLab { pid: "p-demo-007", test: "PSA", loinc: "2857-1", val: 12.4, unit: "ng/mL", date: "2026-01-10" },
        DemoLab { pid: "p-demo-010", test: "CA 15-3", loinc: "6875-9", val: 42.0, unit: "U/mL", date: "2026-02-28" },
    ];

    for (i, lab) in labs.iter().enumerate() {
        let lab_id = format!("lab-d{:03}", i + 1);
        conn.execute(
            "INSERT INTO lab_results (id, patient_id, test_name, loinc_code, value, unit, result_date, source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'structured')",
            rusqlite::params![lab_id, lab.pid, lab.test, lab.loinc, lab.val, lab.unit, lab.date],
        )?;
    }

    // ─── Procedures (for autopopulate) ───
    conn.execute(
        "INSERT INTO procedures (id, patient_id, description, procedure_date, status) VALUES ('proc-d001', 'p-demo-002', 'Right partial mastectomy with sentinel node biopsy', '2025-12-10', 'completed')",
        [],
    )?;
    conn.execute(
        "INSERT INTO procedures (id, patient_id, description, procedure_date, status) VALUES ('proc-d002', 'p-demo-003', 'Right hemicolectomy', '2025-10-15', 'completed')",
        [],
    )?;
    conn.execute(
        "INSERT INTO procedures (id, patient_id, description, procedure_date, status) VALUES ('proc-d003', 'p-demo-007', 'Radical prostatectomy', '2025-06-20', 'completed')",
        [],
    )?;
    conn.execute(
        "INSERT INTO procedures (id, patient_id, description, procedure_date, status) VALUES ('proc-d004', 'p-demo-008', 'Total thyroidectomy', '2026-03-01', 'completed')",
        [],
    )?;
    conn.execute(
        "INSERT INTO procedures (id, patient_id, description, procedure_date, status) VALUES ('proc-d005', 'p-demo-011', 'Left nephrectomy', '2026-01-15', 'completed')",
        [],
    )?;

    // ─── Consents ───
    struct DemoConsent { id: &'static str, pid: &'static str, ctype: &'static str, scope: Option<&'static str>, status: &'static str, granted: &'static str, doc_by: &'static str }
    let consents = vec![
        DemoConsent { id: "con-001", pid: "p-demo-001", ctype: "general_research", scope: None, status: "active", granted: "2025-09-01", doc_by: "Sarah Chen, CRC" },
        DemoConsent { id: "con-002", pid: "p-demo-001", ctype: "condition_specific", scope: Some("C34"), status: "active", granted: "2025-09-01", doc_by: "Sarah Chen, CRC" },
        DemoConsent { id: "con-003", pid: "p-demo-002", ctype: "full_record", scope: None, status: "active", granted: "2025-11-15", doc_by: "James Wright, CRC" },
        DemoConsent { id: "con-004", pid: "p-demo-003", ctype: "general_research", scope: None, status: "active", granted: "2025-10-05", doc_by: "Sarah Chen, CRC" },
        DemoConsent { id: "con-005", pid: "p-demo-004", ctype: "general_research", scope: None, status: "active", granted: "2025-07-20", doc_by: "Maria Lopez, CRC" },
        DemoConsent { id: "con-006", pid: "p-demo-005", ctype: "condition_specific", scope: Some("D05"), status: "active", granted: "2026-01-15", doc_by: "James Wright, CRC" },
        DemoConsent { id: "con-007", pid: "p-demo-006", ctype: "general_research", scope: None, status: "withdrawn", granted: "2024-06-01", doc_by: "Sarah Chen, CRC" },
        DemoConsent { id: "con-008", pid: "p-demo-007", ctype: "general_research", scope: None, status: "active", granted: "2025-05-01", doc_by: "Maria Lopez, CRC" },
        DemoConsent { id: "con-009", pid: "p-demo-008", ctype: "full_record", scope: None, status: "active", granted: "2026-02-20", doc_by: "James Wright, CRC" },
        DemoConsent { id: "con-010", pid: "p-demo-010", ctype: "general_research", scope: None, status: "active", granted: "2025-11-01", doc_by: "Sarah Chen, CRC" },
        DemoConsent { id: "con-011", pid: "p-demo-010", ctype: "condition_specific", scope: Some("C50"), status: "active", granted: "2025-11-01", doc_by: "Sarah Chen, CRC" },
        DemoConsent { id: "con-012", pid: "p-demo-011", ctype: "general_research", scope: None, status: "active", granted: "2026-01-10", doc_by: "Maria Lopez, CRC" },
        DemoConsent { id: "con-013", pid: "p-demo-012", ctype: "general_research", scope: None, status: "active", granted: "2026-02-01", doc_by: "James Wright, CRC" },
        DemoConsent { id: "con-014", pid: "p-demo-012", ctype: "healthy_volunteer", scope: None, status: "active", granted: "2026-02-01", doc_by: "James Wright, CRC" },
    ];

    for c in &consents {
        conn.execute(
            "INSERT INTO patient_consents (id, patient_id, consent_type, condition_scope, status, granted_date, documented_by, withdrawn_date, withdrawal_reason, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?6, ?6)",
            rusqlite::params![
                c.id, c.pid, c.ctype, c.scope, c.status, c.granted, c.doc_by,
                if c.status == "withdrawn" { Some("2025-12-15") } else { None::<&str> },
                if c.status == "withdrawn" { Some("Patient declined further participation") } else { None::<&str> },
            ],
        )?;
    }

    // ─── Registry Status ───
    struct DemoStatus { pid: &'static str, status: &'static str, avail: &'static str, studies: i32, washout: Option<&'static str> }
    let statuses = vec![
        DemoStatus { pid: "p-demo-001", status: "active", avail: "enrolled", studies: 1, washout: None },
        DemoStatus { pid: "p-demo-002", status: "active", avail: "enrolled", studies: 1, washout: None },
        DemoStatus { pid: "p-demo-003", status: "active", avail: "enrolled", studies: 1, washout: None },
        DemoStatus { pid: "p-demo-004", status: "active", avail: "available", studies: 0, washout: None },
        DemoStatus { pid: "p-demo-005", status: "active", avail: "available", studies: 0, washout: None },
        DemoStatus { pid: "p-demo-006", status: "inactive", avail: "unavailable", studies: 1, washout: None },
        DemoStatus { pid: "p-demo-007", status: "active", avail: "washout", studies: 1, washout: Some("2026-06-20") },
        DemoStatus { pid: "p-demo-008", status: "active", avail: "available", studies: 0, washout: None },
        DemoStatus { pid: "p-demo-010", status: "active", avail: "enrolled", studies: 2, washout: None },
        DemoStatus { pid: "p-demo-011", status: "active", avail: "available", studies: 0, washout: None },
        DemoStatus { pid: "p-demo-012", status: "active", avail: "enrolled", studies: 1, washout: None },
    ];

    for s in &statuses {
        conn.execute(
            "INSERT INTO patient_registry_status (patient_id, registry_status, availability, total_studies_participated, washout_until)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![s.pid, s.status, s.avail, s.studies, s.washout],
        )?;
    }

    // ─── Diagnosis History (longitudinal tracking examples) ───
    conn.execute(
        "INSERT INTO diagnosis_history (id, diagnosis_id, patient_id, previous_status, new_status, changed_at, change_source)
         VALUES ('dh-001', 'dx-d014', 'p-demo-007', 'active', 'resolved', '2025-07-01', 'import')",
        [],
    )?;

    // ─── NAACCR Reportable Cases ───
    struct DemoCase {
        id: &'static str, pid: &'static str, dx_id: &'static str,
        site: &'static str, histology: &'static str, behavior: &'static str, grade: &'static str,
        dx_date: &'static str, stage: &'static str, status: &'static str,
        completeness: f64, tx_surg: &'static str, tx_chemo: &'static str, tx_immuno: &'static str, tx_hormone: &'static str,
    }

    let cases = vec![
        DemoCase { id: "naaccr-001", pid: "p-demo-001", dx_id: "dx-d001", site: "C34.1", histology: "8046/3", behavior: "/3", grade: "3", dx_date: "2025-08-15", stage: "IIIB", status: "in_progress", completeness: 0.73, tx_surg: "00", tx_chemo: "01", tx_immuno: "01", tx_hormone: "00" },
        DemoCase { id: "naaccr-002", pid: "p-demo-002", dx_id: "dx-d004", site: "C50.9", histology: "8500/3", behavior: "/3", grade: "2", dx_date: "2025-11-02", stage: "IIA", status: "complete", completeness: 0.87, tx_surg: "01", tx_chemo: "00", tx_immuno: "00", tx_hormone: "01" },
        DemoCase { id: "naaccr-003", pid: "p-demo-003", dx_id: "dx-d006", site: "C18.0", histology: "8140/3", behavior: "/3", grade: "2", dx_date: "2025-09-20", stage: "IIIA", status: "in_progress", completeness: 0.67, tx_surg: "01", tx_chemo: "01", tx_immuno: "00", tx_hormone: "00" },
        DemoCase { id: "naaccr-004", pid: "p-demo-004", dx_id: "dx-d008", site: "C34.9", histology: "8046/3", behavior: "/3", grade: "9", dx_date: "2025-06-10", stage: "", status: "draft", completeness: 0.40, tx_surg: "00", tx_chemo: "00", tx_immuno: "01", tx_hormone: "00" },
        DemoCase { id: "naaccr-005", pid: "p-demo-005", dx_id: "dx-d010", site: "C50.9", histology: "8500/2", behavior: "/2", grade: "1", dx_date: "2026-01-08", stage: "0", status: "complete", completeness: 0.93, tx_surg: "01", tx_chemo: "00", tx_immuno: "00", tx_hormone: "00" },
        DemoCase { id: "naaccr-006", pid: "p-demo-007", dx_id: "dx-d013", site: "C61.9", histology: "8140/3", behavior: "/3", grade: "2", dx_date: "2025-04-12", stage: "II", status: "submitted", completeness: 0.93, tx_surg: "01", tx_chemo: "00", tx_immuno: "00", tx_hormone: "01" },
        DemoCase { id: "naaccr-007", pid: "p-demo-008", dx_id: "dx-d015", site: "C73.9", histology: "8260/3", behavior: "/3", grade: "1", dx_date: "2026-02-14", stage: "I", status: "draft", completeness: 0.53, tx_surg: "01", tx_chemo: "00", tx_immuno: "00", tx_hormone: "00" },
        DemoCase { id: "naaccr-008", pid: "p-demo-010", dx_id: "dx-d018", site: "C50.4", histology: "8520/3", behavior: "/3", grade: "2", dx_date: "2025-10-18", stage: "IIB", status: "in_progress", completeness: 0.73, tx_surg: "00", tx_chemo: "01", tx_immuno: "00", tx_hormone: "01" },
        DemoCase { id: "naaccr-009", pid: "p-demo-011", dx_id: "dx-d020", site: "C64.1", histology: "8312/3", behavior: "/3", grade: "2", dx_date: "2025-12-05", stage: "I", status: "draft", completeness: 0.47, tx_surg: "00", tx_chemo: "00", tx_immuno: "00", tx_hormone: "00" },
        DemoCase { id: "naaccr-010", pid: "p-demo-012", dx_id: "dx-d021", site: "C56.1", histology: "8441/3", behavior: "/3", grade: "3", dx_date: "2026-01-22", stage: "IIIC", status: "in_progress", completeness: 0.60, tx_surg: "00", tx_chemo: "01", tx_immuno: "00", tx_hormone: "00" },
    ];

    for c in &cases {
        let clin_stage: Option<&str> = if c.stage.is_empty() { None } else { Some(c.stage) };
        conn.execute(
            "INSERT INTO reportable_cases (id, patient_id, detected_at, detection_method, triggering_diagnosis_id,
                    abstract_status, primary_site_icdo3, histology_icdo3, behavior_code, grade,
                    date_of_diagnosis, clinical_stage_group, completeness_score,
                    treatment_surgery, treatment_chemo, treatment_immuno, treatment_hormone,
                    state_registry, submitted_at)
             VALUES (?1, ?2, '2026-03-20T10:00:00Z', 'auto', ?3,
                    ?4, ?5, ?6, ?7, ?8,
                    ?9, ?10, ?11,
                    ?12, ?13, ?14, ?15,
                    ?16, ?17)",
            rusqlite::params![
                c.id, c.pid, c.dx_id,
                c.status, c.site, c.histology, c.behavior, c.grade,
                c.dx_date, clin_stage, c.completeness,
                c.tx_surg, c.tx_chemo, c.tx_immuno, c.tx_hormone,
                if c.status == "submitted" { Some("WA") } else { None::<&str> },
                if c.status == "submitted" { Some("2026-03-25T14:00:00Z") } else { None::<&str> },
            ],
        )?;
    }

    // ─── Auto-match notifications ───
    conn.execute(
        "INSERT INTO auto_match_notifications (id, patient_id, study_id, score, status) VALUES ('amn-001', 'p-demo-004', ?1, 78.0, 'potentially_eligible')",
        [study_id],
    )?;
    conn.execute(
        "INSERT INTO auto_match_notifications (id, patient_id, study_id, score, status) VALUES ('amn-002', 'p-demo-008', ?1, 65.0, 'potentially_eligible')",
        [study_id],
    )?;

    tracing::info!("Seeded {} demo patients, {} diagnoses, {} consents, {} NAACCR cases",
        patients.len(), diagnoses.len(), consents.len(), cases.len());

    Ok(())
}

/// Seed the ICD-10 to ICD-O-3 topography crosswalk with common cancer sites.
fn seed_crosswalk(conn: &Connection) -> Result<(), DbError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM icd10_icdo3_crosswalk", [], |row| row.get(0))?;
    if count > 0 { return Ok(()); }

    struct Xwalk { icd10: &'static str, icdo3: &'static str, hist: &'static str, desc: &'static str }
    let entries = vec![
        Xwalk { icd10: "C00", icdo3: "C00.9", hist: "8070/3", desc: "Lip" },
        Xwalk { icd10: "C01", icdo3: "C01.9", hist: "8070/3", desc: "Base of tongue" },
        Xwalk { icd10: "C07", icdo3: "C07.9", hist: "8200/3", desc: "Parotid gland" },
        Xwalk { icd10: "C09", icdo3: "C09.9", hist: "8070/3", desc: "Tonsil" },
        Xwalk { icd10: "C15", icdo3: "C15.9", hist: "8070/3", desc: "Esophagus" },
        Xwalk { icd10: "C16", icdo3: "C16.9", hist: "8140/3", desc: "Stomach" },
        Xwalk { icd10: "C18", icdo3: "C18.9", hist: "8140/3", desc: "Colon" },
        Xwalk { icd10: "C19", icdo3: "C19.9", hist: "8140/3", desc: "Rectosigmoid junction" },
        Xwalk { icd10: "C20", icdo3: "C20.9", hist: "8140/3", desc: "Rectum" },
        Xwalk { icd10: "C22", icdo3: "C22.0", hist: "8170/3", desc: "Liver" },
        Xwalk { icd10: "C25", icdo3: "C25.9", hist: "8140/3", desc: "Pancreas" },
        Xwalk { icd10: "C34", icdo3: "C34.9", hist: "8046/3", desc: "Lung/bronchus" },
        Xwalk { icd10: "C43", icdo3: "C44.9", hist: "8720/3", desc: "Melanoma of skin" },
        Xwalk { icd10: "C50", icdo3: "C50.9", hist: "8500/3", desc: "Breast" },
        Xwalk { icd10: "C53", icdo3: "C53.9", hist: "8070/3", desc: "Cervix uteri" },
        Xwalk { icd10: "C54", icdo3: "C54.1", hist: "8140/3", desc: "Corpus uteri" },
        Xwalk { icd10: "C56", icdo3: "C56.9", hist: "8441/3", desc: "Ovary" },
        Xwalk { icd10: "C61", icdo3: "C61.9", hist: "8140/3", desc: "Prostate" },
        Xwalk { icd10: "C62", icdo3: "C62.9", hist: "9061/3", desc: "Testis" },
        Xwalk { icd10: "C64", icdo3: "C64.9", hist: "8312/3", desc: "Kidney" },
        Xwalk { icd10: "C67", icdo3: "C67.9", hist: "8120/3", desc: "Bladder" },
        Xwalk { icd10: "C71", icdo3: "C71.9", hist: "9440/3", desc: "Brain" },
        Xwalk { icd10: "C73", icdo3: "C73.9", hist: "8260/3", desc: "Thyroid" },
        Xwalk { icd10: "C74", icdo3: "C74.9", hist: "8370/3", desc: "Adrenal gland" },
        Xwalk { icd10: "C80", icdo3: "C80.9", hist: "8000/3", desc: "Unknown primary" },
        Xwalk { icd10: "C81", icdo3: "C77.9", hist: "9650/3", desc: "Hodgkin lymphoma" },
        Xwalk { icd10: "C82", icdo3: "C77.9", hist: "9690/3", desc: "Follicular lymphoma" },
        Xwalk { icd10: "C83", icdo3: "C77.9", hist: "9680/3", desc: "Non-follicular lymphoma" },
        Xwalk { icd10: "C90", icdo3: "C42.1", hist: "9732/3", desc: "Multiple myeloma" },
        Xwalk { icd10: "C91", icdo3: "C42.1", hist: "9811/3", desc: "Lymphoid leukemia" },
        Xwalk { icd10: "C92", icdo3: "C42.1", hist: "9861/3", desc: "Myeloid leukemia" },
    ];

    for e in &entries {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO icd10_icdo3_crosswalk (id, icd10_code, icdo3_topography, icdo3_histology_default, description, reportable)
             VALUES (?1, ?2, ?3, ?4, ?5, 1)",
            rusqlite::params![id, e.icd10, e.icdo3, e.hist, e.desc],
        )?;
    }

    tracing::info!("Seeded {} ICD-10→ICD-O-3 crosswalk entries", entries.len());
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

        // Verify demo patients
        let patient_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM patients", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(patient_count, 12, "Should seed 12 demo patients");

        // Verify consents
        let consent_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM patient_consents", [], |row| row.get(0),
        ).unwrap();
        assert!(consent_count >= 10, "Should seed at least 10 consents");

        // Verify NAACCR cases
        let case_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM reportable_cases", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(case_count, 10, "Should seed 10 NAACCR reportable cases");

        // Verify crosswalk
        let xwalk_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM icd10_icdo3_crosswalk", [], |row| row.get(0),
        ).unwrap();
        assert!(xwalk_count >= 25, "Should seed at least 25 crosswalk entries");

        // Verify registry status
        let status_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM patient_registry_status", [], |row| row.get(0),
        ).unwrap();
        assert!(status_count >= 10, "Should seed at least 10 registry status rows");
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
