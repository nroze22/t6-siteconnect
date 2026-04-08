//! FHIR Bulk Data Access (Flat FHIR) — `$export` orchestration.
//!
//! Implements the async export workflow defined in
//! https://hl7.org/fhir/uv/bulkdata/export/index.html
//!
//! Three phases:
//!
//!   1. **Kickoff** — POST `<base>/$export?_type=…` (system level), or
//!      `Patient/$export`, or `Group/<id>/$export`. Server responds with
//!      `202 Accepted` and a `Content-Location` header pointing to the
//!      polling URL.
//!
//!   2. **Poll** — GET the polling URL until it returns `200 OK` with a
//!      JSON manifest. While the export is in progress, servers return
//!      `202` with an optional `X-Progress` header. We back off between
//!      polls and obey a hard timeout to avoid wedging forever.
//!
//!   3. **Download** — the manifest's `output` array lists per-resource
//!      ndjson file URLs. The caller streams each one through
//!      `crate::fhir::ndjson::stream_ndjson`.
//!
//! Cleanup (`DELETE` on the polling URL) is best-effort.
//!
//! This module is purely async / `reqwest` — it does not touch the
//! database. The Tauri command in `commands::epic` connects this to
//! the normalizer and the SQLite store.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::time::sleep;

const KICKOFF_TIMEOUT: Duration = Duration::from_secs(60);
const POLL_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const DEFAULT_POLL_INTERVAL: Duration = Duration::from_secs(3);
const MAX_POLL_INTERVAL: Duration = Duration::from_secs(30);
const TOTAL_POLL_TIMEOUT: Duration = Duration::from_secs(60 * 60); // 1 hour

/// Where to scope the export.
#[derive(Debug, Clone)]
pub enum ExportScope {
    /// `<base>/$export` — every patient the access token can see.
    System,
    /// `<base>/Patient/$export`
    Patient,
    /// `<base>/Group/<id>/$export`
    Group(String),
}

impl ExportScope {
    fn url(&self, fhir_base: &str) -> String {
        let base = fhir_base.trim_end_matches('/');
        match self {
            ExportScope::System => format!("{}/$export", base),
            ExportScope::Patient => format!("{}/Patient/$export", base),
            ExportScope::Group(id) => format!("{}/Group/{}/$export", base, id),
        }
    }
}

/// One ndjson file in the export manifest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportFile {
    #[serde(rename = "type")]
    pub resource_type: String,
    pub url: String,
    #[serde(default)]
    pub count: Option<u64>,
}

/// The complete export manifest the FHIR server returns when ready.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportManifest {
    #[serde(default)]
    pub transaction_time: Option<String>,
    #[serde(default)]
    pub request: Option<String>,
    #[serde(default)]
    pub requires_access_token: Option<bool>,
    #[serde(default)]
    pub output: Vec<ExportFile>,
    #[serde(default)]
    pub error: Vec<ExportFile>,
}

#[derive(Debug, Error)]
pub enum BulkExportError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Kickoff returned {status}: {body}")]
    Kickoff { status: u16, body: String },

    #[error("Server did not return a Content-Location header on kickoff")]
    MissingContentLocation,

    #[error("Polling status URL returned {status}: {body}")]
    Poll { status: u16, body: String },

    #[error("Failed to parse export manifest: {0}")]
    Parse(#[from] serde_json::Error),

    #[error("Export timed out after {seconds}s without completing")]
    Timeout { seconds: u64 },
}

/// Snapshot of an in-progress export, suitable for piping to UI.
#[derive(Debug, Clone, Serialize)]
pub struct ExportProgress {
    pub elapsed_seconds: u64,
    pub message: Option<String>,
}

