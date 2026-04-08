//! FHIR R4 client and shared types.
//!
//! This module is intentionally provider-agnostic — it knows nothing about
//! Epic specifically. Epic-flavored extensions and value-set quirks are
//! handled by the normalizer in `crate::import::fhir_epic` (Phase 1B+).
//!
//! Scope right now:
//!   * `client::FhirClient` — minimal authenticated R4 HTTP client with
//!     `metadata()`, `read()`, and `search()` operations, plus retry on
//!     transient failures.
//!   * `client::CapabilityStatement` — the slimmed shape we actually use
//!     to surface "Connected to Epic R4 — supports Patient, Condition, …"
//!     in the Settings UI.
//!
//! Bulk Data `$export` lives in `crate::epic::bulk_export` in a later phase.

pub mod client;
pub mod ndjson;

pub use client::{CapabilityStatement, FhirClient, FhirError};
pub use ndjson::{stream_ndjson, NdjsonError};
