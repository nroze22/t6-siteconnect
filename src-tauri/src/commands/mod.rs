pub mod hospital;
pub mod source_extract;
pub mod demo_tools;
pub mod model_job;
pub mod rehearsal;
pub mod analytics;
pub mod database;
pub mod epic;
pub mod import;
pub mod llm;
pub mod naaccr;
pub mod ollama;
pub mod registry;
pub mod screening;
pub mod studies;
pub mod watcher;

use serde::Serialize;

#[derive(Serialize)]
pub struct AppStatus {
    pub llm_status: String,
    pub llm_model: Option<String>,
    pub database_ready: bool,
    pub patient_count: u64,
    pub study_count: u64,
    pub last_import: Option<String>,
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Welcome to TalOS SiteConnect, {}!", name)
}

#[tauri::command]
pub fn get_app_status() -> AppStatus {
    AppStatus {
        llm_status: "not_configured".to_string(),
        llm_model: None,
        database_ready: false,
        patient_count: 0,
        study_count: 0,
        last_import: None,
    }
}

pub mod docling;

mod hospital_signing;
