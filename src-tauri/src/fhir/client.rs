//! Minimal authenticated FHIR R4 HTTP client.
//!
//! Designed to be small, predictable, and easy to extend. Every request
//! goes through `request_json` which centralizes:
//!   * the `Authorization: Bearer …` header (when a token is set)
//!   * the standard FHIR `Accept: application/fhir+json` header
//!   * a single retry on connection errors and `5xx` responses
//!   * timeout enforcement
//!
//! All errors flow through `FhirError`, which the calling Tauri command
//! converts into a user-facing string.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use thiserror::Error;

const ACCEPT_FHIR_JSON: &str = "application/fhir+json";
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Error)]
pub enum FhirError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("FHIR server returned {status}: {body}")]
    Server { status: u16, body: String },

    #[error("Failed to parse FHIR response: {0}")]
    Parse(#[from] serde_json::Error),

    #[error("Invalid base URL: {0}")]
    InvalidUrl(String),
}

/// A slim view of a FHIR `CapabilityStatement` — only the fields we
/// actually surface to the user. The full resource is enormous; we
/// deliberately ignore everything we don't display.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CapabilityStatement {
    pub fhir_version: Option<String>,
    pub software_name: Option<String>,
    pub software_version: Option<String>,
    pub publisher: Option<String>,
    pub supported_resources: Vec<String>,
}

/// Authenticated FHIR R4 client. Holds a base URL and an optional bearer
/// token. Cloning is cheap (Arc-backed `reqwest::Client` internally).
#[derive(Debug, Clone)]
pub struct FhirClient {
    base_url: String,
    bearer_token: Option<String>,
    http: reqwest::Client,
}

impl FhirClient {
    pub fn new(base_url: impl Into<String>) -> Result<Self, FhirError> {
        let base_url = normalize_base_url(base_url.into())?;
        let http = reqwest::Client::builder()
            .timeout(DEFAULT_TIMEOUT)
            .user_agent("TalOS-SiteConnect/0.1 (FHIR R4)")
            .build()
            .map_err(FhirError::Http)?;
        Ok(Self {
            base_url,
            bearer_token: None,
            http,
        })
    }

