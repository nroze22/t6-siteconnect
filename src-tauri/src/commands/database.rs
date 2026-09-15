use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::db::audit::{write_audit_entry, AuditAction};
use crate::db::state::{init_pool, DbState};
use crate::db::seed::seed_if_empty;

/// Initialize the encrypted SQLCipher database with the given passphrase.
/// Creates the connection pool, runs migrations, and seeds default data.
#[tauri::command]
pub fn init_database(app: AppHandle, passphrase: String) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    let db_path = app_data_dir.join("siteconnect.db");
    if db_path.try_exists().map_err(|_| "Could not inspect local database storage.".to_string())? {
        return Err("A database already exists. Unlock it instead of creating new storage.".into());
    }

    let pool = init_pool(&db_path, &passphrase)
        .map_err(|e| format!("Failed to initialize database: {}", e))?;

    // Seed default study data on first run
    {
        let conn = pool.get()
            .map_err(|e| format!("Failed to get connection for seeding: {}", e))?;

        // Re-apply pragmas on this connection
        conn.pragma_update(None, "key", &passphrase)
            .map_err(|e| format!("Failed to set key on seed connection: {}", e))?;

        seed_if_empty(&conn)
            .map_err(|e| format!("Failed to seed database: {}", e))?;

        // Write genesis audit entry
        write_audit_entry(&conn, AuditAction::DatabaseInitialized, "Database created with SQLCipher AES-256")
            .map_err(|e| format!("Failed to write audit entry: {}", e))?;
    }

    // Store the pool in Tauri managed state
    let db_state = app.state::<DbState>();
    let mut lock = db_state.0.lock().map_err(|e| format!("State lock poisoned: {}", e))?;
    *lock = Some(pool);

    tracing::info!("Database initialized successfully at {:?}", db_path);
    Ok("Database initialized successfully".to_string())
}

/// Unlock an existing encrypted database with the given passphrase.
/// Opens the connection pool, verifies the passphrase, and stores it in app state.
#[tauri::command]
pub fn unlock_database(app: AppHandle, passphrase: String) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let db_path = app_data_dir.join("siteconnect.db");
    if !db_path.try_exists().map_err(|_| "Could not inspect local database storage.".to_string())? {
        return Err("Database does not exist. Please run initial setup.".to_string());
    }

    let pool = init_pool(&db_path, &passphrase)
        .map_err(|_| "Invalid passphrase. Please try again.".to_string())?;

    // Write audit entry for unlock
    {
        let conn = pool.get()
            .map_err(|e| format!("Failed to get connection for audit: {}", e))?;
        conn.pragma_update(None, "key", &passphrase)
            .map_err(|e| format!("Failed to set key: {}", e))?;
        let _ = write_audit_entry(&conn, AuditAction::DatabaseUnlocked, "Database unlocked");
    }

    // Store the pool in Tauri managed state
    let db_state = app.state::<DbState>();
    let mut lock = db_state.0.lock().map_err(|e| format!("State lock poisoned: {}", e))?;
    *lock = Some(pool);

    tracing::info!("Database unlocked successfully");
    Ok("Database unlocked successfully".to_string())
}

/// Check whether the database file already exists on disk.
#[tauri::command]
pub fn check_database_exists(app: AppHandle) -> Result<bool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let db_path: PathBuf = app_data_dir.join("siteconnect.db");
    db_path.try_exists().map_err(|_| "Could not inspect local database storage.".to_string())
}
