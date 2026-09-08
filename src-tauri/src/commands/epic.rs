//! Epic / FHIR connection management — Phase 1 foundation.
//!
//! This module owns the per-site connection model only. The actual SMART
//! OAuth2 flow, JWKS keypair generation, FHIR client, and `$export` worker
//! land in `src-tauri/src/epic/` and `src-tauri/src/fhir/` in later phases.
//!
//! The shape here is intentionally complete enough that the frontend can
//! manage Epic profiles end-to-end (list, upsert, delete, mark-status)
//! without those modules existing yet, so the per-site UX surface can be
//! built and reviewed independently of the OAuth machinery.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;

use crate::db::DbState;
use crate::epic::bulk_export::{release_export, run_export, ExportScope};
use crate::epic::jwks;
use crate::epic::oauth::{backend_services_token, begin_oauth, finish_oauth, refresh_tokens, OauthRequest};
use crate::epic::secrets::{delete_tokens, load_tokens, save_tokens, StoredTokens};
use crate::fhir::ndjson::stream_ndjson;
use crate::fhir::FhirClient;
use crate::import::fhir_normalize::{
    insert_condition, insert_medication, insert_observation, resolve_subject_patient,
    upsert_patient, NormalizeStats,
};

/// One row of `epic_connections`.
///
/// `status` lifecycle: `unconfigured` → `connected` → `error`.
/// `unconfigured` is the default until the OAuth flow lands; this lets
/// the user create profiles and review them before any live calls happen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpicConnection {
    pub id: String,
    pub site_label: String,
    pub fhir_base_url: String,
    pub authorize_url: Option<String>,
    pub token_url: Option<String>,
    pub client_id: Option<String>,
    pub scopes: Option<String>,
    /// `standalone` (user-launched SMART) or `backend_services` (JWKS).
    pub auth_mode: String,
    pub jwk_thumbprint: Option<String>,
    pub jwk_public_path: Option<String>,
    pub status: String,
    pub last_tested_at: Option<String>,
    pub last_test_error: Option<String>,
    pub last_sync_at: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Input for creating or updating a connection. Omit `id` to insert,
/// supply it to update an existing row.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertEpicConnectionInput {
    pub id: Option<String>,
    pub site_label: String,
    pub fhir_base_url: String,
    pub authorize_url: Option<String>,
    pub token_url: Option<String>,
    pub client_id: Option<String>,
    pub scopes: Option<String>,
    pub auth_mode: Option<String>,
    pub notes: Option<String>,
}

// Each command opens the DB lock inline, mirroring the style used by
// `studies.rs` and `llm.rs`. Avoids dragging the pooled-connection type
// into this module's public surface.

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<EpicConnection> {
    Ok(EpicConnection {
        id: row.get(0)?,
        site_label: row.get(1)?,
        fhir_base_url: row.get(2)?,
        authorize_url: row.get(3)?,
        token_url: row.get(4)?,
        client_id: row.get(5)?,
        scopes: row.get(6)?,
        auth_mode: row.get(7)?,
        jwk_thumbprint: row.get(8)?,
        jwk_public_path: row.get(9)?,
        status: row.get(10)?,
        last_tested_at: row.get(11)?,
        last_test_error: row.get(12)?,
        last_sync_at: row.get(13)?,
        notes: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

const SELECT_COLS: &str = "id, site_label, fhir_base_url, authorize_url, token_url, client_id, \
                           scopes, auth_mode, jwk_thumbprint, jwk_public_path, status, \
                           last_tested_at, last_test_error, last_sync_at, notes, created_at, updated_at";

#[tauri::command]
pub fn list_epic_connections(app: AppHandle) -> Result<Vec<EpicConnection>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state
        .0
        .lock()
        .map_err(|e| format!("Lock poisoned: {}", e))?;
    let conn = lock
        .as_ref()
        .ok_or("Database not initialized.")?
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    let sql = format!(
        "SELECT {} FROM epic_connections ORDER BY site_label COLLATE NOCASE",
        SELECT_COLS
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare list query: {}", e))?;
    let rows = stmt
        .query_map([], map_row)
        .map_err(|e| format!("Failed to query connections: {}", e))?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("Row decode failed: {}", e))?);
    }
    Ok(out)
}

