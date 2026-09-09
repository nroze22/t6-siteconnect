mod commands;
mod db;
mod epic;
mod fhir;
mod import;
mod registry;
mod screening;

use commands::{greet, get_app_status};
use commands::database::{init_database, unlock_database, check_database_exists};
use commands::import::{detect_file_format, preview_import, execute_import, validate_import, check_duplicate_import, adjust_column_mapping, get_available_target_fields, save_import_profile, list_import_profiles, delete_import_profile, use_import_profile};
use commands::screening::{screen_patients, screen_patients_multi, override_criterion, get_study_criteria};
use commands::registry::{get_registry_patients, get_patient_detail, upsert_patient_consent, withdraw_patient_consent, update_registry_status, get_registry_dashboard, trigger_auto_match, get_auto_match_notifications, dismiss_auto_match};
use commands::naaccr::{detect_reportable_cases, get_reportable_cases, update_reportable_case, autopopulate_case, validate_case, export_naaccr_xml, get_naaccr_dashboard};
use commands::watcher::{start_folder_watcher, stop_folder_watcher, get_watcher_status, WatcherState};
use commands::analytics::{get_analytics_patients, get_analytics_studies, get_analytics_summary, screen_patients_for_study, get_audit_trail, export_audit_trail, verify_audit_chain_cmd};
use commands::llm::{get_llm_status, check_llm_health, evaluate_criterion_with_llm, chat_with_llm, parse_clinical_notes, generate_ai_insight, import_extracted_patients, LlmState};
use commands::ollama::{check_ollama_status, get_ollama_models, install_ollama, start_ollama, pull_ollama_model, detect_system_hardware, configure_ollama_backend, test_ollama_inference};
use commands::studies::{parse_protocol_text, create_custom_study, infer_structured_rules};
use commands::epic::{list_epic_connections, upsert_epic_connection, delete_epic_connection, test_epic_connection, connect_epic_connection, disconnect_epic_connection, pull_epic_cohort, generate_epic_keypair, get_epic_public_jwk, connect_epic_backend_services};
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
            commands::rehearsal::read_operation,
            commands::rehearsal::write_operation,
            commands::model_job::get_model_job,
            commands::model_job::start_model_job,
            commands::model_job::cancel_model_job,
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
            screen_patients_multi,
            override_criterion,
            get_study_criteria,
            start_folder_watcher,
            stop_folder_watcher,
            get_watcher_status,
            // Registry
            get_registry_patients,
            get_patient_detail,
            upsert_patient_consent,
            withdraw_patient_consent,
            update_registry_status,
            get_registry_dashboard,
            trigger_auto_match,
            get_auto_match_notifications,
            dismiss_auto_match,
            // NAACCR
            detect_reportable_cases,
            get_reportable_cases,
            update_reportable_case,
            autopopulate_case,
            validate_case,
            export_naaccr_xml,
            get_naaccr_dashboard,
            // Analytics
            get_analytics_patients,
            get_analytics_studies,
            get_analytics_summary,
            screen_patients_for_study,
            get_audit_trail,
            export_audit_trail,
            verify_audit_chain_cmd,
            // LLM (Ollama)
            get_llm_status,
            check_llm_health,
            evaluate_criterion_with_llm,
            chat_with_llm,
            parse_clinical_notes,
            commands::demo_tools::extract_demo_note,
            commands::demo_tools::check_demo_export,
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
            // Custom studies
            parse_protocol_text,
            create_custom_study,
            infer_structured_rules,
            // Epic / FHIR connection profiles
            list_epic_connections,
            upsert_epic_connection,
            delete_epic_connection,
            test_epic_connection,
            connect_epic_connection,
            disconnect_epic_connection,
            pull_epic_cohort,
            generate_epic_keypair,
            get_epic_public_jwk,
            connect_epic_backend_services,
        ])
        .run(tauri::generate_context!())
        .expect("error while running TalOS SiteConnect");
}
