//! Epic / SMART on FHIR integration.
//!
//! Layered intentionally so each piece is independently testable and
//! independently swappable. The Tauri command surface in
//! `crate::commands::epic` orchestrates these modules; nothing outside
//! that command module should reach in here directly.
//!
//! ```text
//!   commands::epic
//!         │
//!         ├── discovery   (.well-known/smart-configuration)
//!         ├── pkce        (S256 code_verifier + code_challenge)
//!         ├── loopback    (one-shot 127.0.0.1 callback listener)
//!         ├── oauth       (full standalone-launch flow + token exchange)
//!         ├── secrets     (OS keychain wrapper for tokens)
//!         └── crate::fhir::client  (authenticated R4 client)
//! ```

pub mod bulk_export;
pub mod discovery;
pub mod jwt_assertion;
pub mod jwks;
pub mod loopback;
pub mod oauth;
pub mod pkce;
pub mod secrets;