    pub fn with_bearer(mut self, token: impl Into<String>) -> Self {
        self.bearer_token = Some(token.into());
        self
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Fetch the server's `CapabilityStatement`. Used by `test_epic_connection`
    /// to confirm we can reach the server and read what it supports.
    pub async fn metadata(&self) -> Result<CapabilityStatement, FhirError> {
        let url = format!("{}/metadata", self.base_url);
        let raw: serde_json::Value = self.request_json(&url).await?;
        Ok(parse_capability_statement(&raw))
    }

    /// Read a single resource by id, e.g. `Patient/123`.
    #[allow(dead_code)]
    pub async fn read(
        &self,
        resource_type: &str,
        id: &str,
    ) -> Result<serde_json::Value, FhirError> {
        let url = format!("{}/{}/{}", self.base_url, resource_type, id);
        self.request_json(&url).await
    }

    /// Search a resource type with the given query parameters.
    /// Returns the raw `Bundle` JSON for the caller to walk.
    #[allow(dead_code)]
    pub async fn search(
        &self,
        resource_type: &str,
        params: &[(&str, &str)],
    ) -> Result<serde_json::Value, FhirError> {
        let url = format!("{}/{}", self.base_url, resource_type);
        let mut req = self.http.get(&url).header(reqwest::header::ACCEPT, ACCEPT_FHIR_JSON);
        if let Some(token) = &self.bearer_token {
            req = req.bearer_auth(token);
        }
        if !params.is_empty() {
            req = req.query(params);
        }
        let resp = req.send().await?;
        self.handle_json(resp).await
    }

    // ----- internals -----

    async fn request_json(&self, url: &str) -> Result<serde_json::Value, FhirError> {
        // One retry on transient failures (network blip / 5xx).
        match self.try_request_json(url).await {
            Ok(v) => Ok(v),
            Err(FhirError::Http(_)) | Err(FhirError::Server { status: 500..=599, .. }) => {
                tracing::debug!("FHIR retry after transient error: {}", url);
                self.try_request_json(url).await
            }
            Err(other) => Err(other),
        }
    }

    async fn try_request_json(&self, url: &str) -> Result<serde_json::Value, FhirError> {
        let mut req = self
            .http
            .get(url)
            .header(reqwest::header::ACCEPT, ACCEPT_FHIR_JSON);
        if let Some(token) = &self.bearer_token {
            req = req.bearer_auth(token);
        }
        let resp = req.send().await?;
        self.handle_json(resp).await
    }

    async fn handle_json(
        &self,
        resp: reqwest::Response,
    ) -> Result<serde_json::Value, FhirError> {
        let status = resp.status();
        if status.is_success() {
            let value = resp.json::<serde_json::Value>().await?;
            Ok(value)
        } else {
            let body = resp.text().await.unwrap_or_default();
            Err(FhirError::Server {
                status: status.as_u16(),
                body: body.chars().take(500).collect(),
            })
        }
    }
}

fn normalize_base_url(url: String) -> Result<String, FhirError> {
    let trimmed = url.trim().trim_end_matches('/').to_string();
    if trimmed.is_empty() {
        return Err(FhirError::InvalidUrl("base URL is empty".to_string()));
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err(FhirError::InvalidUrl(
            "base URL must start with http(s)://".to_string(),
        ));
    }
    Ok(trimmed)
}

/// Pull the fields we actually display out of a `CapabilityStatement`
/// JSON object. Tolerant: missing fields become `None` / empty.
fn parse_capability_statement(raw: &serde_json::Value) -> CapabilityStatement {
    let fhir_version = raw
        .get("fhirVersion")
        .and_then(|v| v.as_str())
        .map(String::from);
    let software = raw.get("software");
    let software_name = software
        .and_then(|s| s.get("name"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let software_version = software
        .and_then(|s| s.get("version"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let publisher = raw
        .get("publisher")
        .and_then(|v| v.as_str())
        .map(String::from);

    let mut supported_resources: Vec<String> = raw
        .get("rest")
        .and_then(|r| r.as_array())
        .and_then(|arr| arr.first())
        .and_then(|rest| rest.get("resource"))
        .and_then(|r| r.as_array())
        .map(|resources| {
            resources
                .iter()
                .filter_map(|r| r.get("type").and_then(|t| t.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();
    supported_resources.sort();
    supported_resources.dedup();

    CapabilityStatement {
        fhir_version,
        software_name,
        software_version,
        publisher,
        supported_resources,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_trailing_slash() {
        assert_eq!(
            normalize_base_url("https://example.com/fhir/".to_string()).unwrap(),
            "https://example.com/fhir"
        );
    }

    #[test]
    fn rejects_missing_scheme() {
        assert!(normalize_base_url("example.com".to_string()).is_err());
    }

    #[test]
    fn parses_capability_statement_minimal() {
        let raw = serde_json::json!({
            "fhirVersion": "4.0.1",
            "software": { "name": "Epic", "version": "Aug 2025" },
            "publisher": "Epic Systems Corporation",
            "rest": [{
                "resource": [
                    { "type": "Patient" },
                    { "type": "Condition" },
                    { "type": "Patient" }
                ]
            }]
        });
        let cap = parse_capability_statement(&raw);
        assert_eq!(cap.fhir_version.as_deref(), Some("4.0.1"));
        assert_eq!(cap.software_name.as_deref(), Some("Epic"));
        assert_eq!(cap.supported_resources, vec!["Condition", "Patient"]);
    }

    #[test]
    fn parses_capability_statement_empty() {
        let cap = parse_capability_statement(&serde_json::json!({}));
        assert!(cap.fhir_version.is_none());
        assert!(cap.supported_resources.is_empty());
    }
}
