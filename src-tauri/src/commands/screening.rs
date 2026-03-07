use serde::{Deserialize, Serialize};

/// Tauri commands for the screening engine.
/// These are placeholder commands that return demo data until the database is wired up.

#[derive(Serialize)]
pub struct ScreeningResultResponse {
    pub screening_id: String,
    pub patient_id: String,
    pub study_id: String,
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
pub fn screen_patients(request: ScreenRequest) -> Result<Vec<ScreeningResultResponse>, String> {
    // TODO: Wire to actual ScreeningEngine once DB connection is managed as app state
    tracing::info!("Screening patients for study {}", request.study_id);
    Ok(vec![])
}

#[tauri::command]
pub fn override_criterion(request: OverrideRequest) -> Result<(), String> {
    tracing::info!(
        "Override criterion {} -> {} (justification: {})",
        request.criterion_id,
        request.new_result,
        request.justification
    );
    // TODO: Persist override to database with audit trail
    Ok(())
}

#[tauri::command]
pub fn get_study_criteria(study_id: String) -> Result<Vec<CriterionResultResponse>, String> {
    tracing::info!("Getting criteria for study {}", study_id);
    // TODO: Load from database
    Ok(vec![])
}