#[tauri::command]
pub fn upsert_epic_connection(
    app: AppHandle,
    input: UpsertEpicConnectionInput,
) -> Result<EpicConnection, String> {
    if input.site_label.trim().is_empty() {
        return Err("Site label is required.".to_string());
    }
    if input.fhir_base_url.trim().is_empty() {
        return Err("FHIR base URL is required.".to_string());
    }

    let db_state = app.state::<DbState>();
    let lock = db_state
        .0
        .lock()
        .map_err(|e| format!("Lock poisoned: {}", e))?;
    let conn = lock
        .as_ref()
        .ok_or("Database not initialized.")?
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    let auth_mode = input
        .auth_mode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("standalone")
        .to_string();

    let id = match input.id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(existing) => {
            conn.execute(
                "UPDATE epic_connections SET
                    site_label = ?2,
                    fhir_base_url = ?3,
                    authorize_url = ?4,
                    token_url = ?5,
                    client_id = ?6,
                    scopes = ?7,
                    auth_mode = ?8,
                    notes = ?9,
                    updated_at = datetime('now')
                 WHERE id = ?1",
                rusqlite::params![
                    existing,
                    input.site_label.trim(),
                    input.fhir_base_url.trim(),
                    input.authorize_url,
                    input.token_url,
                    input.client_id,
                    input.scopes,
                    auth_mode,
                    input.notes,
                ],
            )
            .map_err(|e| format!("Failed to update connection: {}", e))?;
            existing.to_string()
        }
        None => {
            let new_id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO epic_connections (
                    id, site_label, fhir_base_url, authorize_url, token_url,
                    client_id, scopes, auth_mode, notes
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    new_id,
                    input.site_label.trim(),
                    input.fhir_base_url.trim(),
                    input.authorize_url,
                    input.token_url,
                    input.client_id,
                    input.scopes,
                    auth_mode,
                    input.notes,
                ],
            )
            .map_err(|e| format!("Failed to insert connection: {}", e))?;
            new_id
        }
    };

    crate::db::audit::write_named_audit_entry(&conn, "epic_connection_upserted",
        &format!("connection_id={} site={}", id, input.site_label.trim()))
        .map_err(|e| format!("Audit write failed: {}", e))?;

    let sql = format!("SELECT {} FROM epic_connections WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, [&id], map_row)
        .map_err(|e| format!("Failed to reload connection: {}", e))
}

#[tauri::command]
pub fn delete_epic_connection(app: AppHandle, id: String) -> Result<(), String> {
    if id.trim().is_empty() {
        return Err("Connection id is required.".to_string());
    }

    let db_state = app.state::<DbState>();
    let lock = db_state
        .0
        .lock()
        .map_err(|e| format!("Lock poisoned: {}", e))?;
    let conn = lock
        .as_ref()
        .ok_or("Database not initialized.")?
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    let removed = conn
        .execute("DELETE FROM epic_connections WHERE id = ?1", [&id])
        .map_err(|e| format!("Failed to delete connection: {}", e))?;

    if removed == 0 {
        return Err("Connection not found.".to_string());
    }

    crate::db::audit::write_named_audit_entry(&conn, "epic_connection_deleted",
        &format!("connection_id={}", id))
        .map_err(|e| format!("Audit write failed: {}", e))?;
    Ok(())
}

/// Result of testing a connection: a live `GET /metadata` against the
/// FHIR base URL, optionally bearer-authenticated if we have stored
/// tokens. Surfaces enough capability info for the UI to display
/// "Connected to Epic R4 — supports Patient, Condition, …".
#[derive(Debug, Serialize)]
pub struct EpicConnectionTestResult {
    pub ok: bool,
    pub status: String,
    pub message: String,
    pub fhir_version: Option<String>,
    pub software: Option<String>,
    pub supported_resources: Vec<String>,
}

