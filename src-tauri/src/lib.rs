mod commands;
mod db;
mod import;
mod screening;

use commands::{greet, get_app_status};
use commands::database::{init_database, unlock_database, check_database_exists};
use commands::import::{detect_file_format, preview_import, execute_import};
use commands::screening::{screen_patients, override_criterion, get_study_criteria};
use commands::watcher::{start_folder_watcher, stop_folder_watcher, get_watcher_status, WatcherState};
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

            // Ensure app data directory exists
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&app_data_dir).ok();

            let db_path = app_data_dir.join("siteconnect.db");
            tracing::info!("Database path: {:?}", db_path);

            // TODO: Start LLM sidecar

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
            screen_patients,
            override_criterion,
            get_study_criteria,
            start_folder_watcher,
            stop_folder_watcher,
            get_watcher_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running TalOS SiteConnect");
}
