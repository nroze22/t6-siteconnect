use chrono::Utc;
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::DbError;

/// Actions that can be recorded in the audit trail.
#[derive(Debug, Clone, Copy)]
pub enum AuditAction {
    PatientImported,
    PatientUpdated,
    DataImported,
    ScreeningExecuted,
    CriterionOverridden,
    PatientReviewed,
    DatabaseInitialized,
    DatabaseUnlocked,
    StudySeeded,
    // Registry actions
    ConsentGranted,
    ConsentWithdrawn,
    RegistryStatusChanged,
    AutoMatchTriggered,
    // NAACCR actions
    CaseDetected,
    CaseAbstracted,
    CaseSubmitted,
    NaacrXmlExported,
}

impl AuditAction {
    pub fn as_str(&self) -> &str {
        match self {
            Self::PatientImported => "patient_imported",
            Self::PatientUpdated => "patient_updated",
            Self::DataImported => "data_imported",
            Self::ScreeningExecuted => "screening_executed",
            Self::CriterionOverridden => "criterion_overridden",
            Self::PatientReviewed => "patient_reviewed",
            Self::DatabaseInitialized => "database_initialized",
            Self::DatabaseUnlocked => "database_unlocked",
            Self::StudySeeded => "study_seeded",
            Self::ConsentGranted => "consent_granted",
            Self::ConsentWithdrawn => "consent_withdrawn",
            Self::RegistryStatusChanged => "registry_status_changed",
            Self::AutoMatchTriggered => "auto_match_triggered",
            Self::CaseDetected => "case_detected",
            Self::CaseAbstracted => "case_abstracted",
            Self::CaseSubmitted => "case_submitted",
            Self::NaacrXmlExported => "naaccr_xml_exported",
        }
    }
}

/// Compute an HMAC-like integrity hash for an audit entry.
/// Uses SHA-256 over the concatenation of the previous checksum, timestamp,
/// action, and details — forming an immutable chain.
fn compute_checksum(
    previous_checksum: &str,
    timestamp: &str,
    action: &str,
    details: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(previous_checksum.as_bytes());
    hasher.update(b"|");
    hasher.update(timestamp.as_bytes());
    hasher.update(b"|");
    hasher.update(action.as_bytes());
    hasher.update(b"|");
    hasher.update(details.as_bytes());
    hex::encode(hasher.finalize())
}

/// Write an immutable audit log entry chained to the previous entry's checksum.
/// Each entry's checksum covers the previous entry's checksum, creating a
/// tamper-evident chain (similar to a blockchain).
pub fn write_audit_entry(
    conn: &Connection,
    action: AuditAction,
    details: &str,
) -> Result<String, DbError> {
    write_named_audit_entry(conn, action.as_str(), details)
}

/// Shared writer for connector actions as well as typed application events.
pub fn write_named_audit_entry(conn: &Connection, action_str: &str, details: &str) -> Result<String, DbError> {
    let id = Uuid::new_v4().to_string();
    let timestamp = Utc::now().to_rfc3339();

    // Get the most recent checksum to chain from
    let previous_checksum: String = conn
        .query_row(
            "SELECT checksum FROM audit_log ORDER BY timestamp DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| {
            // Genesis entry — use a known seed
            "0000000000000000000000000000000000000000000000000000000000000000".to_string()
        });

    let checksum = compute_checksum(&previous_checksum, &timestamp, action_str, details);

    conn.execute(
        "INSERT INTO audit_log (id, timestamp, action, details, checksum)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, timestamp, action_str, details, checksum],
    )?;

    tracing::debug!("Audit: {} — {}", action_str, details);
    Ok(id)
}

/// Verify the integrity of the entire audit chain.
/// Returns the number of entries verified, or an error if tampering is detected.
pub fn verify_audit_chain(conn: &Connection) -> Result<u64, String> {
    let mut stmt = conn
        .prepare("SELECT timestamp, action, details, checksum FROM audit_log ORDER BY timestamp ASC")
        .map_err(|e| format!("Failed to read audit log: {}", e))?;

    let mut previous_checksum =
        "0000000000000000000000000000000000000000000000000000000000000000".to_string();
    let mut count = 0u64;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| format!("Failed to query audit log: {}", e))?;

    for row in rows {
        let (timestamp, action, details, stored_checksum) =
            row.map_err(|e| format!("Failed to read row: {}", e))?;

        let expected = compute_checksum(&previous_checksum, &timestamp, &action, &details);

        if expected != stored_checksum {
            return Err(format!(
                "Audit chain integrity violation at entry {} (timestamp: {}). Expected checksum {} but found {}",
                count + 1, timestamp, expected, stored_checksum
            ));
        }

        previous_checksum = stored_checksum;
        count += 1;
    }

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::init_test_db(&conn);
        conn
    }

    #[test]
    fn test_write_audit_entry() {
        let conn = setup_db();
        let id = write_audit_entry(
            &conn,
            AuditAction::DatabaseInitialized,
            "Database created with SQLCipher",
        )
        .unwrap();
        assert!(!id.is_empty());

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM audit_log", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_audit_chain_integrity() {
        let conn = setup_db();

        // Write several entries
        write_audit_entry(&conn, AuditAction::DatabaseInitialized, "init").unwrap();
        write_audit_entry(&conn, AuditAction::PatientImported, "patient p001").unwrap();
        write_audit_entry(&conn, AuditAction::ScreeningExecuted, "study s001, 25 patients").unwrap();
        write_audit_entry(
            &conn,
            AuditAction::CriterionOverridden,
            "criterion sc001: met -> not_met, justification: clinical review",
        )
        .unwrap();

        // Verify chain
        let count = verify_audit_chain(&conn).unwrap();
        assert_eq!(count, 4);
    }

    #[test]
    fn test_audit_chain_detects_tampering() {
        let conn = setup_db();

        write_audit_entry(&conn, AuditAction::DatabaseInitialized, "init").unwrap();
        write_audit_entry(&conn, AuditAction::PatientImported, "patient p001").unwrap();

        // Tamper with the second entry's details
        conn.execute(
            "UPDATE audit_log SET details = 'TAMPERED' WHERE action = 'patient_imported'",
            [],
        )
        .unwrap();

        // Verification should fail
        let result = verify_audit_chain(&conn);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("integrity violation"));
    }

    #[test]
    fn test_empty_audit_chain_verifies() {
        let conn = setup_db();
        let count = verify_audit_chain(&conn).unwrap();
        assert_eq!(count, 0);
    }
}
