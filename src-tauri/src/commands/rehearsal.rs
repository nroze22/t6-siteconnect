//! Durable synthetic rehearsal journal. Not a hospital identity or immutable audit service.
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
#[derive(Serialize, Deserialize)]
pub struct Snapshot {
    pub revision: i64,
    pub payload: String,
    pub digest: String,
}
fn open(app: &AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("synthetic-operations.sqlite");
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    init(&conn)?;
    Ok(conn)
}
fn init(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS snapshots(namespace TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(namespace,revision));").map_err(|e|e.to_string())
}
fn hash(namespace: &str, revision: i64, previous: &str, payload: &str) -> String {
    format!(
        "{:x}",
        Sha256::digest(format!("{namespace}\n{revision}\n{previous}\n{payload}"))
    )
}
fn read(conn: &Connection, namespace: &str) -> Result<Option<Snapshot>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT revision,payload,digest FROM snapshots WHERE namespace=? ORDER BY revision",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([namespace], |r| {
            Ok(Snapshot {
                revision: r.get(0)?,
                payload: r.get(1)?,
                digest: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut previous = String::new();
    let mut latest = None;
    let mut expected = 1;
    for row in rows {
        let row = row.map_err(|e| e.to_string())?;
        if row.revision != expected
            || hash(namespace, row.revision, &previous, &row.payload) != row.digest
        {
            return Err(
                "Local journal integrity check failed. Preserve the file and contact support."
                    .into(),
            );
        }
        expected += 1;
        previous = row.digest.clone();
        latest = Some(row);
    }
    Ok(latest)
}
fn write(
    conn: &mut Connection,
    namespace: &str,
    expected: i64,
    payload: &str,
) -> Result<Snapshot, String> {
    if payload.len() > 2_000_000 {
        return Err("Synthetic session exceeds journal size limit".into());
    }
    serde_json::from_str::<serde_json::Value>(payload).map_err(|_| "Invalid session JSON")?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let previous = read(&tx, namespace)?;
    if previous.as_ref().map(|s| s.revision).unwrap_or(0) != expected {
        return Err(
            "This session changed in another window. Reopen to load the latest saved state.".into(),
        );
    }
    let next = Snapshot {
        revision: expected + 1,
        payload: payload.into(),
        digest: hash(
            namespace,
            expected + 1,
            &previous.map(|s| s.digest).unwrap_or_default(),
            payload,
        ),
    };
    tx.execute(
        "INSERT INTO snapshots VALUES(?,?,?,?)",
        params![namespace, next.revision, next.payload, next.digest],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(next)
}
fn namespace(value: &str) -> Result<(), String> {
    if ["rehearsal", "model-setup"].contains(&value) {
        Ok(())
    } else {
        Err("Unknown synthetic journal".into())
    }
}
#[tauri::command]
pub fn read_operation(app: AppHandle, name: String) -> Result<Option<Snapshot>, String> {
    namespace(&name)?;
    read(&open(&app)?, &name)
}
#[tauri::command]
pub fn write_operation(
    app: AppHandle,
    name: String,
    revision: i64,
    payload: String,
) -> Result<Snapshot, String> {
    namespace(&name)?;
    write(&mut open(&app)?, &name, revision, &payload)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transactions_preserve_history_and_reject_stale_writers() {
        let mut db = Connection::open_in_memory().unwrap();
        init(&db).unwrap();
        write(&mut db, "rehearsal", 0, "{}").unwrap();
        assert!(write(&mut db, "rehearsal", 0, "{}").is_err());
        assert_eq!(read(&db, "rehearsal").unwrap().unwrap().revision, 1);
    }
    #[test]
    fn altered_history_blocks_recovery() {
        let mut db = Connection::open_in_memory().unwrap();
        init(&db).unwrap();
        write(&mut db, "rehearsal", 0, "{}").unwrap();
        db.execute("UPDATE snapshots SET payload='[]'", []).unwrap();
        assert!(read(&db, "rehearsal").is_err());
    }
    #[test]
    fn committed_state_survives_reopen() {
        let path = std::env::temp_dir().join(format!("journal-{}.db", uuid::Uuid::new_v4()));
        {
            let mut db = Connection::open(&path).unwrap();
            init(&db).unwrap();
            write(&mut db, "rehearsal", 0, r#"{"receipts":["accepted"]}"#).unwrap();
        }
        {
            let db = Connection::open(&path).unwrap();
            assert!(read(&db, "rehearsal")
                .unwrap()
                .unwrap()
                .payload
                .contains("accepted"));
        }
        std::fs::remove_file(path).unwrap();
    }
}