/// Issue a `GET /metadata` against the FHIR base. Uses any stored bearer
/// token, but the metadata endpoint is typically public so an anonymous
/// call usually succeeds and is enough to confirm reachability.
#[tauri::command]
pub async fn test_epic_connection(
    app: AppHandle,
    id: String,
) -> Result<EpicConnectionTestResult, String> {
    let conn_row = load_connection(&app, &id)?;

    // Use a stored token if we have one. Token presence is not required
    // for `/metadata` on most servers.
    let token = load_tokens(&id)
        .map_err(|e| format!("Failed to read keychain: {}", e))?
        .map(|t| t.access_token.clone());

    let mut client = FhirClient::new(&conn_row.fhir_base_url)
        .map_err(|e| format!("Invalid FHIR base URL: {}", e))?;
    if let Some(t) = token {
        client = client.with_bearer(t);
    }

    let test_result = client.metadata().await;

    let result = match test_result {
        Ok(cap) => {
            let software = match (cap.software_name.as_deref(), cap.software_version.as_deref()) {
                (Some(name), Some(version)) => Some(format!("{} {}", name, version)),
                (Some(name), None) => Some(name.to_string()),
                _ => None,
            };
            update_connection_status(
                &app,
                &id,
                "connected",
                None,
                /* clear_error */ true,
            )?;
            EpicConnectionTestResult {
                ok: true,
                status: "connected".to_string(),
                message: format!(
                    "Connected to FHIR {} ({} resources available)",
                    cap.fhir_version.as_deref().unwrap_or("R4"),
                    cap.supported_resources.len()
                ),
                fhir_version: cap.fhir_version,
                software,
                supported_resources: cap.supported_resources,
            }
        }
        Err(err) => {
            let msg = err.to_string();
            update_connection_status(
                &app,
                &id,
                "error",
                Some(&msg),
                /* clear_error */ false,
            )?;
            EpicConnectionTestResult {
                ok: false,
                status: "error".to_string(),
                message: msg,
                fhir_version: None,
                software: None,
                supported_resources: Vec::new(),
            }
        }
    };

    Ok(result)
}

/// Result of beginning the OAuth flow — the frontend gets the authorize
/// URL it should open in the system browser, plus a polling token to
/// later call `complete_epic_connection`. We do NOT return any secrets.
#[derive(Debug, Serialize)]
pub struct EpicConnectResult {
    pub authorize_url: String,
    pub redirect_uri: String,
    pub status: String,
    pub message: String,
    pub fhir_version: Option<String>,
    pub software: Option<String>,
    pub supported_resources: Vec<String>,
}

/// Run the SMART standalone-launch OAuth flow end-to-end:
///
///   1. Discover endpoints (or use overrides)
///   2. Bind a one-shot loopback listener
///   3. Open the system browser to the authorize URL
///   4. Wait for the redirect, exchange the code for tokens
///   5. Persist tokens in the OS keychain
///   6. Run a `/metadata` probe with the new bearer token to confirm
///   7. Mark the connection `connected` and return capability info
///
/// This is one Tauri command rather than a multi-step dance because the
/// loopback listener has a strict 5-minute lifetime and we want every
/// step to share the same async task.
#[tauri::command]
pub async fn connect_epic_connection(
    app: AppHandle,
    id: String,
) -> Result<EpicConnectResult, String> {
    let conn_row = load_connection(&app, &id)?;

    let client_id = conn_row
        .client_id
        .clone()
        .ok_or("This connection has no client_id yet. Add the client_id from your Epic vendor registration first.")?;

    let scopes = conn_row
        .scopes
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            "openid fhirUser launch/patient patient/*.read offline_access".to_string()
        });

    let oauth_req = OauthRequest {
        fhir_base_url: conn_row.fhir_base_url.clone(),
        client_id: client_id.clone(),
        scopes,
        authorize_url: conn_row.authorize_url.clone(),
        token_url: conn_row.token_url.clone(),
    };

    // 1–3: discover, bind, build URL.
    let progress = begin_oauth(&oauth_req)
        .await
        .map_err(|e| format!("Failed to begin OAuth: {}", e))?;
    let authorize_url = progress.authorize_url.clone();
    let redirect_uri = progress.redirect_uri.clone();

    // Open the URL in the user's default browser via the shell plugin.
    // (`shell.open` is deprecated in newer plugin-shell in favor of
    // tauri-plugin-opener, but adding another plugin solely for this
    // single call is more friction than the deprecation warning.)
    #[allow(deprecated)]
    if let Err(e) = app.shell().open(&authorize_url, None) {
        tracing::warn!("Failed to open browser automatically: {}", e);
    }

    // 4–5: wait for callback + exchange code, then persist tokens.
    let tokens = finish_oauth(progress, &client_id)
        .await
        .map_err(|e| format!("OAuth failed: {}", e))?;

    save_tokens(&id, &tokens)
        .map_err(|e| format!("Failed to store tokens: {}", e))?;

    // 6: confirm with a metadata probe using the new token.
    let mut fhir_client = FhirClient::new(&conn_row.fhir_base_url)
        .map_err(|e| format!("Invalid FHIR base URL: {}", e))?;
    fhir_client = fhir_client.with_bearer(tokens.access_token.clone());

    let cap = fhir_client
        .metadata()
        .await
        .map_err(|e| format!("Connected, but /metadata probe failed: {}", e))?;

    let software = match (cap.software_name.as_deref(), cap.software_version.as_deref()) {
        (Some(name), Some(version)) => Some(format!("{} {}", name, version)),
        (Some(name), None) => Some(name.to_string()),
        _ => None,
    };

    // 7: mark connected.
    update_connection_status(&app, &id, "connected", None, /* clear_error */ true)?;
    audit_event(
        &app,
        "epic_connection_connected",
        &format!("connection_id={}", id),
    )?;

    Ok(EpicConnectResult {
        authorize_url,
        redirect_uri,
        status: "connected".to_string(),
        message: format!(
            "Connected to FHIR {} ({} resources)",
            cap.fhir_version.as_deref().unwrap_or("R4"),
            cap.supported_resources.len()
        ),
        fhir_version: cap.fhir_version,
        software,
        supported_resources: cap.supported_resources,
    })
}

