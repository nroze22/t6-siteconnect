use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;
use uuid::Uuid;
use chrono::Utc;

use crate::db::DbState;
use crate::db::audit::{write_audit_entry, AuditAction};

// ─── Request/Response Types ───

#[derive(Deserialize)]
pub struct RegistryFilters {
    pub search: Option<String>,
    pub consent_filter: Option<String>,       // "all" | ConsentType
    pub availability_filter: Option<String>,  // "all" | RegistryAvailability
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Serialize)]
pub struct RegistryPatient {
    pub id: String,
    pub site_patient_id: String,
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,
    pub race: Option<String>,
    pub ethnicity: Option<String>,
    pub insurance_type: Option<String>,
    pub imported_at: String,
    pub last_updated: String,
    pub primary_diagnosis: Option<String>,
    pub diagnosis_count: u32,
    pub consent_status: Option<String>,       // best active consent type, or null
    pub consent_count: u32,
    pub registry_status: String,
    pub availability: String,
}

#[derive(Serialize)]
pub struct PatientDetail {
    pub patient: RegistryPatient,
    pub consents: Vec<ConsentRecord>,
    pub diagnosis_history: Vec<DiagnosisHistoryRecord>,
    pub registry_status: Option<RegistryStatusRecord>,
}

#[derive(Serialize, Clone)]
pub struct ConsentRecord {
    pub id: String,
    pub patient_id: String,
    pub consent_type: String,
    pub condition_scope: Option<String>,
    pub status: String,
    pub granted_date: String,
    pub expiry_date: Option<String>,
    pub withdrawn_date: Option<String>,
    pub withdrawal_reason: Option<String>,
    pub documented_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Serialize)]
pub struct DiagnosisHistoryRecord {
    pub id: String,
    pub diagnosis_id: String,
    pub patient_id: String,
    pub previous_status: String,
    pub new_status: String,
    pub changed_at: String,
    pub change_source: String,
}

#[derive(Serialize)]
pub struct RegistryStatusRecord {
    pub patient_id: String,
    pub registry_status: String,
    pub availability: String,
    pub washout_until: Option<String>,
    pub total_studies_participated: u32,
    pub last_study_end_date: Option<String>,
    pub max_concurrent_studies: u32,
    pub compensation_total_cents: i64,
    pub annual_compensation_limit_cents: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Deserialize)]
pub struct UpsertConsentRequest {
    pub patient_id: String,
    pub consent_type: String,
    pub condition_scope: Option<String>,
    pub granted_date: String,
    pub expiry_date: Option<String>,
    pub documented_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Deserialize)]
pub struct WithdrawConsentRequest {
    pub consent_id: String,
    pub reason: String,
}

#[derive(Deserialize)]
pub struct UpdateRegistryStatusRequest {
    pub patient_id: String,
    pub registry_status: Option<String>,
    pub availability: Option<String>,
    pub washout_until: Option<String>,
    pub notes: Option<String>,
}

#[derive(Serialize)]
pub struct RegistryDashboard {
    pub total_patients: u32,
    pub with_consent: u32,
    pub by_consent_type: Vec<ConsentTypeCount>,
    pub by_availability: Vec<AvailabilityCount>,
    pub top_conditions: Vec<ConditionCount>,
    pub recent_consents: Vec<ConsentRecord>,
}

#[derive(Serialize)]
pub struct ConsentTypeCount {
    pub consent_type: String,
    pub count: u32,
}

#[derive(Serialize)]
pub struct AvailabilityCount {
    pub availability: String,
    pub count: u32,
}

#[derive(Serialize)]
pub struct ConditionCount {
    pub icd10_prefix: String,
    pub description: String,
    pub count: u32,
}

#[derive(Serialize)]
pub struct AutoMatchNotification {
    pub id: String,
    pub patient_id: String,
    pub study_id: String,
    pub score: f64,
    pub status: String,
    pub notified_at: String,
    pub dismissed: bool,
    pub actioned: bool,
}

// ─── Commands ───

