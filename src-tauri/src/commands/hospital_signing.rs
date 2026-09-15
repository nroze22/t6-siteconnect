//! ES384 source-preview keys. Separate service preserves legacy registrations.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine as _};
use ring::{
    rand::SystemRandom,
    signature::{EcdsaKeyPair, KeyPair, ECDSA_P384_SHA384_FIXED_SIGNING},
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
const SERVICE: &str = "talos-siteconnect.hospital-es384";
fn from_der(bytes: &[u8]) -> Result<EcdsaKeyPair, String> {
    EcdsaKeyPair::from_pkcs8(
        &ECDSA_P384_SHA384_FIXED_SIGNING,
        bytes,
        &SystemRandom::new(),
    )
    .map_err(|_| "Could not load the protected ES384 key.".into())
}
fn load(id: &str) -> Result<Option<EcdsaKeyPair>, String> {
    let entry =
        keyring::Entry::new(SERVICE, id).map_err(|_| "Could not open the OS credential store.")?;
    match entry.get_password() {
        Ok(encoded) => {
            let bytes = B64
                .decode(encoded)
                .map_err(|_| "Invalid protected signing key.")?;
            Ok(Some(from_der(&bytes)?))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Could not read the OS-protected signing key.".into()),
    }
}
fn public(key: &EcdsaKeyPair) -> Value {
    let point = key.public_key().as_ref();
    // ring emits an uncompressed P-384 point: 0x04 plus two 48-byte coordinates.
    let kid = B64.encode(Sha256::digest(point));
    json!({"kty":"EC","crv":"P-384","alg":"ES384","use":"sig","kid":kid,"x":B64.encode(&point[1..49]),"y":B64.encode(&point[49..97])})
}
pub fn public_key(id: &str) -> Result<Value, String> {
    let key = match load(id)? {
        Some(key) => key,
        None => {
            let der = EcdsaKeyPair::generate_pkcs8(
                &ECDSA_P384_SHA384_FIXED_SIGNING,
                &SystemRandom::new(),
            )
            .map_err(|_| "Could not generate signing key.")?;
            let key = from_der(der.as_ref())?;
            keyring::Entry::new(SERVICE, id)
                .map_err(|_| "Could not open the OS credential store.")?
                .set_password(&B64.encode(der.as_ref()))
                .map_err(|_| "Could not protect the signing key in the OS credential store.")?;
            key
        }
    };
    Ok(json!({"keys":[public(&key)]}))
}
fn sign(key: &EcdsaKeyPair, client: &str, endpoint: &str) -> Result<String, String> {
    let now = chrono::Utc::now().timestamp();
    let jwk = public(key);
    let header = json!({"alg":"ES384","typ":"JWT","kid":jwk["kid"]});
    let claims = json!({"iss":client,"sub":client,"aud":endpoint,"iat":now,"exp":now+300,"jti":uuid::Uuid::new_v4().to_string()});
    let unsigned = format!(
        "{}.{}",
        B64.encode(header.to_string()),
        B64.encode(claims.to_string())
    );
    let signature = key
        .sign(&SystemRandom::new(), unsigned.as_bytes())
        .map_err(|_| "Could not sign the authentication assertion.")?;
    Ok(format!("{}.{}", unsigned, B64.encode(signature.as_ref())))
}
pub fn assertion(id: &str, client: &str, endpoint: &str) -> Result<String, String> {
    let key = load(id)?.ok_or("Prepare and register the public key first.")?;
    sign(&key, client, endpoint)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn es384_assertion_verifies_with_exported_jwk() {
        let der =
            EcdsaKeyPair::generate_pkcs8(&ECDSA_P384_SHA384_FIXED_SIGNING, &SystemRandom::new())
                .unwrap();
        let key = from_der(der.as_ref()).unwrap();
        let jwk = public(&key);
        let token = sign(&key, "client-a", "https://hospital.test/token").unwrap();
        let decode_key = jsonwebtoken::DecodingKey::from_ec_components(
            jwk["x"].as_str().unwrap(),
            jwk["y"].as_str().unwrap(),
        )
        .unwrap();
        let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::ES384);
        validation.set_audience(&["https://hospital.test/token"]);
        validation.set_issuer(&["client-a"]);
        validation.sub = Some("client-a".into());
        let decoded = jsonwebtoken::decode::<Value>(&token, &decode_key, &validation).unwrap();
        assert_eq!(decoded.header.kid.as_deref(), jwk["kid"].as_str());
        assert_eq!(
            decoded.claims["exp"].as_i64().unwrap() - decoded.claims["iat"].as_i64().unwrap(),
            300
        );
        let second = sign(&key, "client-a", "https://hospital.test/token").unwrap();
        let other = jsonwebtoken::decode::<Value>(&second, &decode_key, &validation).unwrap();
        assert_ne!(decoded.claims["jti"], other.claims["jti"]);
        validation.set_audience(&["https://other.test/token"]);
        assert!(jsonwebtoken::decode::<Value>(&token, &decode_key, &validation).is_err());
        assert_eq!(B64.decode(jwk["x"].as_str().unwrap()).unwrap().len(), 48);
    }
}