/// Clear stored tokens for a connection. The connection profile row
/// remains so the user can re-connect later without re-entering details.
#[tauri::command]
pub fn disconnect_epic_connection(app: AppHandle, id: String) -> Result<(), String> {
    delete_tokens(&id).map_err(|e| format!("Failed to clear tokens: {}", e))?;
    update_connection_status(
        &app,
        &id,
        "unconfigured",
        Some("Disconnected by user. Reconnect to resume access."),
        /* clear_error */ false,
    )?;
    audit_event(
        &app,
        "epic_connection_disconnected",
        &format!("connection_id={}", id),
    )?;
    Ok(())
}

// =============================================================================
// Internal helpers
// =============================================================================

fn load_connection(app: &AppHandle, id: &str) -> Result<EpicConnection, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state
        .0
        .lock()
        .map_err(|e| format!("Lock poisoned: {}", e))?;
    let conn = lock
        .as_ref()
        .ok_or("Database not initialized.")?
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    let sql = format!("SELECT {} FROM epic_connections WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, [id], map_row)
        .map_err(|e| format!("Connection not found: {}", e))
}

/// Update `status` + timestamps. When `clear_error` is true the
/// `last_test_error` column is wiped; otherwise the supplied error
/// message (or NULL) is stored.
fn update_connection_status(
    app: &AppHandle,
    id: &str,
    status: &str,
    error: Option<&str>,
    clear_error: bool,
) -> Result<(), String> {
    let db_state = app.state::<DbState>();
    let lock = db_state
        .0
        .lock()
        .map_err(|e| format!("Lock poisoned: {}", e))?;
    let conn = lock
        .as_ref()
        .ok_or("Database not initialized.")?
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    let stored_error: Option<&str> = if clear_error { None } else { error };

    conn.execute(
        "UPDATE epic_connections
            SET status = ?2,
                last_tested_at = datetime('now'),
                last_test_error = ?3,
                updated_at = datetime('now')
          WHERE id = ?1",
        rusqlite::params![id, status, stored_error],
    )
    .map_err(|e| format!("Failed to update connection status: {}", e))?;
    Ok(())
}

// =============================================================================
// JWKS keypair + Backend Services
// =============================================================================

