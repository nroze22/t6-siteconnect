//! SMART configuration discovery.
//!
//! Per the SMART App Launch spec, every FHIR server that supports SMART
//! exposes a JSON document at `<base>/.well-known/smart-configuration`
//! advertising its OAuth endpoints, supported scopes, and capabilities.
//!
//! We use this to avoid hard-coding Epic-specific endpoint paths. The
//! caller may also override `authorize_url` / `token_url` per connection
//! profile if a particular site needs special routing — discovery is
//! the default, the override is the escape hatch.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use thiserror::Error;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Error)]
pub enum DiscoveryError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Discovery endpoint returned {status}")]
    Status { status: u16 },

    #[error("Failed to parse smart-configuration: {0}")]
    Parse(#[from] serde_json::Error),

    #[error("smart-configuration is missing required field: {0}")]
    MissingField(&'static str),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartConfiguration {
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    #[serde(default)]
    pub scopes_supported: Vec<String>,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub code_challenge_methods_supported: Vec<String>,
}

/// Fetch and parse `<fhir_base>/.well-known/smart-configuration`.
pub async fn fetch_smart_configuration(
    fhir_base_url: &str,
) -> Result<SmartConfiguration, DiscoveryError> {
    let base = fhir_base_url.trim_end_matches('/');
    let url = format!("{}/.well-known/smart-configuration", base);

    let client = reqwest::Client::builder()
        .timeout(DEFAULT_TIMEOUT)
        .user_agent("TalOS-SiteConnect/0.1 (SMART discovery)")
        .build()?;

    let resp = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(DiscoveryError::Status {
            status: resp.status().as_u16(),
        });
    }

    let raw: serde_json::Value = resp.json().await?;
    let parsed: SmartConfiguration = serde_json::from_value(raw.clone())?;

    if parsed.authorization_endpoint.is_empty() {
        return Err(DiscoveryError::MissingField("authorization_endpoint"));
    }
    if parsed.token_endpoint.is_empty() {
        return Err(DiscoveryError::MissingField("token_endpoint"));
    }

    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal_smart_config() {
        let raw = serde_json::json!({
            "authorization_endpoint": "https://example.org/oauth2/authorize",
            "token_endpoint": "https://example.org/oauth2/token",
            "scopes_supported": ["openid", "fhirUser", "patient/*.read"],
            "capabilities": ["launch-standalone", "client-public"],
            "code_challenge_methods_supported": ["S256"]
        });
        let parsed: SmartConfiguration = serde_json::from_value(raw).unwrap();
        assert_eq!(
            parsed.authorization_endpoint,
            "https://example.org/oauth2/authorize"
        );
        assert!(parsed.scopes_supported.contains(&"patient/*.read".to_string()));
    }
}
