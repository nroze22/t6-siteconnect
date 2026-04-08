use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

use crate::db::DbState;
use crate::db::audit::{write_audit_entry, AuditAction};
use crate::registry::detection;
use crate::registry::autopopulate;
use crate::registry::validation;
use crate::registry::export;

// ─── Response Types ───

#[derive(Serialize)]
pub struct ReportableCaseResponse {
    pub id: String,
    pub patient_id: String,
    pub site_patient_id: String,
    pub detected_at: String,
    pub detection_method: String,
    pub abstract_status: String,
    pub primary_site_icdo3: Option<String>,
    pub histology_icdo3: Option<String>,
    pub behavior_code: Option<String>,
    pub grade: Option<String>,
    pub date_of_diagnosis: Option<String>,
    pub clinical_stage_group: Option<String>,
    pub pathologic_stage_group: Option<String>,
    pub treatment_surgery: String,
    pub treatment_chemo: String,
    pub treatment_immuno: String,
    pub treatment_hormone: String,
    pub completeness_score: f64,
    pub validation_error_count: u32,
    pub state_registry: Option<String>,
    pub submitted_at: Option<String>,
}

#[derive(Deserialize)]
pub struct CaseFilters {
    pub status_filter: Option<String>,
    pub search: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Deserialize)]
pub struct UpdateCaseFields {
    pub case_id: String,
    pub primary_site_icdo3: Option<String>,
    pub histology_icdo3: Option<String>,
    pub behavior_code: Option<String>,
    pub grade: Option<String>,
    pub laterality: Option<String>,
    pub date_of_diagnosis: Option<String>,
    pub diagnostic_confirmation: Option<String>,
    pub clinical_stage_group: Option<String>,
    pub pathologic_stage_group: Option<String>,
    pub abstract_status: Option<String>,
}

#[derive(Serialize)]
pub struct NaacrDashboardResponse {
    pub total_cases: u32,
    pub by_status: Vec<StatusCount>,
    pub avg_completeness: f64,
    pub cases_nearing_deadline: u32,
    pub recent_detections: u32,
}

#[derive(Serialize)]
pub struct StatusCount {
    pub status: String,
    pub count: u32,
}

// ─── Commands ───

#[tauri::command]
pub fn detect_reportable_cases(app: AppHandle) -> Result<Vec<detection::DetectedCase>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let cases = detection::detect_reportable_cases(&conn)?;

    let details = format!("cases_detected={}", cases.len());
    write_audit_entry(&conn, AuditAction::CaseDetected, &details)
        .map_err(|e| format!("Audit failed: {}", e))?;

    tracing::info!("NAACCR: detected {} new reportable cases", cases.len());
    Ok(cases)
}