/// Generate a P-256 signing keypair for this connection, store the
/// private key in the OS keychain, and return the public JWK the site
/// admin needs to upload to their Epic.
#[tauri::command]
pub fn generate_epic_keypair(
    app: AppHandle,
    id: String,
) -> Result<serde_json::Value, String> {
    let public_jwk = jwks::generate_keypair(&id)
        .map_err(|e| format!("Keypair generation failed: {}", e))?;

    // Store the kid + thumbprint on the connection row for reference.
    let db_state = app.state::<DbState>();
    let lock = db_state
        .0
        .lock()
        .map_err(|e| format!("Lock poisoned: {}", e))?;
    let conn = lock
        .as_ref()
        .ok_or("Database not initialized.")?
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let _ = conn.execute(
        "UPDATE epic_connections SET jwk_thumbprint = ?2, updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![id, public_jwk.kid],
    );
    // Reuse this connection; audit_event would re-lock the held DbState mutex.
    crate::db::audit::write_named_audit_entry(&conn, "epic_keypair_generated",
        &format!("connection_id={} kid={}", id, public_jwk.kid))
        .map_err(|e| format!("Audit write failed: {}", e))?;

    // Return as a JWKS document so the frontend can show/copy/download it.
    let doc = jwks::format_jwks_document(&public_jwk);
    serde_json::from_str(&doc)
        .map_err(|e| format!("Failed to serialize JWKS document: {}", e))
}

/// Return the existing public JWK for this connection, if one has been
/// generated. Returns `null` if no keypair exists.
#[tauri::command]
pub fn get_epic_public_jwk(id: String) -> Result<Option<serde_json::Value>, String> {
    let jwk = jwks::load_public_jwk(&id)
        .map_err(|e| format!("Failed to load JWK: {}", e))?;
    match jwk {
        Some(j) => {
            let doc = jwks::format_jwks_document(&j);
            let val = serde_json::from_str(&doc)
                .map_err(|e| format!("Serialize: {}", e))?;
            Ok(Some(val))
        }
        None => Ok(None),
    }
}

/// Authenticate using SMART Backend Services (no browser, no user).
/// Requires a keypair to have been generated and the public JWK to be
/// uploaded at the site's Epic.
#[tauri::command]
pub async fn connect_epic_backend_services(
    app: AppHandle,
    id: String,
) -> Result<EpicConnectResult, String> {
    let conn_row = load_connection(&app, &id)?;
    let client_id = conn_row
        .client_id
        .clone()
        .ok_or("client_id is required.")?;
    let scopes = conn_row
        .scopes
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "system/*.read".to_string());

    // Resolve token endpoint.
    let token_url = match conn_row.token_url.as_deref().filter(|s| !s.trim().is_empty()) {
        Some(url) => url.to_string(),
        None => {
            let cfg = crate::epic::discovery::fetch_smart_configuration(&conn_row.fhir_base_url)
                .await
                .map_err(|e| format!("Discovery failed: {}", e))?;
            cfg.token_endpoint
        }
    };

    let tokens = backend_services_token(&id, &client_id, &token_url, &scopes)
        .await
        .map_err(|e| format!("Backend services auth failed: {}", e))?;

    save_tokens(&id, &tokens)
        .map_err(|e| format!("Failed to store tokens: {}", e))?;

    // Verify with /metadata.
    let mut fhir_client = FhirClient::new(&conn_row.fhir_base_url)
        .map_err(|e| format!("Invalid FHIR base: {}", e))?;
    fhir_client = fhir_client.with_bearer(tokens.access_token.clone());

    let cap = fhir_client
        .metadata()
        .await
        .map_err(|e| format!("Connected, but metadata probe failed: {}", e))?;

    let software = match (cap.software_name.as_deref(), cap.software_version.as_deref()) {
        (Some(n), Some(v)) => Some(format!("{} {}", n, v)),
        (Some(n), None) => Some(n.to_string()),
        _ => None,
    };

    // Store token URL if it was discovered (so token refresh works later).
    if conn_row.token_url.is_none() {
        let _ = (|| -> Result<(), String> {
            let db_state = app.state::<DbState>();
            let lock = db_state.0.lock().map_err(|e| e.to_string())?;
            let pool = lock.as_ref().ok_or("no db")?;
            let db = pool.get().map_err(|e| e.to_string())?;
            db.execute(
                "UPDATE epic_connections SET token_url = ?2, updated_at = datetime('now') WHERE id = ?1",
                rusqlite::params![id, token_url],
            ).map_err(|e| e.to_string())?;
            Ok(())
        })();
    }

    update_connection_status(&app, &id, "connected", None, true)?;
    audit_event(
        &app,
        "epic_backend_services_connected",
        &format!("connection_id={}", id),
    )?;

    Ok(EpicConnectResult {
        authorize_url: String::new(),
        redirect_uri: String::new(),
        status: "connected".to_string(),
        message: format!(
            "Backend Services authenticated — FHIR {} ({} resources)",
            cap.fhir_version.as_deref().unwrap_or("R4"),
            cap.supported_resources.len()
        ),
        fhir_version: cap.fhir_version,
        software,
        supported_resources: cap.supported_resources,
    })
}

