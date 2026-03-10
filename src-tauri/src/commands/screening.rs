use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::db::DbState;
use crate::db::audit::{write_audit_entry, AuditAction};
use crate::screening::engine::ScreeningEngine;

/// Tauri commands for the screening engine.
/// Wired to the real ScreeningEngine and database.

#[derive(Serialize)]
pub struct ScreeningResultResponse {
    pub screening_id: String,
    pub patient_id: String,
    pub study_id: String,
    pub site_patient_id: String,
    pub age: Option<u32>,
    pub gender: Option<String>,
    pub primary_diagnosis: Option<String>,
    pub overall_status: String,
    pub score: f64,
    pub inclusion_met: u32,
    pub inclusion_total: u32,
    pub exclusion_triggered: u32,
    pub exclusion_total: u32,
    pub missing_data_count: u32,
}

#[derive(Serialize)]
pub struct CriterionResultResponse {
    pub criterion_id: String,
    pub criterion_type: String,
    pub criterion_text: String,
    pub result: String,
    pub evidence: Option<String>,
    pub evidence_source: Option<String>,
    pub confidence: f64,
    pub ai_determined: bool,
}

#[derive(Deserialize)]
pub struct ScreenRequest {
    pub study_id: String,
    pub patient_ids: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub struct OverrideRequest {
    pub screening_result_id: String,
    pub criterion_id: String,
    pub new_result: String,
    pub justification: String,
}

#[tauri::command]
pub fn screen_patients(app: AppHandle, request: ScreenRequest) -> Result<Vec<ScreeningResultResponse>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    tracing::info!("Screening patients for study {}", request.study_id);

    let results = ScreeningEngine::screen_all_patients(&conn, &request.study_id)?;

    // If specific patient_ids were requested, filter to those
    let filtered = if let Some(ref ids) = request.patient_ids {
        results.into_iter().filter(|r| ids.contains(&r.patient_id)).collect()
    } else {
        results
    };

    // Map engine results to response structs
    let responses: Vec<ScreeningResultResponse> = filtered
        .into_iter()
        .map(|r| ScreeningResultResponse {
            screening_id: r.screening_id,
            patient_id: r.patient_id,
            study_id: r.study_id,
            site_patient_id: r.site_patient_id,
            age: r.age,
            gender: r.gender,
            primary_diagnosis: r.primary_diagnosis,
            overall_status: r.overall_status,
            score: r.score,
            inclusion_met: r.inclusion_met,
            inclusion_total: r.inclusion_total,
            exclusion_triggered: r.exclusion_triggered,
            exclusion_total: r.exclusion_total,
            missing_data_count: r.missing_data_count,
        })
        .collect();

    Ok(responses)
}

#[tauri::command]
pub fn override_criterion(app: AppHandle, request: OverrideRequest) -> Result<(), String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    tracing::info!(
        "Override criterion {} -> {} (justification: {})",
        request.criterion_id,
        request.new_result,
        request.justification
    );

    // Persist the override to the screening_criteria_results table
    let rows_updated = conn.execute(
        "UPDATE screening_criteria_results
         SET result = ?1, human_override = ?2, human_verified = 1
         WHERE screening_result_id = ?3 AND criterion_id = ?4",
        rusqlite::params![
            request.new_result,
            request.justification,
            request.screening_result_id,
            request.criterion_id,
        ],
    ).map_err(|e| format!("Failed to persist override: {}", e))?;

    if rows_updated == 0 {
        // No existing row -- insert the override as a new record
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO screening_criteria_results
             (id, screening_result_id, criterion_id, criterion_type, criterion_text, result, human_override, human_verified)
             VALUES (?1, ?2, ?3, '', '', ?4, ?5, 1)",
            rusqlite::params![
                id,
                request.screening_result_id,
                request.criterion_id,
                request.new_result,
                request.justification,
            ],
        ).map_err(|e| format!("Failed to insert override: {}", e))?;
    }

    // Write audit trail entry
    let audit_details = format!(
        "criterion_id={}, screening_result_id={}, new_result={}, justification={}",
        request.criterion_id,
        request.screening_result_id,
        request.new_result,
        request.justification,
    );
    write_audit_entry(&conn, AuditAction::CriterionOverridden, &audit_details)
        .map_err(|e| format!("Failed to write audit entry: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_study_criteria(app: AppHandle, study_id: String) -> Result<Vec<CriterionResultResponse>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    tracing::info!("Getting criteria for study {}", study_id);

    let mut stmt = conn.prepare(
        "SELECT id, type, criterion_text FROM study_criteria
         WHERE study_id = ?1 ORDER BY type, criterion_number"
    ).map_err(|e| format!("Query error: {}", e))?;

    let criteria = stmt.query_map([&study_id], |row| {
        Ok(CriterionResultResponse {
            criterion_id: row.get(0)?,
            criterion_type: row.get(1)?,
            criterion_text: row.get(2)?,
            result: "pending".to_string(),
            evidence: None,
            evidence_source: None,
            confidence: 0.0,
            ai_determined: false,
        })
    })
    .map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    Ok(criteria)
}
