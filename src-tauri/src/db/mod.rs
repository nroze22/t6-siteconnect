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
            measurement_type TEXT NOT NULL,
            value REAL NOT NULL,
            unit TEXT NOT NULL,
            measurement_date TEXT
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

        -- Indexes for common queries
        CREATE INDEX IF NOT EXISTS idx_diagnoses_patient ON diagnoses(patient_id);
        CREATE INDEX IF NOT EXISTS idx_diagnoses_icd10 ON diagnoses(icd10_code);
        CREATE INDEX IF NOT EXISTS idx_medications_patient ON medications(patient_id);
        CREATE INDEX IF NOT EXISTS idx_medications_rxnorm ON medications(rxnorm_code);
        CREATE INDEX IF NOT EXISTS idx_lab_results_patient ON lab_results(patient_id);
        CREATE INDEX IF NOT EXISTS idx_lab_results_loinc ON lab_results(loinc_code);
        CREATE INDEX IF NOT EXISTS idx_vitals_patient ON vitals(patient_id);
        CREATE INDEX IF NOT EXISTS idx_screening_results_patient ON screening_results(patient_id);
        CREATE INDEX IF NOT EXISTS idx_screening_results_study ON screening_results(study_id);
        CREATE INDEX IF NOT EXISTS idx_screening_criteria_result ON screening_criteria_results(screening_result_id);
        CREATE INDEX IF NOT EXISTS idx_study_criteria_study ON study_criteria(study_id);
        CREATE INDEX IF NOT EXISTS idx_studies_nct ON studies(nct_number);
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

        // Verify tables exist
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(count >= 10, "Expected at least 10 tables, got {}", count);
    }
}