#[tauri::command]
pub fn get_reportable_cases(app: AppHandle, filters: CaseFilters) -> Result<Vec<ReportableCaseResponse>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let limit = filters.limit.unwrap_or(200);

    let mut sql = String::from(
        "SELECT rc.id, rc.patient_id, p.site_patient_id, rc.detected_at, rc.detection_method,
                rc.abstract_status, rc.primary_site_icdo3, rc.histology_icdo3, rc.behavior_code,
                rc.grade, rc.date_of_diagnosis, rc.clinical_stage_group, rc.pathologic_stage_group,
                rc.treatment_surgery, rc.treatment_chemo, rc.treatment_immuno, rc.treatment_hormone,
                rc.completeness_score, rc.validation_errors, rc.state_registry, rc.submitted_at
         FROM reportable_cases rc
         JOIN patients p ON p.id = rc.patient_id
         WHERE 1=1"
    );

    if let Some(ref status) = filters.status_filter {
        if status != "all" {
            sql.push_str(&format!(" AND rc.abstract_status = '{}'", status.replace('\'', "")));
        }
    }

    sql.push_str(&format!(" ORDER BY rc.detected_at DESC LIMIT {}", limit));

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {}", e))?;

    let cases = stmt.query_map([], |row| {
        let validation_json: Option<String> = row.get(18)?;
        let error_count = validation_json
            .as_deref()
            .and_then(|j| serde_json::from_str::<Vec<serde_json::Value>>(j).ok())
            .map(|v| v.len() as u32)
            .unwrap_or(0);

        Ok(ReportableCaseResponse {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            site_patient_id: row.get(2)?,
            detected_at: row.get(3)?,
            detection_method: row.get(4)?,
            abstract_status: row.get(5)?,
            primary_site_icdo3: row.get(6)?,
            histology_icdo3: row.get(7)?,
            behavior_code: row.get(8)?,
            grade: row.get(9)?,
            date_of_diagnosis: row.get(10)?,
            clinical_stage_group: row.get(11)?,
            pathologic_stage_group: row.get(12)?,
            treatment_surgery: row.get(13)?,
            treatment_chemo: row.get(14)?,
            treatment_immuno: row.get(15)?,
            treatment_hormone: row.get(16)?,
            completeness_score: row.get(17)?,
            validation_error_count: error_count,
            state_registry: row.get(19)?,
            submitted_at: row.get(20)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    Ok(cases)
}

#[tauri::command]
pub fn update_reportable_case(app: AppHandle, fields: UpdateCaseFields) -> Result<(), String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    // Build dynamic UPDATE
    let mut sets = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    macro_rules! maybe_set {
        ($field:expr, $col:expr) => {
            if let Some(ref val) = $field {
                sets.push(format!("{} = ?{}", $col, idx));
                params.push(Box::new(val.clone()));
                idx += 1;
            }
        };
    }

    maybe_set!(fields.primary_site_icdo3, "primary_site_icdo3");
    maybe_set!(fields.histology_icdo3, "histology_icdo3");
    maybe_set!(fields.behavior_code, "behavior_code");
    maybe_set!(fields.grade, "grade");
    maybe_set!(fields.laterality, "laterality");
    maybe_set!(fields.date_of_diagnosis, "date_of_diagnosis");
    maybe_set!(fields.diagnostic_confirmation, "diagnostic_confirmation");
    maybe_set!(fields.clinical_stage_group, "clinical_stage_group");
    maybe_set!(fields.pathologic_stage_group, "pathologic_stage_group");
    maybe_set!(fields.abstract_status, "abstract_status");

    if sets.is_empty() {
        return Ok(());
    }

    sets.push(format!("updated_at = datetime('now')"));

    let sql = format!(
        "UPDATE reportable_cases SET {} WHERE id = ?{}",
        sets.join(", "),
        idx
    );
    params.push(Box::new(fields.case_id.clone()));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| format!("Failed to update case: {}", e))?;

    let details = format!("case_id={}, fields_updated={}", fields.case_id, sets.len() - 1);
    write_audit_entry(&conn, AuditAction::CaseAbstracted, &details)
        .map_err(|e| format!("Audit failed: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn autopopulate_case(app: AppHandle, case_id: String) -> Result<autopopulate::AutoPopulateResult, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    autopopulate::autopopulate_case(&conn, &case_id)
}

#[tauri::command]
pub fn validate_case(app: AppHandle, case_id: String) -> Result<Vec<validation::ValidationError>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    validation::validate_case(&conn, &case_id)
}

#[tauri::command]
pub fn export_naaccr_xml(app: AppHandle, case_ids: Vec<String>, state_code: String) -> Result<String, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let xml = export::export_cases_xml(&conn, &case_ids, &state_code)?;

    let details = format!("cases={}, state={}", case_ids.len(), state_code);
    write_audit_entry(&conn, AuditAction::NaacrXmlExported, &details)
        .map_err(|e| format!("Audit failed: {}", e))?;

    Ok(xml)
}

#[tauri::command]
pub fn get_naaccr_dashboard(app: AppHandle) -> Result<NaacrDashboardResponse, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let total_cases: u32 = conn.query_row(
        "SELECT COUNT(*) FROM reportable_cases", [], |row| row.get::<_, i64>(0)
    ).map_err(|e| format!("Query error: {}", e))? as u32;

    let mut stmt = conn.prepare(
        "SELECT abstract_status, COUNT(*) FROM reportable_cases GROUP BY abstract_status"
    ).map_err(|e| format!("Query error: {}", e))?;
    let by_status: Vec<StatusCount> = stmt.query_map([], |row| {
        Ok(StatusCount { status: row.get(0)?, count: row.get::<_, i64>(1)? as u32 })
    }).map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    let avg_completeness: f64 = conn.query_row(
        "SELECT COALESCE(AVG(completeness_score), 0.0) FROM reportable_cases",
        [], |row| row.get(0)
    ).map_err(|e| format!("Query error: {}", e))?;

    let recent_detections: u32 = conn.query_row(
        "SELECT COUNT(*) FROM reportable_cases WHERE detected_at >= datetime('now', '-7 days')",
        [], |row| row.get::<_, i64>(0)
    ).map_err(|e| format!("Query error: {}", e))? as u32;

    Ok(NaacrDashboardResponse {
        total_cases,
        by_status,
        avg_completeness,
        cases_nearing_deadline: 0, // placeholder — requires state profile deadlines
        recent_detections,
    })
}
