//! Per-install ECDSA P-256 keypair for SMART Backend Services.
//!
//! The SMART Backend Services spec (HL7 Bulk Data IG) requires apps to
//! authenticate using a signed JWT client assertion (RFC 7523). Each
//! SiteConnect install generates its own keypair so:
//!
//!   * No shared secret ever exists across sites.
//!   * The private key stays in the OS keychain and never touches disk
//!     or the SQLite database.
//!   * The public key is exported as a JWK JSON file that the site's
//!     Epic admin uploads once to their vendor configuration.
//!
//! Why P-256?
//!   * It is the most universally supported curve across Epic versions
//!     and FHIR authorization servers.
//!   * The `p256` crate is pure Rust, constant-time, and audited.
//!   * The resulting JWK + JWT are compact and widely interoperable.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use p256::ecdsa::SigningKey;
use p256::elliptic_curve::rand_core::OsRng;
use p256::pkcs8::EncodePrivateKey;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

use super::secrets::SecretError;

const KEYCHAIN_SERVICE: &str = "talos-siteconnect.epic-jwks";

#[derive(Debug, Error)]
pub enum JwksError {
    #[error("Key generation failed: {0}")]
    Generation(String),

    #[error("Keychain error: {0}")]
    Secret(#[from] SecretError),

    #[error("Keychain error: {0}")]
    Keychain(#[from] keyring::Error),

    #[error("Failed to serialize key: {0}")]
    Serialize(String),

    #[error("Failed to deserialize key: {0}")]
    Deserialize(String),
}

/// The public half of the keypair, formatted as a JWK for export.
/// This is what the site's Epic admin uploads to their vendor config.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicJwk {
    pub kty: String,
    pub crv: String,
    pub x: String,
    pub y: String,
    pub kid: String,
    #[serde(rename = "use")]
    pub key_use: String,
    pub alg: String,
}

/// Generate a fresh P-256 keypair, store the private key in the OS
/// keychain, and return the public JWK for export.
///
/// `connection_id` scopes the keychain entry so each Epic connection
/// can have its own keypair (though in practice most installs will
/// share one keypair across connections at the same site).
pub fn generate_keypair(connection_id: &str) -> Result<PublicJwk, JwksError> {
    let signing_key = SigningKey::random(&mut OsRng);

    // Serialize private key to PKCS#8 PEM for keychain storage.
    let pem = signing_key
        .to_pkcs8_pem(p256::pkcs8::LineEnding::LF)
        .map_err(|e| JwksError::Generation(format!("PKCS8 encode: {}", e)))?;

    // Store in keychain.
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, connection_id)?;
    entry.set_password(pem.as_ref())?;

    // Build the public JWK.
    let public_jwk = build_public_jwk(&signing_key)?;

    tracing::info!(
        "Generated P-256 keypair for connection {} (kid={})",
        connection_id,
        public_jwk.kid
    );

    Ok(public_jwk)
}

/// Load an existing private key from the keychain and return the public
/// JWK (useful for re-exporting without regenerating).
pub fn load_public_jwk(connection_id: &str) -> Result<Option<PublicJwk>, JwksError> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, connection_id)?;
    let pem = match entry.get_password() {
        Ok(p) => p,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(e) => return Err(JwksError::Keychain(e)),
    };

    let signing_key = load_signing_key_from_pem(&pem)?;
    let jwk = build_public_jwk(&signing_key)?;
    Ok(Some(jwk))
}

/// Load the private signing key from the keychain. Used internally by
/// the JWT assertion signer.
pub fn load_signing_key(connection_id: &str) -> Result<Option<SigningKey>, JwksError> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, connection_id)?;
    let pem = match entry.get_password() {
        Ok(p) => p,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(e) => return Err(JwksError::Keychain(e)),
    };
    let key = load_signing_key_from_pem(&pem)?;
    Ok(Some(key))
}

/// Delete the stored keypair for a connection.
pub fn delete_keypair(connection_id: &str) -> Result<(), JwksError> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, connection_id)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(JwksError::Keychain(e)),
    }
}

/// Format the public JWK as a pretty-printed JWKS document
/// (`{"keys":[…]}`) suitable for saving to a file the site admin
/// can upload.
pub fn format_jwks_document(jwk: &PublicJwk) -> String {
    let doc = serde_json::json!({ "keys": [jwk] });
    serde_json::to_string_pretty(&doc).unwrap_or_default()
}

// ----- internals -----

fn load_signing_key_from_pem(pem: &str) -> Result<SigningKey, JwksError> {
    use p256::pkcs8::DecodePrivateKey;
    SigningKey::from_pkcs8_pem(pem)
        .map_err(|e| JwksError::Deserialize(format!("PKCS8 decode: {}", e)))
}

fn build_public_jwk(signing_key: &SigningKey) -> Result<PublicJwk, JwksError> {
    let verifying_key = signing_key.verifying_key();
    let point = verifying_key.to_encoded_point(false);
    let x_bytes = point
        .x()
        .ok_or_else(|| JwksError::Serialize("missing x coordinate".into()))?;
    let y_bytes = point
        .y()
        .ok_or_else(|| JwksError::Serialize("missing y coordinate".into()))?;

    let x = URL_SAFE_NO_PAD.encode(x_bytes);
    let y = URL_SAFE_NO_PAD.encode(y_bytes);

    // kid = truncated SHA-256 of the public point, URL-safe encoded.
    // This is deterministic from the key material so regenerating the
    // JWK from the same private key always yields the same kid.
    let mut hasher = Sha256::new();
    hasher.update(x_bytes);
    hasher.update(y_bytes);
    let kid = URL_SAFE_NO_PAD.encode(&hasher.finalize()[..16]);

    Ok(PublicJwk {
        kty: "EC".into(),
        crv: "P-256".into(),
        x,
        y,
        kid,
        key_use: "sig".into(),
        alg: "ES256".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_jwk_has_correct_shape() {
        let sk = SigningKey::random(&mut OsRng);
        let jwk = build_public_jwk(&sk).unwrap();
        assert_eq!(jwk.kty, "EC");
        assert_eq!(jwk.crv, "P-256");
        assert_eq!(jwk.alg, "ES256");
        assert_eq!(jwk.key_use, "sig");
        assert!(!jwk.x.is_empty());
        assert!(!jwk.y.is_empty());
        assert!(!jwk.kid.is_empty());
    }

    #[test]
    fn kid_is_deterministic() {
        let sk = SigningKey::random(&mut OsRng);
        let jwk1 = build_public_jwk(&sk).unwrap();
        let jwk2 = build_public_jwk(&sk).unwrap();
        assert_eq!(jwk1.kid, jwk2.kid);
    }

    #[test]
    fn jwks_document_is_valid_json() {
        let sk = SigningKey::random(&mut OsRng);
        let jwk = build_public_jwk(&sk).unwrap();
        let doc = format_jwks_document(&jwk);
        let parsed: serde_json::Value = serde_json::from_str(&doc).unwrap();
        assert!(parsed.get("keys").unwrap().as_array().unwrap().len() == 1);
    }
}
