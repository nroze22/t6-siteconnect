pub mod audit;
pub mod seed;
pub mod state;

use std::path::Path;
use rusqlite::Connection;
use thiserror::Error;

pub use state::DbState;
pub use seed::seed_if_empty;

#[derive(Error, Debug)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Database not initialized")]
    NotInitialized,
    #[error("Invalid passphrase")]
    InvalidPassphrase,
}

/// Initialize the encrypted SQLite database with SQLCipher.
/// The passphrase is used to derive the encryption key via PBKDF2.
pub fn init_database(db_path: &Path, passphrase: &str) -> Result<Connection, DbError> {
    let conn = Connection::open(db_path)?;

    // Set SQLCipher encryption key
    conn.pragma_update(None, "key", passphrase)?;

    // SQLCipher configuration for strong encryption
    conn.pragma_update(None, "cipher_page_size", 4096)?;
    conn.pragma_update(None, "kdf_iter", 256000)?;

    // Verify the database is accessible (will fail if wrong passphrase)
    conn.pragma_query_value(None, "cipher_version", |row| row.get::<_, String>(0))
        .map_err(|_| DbError::InvalidPassphrase)?;

    // Enable WAL mode for better read performance
    conn.pragma_update(None, "journal_mode", "WAL")?;

    // Run migrations
    run_migrations(&conn)?;

    Ok(conn)
}

