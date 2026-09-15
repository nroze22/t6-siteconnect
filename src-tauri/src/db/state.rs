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
    let key = zeroize::Zeroizing::new(passphrase.to_owned());
    let manager = SqliteConnectionManager::file(db_path).with_init(move |conn| {
        conn.pragma_update(None, "key", key.as_str())?;
        conn.pragma_update(None, "cipher_page_size", 4096)?;
        conn.pragma_update(None, "kdf_iter", 256000)?;
        conn.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get::<_, i64>(0))?;
        Ok(())
    });

    // Every initial and replacement connection is keyed by the manager.
    let pool = Pool::builder()
        .max_size(4)
        .build(manager)
        .map_err(|e| DbError::Sqlite(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_ERROR),
            Some(format!("Pool creation failed: {}", e)),
        )))?;

    // Migrate once, after all connections can open the protected database.
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_pool_connection_can_read_encrypted_database_after_reopen() {
        let path = std::env::temp_dir().join(format!("siteconnect-pool-{}.db", uuid::Uuid::new_v4()));
        {
            let pool = init_pool(&path, "synthetic-test-key").unwrap();
            let connections: Vec<_> = (0..4).map(|_| pool.get().unwrap()).collect();
            for conn in &connections {
                let count: i64 = conn.query_row("SELECT count(*) FROM patients", [], |r| r.get(0)).unwrap();
                assert_eq!(count, 0);
            }
        }
        {
            let pool = init_pool(&path, "synthetic-test-key").unwrap();
            let connections: Vec<_> = (0..4).map(|_| pool.get().unwrap()).collect();
            for conn in &connections {
                let _: i64 = conn.query_row("SELECT count(*) FROM patients", [], |r| r.get(0)).unwrap();
            }
        }
        let raw = rusqlite::Connection::open(&path).unwrap();
        assert!(raw.query_row("SELECT count(*) FROM patients", [], |r| r.get::<_, i64>(0)).is_err());
        drop(raw);
        let _ = std::fs::remove_file(path);
    }
}
