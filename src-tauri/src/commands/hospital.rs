//! Read-only source intake. Never invokes the legacy clinical normalizer.
use super::epic::{load_connection, EpicConnection};
use super::hospital_signing;
use crate::epic::secrets::{self, StoredTokens};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::Duration;
use tauri::AppHandle;
use url::Url;
const MAX_BODY: usize = 8 * 1024 * 1024;

pub(crate) fn endpoint(raw: &str) -> Result<Url, String> {
    let u = Url::parse(raw).map_err(|_| "Enter a valid HTTPS endpoint.")?;
    if u.scheme() != "https"
        || u.host_str().is_none()
        || !u.username().is_empty()
        || u.password().is_some()
        || u.fragment().is_some()
    {
        return Err("Endpoints require HTTPS without embedded credentials or fragments.".into());
    }
    Ok(u)
}
fn base(raw: &str) -> Result<Url, String> {
    let u = endpoint(raw)?;
    if u.query().is_some() {
        return Err("FHIR base URL must not contain query parameters.".into());
    }
    Ok(u)
}
fn same_origin(a: &Url, b: &Url) -> bool {
    a.origin() == b.origin()
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .min_tls_version(reqwest::tls::Version::TLS_1_2)
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .user_agent("SiteConnect/0.1 source-preview")
        .build()
        .map_err(|_| "Could not initialize secure transport.".into())
}
async fn bounded_body(mut response: reqwest::Response, limit: usize) -> Result<String, String> {
    if response.content_length().is_some_and(|n| n > limit as u64) {
        return Err(
            "Response exceeds the preview size limit. Request a smaller approved cohort.".into(),
        );
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Source response interrupted. No complete preview was accepted.")?
    {
        if bytes.len() + chunk.len() > limit {
            return Err(
                "Response exceeds the preview size limit. No partial preview was accepted.".into(),
            );
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| "Source response is not valid UTF-8.".into())
}
fn credential_id(c: &EpicConnection) -> Result<String, String> {
    let b = base(&c.fhir_base_url)?;
    let t = endpoint(
        c.token_url
            .as_deref()
            .ok_or("Enter the hospital-approved token endpoint.")?,
    )?;
    let client = c
        .client_id
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Enter the registered client ID.")?;
    let scope = c
        .scopes
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Enter the approved read-only scopes.")?;
    for s in scope.split_whitespace() {
        if !s.starts_with("system/")
            || !(s.ends_with(".read") || s.ends_with(".rs") || s.ends_with(".r"))
        {
            return Err("Source access accepts explicit system read/search scopes only.".into());
        }
    }
    let bytes = serde_json::to_vec(&(&c.id, b.as_str(), t.as_str(), client, scope))
        .map_err(|_| "Invalid configuration.")?;
    Ok(format!("hospital-{:x}", Sha256::digest(bytes)))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceRequest {
    pub base_url: String,
    pub url: String,
    pub connection_id: Option<String>,
    pub authenticate: bool,
    pub bulk: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResponse {
    status: u16,
    body: String,
    content_type: Option<String>,
    content_location: Option<String>,
    retry_after: Option<String>,
}
#[tauri::command]
pub async fn hospital_request(
    app: AppHandle,
    input: SourceRequest,
) -> Result<SourceResponse, String> {
    let b = base(&input.base_url)?;
    let target = endpoint(&input.url)?;
    if !same_origin(&b, &target) {
        return Err("The server referred to another origin. Cross-origin downloads are not approved by this preview connector. Ask hospital IT for an approved same-origin route or managed extract.".into());
    }
    let mut request = client()?.get(target).header(
        "Accept",
        "application/fhir+json, application/fhir+ndjson, application/json",
    );
    if input.bulk {
        request = request.header("Prefer", "respond-async, handling=strict");
    }
    if input.authenticate {
        let c = load_connection(
            &app,
            input
                .connection_id
                .as_deref()
                .ok_or("Select a saved connection before authenticated access.")?,
        )?;
        if base(&c.fhir_base_url)? != b {
            return Err("Connection configuration changed. Recheck the source endpoint.".into());
        }
        let token = secrets::load_tokens(&credential_id(&c)?)
            .map_err(|_| "Could not read OS-protected credentials.")?
            .ok_or("Authenticate this source connection first.")?;
        if token.expires_at == 0 || token.is_expired(chrono::Utc::now().timestamp() + 30) {
            return Err("Source authorization expired. Authenticate again; no partial preview was accepted.".into());
        }
        request = request.bearer_auth(&token.access_token);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "Source request failed. Check network access and the approved endpoint.")?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(match status {
            401 | 403 => {
                "Source access was denied. Check registration, scopes and authorization.".into()
            }
            429 => "Source rate limit reached. Wait before retrying the complete preview.".into(),
            300..=399 => "Source redirect blocked. Configure the final approved endpoint.".into(),
            _ => format!("Source returned HTTP {status}. No complete preview was accepted."),
        });
    }
    let header = |key: &str| {
        response
            .headers()
            .get(key)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
    };
    let content_type = header("content-type");
    let content_location = header("content-location");
    let retry_after = header("retry-after");
    let body = bounded_body(response, MAX_BODY).await?;
    Ok(SourceResponse {
        status,
        body,
        content_type,
        content_location,
        retry_after,
    })
}
#[tauri::command]
pub fn hospital_public_key(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let c = load_connection(&app, &id)?;
    let key_id = credential_id(&c)?;
    hospital_signing::public_key(&key_id)
}
#[tauri::command]
pub async fn hospital_authenticate(app: AppHandle, id: String) -> Result<String, String> {
    let c = load_connection(&app, &id)?;
    let key_id = credential_id(&c)?;
    let token_url = c.token_url.as_deref().ok_or("Token endpoint required.")?;
    let assertion =
        hospital_signing::assertion(&key_id, c.client_id.as_deref().unwrap(), token_url)?;
    let response = client()?
        .post(endpoint(token_url)?)
        .header("Accept", "application/json")
        .form(&[
            ("grant_type", "client_credentials"),
            ("scope", c.scopes.as_deref().unwrap()),
            (
                "client_assertion_type",
                "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            ),
            ("client_assertion", &assertion),
        ])
        .send()
        .await
        .map_err(|_| "Authentication request failed. Check the approved token endpoint.")?;
    if !response.status().is_success() {
        return Err(format!("Authentication returned HTTP {}. Verify client registration, key and scopes with hospital IT.",response.status().as_u16()));
    }
    let value: serde_json::Value = serde_json::from_str(&bounded_body(response, 64 * 1024).await?)
        .map_err(|_| "Invalid authentication response.")?;
    let access = value["access_token"]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() < 16384)
        .ok_or("Authentication returned no usable token.")?;
    if value["token_type"]
        .as_str()
        .map(|s| s.eq_ignore_ascii_case("bearer"))
        != Some(true)
    {
        return Err("Unsupported authentication token type.".into());
    }
    let expires = value["expires_in"]
        .as_i64()
        .filter(|n| *n > 30 && *n <= 86400)
        .ok_or("Authentication must provide a bounded token lifetime.")?;
    let scope = Some(
        value["scope"]
            .as_str()
            .filter(|s| !s.trim().is_empty())
            .ok_or("Authentication did not report granted scopes.")?
            .to_owned(),
    );
    secrets::save_tokens(
        &key_id,
        &StoredTokens {
            access_token: access.into(),
            refresh_token: None,
            token_type: "Bearer".into(),
            scope,
            expires_at: chrono::Utc::now().timestamp() + expires,
            patient: None,
        },
    )
    .map_err(|_| "Could not store authorization in the OS credential store.")?;
    Ok("Authenticated. Data access and completeness must still be checked.".into())
}
#[tauri::command]
pub fn hospital_disconnect(app: AppHandle, id: String) -> Result<(), String> {
    let c = load_connection(&app, &id)?;
    secrets::delete_tokens(&credential_id(&c)?)
        .map_err(|_| "Could not remove source authorization.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unsafe_endpoints() {
        for v in [
            "http://hospital.test/fhir",
            "https://user:secret@hospital.test/fhir",
            "https://hospital.test/fhir#fragment",
            "file:///etc/passwd",
        ] {
            assert!(endpoint(v).is_err());
        }
        assert!(base("https://hospital.test/fhir?token=secret").is_err());
    }
    #[test]
    fn origins_include_ports_and_scheme() {
        let a = endpoint("https://hospital.test/fhir").unwrap();
        assert!(same_origin(
            &a,
            &endpoint("https://hospital.test/files/a").unwrap()
        ));
        assert!(!same_origin(
            &a,
            &endpoint("https://hospital.test:444/files/a").unwrap()
        ));
        assert!(!same_origin(
            &a,
            &endpoint("https://other.test/files/a").unwrap()
        ));
    }
}

#[cfg(test)]
mod credential_tests {
    use super::*;
    fn fixture() -> EpicConnection {
        serde_json::from_value(serde_json::json!({"id":"test-connection","site_label":"Test","fhir_base_url":"https://hospital.test/fhir","token_url":"https://hospital.test/token","client_id":"client-a","scopes":"system/Patient.rs system/Observation.rs","auth_mode":"backend_services","status":"draft","created_at":"","updated_at":""})).unwrap()
    }
    #[test]
    fn credentials_are_bound_to_security_configuration() {
        let c = fixture();
        let original = credential_id(&c).unwrap();
        for field in ["id", "fhir_base_url", "token_url", "client_id", "scopes"] {
            let mut changed = fixture();
            match field {
                "id" => changed.id = "other".into(),
                "fhir_base_url" => changed.fhir_base_url = "https://other.test/fhir".into(),
                "token_url" => changed.token_url = Some("https://other.test/token".into()),
                "client_id" => changed.client_id = Some("client-b".into()),
                _ => changed.scopes = Some("system/Patient.read".into()),
            };
            assert_ne!(credential_id(&changed).unwrap(), original);
        }
        let mut relabeled = fixture();
        relabeled.site_label = "Renamed".into();
        assert_eq!(credential_id(&relabeled).unwrap(), original);
    }
    #[test]
    fn credentials_reject_write_scopes() {
        for scope in [
            "system/Patient.*",
            "system/Patient.cruds",
            "patient/Patient.read",
            "",
        ] {
            let mut c = fixture();
            c.scopes = Some(scope.into());
            assert!(credential_id(&c).is_err());
        }
    }
}
