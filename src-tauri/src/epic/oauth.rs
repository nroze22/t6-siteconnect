//! SMART on FHIR — Standalone Launch with PKCE.
//!
//! This is the orchestration layer. It glues the smaller modules together
//! into a single async function the Tauri command can call.
//!
//! Flow:
//!   1. Discover the SMART configuration from
//!      `<fhir_base>/.well-known/smart-configuration` (overridable per
//!      connection profile).
//!   2. Generate a fresh PKCE pair and a random `state`.
//!   3. Bind a one-shot loopback listener on `127.0.0.1:<random port>`.
//!      Binding *before* opening the browser avoids any race where the
//!      authorization server redirects faster than we can listen.
//!   4. Build the authorize URL and return it to the caller (the Tauri
//!      command opens it in the system browser via `tauri-plugin-shell`).
//!   5. Wait for the loopback callback. Validates `state` for CSRF.
//!   6. Exchange the authorization code for tokens at the token endpoint.
//!   7. Hand the parsed [`StoredTokens`] back to the caller for keychain
//!      persistence.
//!
//! Nothing here knows about Tauri, the database, or our settings UI —
//! it's a pure async function over `reqwest` + `tokio`.

use std::time::Duration;

use serde::Deserialize;
use thiserror::Error;
use url::Url;

use crate::epic::discovery::{fetch_smart_configuration, DiscoveryError, SmartConfiguration};
use crate::epic::jwks::{load_public_jwk, load_signing_key, JwksError};
use crate::epic::jwt_assertion::{sign_client_assertion, AssertionError};
use crate::epic::loopback::{LoopbackError, LoopbackServer};
use crate::epic::pkce::{random_state, PkcePair};
use crate::epic::secrets::StoredTokens;

const CALLBACK_TIMEOUT: Duration = Duration::from_secs(300); // 5 minutes
const TOKEN_TIMEOUT: Duration = Duration::from_secs(30);

/// Configuration for one OAuth attempt.
#[derive(Debug, Clone)]
pub struct OauthRequest {
    pub fhir_base_url: String,
    pub client_id: String,
    pub scopes: String,
    /// Optional override — if `None`, we discover from `.well-known`.
    pub authorize_url: Option<String>,
    /// Optional override — if `None`, we discover from `.well-known`.
    pub token_url: Option<String>,
}