#[tauri::command]
pub fn get_registry_patients(app: AppHandle, filters: RegistryFilters) -> Result<Vec<RegistryPatient>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let limit = filters.limit.unwrap_or(500);
    let offset = filters.offset.unwrap_or(0);

    // Build query with optional search filter
    let mut sql = String::from(
        "SELECT p.id, p.site_patient_id, p.date_of_birth, p.gender, p.race, p.ethnicity,
                p.insurance_type, p.imported_at, p.last_updated,
                (SELECT d.description FROM diagnoses d WHERE d.patient_id = p.id AND d.status = 'active' LIMIT 1) as primary_diagnosis,
                (SELECT COUNT(*) FROM diagnoses d WHERE d.patient_id = p.id) as diagnosis_count,
                (SELECT pc.consent_type FROM patient_consents pc WHERE pc.patient_id = p.id AND pc.status = 'active' ORDER BY pc.granted_date DESC LIMIT 1) as consent_status,
                (SELECT COUNT(*) FROM patient_consents pc WHERE pc.patient_id = p.id AND pc.status = 'active') as consent_count,
                COALESCE(prs.registry_status, 'active') as registry_status,
                COALESCE(prs.availability, 'available') as availability
         FROM patients p
         LEFT JOIN patient_registry_status prs ON prs.patient_id = p.id
         WHERE 1=1"
    );

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref search) = filters.search {
        if !search.is_empty() {
            sql.push_str(" AND (p.site_patient_id LIKE ?1 OR p.id LIKE ?1)");
            params.push(Box::new(format!("%{}%", search)));
        }
    }

    if let Some(ref consent) = filters.consent_filter {
        if consent != "all" {
            if consent == "none" {
                sql.push_str(" AND NOT EXISTS (SELECT 1 FROM patient_consents pc WHERE pc.patient_id = p.id AND pc.status = 'active')");
            } else {
                sql.push_str(&format!(
                    " AND EXISTS (SELECT 1 FROM patient_consents pc WHERE pc.patient_id = p.id AND pc.status = 'active' AND pc.consent_type = '{}')",
                    consent.replace('\'', "")
                ));
            }
        }
    }

    if let Some(ref avail) = filters.availability_filter {
        if avail != "all" {
            sql.push_str(&format!(
                " AND COALESCE(prs.availability, 'available') = '{}'",
                avail.replace('\'', "")
            ));
        }
    }

    sql.push_str(&format!(" ORDER BY p.last_updated DESC LIMIT {} OFFSET {}", limit, offset));

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {}", e))?;

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(RegistryPatient {
            id: row.get(0)?,
            site_patient_id: row.get(1)?,
            date_of_birth: row.get(2)?,
            gender: row.get(3)?,
            race: row.get(4)?,
            ethnicity: row.get(5)?,
            insurance_type: row.get(6)?,
            imported_at: row.get(7)?,
            last_updated: row.get(8)?,
            primary_diagnosis: row.get(9)?,
            diagnosis_count: row.get::<_, i64>(10)? as u32,
            consent_status: row.get(11)?,
            consent_count: row.get::<_, i64>(12)? as u32,
            registry_status: row.get(13)?,
            availability: row.get(14)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?;

    let patients: Vec<RegistryPatient> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {}", e))?;

    Ok(patients)
}

#[tauri::command]
pub fn get_patient_detail(app: AppHandle, patient_id: String) -> Result<PatientDetail, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    // Load patient basic info
    let patient = conn.query_row(
        "SELECT p.id, p.site_patient_id, p.date_of_birth, p.gender, p.race, p.ethnicity,
                p.insurance_type, p.imported_at, p.last_updated,
                (SELECT d.description FROM diagnoses d WHERE d.patient_id = p.id AND d.status = 'active' LIMIT 1),
                (SELECT COUNT(*) FROM diagnoses d WHERE d.patient_id = p.id),
                (SELECT pc.consent_type FROM patient_consents pc WHERE pc.patient_id = p.id AND pc.status = 'active' ORDER BY pc.granted_date DESC LIMIT 1),
                (SELECT COUNT(*) FROM patient_consents pc WHERE pc.patient_id = p.id AND pc.status = 'active'),
                COALESCE(prs.registry_status, 'active'),
                COALESCE(prs.availability, 'available')
         FROM patients p
         LEFT JOIN patient_registry_status prs ON prs.patient_id = p.id
         WHERE p.id = ?1",
        [&patient_id],
        |row| {
            Ok(RegistryPatient {
                id: row.get(0)?,
                site_patient_id: row.get(1)?,
                date_of_birth: row.get(2)?,
                gender: row.get(3)?,
                race: row.get(4)?,
                ethnicity: row.get(5)?,
                insurance_type: row.get(6)?,
                imported_at: row.get(7)?,
                last_updated: row.get(8)?,
                primary_diagnosis: row.get(9)?,
                diagnosis_count: row.get::<_, i64>(10)? as u32,
                consent_status: row.get(11)?,
                consent_count: row.get::<_, i64>(12)? as u32,
                registry_status: row.get(13)?,
                availability: row.get(14)?,
            })
        },
    ).map_err(|e| format!("Patient not found: {}", e))?;

    // Load consents
    let mut stmt = conn.prepare(
        "SELECT id, patient_id, consent_type, condition_scope, status, granted_date,
                expiry_date, withdrawn_date, withdrawal_reason, documented_by, notes
         FROM patient_consents WHERE patient_id = ?1 ORDER BY granted_date DESC"
    ).map_err(|e| format!("Query error: {}", e))?;

    let consents: Vec<ConsentRecord> = stmt.query_map([&patient_id], |row| {
        Ok(ConsentRecord {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            consent_type: row.get(2)?,
            condition_scope: row.get(3)?,
            status: row.get(4)?,
            granted_date: row.get(5)?,
            expiry_date: row.get(6)?,
            withdrawn_date: row.get(7)?,
            withdrawal_reason: row.get(8)?,
            documented_by: row.get(9)?,
            notes: row.get(10)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    // Load diagnosis history
    let mut stmt = conn.prepare(
        "SELECT id, diagnosis_id, patient_id, previous_status, new_status, changed_at, change_source
         FROM diagnosis_history WHERE patient_id = ?1 ORDER BY changed_at DESC LIMIT 50"
    ).map_err(|e| format!("Query error: {}", e))?;

    let diagnosis_history: Vec<DiagnosisHistoryRecord> = stmt.query_map([&patient_id], |row| {
        Ok(DiagnosisHistoryRecord {
            id: row.get(0)?,
            diagnosis_id: row.get(1)?,
            patient_id: row.get(2)?,
            previous_status: row.get(3)?,
            new_status: row.get(4)?,
            changed_at: row.get(5)?,
            change_source: row.get(6)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    // Load registry status
    let registry_status = conn.query_row(
        "SELECT patient_id, registry_status, availability, washout_until,
                total_studies_participated, last_study_end_date, max_concurrent_studies,
                compensation_total_cents, annual_compensation_limit_cents, notes
         FROM patient_registry_status WHERE patient_id = ?1",
        [&patient_id],
        |row| {
            Ok(RegistryStatusRecord {
                patient_id: row.get(0)?,
                registry_status: row.get(1)?,
                availability: row.get(2)?,
                washout_until: row.get(3)?,
                total_studies_participated: row.get::<_, i64>(4)? as u32,
                last_study_end_date: row.get(5)?,
                max_concurrent_studies: row.get::<_, i64>(6)? as u32,
                compensation_total_cents: row.get(7)?,
                annual_compensation_limit_cents: row.get(8)?,
                notes: row.get(9)?,
            })
        },
    ).ok();

    Ok(PatientDetail {
        patient,
        consents,
        diagnosis_history,
        registry_status,
    })
}

#[tauri::command]
pub fn upsert_patient_consent(app: AppHandle, request: UpsertConsentRequest) -> Result<String, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO patient_consents (id, patient_id, consent_type, condition_scope, status, granted_date, expiry_date, documented_by, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6, ?7, ?8, ?9, ?9)",
        rusqlite::params![
            id,
            request.patient_id,
            request.consent_type,
            request.condition_scope,
            request.granted_date,
            request.expiry_date,
            request.documented_by,
            request.notes,
            now,
        ],
    ).map_err(|e| format!("Failed to insert consent: {}", e))?;

    // Ensure patient_registry_status row exists
    conn.execute(
        "INSERT OR IGNORE INTO patient_registry_status (patient_id) VALUES (?1)",
        [&request.patient_id],
    ).map_err(|e| format!("Failed to create registry status: {}", e))?;

    // Audit trail
    let details = format!(
        "patient_id={}, consent_type={}, granted_date={}",
        request.patient_id, request.consent_type, request.granted_date
    );
    write_audit_entry(&conn, AuditAction::ConsentGranted, &details)
        .map_err(|e| format!("Audit failed: {}", e))?;

    tracing::info!("Consent granted for patient {}: {}", request.patient_id, request.consent_type);
    Ok(id)
}

#[tauri::command]
pub fn withdraw_patient_consent(app: AppHandle, request: WithdrawConsentRequest) -> Result<(), String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let now = Utc::now().to_rfc3339();

    let rows = conn.execute(
        "UPDATE patient_consents SET status = 'withdrawn', withdrawn_date = ?1, withdrawal_reason = ?2, updated_at = ?1
         WHERE id = ?3 AND status = 'active'",
        rusqlite::params![now, request.reason, request.consent_id],
    ).map_err(|e| format!("Failed to withdraw consent: {}", e))?;

    if rows == 0 {
        return Err("Consent not found or already withdrawn".to_string());
    }

    // Audit trail
    let details = format!("consent_id={}, reason={}", request.consent_id, request.reason);
    write_audit_entry(&conn, AuditAction::ConsentWithdrawn, &details)
        .map_err(|e| format!("Audit failed: {}", e))?;

    tracing::info!("Consent withdrawn: {}", request.consent_id);
    Ok(())
}

#[tauri::command]
pub fn update_registry_status(app: AppHandle, request: UpdateRegistryStatusRequest) -> Result<(), String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let now = Utc::now().to_rfc3339();

    // Upsert registry status
    conn.execute(
        "INSERT INTO patient_registry_status (patient_id, registry_status, availability, washout_until, notes, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(patient_id) DO UPDATE SET
            registry_status = COALESCE(?2, registry_status),
            availability = COALESCE(?3, availability),
            washout_until = CASE WHEN ?4 IS NOT NULL THEN ?4 ELSE washout_until END,
            notes = CASE WHEN ?5 IS NOT NULL THEN ?5 ELSE notes END,
            updated_at = ?6",
        rusqlite::params![
            request.patient_id,
            request.registry_status.as_deref().unwrap_or("active"),
            request.availability.as_deref().unwrap_or("available"),
            request.washout_until,
            request.notes,
            now,
        ],
    ).map_err(|e| format!("Failed to update registry status: {}", e))?;

    let details = format!(
        "patient_id={}, status={:?}, availability={:?}",
        request.patient_id, request.registry_status, request.availability
    );
    write_audit_entry(&conn, AuditAction::RegistryStatusChanged, &details)
        .map_err(|e| format!("Audit failed: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_registry_dashboard(app: AppHandle) -> Result<RegistryDashboard, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let total_patients: u32 = conn.query_row(
        "SELECT COUNT(*) FROM patients", [], |row| row.get::<_, i64>(0)
    ).map_err(|e| format!("Query error: {}", e))? as u32;

    let with_consent: u32 = conn.query_row(
        "SELECT COUNT(DISTINCT patient_id) FROM patient_consents WHERE status = 'active'",
        [], |row| row.get::<_, i64>(0)
    ).map_err(|e| format!("Query error: {}", e))? as u32;

    // By consent type
    let mut stmt = conn.prepare(
        "SELECT consent_type, COUNT(*) FROM patient_consents WHERE status = 'active' GROUP BY consent_type ORDER BY COUNT(*) DESC"
    ).map_err(|e| format!("Query error: {}", e))?;
    let by_consent_type: Vec<ConsentTypeCount> = stmt.query_map([], |row| {
        Ok(ConsentTypeCount { consent_type: row.get(0)?, count: row.get::<_, i64>(1)? as u32 })
    }).map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    // By availability
    let mut stmt = conn.prepare(
        "SELECT COALESCE(prs.availability, 'available') as avail, COUNT(*)
         FROM patients p LEFT JOIN patient_registry_status prs ON prs.patient_id = p.id
         GROUP BY avail ORDER BY COUNT(*) DESC"
    ).map_err(|e| format!("Query error: {}", e))?;
    let by_availability: Vec<AvailabilityCount> = stmt.query_map([], |row| {
        Ok(AvailabilityCount { availability: row.get(0)?, count: row.get::<_, i64>(1)? as u32 })
    }).map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    // Top conditions
    let mut stmt = conn.prepare(
        "SELECT SUBSTR(icd10_code, 1, 3), description, COUNT(*)
         FROM diagnoses WHERE status = 'active' AND icd10_code IS NOT NULL
         GROUP BY SUBSTR(icd10_code, 1, 3) ORDER BY COUNT(*) DESC LIMIT 10"
    ).map_err(|e| format!("Query error: {}", e))?;
    let top_conditions: Vec<ConditionCount> = stmt.query_map([], |row| {
        Ok(ConditionCount {
            icd10_prefix: row.get(0)?,
            description: row.get(1)?,
            count: row.get::<_, i64>(2)? as u32,
        })
    }).map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    // Recent consents
    let mut stmt = conn.prepare(
        "SELECT id, patient_id, consent_type, condition_scope, status, granted_date,
                expiry_date, withdrawn_date, withdrawal_reason, documented_by, notes
         FROM patient_consents ORDER BY created_at DESC LIMIT 10"
    ).map_err(|e| format!("Query error: {}", e))?;
    let recent_consents: Vec<ConsentRecord> = stmt.query_map([], |row| {
        Ok(ConsentRecord {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            consent_type: row.get(2)?,
            condition_scope: row.get(3)?,
            status: row.get(4)?,
            granted_date: row.get(5)?,
            expiry_date: row.get(6)?,
            withdrawn_date: row.get(7)?,
            withdrawal_reason: row.get(8)?,
            documented_by: row.get(9)?,
            notes: row.get(10)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    Ok(RegistryDashboard {
        total_patients,
        with_consent,
        by_consent_type,
        by_availability,
        top_conditions,
        recent_consents,
    })
}

#[tauri::command]
pub fn trigger_auto_match(app: AppHandle, study_id: String) -> Result<Vec<AutoMatchNotification>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    // Screen all consented patients against the study
    use crate::screening::engine::ScreeningEngine;
    let results = ScreeningEngine::screen_all_patients(&conn, &study_id)?;

    let mut notifications = Vec::new();
    let now = Utc::now().to_rfc3339();

    for result in &results {
        // Only notify for eligible or potentially eligible
        if result.overall_status != "eligible" && result.overall_status != "potentially_eligible" {
            continue;
        }

        // Check if patient has active consent
        let has_consent: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM patient_consents WHERE patient_id = ?1 AND status = 'active')",
            [&result.patient_id],
            |row| row.get(0),
        ).unwrap_or(false);

        if !has_consent {
            continue;
        }

        // Check for existing notification
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM auto_match_notifications WHERE patient_id = ?1 AND study_id = ?2)",
            rusqlite::params![result.patient_id, study_id],
            |row| row.get(0),
        ).unwrap_or(false);

        if exists {
            continue;
        }

        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO auto_match_notifications (id, patient_id, study_id, score, status, notified_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![id, result.patient_id, study_id, result.score, result.overall_status, now],
        ).map_err(|e| format!("Failed to insert notification: {}", e))?;

        notifications.push(AutoMatchNotification {
            id: id.clone(),
            patient_id: result.patient_id.clone(),
            study_id: study_id.clone(),
            score: result.score,
            status: result.overall_status.clone(),
            notified_at: now.clone(),
            dismissed: false,
            actioned: false,
        });
    }

    // Audit
    let details = format!("study_id={}, matches_found={}", study_id, notifications.len());
    write_audit_entry(&conn, AuditAction::AutoMatchTriggered, &details)
        .map_err(|e| format!("Audit failed: {}", e))?;

    tracing::info!("Auto-match for study {}: {} notifications created", study_id, notifications.len());
    Ok(notifications)
}

#[tauri::command]
pub fn get_auto_match_notifications(app: AppHandle, study_id: Option<String>) -> Result<Vec<AutoMatchNotification>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let sql = if study_id.is_some() {
        "SELECT id, patient_id, study_id, score, status, notified_at, dismissed, actioned
         FROM auto_match_notifications WHERE study_id = ?1 AND dismissed = 0 ORDER BY score DESC"
    } else {
        "SELECT id, patient_id, study_id, score, status, notified_at, dismissed, actioned
         FROM auto_match_notifications WHERE dismissed = 0 ORDER BY notified_at DESC LIMIT 100"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| format!("Query error: {}", e))?;

    let params: Vec<Box<dyn rusqlite::types::ToSql>> = if let Some(ref sid) = study_id {
        vec![Box::new(sid.clone())]
    } else {
        vec![]
    };
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(AutoMatchNotification {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            study_id: row.get(2)?,
            score: row.get(3)?,
            status: row.get(4)?,
            notified_at: row.get(5)?,
            dismissed: row.get::<_, i64>(6)? != 0,
            actioned: row.get::<_, i64>(7)? != 0,
        })
    }).map_err(|e| format!("Query error: {}", e))?;

    let notifications: Vec<AutoMatchNotification> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {}", e))?;

    Ok(notifications)
}

#[tauri::command]
pub fn dismiss_auto_match(app: AppHandle, notification_id: String) -> Result<(), String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    conn.execute(
        "UPDATE auto_match_notifications SET dismissed = 1 WHERE id = ?1",
        [&notification_id],
    ).map_err(|e| format!("Failed to dismiss: {}", e))?;

    Ok(())
}
