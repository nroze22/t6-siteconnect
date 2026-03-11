mod commands;
mod db;
mod import;
mod screening;

use commands::{greet, get_app_status};
use commands::database::{init_database, unlock_database, check_database_exists};
use commands::import::{detect_file_format, preview_import, execute_import, validate_import, check_duplicate_import, adjust_column_mapping, get_available_target_fields, save_import_profile, list_import_profiles, delete_import_profile, use_import_profile};
use commands::screening::{screen_patients, override_criterion, get_study_criteria};
use commands::watcher::{start_folder_watcher, stop_folder_watcher, get_watcher_status, WatcherState};
use commands::analytics::{get_analytics_patients, get_analytics_studies, get_analytics_summary, screen_patients_for_study, get_audit_trail, export_audit_trail, verify_audit_chain_cmd};
use commands::llm::{get_llm_status, set_llm_model, start_llm_server, stop_llm_server, check_llm_health, evaluate_criterion_with_llm, pick_llm_model, chat_with_llm, parse_clinical_notes, generate_ai_insight, import_extracted_patients, LlmState};
use commands::ollama::{check_ollama_status, get_ollama_models, install_ollama, start_ollama, pull_ollama_model, detect_system_hardware, configure_ollama_backend, test_ollama_inference};
use db::DbState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            tracing::info!("TalOS SiteConnect starting up");

            // Initialize database state (pool created later when passphrase provided)
            app.manage(DbState::new());

            // Initialize folder watcher state
            app.manage(WatcherState::new());

            // Initialize LLM sidecar state
            app.manage(LlmState::new());

            // Ensure app data directory exists
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data directory: {e}"))?;
            std::fs::create_dir_all(&app_data_dir).ok();

            // Create models directory for GGUF files
            std::fs::create_dir_all(app_data_dir.join("models")).ok();

            let db_path = app_data_dir.join("siteconnect.db");
            tracing::info!("Database path: {:?}", db_path);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_status,
            init_database,
            unlock_database,
            check_database_exists,
            detect_file_format,
            preview_import,
            execute_import,
            validate_import,
            check_duplicate_import,
            adjust_column_mapping,
            get_available_target_fields,
            save_import_profile,
            list_import_profiles,
            delete_import_profile,
            use_import_profile,
            screen_patients,
            override_criterion,
            get_study_criteria,
            start_folder_watcher,
            stop_folder_watcher,
            get_watcher_status,
            // Analytics
            get_analytics_patients,
            get_analytics_studies,
            get_analytics_summary,
            screen_patients_for_study,
            get_audit_trail,
            export_audit_trail,
            verify_audit_chain_cmd,
            // LLM
            get_llm_status,
            set_llm_model,
            start_llm_server,
            stop_llm_server,
            check_llm_health,
            evaluate_criterion_with_llm,
            pick_llm_model,
            chat_with_llm,
            parse_clinical_notes,
            generate_ai_insight,
            import_extracted_patients,
            // Ollama
            check_ollama_status,
            get_ollama_models,
            install_ollama,
            start_ollama,
            pull_ollama_model,
            detect_system_hardware,
            configure_ollama_backend,
            test_ollama_inference,
        ])
        .run(tauri::generate_context!())
        .expect("error while running TalOS SiteConnect");
}