/// Kick off an `$export` and poll until it completes, returning the
/// manifest. Calls `on_progress` after each poll so the caller can
/// surface live updates to the UI.
///
/// `bearer_token` is required — bulk export endpoints are universally
/// authenticated.
/// Kick off an `$export` and poll until it completes, returning the
/// manifest. Calls `on_progress` after each poll so the caller can
/// surface live updates to the UI.
///
/// `since`, if provided, is an ISO-8601 instant (e.g. `2026-04-07T12:00:00Z`).
/// Only resources created or modified after that timestamp are exported.
/// The first pull should pass `None`; subsequent pulls should pass the
/// `transaction_time` from the previous export's manifest.
pub async fn run_export<F>(
    fhir_base: &str,
    scope: &ExportScope,
    resource_types: &[&str],
    bearer_token: &str,
    since: Option<&str>,
    mut on_progress: F,
) -> Result<ExportManifest, BulkExportError>
where
    F: FnMut(ExportProgress),
{
    let kickoff_url = scope.url(fhir_base);
    tracing::info!("Bulk export kickoff: {}", kickoff_url);

    // ----- 1. Kickoff -----
    let kickoff_client = reqwest::Client::builder()
        .timeout(KICKOFF_TIMEOUT)
        .user_agent("TalOS-SiteConnect/0.1 (Bulk export)")
        .build()?;

    let mut kickoff_req = kickoff_client
        .get(&kickoff_url)
        .bearer_auth(bearer_token)
        .header("Accept", "application/fhir+json")
        .header("Prefer", "respond-async");

    if !resource_types.is_empty() {
        kickoff_req = kickoff_req.query(&[("_type", resource_types.join(","))]);
    }
    if let Some(since_ts) = since {
        kickoff_req = kickoff_req.query(&[("_since", since_ts)]);
    }

    let kickoff_resp = kickoff_req.send().await?;
    let kickoff_status = kickoff_resp.status();

    if kickoff_status != reqwest::StatusCode::ACCEPTED {
        let body = kickoff_resp.text().await.unwrap_or_default();
        return Err(BulkExportError::Kickoff {
            status: kickoff_status.as_u16(),
            body: body.chars().take(500).collect(),
        });
    }

    let polling_url = kickoff_resp
        .headers()
        .get(reqwest::header::CONTENT_LOCATION)
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .ok_or(BulkExportError::MissingContentLocation)?;

    tracing::info!("Bulk export polling URL: {}", polling_url);

    // ----- 2. Poll -----
    let poll_client = reqwest::Client::builder()
        .timeout(POLL_REQUEST_TIMEOUT)
        .user_agent("TalOS-SiteConnect/0.1 (Bulk export poll)")
        .build()?;

    let started_at = tokio::time::Instant::now();
    let mut interval = DEFAULT_POLL_INTERVAL;

    loop {
        if started_at.elapsed() > TOTAL_POLL_TIMEOUT {
            return Err(BulkExportError::Timeout {
                seconds: TOTAL_POLL_TIMEOUT.as_secs(),
            });
        }

        let resp = poll_client
            .get(&polling_url)
            .bearer_auth(bearer_token)
            .header("Accept", "application/json")
            .send()
            .await?;

        let status = resp.status();

        if status == reqwest::StatusCode::OK {
            let manifest: ExportManifest = resp.json().await?;
            tracing::info!(
                "Bulk export complete — {} files",
                manifest.output.len()
            );
            return Ok(manifest);
        }

        if status == reqwest::StatusCode::ACCEPTED {
            let progress_msg = resp
                .headers()
                .get("x-progress")
                .and_then(|v| v.to_str().ok())
                .map(String::from);
            on_progress(ExportProgress {
                elapsed_seconds: started_at.elapsed().as_secs(),
                message: progress_msg,
            });

            sleep(interval).await;
            // Exponential-ish backoff, capped, so we don't hammer the server.
            interval = std::cmp::min(interval * 2, MAX_POLL_INTERVAL);
            continue;
        }

        let body = resp.text().await.unwrap_or_default();
        return Err(BulkExportError::Poll {
            status: status.as_u16(),
            body: body.chars().take(500).collect(),
        });
    }
}

/// Best-effort cleanup. Per the spec we should `DELETE` the polling URL
/// when we're done downloading the files so the server can release
/// resources. Failure here is non-fatal.
pub async fn release_export(polling_url: &str, bearer_token: &str) {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(_) => return,
    };
    let _ = client
        .delete(polling_url)
        .bearer_auth(bearer_token)
        .send()
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_builds_system_url() {
        assert_eq!(
            ExportScope::System.url("https://example.org/fhir/R4/"),
            "https://example.org/fhir/R4/$export"
        );
    }

    #[test]
    fn scope_builds_patient_url() {
        assert_eq!(
            ExportScope::Patient.url("https://example.org/fhir/R4"),
            "https://example.org/fhir/R4/Patient/$export"
        );
    }

    #[test]
    fn scope_builds_group_url() {
        assert_eq!(
            ExportScope::Group("abc-123".into()).url("https://example.org/fhir/R4"),
            "https://example.org/fhir/R4/Group/abc-123/$export"
        );
    }

    #[test]
    fn parses_minimal_manifest() {
        let raw = serde_json::json!({
            "transactionTime": "2026-04-07T12:00:00Z",
            "request": "https://example.org/$export",
            "requiresAccessToken": true,
            "output": [
                { "type": "Patient", "url": "https://example.org/files/patient.ndjson", "count": 50 }
            ]
        });
        let manifest: ExportManifest = serde_json::from_value(raw).unwrap();
        assert_eq!(manifest.output.len(), 1);
        assert_eq!(manifest.output[0].resource_type, "Patient");
        assert_eq!(manifest.output[0].count, Some(50));
    }
}