#[derive(Debug, Error)]
pub enum OauthError {
    #[error("SMART discovery failed: {0}")]
    Discovery(#[from] DiscoveryError),

    #[error("Loopback listener error: {0}")]
    Loopback(#[from] LoopbackError),

    #[error("Token exchange failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Token endpoint returned {status}: {body}")]
    TokenStatus { status: u16, body: String },

    #[error("Failed to parse token response: {0}")]
    Parse(#[from] serde_json::Error),

    #[error("Invalid authorize URL: {0}")]
    InvalidUrl(String),

    #[error("JWKS error: {0}")]
    Jwks(#[from] JwksError),

    #[error("JWT assertion error: {0}")]
    Assertion(#[from] AssertionError),

    #[error("Configuration error: {0}")]
    Config(String),
}

/// Result returned to the caller when OAuth begins. The browser is
/// opened externally; the loopback wait happens in [`finish_oauth`].
pub struct OauthInProgress {
    pub authorize_url: String,
    pub state: String,
    pub pkce: PkcePair,
    pub redirect_uri: String,
    pub server: LoopbackServer,
    pub token_endpoint: String,
}

/// Run discovery (if needed), bind the loopback listener, and produce
/// the authorize URL the caller should open in the system browser.
pub async fn begin_oauth(req: &OauthRequest) -> Result<OauthInProgress, OauthError> {
    if req.client_id.trim().is_empty() {
        return Err(OauthError::Config("client_id is required".into()));
    }

    let (authorize_endpoint, token_endpoint) =
        resolve_endpoints(&req.fhir_base_url, req.authorize_url.as_deref(), req.token_url.as_deref())
            .await?;

    let server = LoopbackServer::bind().await?;
    let redirect_uri = server.redirect_uri().to_string();

    let pkce = PkcePair::new();
    let state = random_state();

    let authorize_url = build_authorize_url(
        &authorize_endpoint,
        &req.client_id,
        &redirect_uri,
        &req.scopes,
        &state,
        &pkce,
        &req.fhir_base_url,
    )?;

    tracing::info!("OAuth authorize URL prepared (redirect={})", redirect_uri);

    Ok(OauthInProgress {
        authorize_url,
        state,
        pkce,
        redirect_uri,
        server,
        token_endpoint,
    })
}

/// Wait for the browser to redirect back to the loopback listener,
/// then exchange the code for tokens.
pub async fn finish_oauth(
    progress: OauthInProgress,
    client_id: &str,
) -> Result<StoredTokens, OauthError> {
    let OauthInProgress {
        state,
        pkce,
        redirect_uri,
        server,
        token_endpoint,
        ..
    } = progress;

    let capture = server.wait_for_callback(&state, CALLBACK_TIMEOUT).await?;

    tracing::info!("Received OAuth callback, exchanging code for tokens");
    exchange_code_for_tokens(
        &token_endpoint,
        client_id,
        &capture.code,
        &redirect_uri,
        &pkce.verifier,
    )
    .await
}

// ----- internals -----

async fn resolve_endpoints(
    fhir_base_url: &str,
    authorize_override: Option<&str>,
    token_override: Option<&str>,
) -> Result<(String, String), OauthError> {
    // If both endpoints are pre-supplied, skip discovery entirely. This
    // is the escape hatch for sites where the well-known route is blocked
    // or the URLs differ from what discovery advertises.
    if let (Some(auth), Some(token)) = (authorize_override, token_override) {
        let auth = auth.trim();
        let token = token.trim();
        if !auth.is_empty() && !token.is_empty() {
            tracing::debug!("Using overridden OAuth endpoints (no discovery)");
            return Ok((auth.to_string(), token.to_string()));
        }
    }

    let cfg: SmartConfiguration = fetch_smart_configuration(fhir_base_url).await?;
    let auth = authorize_override
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or(cfg.authorization_endpoint);
    let token = token_override
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or(cfg.token_endpoint);
    Ok((auth, token))
}

fn build_authorize_url(
    authorize_endpoint: &str,
    client_id: &str,
    redirect_uri: &str,
    scopes: &str,
    state: &str,
    pkce: &PkcePair,
    aud: &str,
) -> Result<String, OauthError> {
    let mut url = Url::parse(authorize_endpoint)
        .map_err(|e| OauthError::InvalidUrl(format!("{}: {}", authorize_endpoint, e)))?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", scopes)
        .append_pair("state", state)
        .append_pair("aud", aud) // SMART requires `aud` = FHIR base
        .append_pair("code_challenge", &pkce.challenge)
        .append_pair("code_challenge_method", pkce.method);
    Ok(url.to_string())
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default = "default_token_type")]
    token_type: String,
    #[serde(default)]
    scope: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
    #[serde(default)]
    patient: Option<String>,
}

fn default_token_type() -> String {
    "Bearer".to_string()
}

/// Exchange a valid refresh token for a new access (and possibly new
/// refresh) token. Caller is responsible for persisting the result.
///
/// Used both proactively (when `StoredTokens::is_expired` returns true
/// before a long-running operation) and reactively (when an authenticated
/// FHIR call fails with 401).
pub async fn refresh_tokens(
    token_endpoint: &str,
    client_id: &str,
    refresh_token: &str,
) -> Result<StoredTokens, OauthError> {
    if refresh_token.trim().is_empty() {
        return Err(OauthError::Config("refresh_token is empty".into()));
    }

    let client = reqwest::Client::builder()
        .timeout(TOKEN_TIMEOUT)
        .user_agent("TalOS-SiteConnect/0.1 (OAuth refresh)")
        .build()?;

    let form = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", client_id),
    ];

    let resp = client
        .post(token_endpoint)
        .header(reqwest::header::ACCEPT, "application/json")
        .form(&form)
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(OauthError::TokenStatus {
            status: status.as_u16(),
            body: body.chars().take(500).collect(),
        });
    }

    let raw: TokenResponse = resp.json().await?;
    let now = chrono::Utc::now().timestamp();
    let expires_at = raw.expires_in.map(|s| now + s).unwrap_or(0);

    Ok(StoredTokens {
        access_token: raw.access_token,
        // Some servers omit refresh_token on a refresh response —
        // fall back to the one we already had so we don't lose it.
        refresh_token: raw.refresh_token.or_else(|| Some(refresh_token.to_string())),
        token_type: raw.token_type,
        scope: raw.scope,
        expires_at,
        patient: raw.patient,
    })
}

/// SMART Backend Services — `client_credentials` grant with JWT assertion.
///
/// No browser, no user interaction. The app signs a JWT with its
/// per-install P-256 private key, the site's Epic verifies via the
/// uploaded public JWK. Returns system-scoped tokens.
///
/// Prerequisites:
///   1. A P-256 keypair has been generated for this connection
///      (`epic::jwks::generate_keypair`).
///   2. The site's Epic admin has uploaded the public JWK to the vendor
///      config for this `client_id`.
pub async fn backend_services_token(
    connection_id: &str,
    client_id: &str,
    token_endpoint: &str,
    scopes: &str,
) -> Result<StoredTokens, OauthError> {
    let signing_key = load_signing_key(connection_id)?
        .ok_or_else(|| OauthError::Config(
            "No signing key found. Generate a keypair first.".into(),
        ))?;
    let public_jwk = load_public_jwk(connection_id)?
        .ok_or_else(|| OauthError::Config("Public JWK not found".into()))?;

    let assertion = sign_client_assertion(
        &signing_key,
        client_id,
        token_endpoint,
        &public_jwk.kid,
    )?;

    let client = reqwest::Client::builder()
        .timeout(TOKEN_TIMEOUT)
        .user_agent("TalOS-SiteConnect/0.1 (Backend Services)")
        .build()?;

    let form = [
        ("grant_type", "client_credentials"),
        ("scope", scopes),
        (
            "client_assertion_type",
            "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        ),
        ("client_assertion", &assertion),
    ];

    let resp = client
        .post(token_endpoint)
        .header(reqwest::header::ACCEPT, "application/json")
        .form(&form)
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(OauthError::TokenStatus {
            status: status.as_u16(),
            body: body.chars().take(500).collect(),
        });
    }

    let raw: TokenResponse = resp.json().await?;
    let now = chrono::Utc::now().timestamp();
    let expires_at = raw.expires_in.map(|s| now + s).unwrap_or(0);

    Ok(StoredTokens {
        access_token: raw.access_token,
        refresh_token: None, // Backend services tokens have no refresh token.
        token_type: raw.token_type,
        scope: raw.scope,
        expires_at,
        patient: None,
    })
}

async fn exchange_code_for_tokens(
    token_endpoint: &str,
    client_id: &str,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<StoredTokens, OauthError> {
    let client = reqwest::Client::builder()
        .timeout(TOKEN_TIMEOUT)
        .user_agent("TalOS-SiteConnect/0.1 (OAuth token exchange)")
        .build()?;

    let form = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", client_id),
        ("code_verifier", code_verifier),
    ];

    let resp = client
        .post(token_endpoint)
        .header(reqwest::header::ACCEPT, "application/json")
        .form(&form)
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(OauthError::TokenStatus {
            status: status.as_u16(),
            body: body.chars().take(500).collect(),
        });
    }

    let raw: TokenResponse = resp.json().await?;
    let now = chrono::Utc::now().timestamp();
    let expires_at = raw.expires_in.map(|s| now + s).unwrap_or(0);

    Ok(StoredTokens {
        access_token: raw.access_token,
        refresh_token: raw.refresh_token,
        token_type: raw.token_type,
        scope: raw.scope,
        expires_at,
        patient: raw.patient,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorize_url_includes_required_params() {
        let pkce = PkcePair::new();
        let url = build_authorize_url(
            "https://example.org/oauth2/authorize",
            "client-abc",
            "http://127.0.0.1:55555/callback",
            "system/Patient.read",
            "state-xyz",
            &pkce,
            "https://fhir.example.org/R4",
        )
        .unwrap();

        assert!(url.contains("response_type=code"));
        assert!(url.contains("client_id=client-abc"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("aud=https"));
        assert!(url.contains("state=state-xyz"));
    }
}