// =============================================================================
// Cohort pull (Bulk Data $export)
// =============================================================================

const DEFAULT_EXPORT_TYPES: &[&str] = &[
    "Patient",
    "Condition",
    "Observation",
    "MedicationRequest",
];

#[derive(Debug, Clone, Deserialize)]
pub struct CohortPullInput {
    pub connection_id: String,
    /// `system`, `patient`, or `group`. Defaults to `patient` (the most
    /// universally supported scope across Epic instances).
    #[serde(default)]
    pub scope: Option<String>,
    /// Required when `scope == "group"`.
    #[serde(default)]
    pub group_id: Option<String>,
    /// Optional resource type filter; defaults to the screening set.
    #[serde(default)]
    pub resource_types: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct CohortPullSummary {
    pub connection_id: String,
    pub patients_inserted: u32,
    pub patients_updated: u32,
    pub diagnoses_inserted: u32,
    pub medications_inserted: u32,
    pub labs_inserted: u32,
    pub vitals_inserted: u32,
    pub skipped: u32,
    pub elapsed_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CohortPullProgress {
    pub connection_id: String,
    pub phase: String,
    pub message: String,
    pub elapsed_seconds: u64,
    #[serde(default)]
    pub stats: Option<CohortPullPartial>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CohortPullPartial {
    pub patients: u32,
    pub diagnoses: u32,
    pub medications: u32,
    pub labs: u32,
    pub vitals: u32,
}

impl From<&NormalizeStats> for CohortPullPartial {
    fn from(s: &NormalizeStats) -> Self {
        Self {
            patients: s.patients_inserted + s.patients_updated,
            diagnoses: s.diagnoses_inserted,
            medications: s.medications_inserted,
            labs: s.labs_inserted,
            vitals: s.vitals_inserted,
        }
    }
}

const PROGRESS_EVENT: &str = "epic://cohort-pull/progress";

fn emit_progress(app: &AppHandle, progress: CohortPullProgress) {
    if let Err(e) = app.emit(PROGRESS_EVENT, &progress) {
        tracing::warn!("Failed to emit cohort pull progress: {}", e);
    }
}

/// Run a Bulk Data `$export` against a connected Epic instance and
/// import the resulting ndjson files into the local database.
///
/// The flow:
///   1. Load the connection profile + access token (refresh if expired)
///   2. Kick off `$export` and poll until the manifest is ready,
///      emitting `epic://cohort-pull/progress` events while we wait
///   3. For each manifest file, stream it line-by-line through the
///      normalizer in a single SQL transaction (one tx per file so a
///      failure in one resource type doesn't roll back the others)
///   4. Best-effort `DELETE` the polling URL to release server resources
///   5. Update `epic_connections.last_sync_at` and write an audit row
#[tauri::command]
pub async fn pull_epic_cohort(
    app: AppHandle,
    input: CohortPullInput,
) -> Result<CohortPullSummary, String> {
    let started = std::time::Instant::now();
    let connection_id = input.connection_id.clone();
    let conn_row = load_connection(&app, &connection_id)?;

    let resource_types: Vec<&str> = match &input.resource_types {
        Some(list) if !list.is_empty() => list.iter().map(String::as_str).collect(),
        _ => DEFAULT_EXPORT_TYPES.to_vec(),
    };

    let scope = match input.scope.as_deref() {
        Some("system") => ExportScope::System,
        Some("group") => {
            let id = input
                .group_id
                .as_deref()
                .ok_or("group_id is required when scope=group")?;
            ExportScope::Group(id.to_string())
        }
        _ => ExportScope::Patient,
    };

    // ----- 1. Token (refresh if needed) -----
    let token = ensure_valid_token(&app, &conn_row).await?;

    emit_progress(
        &app,
        CohortPullProgress {
            connection_id: connection_id.clone(),
            phase: "kickoff".into(),
            message: "Asking Epic to start the export…".into(),
            elapsed_seconds: started.elapsed().as_secs(),
            stats: None,
        },
    );

    // Use the previous sync timestamp for incremental pulls.
    let since = conn_row.last_sync_at.as_deref();

    // ----- 2. Run export -----
    let progress_app = app.clone();
    let progress_id = connection_id.clone();
    let manifest = run_export(
        &conn_row.fhir_base_url,
        &scope,
        &resource_types,
        &token.access_token,
        since,
        move |snap| {
            emit_progress(
                &progress_app,
                CohortPullProgress {
                    connection_id: progress_id.clone(),
                    phase: "polling".into(),
                    message: snap.message.unwrap_or_else(|| "Export in progress…".into()),
                    elapsed_seconds: snap.elapsed_seconds,
                    stats: None,
                },
            );
        },
    )
    .await
    .map_err(|e| format!("Export failed: {}", e))?;

    // ----- 3. Download + normalize -----
    let download_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .user_agent("TalOS-SiteConnect/0.1 (Bulk download)")
        .build()
        .map_err(|e| format!("HTTP client build failed: {}", e))?;

    let mut total_stats = NormalizeStats::default();

    // Process Patient files first so foreign-key resolution works for
    // the rest. Manifest files are unordered in general.
    let (patient_files, other_files): (Vec<_>, Vec<_>) = manifest
        .output
        .iter()
        .partition(|f| f.resource_type == "Patient");

    for file in patient_files.iter().chain(other_files.iter()) {
        emit_progress(
            &app,
            CohortPullProgress {
                connection_id: connection_id.clone(),
                phase: "importing".into(),
                message: format!("Importing {}…", file.resource_type),
                elapsed_seconds: started.elapsed().as_secs(),
                stats: Some(CohortPullPartial::from(&total_stats)),
            },
        );

        let file_stats = process_export_file(
            &app,
            &download_client,
            file.resource_type.as_str(),
            &file.url,
            &token.access_token,
        )
        .await
        .map_err(|e| format!("Failed to import {}: {}", file.resource_type, e))?;

        total_stats.merge(&file_stats);
    }

    // ----- 4. Release export (best effort) -----
    if let Some(req) = manifest.request.as_deref() {
        // The polling URL is what we want to DELETE; the spec stores
        // the kickoff URL in `request`, so we use it as the polling URL
        // when no separate one is exposed. (Most servers accept either.)
        release_export(req, &token.access_token).await;
    }

    // ----- 5. Persist sync timestamp + audit -----
    update_last_sync(&app, &connection_id)?;
    audit_event(
        &app,
        "epic_cohort_pulled",
        &format!(
            "connection_id={} patients={} diagnoses={} meds={} labs={} vitals={} skipped={}",
            connection_id,
            total_stats.patients_inserted + total_stats.patients_updated,
            total_stats.diagnoses_inserted,
            total_stats.medications_inserted,
            total_stats.labs_inserted,
            total_stats.vitals_inserted,
            total_stats.skipped,
        ),
    )?;

    let summary = CohortPullSummary {
        connection_id: connection_id.clone(),
        patients_inserted: total_stats.patients_inserted,
        patients_updated: total_stats.patients_updated,
        diagnoses_inserted: total_stats.diagnoses_inserted,
        medications_inserted: total_stats.medications_inserted,
        labs_inserted: total_stats.labs_inserted,
        vitals_inserted: total_stats.vitals_inserted,
        skipped: total_stats.skipped,
        elapsed_seconds: started.elapsed().as_secs(),
    };

    emit_progress(
        &app,
        CohortPullProgress {
            connection_id,
            phase: "done".into(),
            message: format!(
                "Imported {} patients, {} diagnoses, {} meds, {} labs",
                summary.patients_inserted + summary.patients_updated,
                summary.diagnoses_inserted,
                summary.medications_inserted,
                summary.labs_inserted,
            ),
            elapsed_seconds: summary.elapsed_seconds,
            stats: Some(CohortPullPartial::from(&total_stats)),
        },
    );

    Ok(summary)
}

/// Stream one ndjson file into the database in a single transaction.
async fn process_export_file(
    app: &AppHandle,
    http: &reqwest::Client,
    resource_type: &str,
    url: &str,
    bearer_token: &str,
) -> Result<NormalizeStats, String> {
    // Buffer parsed resources so we can hold the DB lock briefly and
    // do all inserts in one transaction. For very large files this
    // means peak memory == one resource type's worth, which is fine.
    let mut buffered: Vec<serde_json::Value> = Vec::new();
    stream_ndjson(http, url, Some(bearer_token), |value| {
        buffered.push(value);
    })
    .await
    .map_err(|e| format!("Stream failed: {}", e))?;

    let db_state = app.state::<DbState>();
    let lock = db_state
        .0
        .lock()
        .map_err(|e| format!("Lock poisoned: {}", e))?;
    let conn = lock
        .as_ref()
        .ok_or("Database not initialized.")?
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    conn.execute_batch("BEGIN TRANSACTION")
        .map_err(|e| format!("Begin tx: {}", e))?;

    let mut stats = NormalizeStats::default();
    for resource in &buffered {
        match resource_type {
            "Patient" => {
                let _ = upsert_patient(&conn, resource, &mut stats);
            }
            "Condition" => {
                if let Some(pid) = resolve_subject_patient(&conn, resource) {
                    insert_condition(&conn, &pid, resource, &mut stats);
                } else {
                    stats.skipped += 1;
                }
            }
            "MedicationRequest" | "MedicationStatement" => {
                if let Some(pid) = resolve_subject_patient(&conn, resource) {
                    insert_medication(&conn, &pid, resource, &mut stats);
                } else {
                    stats.skipped += 1;
                }
            }
            "Observation" => {
                if let Some(pid) = resolve_subject_patient(&conn, resource) {
                    insert_observation(&conn, &pid, resource, &mut stats);
                } else {
                    stats.skipped += 1;
                }
            }
            other => {
                tracing::debug!("Ignoring unsupported resource type: {}", other);
                stats.skipped += 1;
            }
        }
    }

    conn.execute_batch("COMMIT")
        .map_err(|e| format!("Commit tx: {}", e))?;

    Ok(stats)
}

/// Load the stored token for a connection, transparently refreshing it
/// if it has expired (and we have a refresh_token to do so).
async fn ensure_valid_token(
    app: &AppHandle,
    conn_row: &EpicConnection,
) -> Result<StoredTokens, String> {
    let mut tokens = load_tokens(&conn_row.id)
        .map_err(|e| format!("Failed to read keychain: {}", e))?
        .ok_or("Not connected to Epic. Click Connect on this profile first.")?;

    let now = chrono::Utc::now().timestamp();
    if !tokens.is_expired(now) {
        return Ok(tokens);
    }

    let refresh = tokens
        .refresh_token
        .clone()
        .ok_or("Access token expired and no refresh_token available — please reconnect.")?;
    let token_url = conn_row
        .token_url
        .clone()
        .ok_or("Token endpoint missing — reconnect to discover it.")?;
    let client_id = conn_row
        .client_id
        .clone()
        .ok_or("client_id missing on this connection.")?;

    tracing::info!("Refreshing access token for connection {}", conn_row.id);
    let refreshed = refresh_tokens(&token_url, &client_id, &refresh)
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    save_tokens(&conn_row.id, &refreshed)
        .map_err(|e| format!("Failed to persist refreshed tokens: {}", e))?;
    tokens = refreshed;
    Ok(tokens)
}

fn update_last_sync(app: &AppHandle, id: &str) -> Result<(), String> {
    let db_state = app.state::<DbState>();
    let lock = db_state
        .0
        .lock()
        .map_err(|e| format!("Lock poisoned: {}", e))?;
    let conn = lock
        .as_ref()
        .ok_or("Database not initialized.")?
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    conn.execute(
        "UPDATE epic_connections SET last_sync_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        [id],
    )
    .map_err(|e| format!("Failed to update last_sync: {}", e))?;
    Ok(())
}

fn audit_event(app: &AppHandle, action: &str, details: &str) -> Result<(), String> {
    let db_state = app.state::<DbState>();
    let lock = db_state
        .0
        .lock()
        .map_err(|e| format!("Lock poisoned: {}", e))?;
    let conn = lock
        .as_ref()
        .ok_or("Database not initialized.")?
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    crate::db::audit::write_named_audit_entry(&conn, action, details)
        .map_err(|e| format!("Required audit write failed: {}", e))?;
    Ok(())
}
