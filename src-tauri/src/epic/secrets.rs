//! Per-connection token storage in the OS keychain.
//!
//! Tokens (access + refresh) live here, NOT in the SQLCipher database.
//! Reasons:
//!   * The keychain is the OS-blessed place for short-lived secrets and
//!     supports per-app access controls (Touch ID prompts on macOS, etc.)
//!   * It cleanly separates the durable connection profile (in SQLite)
//!     from the volatile authorization state (in keychain), so wiping
//!     credentials does not require touching the database.
//!   * Backups of the SQLite file never carry authentication material.
//!
//! Each Epic connection is identified by its UUID `id` from
//! `epic_connections.id`. We store one keychain entry per connection.

use serde::{Deserialize, Serialize};
use thiserror::Error;
use zeroize::ZeroizeOnDrop;

const SERVICE: &str = "talos-siteconnect.epic-tokens";

#[derive(Debug, Error)]
pub enum SecretError {
    #[error("Keychain error: {0}")]
    Keychain(#[from] keyring::Error),

    #[error("Failed to serialize tokens: {0}")]
    Serde(#[from] serde_json::Error),
}

/// Tokens persisted for a connected Epic instance. `ZeroizeOnDrop` so
/// in-memory copies are scrubbed after use.
#[derive(Debug, Clone, Serialize, Deserialize, ZeroizeOnDrop)]
pub struct StoredTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: String,
    pub scope: Option<String>,
    /// Unix epoch seconds when the access token expires. May be 0 if
    /// the server omitted `expires_in`.
    #[zeroize(skip)]
    pub expires_at: i64,
    /// Free-form patient context returned by SMART for patient launches.
    pub patient: Option<String>,
}

impl StoredTokens {
    pub fn is_expired(&self, now_epoch: i64) -> bool {
        self.expires_at != 0 && now_epoch >= self.expires_at
    }
}

fn entry_for(connection_id: &str) -> Result<keyring::Entry, SecretError> {
    Ok(keyring::Entry::new(SERVICE, connection_id)?)
}

pub fn save_tokens(connection_id: &str, tokens: &StoredTokens) -> Result<(), SecretError> {
    let json = serde_json::to_string(tokens)?;
    entry_for(connection_id)?.set_password(&json)?;
    tracing::info!("Stored OAuth tokens in keychain for connection {}", connection_id);
    Ok(())
}

pub fn load_tokens(connection_id: &str) -> Result<Option<StoredTokens>, SecretError> {
    match entry_for(connection_id)?.get_password() {
        Ok(json) => {
            let parsed: StoredTokens = serde_json::from_str(&json)?;
            Ok(Some(parsed))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(SecretError::Keychain(e)),
    }
}

pub fn delete_tokens(connection_id: &str) -> Result<(), SecretError> {
    match entry_for(connection_id)?.delete_credential() {
        Ok(()) => {
            tracing::info!("Removed OAuth tokens from keychain for connection {}", connection_id);
            Ok(())
        }
        // Idempotent: deleting a non-existent entry is fine.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(SecretError::Keychain(e)),
    }
}
