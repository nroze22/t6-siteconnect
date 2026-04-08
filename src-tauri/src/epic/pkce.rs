//! PKCE (Proof Key for Code Exchange) helpers — RFC 7636.
//!
//! Desktop apps cannot keep client secrets, so PKCE is the only safe
//! way to do an authorization code flow from a public client like ours.
//!
//! Each call to [`PkcePair::new`] produces:
//!   * a 64-character random `code_verifier` (URL-safe, no padding)
//!   * a SHA-256 `code_challenge` of that verifier, also base64url-encoded
//!   * the literal challenge method string `S256`
//!
//! The verifier is sent only on the back-channel token exchange. The
//! challenge is what we put in the front-channel authorize URL.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{distributions::Alphanumeric, Rng};
use sha2::{Digest, Sha256};

/// A matched verifier + challenge pair for one OAuth flow.
#[derive(Debug, Clone)]
pub struct PkcePair {
    pub verifier: String,
    pub challenge: String,
    pub method: &'static str,
}

impl PkcePair {
    pub fn new() -> Self {
        // RFC 7636 §4.1: verifier must be 43..=128 chars from the URL-safe
        // alphabet. 64 alphanumerics is comfortably inside that band and
        // gives us ~380 bits of entropy.
        let verifier: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(64)
            .map(char::from)
            .collect();

        let mut hasher = Sha256::new();
        hasher.update(verifier.as_bytes());
        let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());

        Self {
            verifier,
            challenge,
            method: "S256",
        }
    }
}

/// Random `state` parameter for CSRF protection on the OAuth callback.
pub fn random_state() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifier_is_in_legal_range() {
        let pair = PkcePair::new();
        assert!(pair.verifier.len() >= 43 && pair.verifier.len() <= 128);
        assert_eq!(pair.method, "S256");
    }

    #[test]
    fn challenge_matches_verifier() {
        let pair = PkcePair::new();
        let mut hasher = Sha256::new();
        hasher.update(pair.verifier.as_bytes());
        let expected = URL_SAFE_NO_PAD.encode(hasher.finalize());
        assert_eq!(pair.challenge, expected);
    }

    #[test]
    fn pairs_are_unique() {
        let a = PkcePair::new();
        let b = PkcePair::new();
        assert_ne!(a.verifier, b.verifier);
        assert_ne!(a.challenge, b.challenge);
    }

    #[test]
    fn state_is_long_enough() {
        let s = random_state();
        assert!(s.len() >= 16);
    }
}