pub(crate) fn run_migrations(conn: &Connection) -> Result<(), DbError> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS patients (
            id TEXT PRIMARY KEY,
            site_patient_id TEXT NOT NULL,
            date_of_birth TEXT,
            gender TEXT,
            race TEXT,
            ethnicity TEXT,
            insurance_type TEXT,
            imported_at TEXT NOT NULL,
            import_source TEXT,
            last_updated TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS diagnoses (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            icd10_code TEXT,
            description TEXT NOT NULL,
            onset_date TEXT,
            status TEXT DEFAULT 'active',
            source TEXT DEFAULT 'structured',
            confidence REAL DEFAULT 1.0,
            raw_text TEXT
        );

        CREATE TABLE IF NOT EXISTS medications (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            rxnorm_code TEXT,
            drug_name TEXT NOT NULL,
            dose TEXT,
            frequency TEXT,
            start_date TEXT,
            end_date TEXT,
            status TEXT DEFAULT 'active',
            source TEXT DEFAULT 'structured',
            confidence REAL DEFAULT 1.0
        );

        CREATE TABLE IF NOT EXISTS lab_results (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            loinc_code TEXT,
            test_name TEXT NOT NULL,
            value REAL,
            unit TEXT,
            reference_range TEXT,
            result_date TEXT,
            abnormal_flag TEXT,
            source TEXT DEFAULT 'structured'
        );

        CREATE TABLE IF NOT EXISTS vitals (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            vital_type TEXT NOT NULL,
            value REAL,
            unit TEXT,
            measurement_date TEXT
        );

        CREATE TABLE IF NOT EXISTS procedures (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            cpt_code TEXT,
            description TEXT NOT NULL,
            procedure_date TEXT,
            status TEXT DEFAULT 'completed'
        );

        CREATE TABLE IF NOT EXISTS allergies (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            allergen TEXT NOT NULL,
            reaction TEXT,
            severity TEXT,
            allergy_type TEXT,
            onset_date TEXT,
            status TEXT DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS clinical_notes (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            note_type TEXT,
            note_text TEXT NOT NULL,
            note_date TEXT,
            entities_extracted INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS studies (
            id TEXT PRIMARY KEY,
            nct_number TEXT,
            title TEXT NOT NULL,
            short_title TEXT,
            sponsor TEXT NOT NULL,
            phase TEXT,
            status TEXT DEFAULT 'recruiting',
            therapeutic_area TEXT,
            indication TEXT,
            study_type TEXT DEFAULT 'interventional',
            summary TEXT,
            source TEXT DEFAULT 'curated',
            last_synced TEXT,
            estimated_per_patient_value INTEGER,
            estimated_site_startup INTEGER,
            currency TEXT DEFAULT 'USD',
            payment_model TEXT DEFAULT 'unknown',
            financial_details TEXT
        );

        CREATE TABLE IF NOT EXISTS study_criteria (
            id TEXT PRIMARY KEY,
            study_id TEXT NOT NULL REFERENCES studies(id),
            type TEXT NOT NULL,
            criterion_number INTEGER NOT NULL,
            criterion_text TEXT NOT NULL,
            structured_rule TEXT,
            rule_type TEXT DEFAULT 'structured'
        );

        CREATE TABLE IF NOT EXISTS screening_results (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            study_id TEXT NOT NULL REFERENCES studies(id),
            overall_status TEXT NOT NULL,
            inclusion_met INTEGER DEFAULT 0,
            inclusion_total INTEGER DEFAULT 0,
            exclusion_triggered INTEGER DEFAULT 0,
            exclusion_total INTEGER DEFAULT 0,
            missing_data_count INTEGER DEFAULT 0,
            score REAL DEFAULT 0.0,
            screened_at TEXT NOT NULL,
            reviewed_by TEXT,
            review_status TEXT DEFAULT 'pending',
            review_notes TEXT
        );

        CREATE TABLE IF NOT EXISTS screening_criteria_results (
            id TEXT PRIMARY KEY,
            screening_result_id TEXT NOT NULL REFERENCES screening_results(id),
            criterion_id TEXT NOT NULL,
            criterion_type TEXT NOT NULL,
            criterion_text TEXT NOT NULL,
            result TEXT NOT NULL,
            evidence TEXT,
            evidence_source TEXT,
            confidence REAL DEFAULT 1.0,
            reasoning TEXT,
            ai_determined INTEGER DEFAULT 0,
            human_verified INTEGER DEFAULT 0,
            human_override TEXT
        );

        CREATE TABLE IF NOT EXISTS import_log (
            id TEXT PRIMARY KEY,
            file_name TEXT NOT NULL,
            file_format TEXT,
            records_imported INTEGER DEFAULT 0,
            records_updated INTEGER DEFAULT 0,
            records_skipped INTEGER DEFAULT 0,
            column_mapping TEXT,
            imported_at TEXT NOT NULL,
            imported_by TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            checksum TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS import_file_hashes (
            id TEXT PRIMARY KEY,
            file_hash TEXT NOT NULL,
            file_name TEXT NOT NULL,
            imported_at TEXT NOT NULL DEFAULT (datetime('now')),
            records_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_import_file_hashes_hash ON import_file_hashes(file_hash);

        CREATE TABLE IF NOT EXISTS import_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            emr_system TEXT,
            file_format TEXT NOT NULL,
            column_mapping TEXT NOT NULL,
            header_row_index INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_used_at TEXT,
            use_count INTEGER NOT NULL DEFAULT 0
        );

        -- Multi-protocol screening batches
        CREATE TABLE IF NOT EXISTS screening_batches (
            id TEXT PRIMARY KEY,
            study_ids TEXT NOT NULL,
            patient_count INTEGER NOT NULL,
            study_count INTEGER NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            status TEXT DEFAULT 'running'
        );

        -- Patient registry: consent tracking
        CREATE TABLE IF NOT EXISTS patient_consents (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            consent_type TEXT NOT NULL,
            condition_scope TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            granted_date TEXT NOT NULL,
            expiry_date TEXT,
            withdrawn_date TEXT,
            withdrawal_reason TEXT,
            documented_by TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Patient registry: status extension (1:1 with patients)
        CREATE TABLE IF NOT EXISTS patient_registry_status (
            patient_id TEXT PRIMARY KEY REFERENCES patients(id),
            registry_status TEXT NOT NULL DEFAULT 'active',
            availability TEXT DEFAULT 'available',
            washout_until TEXT,
            total_studies_participated INTEGER DEFAULT 0,
            last_study_end_date TEXT,
            max_concurrent_studies INTEGER DEFAULT 1,
            compensation_total_cents INTEGER DEFAULT 0,
            annual_compensation_limit_cents INTEGER,
            notes TEXT,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Patient registry: diagnosis change history
        CREATE TABLE IF NOT EXISTS diagnosis_history (
            id TEXT PRIMARY KEY,
            diagnosis_id TEXT NOT NULL REFERENCES diagnoses(id),
            patient_id TEXT NOT NULL REFERENCES patients(id),
            previous_status TEXT NOT NULL,
            new_status TEXT NOT NULL,
            changed_at TEXT NOT NULL,
            change_source TEXT DEFAULT 'import'
        );

        -- Patient registry: auto-match notifications
        CREATE TABLE IF NOT EXISTS auto_match_notifications (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            study_id TEXT NOT NULL REFERENCES studies(id),
            score REAL NOT NULL,
            status TEXT NOT NULL,
            notified_at TEXT NOT NULL DEFAULT (datetime('now')),
            dismissed INTEGER DEFAULT 0,
            actioned INTEGER DEFAULT 0
        );

        -- NAACCR: reportable cancer cases
        CREATE TABLE IF NOT EXISTS reportable_cases (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL REFERENCES patients(id),
            detected_at TEXT NOT NULL DEFAULT (datetime('now')),
            detection_method TEXT NOT NULL DEFAULT 'auto',
            triggering_diagnosis_id TEXT REFERENCES diagnoses(id),
            registry_type TEXT DEFAULT 'hospital',
            abstract_status TEXT DEFAULT 'draft',
            primary_site_icdo3 TEXT,
            histology_icdo3 TEXT,
            behavior_code TEXT,
            grade TEXT,
            laterality TEXT,
            date_of_diagnosis TEXT,
            diagnostic_confirmation TEXT,
            clinical_stage_group TEXT,
            pathologic_stage_group TEXT,
            tnm_clinical_t TEXT,
            tnm_clinical_n TEXT,
            tnm_clinical_m TEXT,
            tnm_pathologic_t TEXT,
            tnm_pathologic_n TEXT,
            tnm_pathologic_m TEXT,
            treatment_surgery TEXT DEFAULT '00',
            treatment_radiation TEXT DEFAULT '00',
            treatment_chemo TEXT DEFAULT '00',
            treatment_hormone TEXT DEFAULT '00',
            treatment_immuno TEXT DEFAULT '00',
            treatment_other TEXT DEFAULT '00',
            date_first_treatment TEXT,
            vital_status TEXT DEFAULT '1',
            date_of_last_contact TEXT,
            completeness_score REAL DEFAULT 0.0,
            validation_errors TEXT,
            state_registry TEXT,
            submission_batch_id TEXT,
            submitted_at TEXT,
            abstracted_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- NAACCR: ICD-10 to ICD-O-3 crosswalk
        CREATE TABLE IF NOT EXISTS icd10_icdo3_crosswalk (
            id TEXT PRIMARY KEY,
            icd10_code TEXT NOT NULL,
            icdo3_topography TEXT NOT NULL,
            icdo3_histology_default TEXT,
            description TEXT,
            reportable INTEGER DEFAULT 1
        );

        -- NAACCR: inter-field validation rules
        CREATE TABLE IF NOT EXISTS naaccr_validation_rules (
            id TEXT PRIMARY KEY,
            rule_name TEXT NOT NULL,
            rule_code TEXT NOT NULL,
            field1 TEXT NOT NULL,
            field2 TEXT,
            condition TEXT NOT NULL,
            error_level TEXT DEFAULT 'error',
            message_template TEXT NOT NULL
        );

        -- NAACCR: state registry submission profiles
        CREATE TABLE IF NOT EXISTS state_registry_profiles (
            id TEXT PRIMARY KEY,
            state_code TEXT NOT NULL UNIQUE,
            state_name TEXT NOT NULL,
            required_fields TEXT NOT NULL,
            submission_format TEXT DEFAULT 'naaccr_xml_v25',
            submission_url TEXT,
            reporting_deadline_days INTEGER DEFAULT 180,
            notes TEXT
        );

        -- Indexes for common queries
        CREATE INDEX IF NOT EXISTS idx_diagnoses_patient ON diagnoses(patient_id);
        CREATE INDEX IF NOT EXISTS idx_diagnoses_icd10 ON diagnoses(icd10_code);
        CREATE INDEX IF NOT EXISTS idx_medications_patient ON medications(patient_id);
        CREATE INDEX IF NOT EXISTS idx_medications_rxnorm ON medications(rxnorm_code);
        CREATE INDEX IF NOT EXISTS idx_lab_results_patient ON lab_results(patient_id);
        CREATE INDEX IF NOT EXISTS idx_lab_results_loinc ON lab_results(loinc_code);
        CREATE INDEX IF NOT EXISTS idx_vitals_patient ON vitals(patient_id);
        CREATE INDEX IF NOT EXISTS idx_procedures_patient ON procedures(patient_id);
        CREATE INDEX IF NOT EXISTS idx_allergies_patient ON allergies(patient_id);
        CREATE INDEX IF NOT EXISTS idx_screening_results_patient ON screening_results(patient_id);
        CREATE INDEX IF NOT EXISTS idx_screening_results_study ON screening_results(study_id);
        CREATE INDEX IF NOT EXISTS idx_screening_criteria_result ON screening_criteria_results(screening_result_id);
        CREATE INDEX IF NOT EXISTS idx_study_criteria_study ON study_criteria(study_id);
        CREATE INDEX IF NOT EXISTS idx_studies_nct ON studies(nct_number);

        -- Multi-protocol screening indexes
        CREATE INDEX IF NOT EXISTS idx_screening_results_patient_study ON screening_results(patient_id, study_id);

        -- Patient registry indexes
        CREATE INDEX IF NOT EXISTS idx_patient_consents_patient ON patient_consents(patient_id);
        CREATE INDEX IF NOT EXISTS idx_patient_consents_status ON patient_consents(status);
        CREATE INDEX IF NOT EXISTS idx_diagnosis_history_patient ON diagnosis_history(patient_id);
        CREATE INDEX IF NOT EXISTS idx_diagnosis_history_diagnosis ON diagnosis_history(diagnosis_id);
        CREATE INDEX IF NOT EXISTS idx_auto_match_study ON auto_match_notifications(study_id);

        -- NAACCR indexes
        CREATE INDEX IF NOT EXISTS idx_reportable_cases_patient ON reportable_cases(patient_id);
        CREATE INDEX IF NOT EXISTS idx_reportable_cases_status ON reportable_cases(abstract_status);
        CREATE INDEX IF NOT EXISTS idx_crosswalk_icd10 ON icd10_icdo3_crosswalk(icd10_code);

        -- Epic / FHIR connection profiles. Each row is one site's Epic
        -- instance — every site is its own OAuth server, so connections
        -- are first-class data, not a settings blob. Tokens and the
        -- private signing key live in the OS keychain, never in this table.
        CREATE TABLE IF NOT EXISTS epic_connections (
            id TEXT PRIMARY KEY,
            site_label TEXT NOT NULL,
            fhir_base_url TEXT NOT NULL,
            authorize_url TEXT,
            token_url TEXT,
            client_id TEXT,
            scopes TEXT,
            auth_mode TEXT NOT NULL DEFAULT 'standalone',
            jwk_thumbprint TEXT,
            jwk_public_path TEXT,
            status TEXT NOT NULL DEFAULT 'unconfigured',
            last_tested_at TEXT,
            last_test_error TEXT,
            last_sync_at TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_epic_connections_status ON epic_connections(status);
        ",
    )?;

    tracing::info!("Database migrations completed successfully");
    Ok(())
}

/// Initialize an in-memory database with migrations for testing.
#[cfg(test)]
pub(crate) fn init_test_db(conn: &Connection) {
    run_migrations(conn).unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_database_in_memory() {
        let conn = Connection::open_in_memory().unwrap();
        // For in-memory testing, skip SQLCipher pragmas
        run_migrations(&conn).unwrap();

        // Verify tables exist — should have all original + new tables
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(count >= 20, "Expected at least 20 tables (16 original + 8 new), got {}", count);
    }

    #[test]
    fn test_new_tables_exist() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let tables = vec![
            "screening_batches",
            "patient_consents",
            "patient_registry_status",
            "diagnosis_history",
            "auto_match_notifications",
            "reportable_cases",
            "icd10_icdo3_crosswalk",
            "naaccr_validation_rules",
            "state_registry_profiles",
        ];

        for table in tables {
            let exists: bool = conn
                .query_row(
                    "SELECT count(*) > 0 FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(exists, "Table '{}' should exist", table);
        }
    }

    #[test]
    fn test_consent_crud() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Insert patient
        conn.execute(
            "INSERT INTO patients (id, site_patient_id, imported_at, last_updated) VALUES ('p1', 'MRN-1', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();

        // Grant consent
        conn.execute(
            "INSERT INTO patient_consents (id, patient_id, consent_type, status, granted_date)
             VALUES ('c1', 'p1', 'general_research', 'active', '2026-03-01')",
            [],
        ).unwrap();

        // Verify consent exists
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM patient_consents WHERE patient_id = 'p1' AND status = 'active'",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(count, 1);

        // Withdraw consent
        conn.execute(
            "UPDATE patient_consents SET status = 'withdrawn', withdrawn_date = '2026-04-01', withdrawal_reason = 'Changed mind'
             WHERE id = 'c1'",
            [],
        ).unwrap();

        let status: String = conn.query_row(
            "SELECT status FROM patient_consents WHERE id = 'c1'",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(status, "withdrawn");
    }

    #[test]
    fn test_diagnosis_history_tracking() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO patients (id, site_patient_id, imported_at, last_updated) VALUES ('p1', 'MRN-1', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO diagnoses (id, patient_id, icd10_code, description, status, source, confidence)
             VALUES ('dx1', 'p1', 'C34.1', 'Lung cancer', 'active', 'structured', 1.0)",
            [],
        ).unwrap();

        // Record a status change
        conn.execute(
            "INSERT INTO diagnosis_history (id, diagnosis_id, patient_id, previous_status, new_status, changed_at, change_source)
             VALUES ('dh1', 'dx1', 'p1', 'active', 'resolved', '2026-06-01', 'import')",
            [],
        ).unwrap();

        let (prev, new_s): (String, String) = conn.query_row(
            "SELECT previous_status, new_status FROM diagnosis_history WHERE diagnosis_id = 'dx1'",
            [], |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap();
        assert_eq!(prev, "active");
        assert_eq!(new_s, "resolved");
    }

    #[test]
    fn test_registry_status_upsert() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO patients (id, site_patient_id, imported_at, last_updated) VALUES ('p1', 'MRN-1', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();

        // Insert
        conn.execute(
            "INSERT INTO patient_registry_status (patient_id, registry_status, availability)
             VALUES ('p1', 'active', 'available')",
            [],
        ).unwrap();

        // Update via upsert pattern
        conn.execute(
            "INSERT INTO patient_registry_status (patient_id, registry_status, availability, updated_at)
             VALUES ('p1', 'active', 'enrolled', datetime('now'))
             ON CONFLICT(patient_id) DO UPDATE SET availability = excluded.availability, updated_at = excluded.updated_at",
            [],
        ).unwrap();

        let avail: String = conn.query_row(
            "SELECT availability FROM patient_registry_status WHERE patient_id = 'p1'",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(avail, "enrolled");
    }

    #[test]
    fn test_auto_match_notifications() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO patients (id, site_patient_id, imported_at, last_updated) VALUES ('p1', 'MRN-1', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO studies (id, title, sponsor, phase) VALUES ('s1', 'Test Study', 'Sponsor', 'Phase 3')",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO auto_match_notifications (id, patient_id, study_id, score, status)
             VALUES ('n1', 'p1', 's1', 85.0, 'eligible')",
            [],
        ).unwrap();

        // Query undismissed
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM auto_match_notifications WHERE dismissed = 0",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(count, 1);

        // Dismiss
        conn.execute("UPDATE auto_match_notifications SET dismissed = 1 WHERE id = 'n1'", []).unwrap();

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM auto_match_notifications WHERE dismissed = 0",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_screening_batches_table() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO screening_batches (id, study_ids, patient_count, study_count, started_at, status)
             VALUES ('b1', '[\"s1\",\"s2\"]', 25, 2, '2026-03-01', 'running')",
            [],
        ).unwrap();

        conn.execute(
            "UPDATE screening_batches SET status = 'completed', completed_at = '2026-03-01' WHERE id = 'b1'",
            [],
        ).unwrap();

        let status: String = conn.query_row(
            "SELECT status FROM screening_batches WHERE id = 'b1'",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(status, "completed");
    }
}
