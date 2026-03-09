use serde::Serialize;
use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::db::DbState;

#[derive(Debug, Clone, Serialize)]
pub struct AnalyticsPatient {
    pub id: String,
    pub site_patient_id: String,
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,
    pub race: Option<String>,
    pub ethnicity: Option<String>,
    pub insurance_type: Option<String>,
    pub imported_at: String,
    pub diagnoses: Vec<AnalyticsDiagnosis>,
    pub medications: Vec<AnalyticsMedication>,
    pub lab_results: Vec<AnalyticsLab>,
    pub vitals: Vec<AnalyticsVital>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalyticsDiagnosis {
    pub icd10_code: Option<String>,
    pub description: String,
    pub onset_date: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalyticsMedication {
    pub drug_name: String,
    pub dose: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalyticsLab {
    pub test_name: String,
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub result_date: Option<String>,
    pub reference_range: Option<String>,
    pub abnormal_flag: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalyticsVital {
    pub measurement_type: String,
    pub value: f64,
    pub unit: String,
    pub measurement_date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalyticsStudy {
    pub id: String,
    pub nct_number: Option<String>,
    pub title: String,
    pub short_title: Option<String>,
    pub sponsor: String,
    pub phase: Option<String>,
    pub status: Option<String>,
    pub therapeutic_area: Option<String>,
    pub indication: Option<String>,
    pub estimated_per_patient_value: Option<i64>,
    pub criteria_count: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalyticsSummary {
    pub patient_count: u64,
    pub study_count: u64,
    pub total_diagnoses: u64,
    pub total_labs: u64,
    pub total_medications: u64,
    pub last_import: Option<String>,
    pub imports_count: u64,
}

fn load_diagnoses(conn: &Connection, patient_id: &str) -> Result<Vec<AnalyticsDiagnosis>, String> {
    let mut stmt = conn.prepare(
        "SELECT icd10_code, description, onset_date, status FROM diagnoses WHERE patient_id = ?1"
    ).map_err(|e| format!("Query error: {}", e))?;
    let rows = stmt.query_map([patient_id], |row| {
        Ok(AnalyticsDiagnosis {
            icd10_code: row.get(0)?,
            description: row.get(1)?,
            onset_date: row.get(2)?,
            status: row.get(3)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {}", e))
}

fn load_medications(conn: &Connection, patient_id: &str) -> Result<Vec<AnalyticsMedication>, String> {
    let mut stmt = conn.prepare(
        "SELECT drug_name, dose, status FROM medications WHERE patient_id = ?1"
    ).map_err(|e| format!("Query error: {}", e))?;
    let rows = stmt.query_map([patient_id], |row| {
        Ok(AnalyticsMedication {
            drug_name: row.get(0)?,
            dose: row.get(1)?,
            status: row.get(2)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {}", e))
}

fn load_labs(conn: &Connection, patient_id: &str) -> Result<Vec<AnalyticsLab>, String> {
    let mut stmt = conn.prepare(
        "SELECT test_name, value, unit, result_date, reference_range, abnormal_flag
         FROM lab_results WHERE patient_id = ?1 ORDER BY result_date DESC"
    ).map_err(|e| format!("Query error: {}", e))?;
    let rows = stmt.query_map([patient_id], |row| {
        Ok(AnalyticsLab {
            test_name: row.get(0)?,
            value: row.get(1)?,
            unit: row.get(2)?,
            result_date: row.get(3)?,
            reference_range: row.get(4)?,
            abnormal_flag: row.get(5)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {}", e))
}

fn load_vitals(conn: &Connection, patient_id: &str) -> Result<Vec<AnalyticsVital>, String> {
    let mut stmt = conn.prepare(
        "SELECT vital_type, value, unit, measurement_date
         FROM vitals WHERE patient_id = ?1 ORDER BY measurement_date DESC"
    ).map_err(|e| format!("Query error: {}", e))?;
    let rows = stmt.query_map([patient_id], |row| {
        Ok(AnalyticsVital {
            measurement_type: row.get(0)?,
            value: row.get(1)?,
            unit: row.get(2)?,
            measurement_date: row.get(3)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {}", e))
}

/// Get all patients with their clinical data for frontend analytics.
#[tauri::command]
pub fn get_analytics_patients(app: AppHandle) -> Result<Vec<AnalyticsPatient>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT id, site_patient_id, date_of_birth, gender, race, ethnicity, insurance_type, imported_at
         FROM patients ORDER BY imported_at DESC"
    ).map_err(|e| format!("Query error: {}", e))?;

    let patient_rows: Vec<(String, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?,
            ))
        })
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {}", e))?;

    let mut patients = Vec::with_capacity(patient_rows.len());

    for (id, site_patient_id, dob, gender, race, ethnicity, insurance, imported_at) in &patient_rows {
        patients.push(AnalyticsPatient {
            id: id.clone(),
            site_patient_id: site_patient_id.clone(),
            date_of_birth: dob.clone(),
            gender: gender.clone(),
            race: race.clone(),
            ethnicity: ethnicity.clone(),
            insurance_type: insurance.clone(),
            imported_at: imported_at.clone(),
            diagnoses: load_diagnoses(&conn, id)?,
            medications: load_medications(&conn, id)?,
            lab_results: load_labs(&conn, id)?,
            vitals: load_vitals(&conn, id)?,
        });
    }

    tracing::info!(count = patients.len(), "Loaded patients for analytics");
    Ok(patients)
}

/// Get all studies from the database.
#[tauri::command]
pub fn get_analytics_studies(app: AppHandle) -> Result<Vec<AnalyticsStudy>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT s.id, s.nct_number, s.title, s.short_title, s.sponsor, s.phase, s.status,
                s.therapeutic_area, s.indication, s.estimated_per_patient_value,
                (SELECT COUNT(*) FROM study_criteria WHERE study_id = s.id) as criteria_count
         FROM studies s ORDER BY s.title"
    ).map_err(|e| format!("Query error: {}", e))?;

    let studies = stmt.query_map([], |row| {
        Ok(AnalyticsStudy {
            id: row.get(0)?,
            nct_number: row.get(1)?,
            title: row.get(2)?,
            short_title: row.get(3)?,
            sponsor: row.get(4)?,
            phase: row.get(5)?,
            status: row.get(6)?,
            therapeutic_area: row.get(7)?,
            indication: row.get(8)?,
            estimated_per_patient_value: row.get(9)?,
            criteria_count: row.get(10)?,
        })
    })
    .map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    Ok(studies)
}

/// Get a summary of the database for the dashboard.
#[tauri::command]
pub fn get_analytics_summary(app: AppHandle) -> Result<AnalyticsSummary, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let patient_count: u64 = conn.query_row("SELECT COUNT(*) FROM patients", [], |r| r.get(0))
        .map_err(|e| format!("Query error: {}", e))?;
    let study_count: u64 = conn.query_row("SELECT COUNT(*) FROM studies", [], |r| r.get(0))
        .map_err(|e| format!("Query error: {}", e))?;
    let total_diagnoses: u64 = conn.query_row("SELECT COUNT(*) FROM diagnoses", [], |r| r.get(0))
        .map_err(|e| format!("Query error: {}", e))?;
    let total_labs: u64 = conn.query_row("SELECT COUNT(*) FROM lab_results", [], |r| r.get(0))
        .map_err(|e| format!("Query error: {}", e))?;
    let total_medications: u64 = conn.query_row("SELECT COUNT(*) FROM medications", [], |r| r.get(0))
        .map_err(|e| format!("Query error: {}", e))?;
    let imports_count: u64 = conn.query_row("SELECT COUNT(*) FROM import_log", [], |r| r.get(0))
        .map_err(|e| format!("Query error: {}", e))?;
    let last_import: Option<String> = conn.query_row(
        "SELECT imported_at FROM import_log ORDER BY imported_at DESC LIMIT 1",
        [], |r| r.get(0),
    ).ok();

    Ok(AnalyticsSummary {
        patient_count,
        study_count,
        total_diagnoses,
        total_labs,
        total_medications,
        last_import,
        imports_count,
    })
}

// --- Audit Trail ---

#[derive(Debug, Clone, Serialize)]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: String,
    pub action: String,
    pub details: Option<String>,
    pub checksum: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuditExport {
    pub entries: Vec<AuditEntry>,
    pub total_entries: u64,
    pub chain_valid: bool,
    pub chain_error: Option<String>,
    pub exported_at: String,
    pub app_version: String,
}

/// Get all audit trail entries.
#[tauri::command]
pub fn get_audit_trail(app: AppHandle) -> Result<Vec<AuditEntry>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT id, timestamp, action, details, checksum FROM audit_log ORDER BY timestamp ASC"
    ).map_err(|e| format!("Query error: {}", e))?;

    let entries = stmt.query_map([], |row| {
        Ok(AuditEntry {
            id: row.get(0)?,
            timestamp: row.get(1)?,
            action: row.get(2)?,
            details: row.get(3)?,
            checksum: row.get(4)?,
        })
    })
    .map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    Ok(entries)
}

/// Export the full audit trail as a verified package.
/// Includes chain integrity verification result.
#[tauri::command]
pub fn export_audit_trail(app: AppHandle) -> Result<AuditExport, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    // Get all entries
    let mut stmt = conn.prepare(
        "SELECT id, timestamp, action, details, checksum FROM audit_log ORDER BY timestamp ASC"
    ).map_err(|e| format!("Query error: {}", e))?;

    let entries: Vec<AuditEntry> = stmt.query_map([], |row| {
        Ok(AuditEntry {
            id: row.get(0)?,
            timestamp: row.get(1)?,
            action: row.get(2)?,
            details: row.get(3)?,
            checksum: row.get(4)?,
        })
    })
    .map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    let total_entries = entries.len() as u64;

    // Verify chain integrity
    let (chain_valid, chain_error) = match crate::db::audit::verify_audit_chain(&conn) {
        Ok(_) => (true, None),
        Err(e) => (false, Some(e)),
    };

    Ok(AuditExport {
        entries,
        total_entries,
        chain_valid,
        chain_error,
        exported_at: chrono::Utc::now().to_rfc3339(),
        app_version: "0.1.0".to_string(),
    })
}

/// Verify the audit trail chain integrity.
#[tauri::command]
pub fn verify_audit_chain_cmd(app: AppHandle) -> Result<(bool, u64), String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    match crate::db::audit::verify_audit_chain(&conn) {
        Ok(count) => Ok((true, count)),
        Err(e) => Err(e),
    }
}

/// Screen all patients against a specific study using the Rust screening engine.
#[tauri::command]
pub fn screen_patients_for_study(app: AppHandle, study_id: String) -> Result<Vec<crate::screening::engine::PatientScreeningResult>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    crate::screening::engine::ScreeningEngine::screen_all_patients(&conn, &study_id)
}
