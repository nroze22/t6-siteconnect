use std::path::Path;
use std::sync::Mutex;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

use super::DbError;

/// Type alias for the SQLCipher connection pool.
pub type DbPool = Pool<SqliteConnectionManager>;

/// Tauri-managed state wrapper for the database connection pool.
/// Uses `Mutex<Option<DbPool>>` so the pool can be lazily initialized
/// after the user provides a passphrase.
pub struct DbState(pub Mutex<Option<DbPool>>);

impl DbState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/// Create an r2d2 connection pool backed by SQLCipher.
///
/// The pool is configured to run SQLCipher pragmas on every new connection
/// and executes migrations on the first connection obtained.
pub fn init_pool(db_path: &Path, passphrase: &str) -> Result<DbPool, DbError> {
    let manager = SqliteConnectionManager::file(db_path);

    // Build the pool — r2d2_sqlite does not support connection_customizer
    // that can set pragmas, so we do it manually after pool creation.
    let pool = Pool::builder()
        .max_size(4)
        .build(manager)
        .map_err(|e| DbError::Sqlite(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_ERROR),
            Some(format!("Pool creation failed: {}", e)),
        )))?;

    // Configure every existing connection in the pool with SQLCipher pragmas.
    // For a freshly-built pool the first `get()` opens the DB file.
    let conn = pool.get().map_err(|e| DbError::Sqlite(rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_ERROR),
        Some(format!("Failed to get connection from pool: {}", e)),
    )))?;

    // Set SQLCipher encryption key
    conn.pragma_update(None, "key", passphrase)?;

    // SQLCipher configuration for strong encryption
    conn.pragma_update(None, "cipher_page_size", 4096)?;
    conn.pragma_update(None, "kdf_iter", 256000)?;

    // Verify the database is accessible (will fail if wrong passphrase on existing DB)
    conn.pragma_query_value(None, "cipher_version", |row| row.get::<_, String>(0))
        .map_err(|_| DbError::InvalidPassphrase)?;

    // Enable WAL mode for better concurrent read performance
    conn.pragma_update(None, "journal_mode", "WAL")?;

    // Run migrations on pool initialization
    super::run_migrations(&conn)?;

    tracing::info!("Database connection pool initialized successfully");
    Ok(pool)
}
