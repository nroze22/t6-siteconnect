//! RFC 7523 JWT client assertion for SMART Backend Services.
//!
//! When using `client_credentials` grant with `client_assertion_type =
//! urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, the app
//! signs a short-lived JWT (≤5 min) with its private key. Epic verifies
//! via the public JWK the site admin uploaded.
//!
//! JWT claims:
//!   * `iss` / `sub` = `client_id` registered at the site's Epic
//!   * `aud` = the token endpoint URL
//!   * `jti` = random nonce (prevents replay)
//!   * `iat` = now
//!   * `exp` = now + 5 min
//!
//! Header must include `kid` matching the uploaded JWK and `alg = ES256`.

use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use p256::ecdsa::SigningKey;
use p256::pkcs8::EncodePrivateKey;
use rand::{distributions::Alphanumeric, Rng};
use serde::Serialize;
use thiserror::Error;

const ASSERTION_LIFETIME_SECS: i64 = 300; // 5 minutes

#[derive(Debug, Error)]
pub enum AssertionError {
    #[error("JWT encoding failed: {0}")]
    Encode(#[from] jsonwebtoken::errors::Error),

    #[error("Key serialization failed: {0}")]
    KeySerialize(String),
}

#[derive(Debug, Serialize)]
struct Claims {
    iss: String,
    sub: String,
    aud: String,
    jti: String,
    iat: i64,
    exp: i64,
}

/// Build and sign a JWT client assertion using the given private key.
///
/// `client_id` serves as both `iss` and `sub`.
/// `token_endpoint` is the `aud`.
/// `kid` must match the `kid` in the public JWK uploaded to Epic.
pub fn sign_client_assertion(
    signing_key: &SigningKey,
    client_id: &str,
    token_endpoint: &str,
    kid: &str,
) -> Result<String, AssertionError> {
    let now = chrono::Utc::now().timestamp();
    let jti: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();

    let claims = Claims {
        iss: client_id.to_string(),
        sub: client_id.to_string(),
        aud: token_endpoint.to_string(),
        jti,
        iat: now,
        exp: now + ASSERTION_LIFETIME_SECS,
    };

    let mut header = Header::new(Algorithm::ES256);
    header.kid = Some(kid.to_string());
    header.typ = Some("JWT".to_string());

    // `jsonwebtoken` needs a PEM-encoded PKCS#8 key.
    let pem = signing_key
        .to_pkcs8_pem(p256::pkcs8::LineEnding::LF)
        .map_err(|e| AssertionError::KeySerialize(e.to_string()))?;
    let encoding_key = EncodingKey::from_ec_pem(pem.as_bytes())?;

    encode(&header, &claims, &encoding_key).map_err(AssertionError::Encode)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine as _;
    use p256::ecdsa::SigningKey;
    use p256::elliptic_curve::rand_core::OsRng;

    #[test]
    fn assertion_has_three_parts() {
        let sk = SigningKey::random(&mut OsRng);
        let jwt = sign_client_assertion(
            &sk,
            "my-client-id",
            "https://example.org/oauth2/token",
            "kid-abc",
        )
        .unwrap();
        assert_eq!(jwt.split('.').count(), 3, "JWT must have header.payload.signature");
    }

    #[test]
    fn assertion_header_contains_kid() {
        let sk = SigningKey::random(&mut OsRng);
        let jwt = sign_client_assertion(
            &sk,
            "my-client-id",
            "https://example.org/oauth2/token",
            "kid-xyz",
        )
        .unwrap();
        let header_b64 = jwt.split('.').next().unwrap();
        let header_json = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(header_b64)
            .unwrap();
        let header: serde_json::Value = serde_json::from_slice(&header_json).unwrap();
        assert_eq!(header["kid"].as_str(), Some("kid-xyz"));
        assert_eq!(header["alg"].as_str(), Some("ES256"));
    }
}
