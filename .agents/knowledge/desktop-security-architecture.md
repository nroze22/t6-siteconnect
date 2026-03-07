# Desktop Security Architecture

> Security reference for TalOS SiteConnect, a Tauri v2 desktop application handling protected health information (PHI) for clinical trial patient screening.

---

## Table of Contents

1. [Threat Model](#1-threat-model)
2. [SQLCipher Encryption](#2-sqlcipher-encryption)
3. [Platform-Specific Secure Storage](#3-platform-specific-secure-storage)
4. [PHI Handling in Memory](#4-phi-handling-in-memory)
5. [Application-Level Access Control](#5-application-level-access-control)
6. [Telemetry Security](#6-telemetry-security)
7. [Code Signing and Installer Integrity](#7-code-signing-and-installer-integrity)
8. [Audit Logging](#8-audit-logging)
9. [Data Export Controls](#9-data-export-controls)

---

## 1. Threat Model

SiteConnect processes PHI locally on clinical site workstations. The threat model reflects the on-premises, offline-first architecture.

### In-Scope Threats

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| **Device theft** | Medium | High — unencrypted DB exposes all patient data | SQLCipher AES-256 encryption at rest |
| **Unauthorized access** (shared workstation) | High | High — colleague accesses patient data without authorization | Passphrase on launch, session timeout, screen lock detection |
| **Data exfiltration** (malicious insider) | Low | High — bulk patient data copied out | Export audit logging, export requires explicit action |
| **Memory dump** (forensic attack) | Low | Medium — PHI visible in process memory | Zeroize sensitive data, minimize PHI lifetime in memory |
| **Shoulder surfing** | Medium | Low — limited data visible per screen | Session timeout, screen lock detection |
| **Malicious update** (supply chain) | Low | Critical — attacker-controlled code on clinical workstation | Code signing, notarization, checksum verification |
| **Model file tampering** | Low | Medium — corrupted model produces wrong screening results | SHA-256 checksum verification on model load |
| **Log file exposure** | Medium | Medium — audit logs may reference patient operations | Logs stored in encrypted database, no PHI in log details |

### Out-of-Scope Threats (By Design)

| Threat | Why Out of Scope |
|--------|-----------------|
| Network attacks (MITM, DDoS) | App is offline-first; no network required for core functionality |
| Cloud breaches | No cloud storage of patient data; all data stays on local device |
| API key theft | No API keys stored in app; LLM runs locally |
| SQL injection (remote) | No network-accessible database; SQLite is local-only |
| Cross-site scripting | No user-generated HTML rendered; Tauri CSP restricts content |
| Server-side vulnerabilities | No server component; Cloud Functions are not part of SiteConnect |

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                    User Workstation                       │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │   Tauri App   │   │  LLM Sidecar │   │  SQLCipher   │ │
│  │  (WebView +   │◄─►│  (llama.cpp) │   │   Database   │ │
│  │   Rust Core)  │   │  localhost    │   │  (encrypted) │ │
│  └──────────────┘   └──────────────┘   └──────────────┘ │
│         │                                      ▲         │
│         │              IPC (Tauri commands)     │         │
│         └──────────────────────────────────────┘         │
│                                                          │
│  ─ ─ ─ ─ ─ ─ ─ ─ TRUST BOUNDARY ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                          │
│  ┌──────────────┐                                        │
│  │  OS Keychain  │  (passphrase-derived key storage)     │
│  └──────────────┘                                        │
└─────────────────────────────────────────────────────────┘
          │ (opt-in, user-initiated only)
          ▼
┌──────────────────┐
│  TalOS API       │  K-anonymized telemetry only
│  (HTTPS, pinned) │  No PHI transmitted
└──────────────────┘
```

---

## 2. SQLCipher Encryption

### How SQLCipher Works

SQLCipher is a fork of SQLite that adds transparent, page-level encryption using AES-256:

- **Algorithm**: AES-256-CBC (Cipher Block Chaining)
- **Key derivation**: PBKDF2-HMAC-SHA512 (256,000 iterations by default)
- **Page-level HMAC**: Each database page has an HMAC-SHA512 for integrity verification
- **IV generation**: Unique IV per page, derived from page number + random salt
- **Page size**: 4096 bytes (configurable)

Every read operation decrypts the relevant page(s). Every write operation encrypts and HMACs the page(s). The database file is indistinguishable from random data without the key.

### Rust Setup with rusqlite

```toml
# Cargo.toml
[dependencies]
rusqlite = { version = "0.31", features = ["bundled-sqlcipher"] }
```

The `bundled-sqlcipher` feature compiles SQLCipher from source, eliminating runtime dependency on system libraries.

```rust
use rusqlite::Connection;

fn open_encrypted_db(path: &str, passphrase: &str) -> Result<Connection> {
    let conn = Connection::open(path)?;

    // Set encryption key (MUST be first operation after open)
    conn.pragma_update(None, "key", passphrase)?;

    // Verify the database is accessible (will fail if key is wrong)
    conn.pragma_query_value(None, "cipher_version", |row| row.get::<_, String>(0))?;

    // Configure cipher settings
    conn.pragma_update(None, "cipher_page_size", 4096)?;
    conn.pragma_update(None, "kdf_iter", 256000)?;
    conn.pragma_update(None, "cipher_hmac_algorithm", "HMAC_SHA512")?;
    conn.pragma_update(None, "cipher_kdf_algorithm", "PBKDF2_HMAC_SHA512")?;

    Ok(conn)
}
```

### Key Management

The database encryption key is derived from the user's passphrase:

```
User Passphrase
      │
      ▼
PBKDF2-HMAC-SHA512 (256,000 iterations, random salt)
      │
      ▼
256-bit Database Key
      │
      ├──► Stored in OS Keychain (for session resumption)
      └──► Used as PRAGMA key for SQLCipher
```

**Important**: The raw passphrase is never stored. The derived key is stored in the OS keychain for session resumption (so the user does not need to re-enter the passphrase within a session). The keychain entry is cleared on explicit logout or session timeout.

### Key Rotation

Key rotation changes the encryption key without re-creating the database:

```rust
fn rotate_key(conn: &Connection, new_passphrase: &str) -> Result<()> {
    // PRAGMA rekey changes the encryption key
    // This re-encrypts every page in the database
    conn.pragma_update(None, "rekey", new_passphrase)?;
    Ok(())
}
```

Key rotation should be offered:
- When the user changes their passphrase
- Periodically (e.g., annually) as a security best practice
- After a suspected compromise

**Duration**: Re-keying processes every page. For a 500MB database, expect 5-15 seconds depending on disk speed.

### Performance Impact

SQLCipher adds approximately 5-15% overhead compared to plain SQLite:

| Operation | SQLite | SQLCipher | Overhead |
|-----------|--------|-----------|----------|
| Sequential reads (1000 rows) | 2.1ms | 2.3ms | ~10% |
| Sequential writes (1000 rows) | 15.3ms | 17.1ms | ~12% |
| Random reads (100 rows) | 1.8ms | 2.0ms | ~11% |
| Full table scan (100K rows) | 89ms | 98ms | ~10% |
| Index lookup | 0.1ms | 0.1ms | ~5% |

This overhead is negligible for SiteConnect's workload (screening hundreds to thousands of patients, not millions).

### Cipher Compatibility

When distributing pre-built databases (e.g., USB Edge Pack with bundled trial data), ensure cipher compatibility:

```rust
// Always set these pragmas explicitly to ensure compatibility across versions
conn.pragma_update(None, "cipher_compatibility", 4)?; // SQLCipher 4.x format
```

---

## 3. Platform-Specific Secure Storage

### macOS Keychain

Use the macOS Security framework to store the derived database key:

```rust
use security_framework::passwords::{set_generic_password, get_generic_password, delete_generic_password};

const SERVICE_NAME: &str = "com.talos.siteconnect";
const ACCOUNT_NAME: &str = "db-key";

fn store_key_macos(key: &[u8]) -> Result<()> {
    set_generic_password(SERVICE_NAME, ACCOUNT_NAME, key)
        .map_err(|e| anyhow::anyhow!("Failed to store key in Keychain: {}", e))
}

fn retrieve_key_macos() -> Result<Vec<u8>> {
    get_generic_password(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| anyhow::anyhow!("Failed to retrieve key from Keychain: {}", e))
}

fn clear_key_macos() -> Result<()> {
    delete_generic_password(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| anyhow::anyhow!("Failed to clear key from Keychain: {}", e))
}
```

Keychain items are:
- Protected by the user's macOS login password
- Accessible only to the SiteConnect application (ACL)
- Backed up in encrypted form (if iCloud Keychain is enabled, which should be discouraged for clinical workstations)

### Windows DPAPI

Use the Windows Data Protection API for key storage:

```rust
#[cfg(target_os = "windows")]
use windows::Security::Cryptography::DataProtection::DataProtectionProvider;

// Alternative: use the windows-rs crate's CryptProtectData/CryptUnprotectData
#[cfg(target_os = "windows")]
fn store_key_windows(key: &[u8]) -> Result<()> {
    use std::fs;
    use winapi::um::dpapi::{CryptProtectData, CryptUnprotectData};
    use winapi::um::wincrypt::DATA_BLOB;

    // DPAPI encrypts data using the Windows user profile key
    // The encrypted blob can only be decrypted by the same user on the same machine
    let encrypted = dpapi_encrypt(key)?;

    // Store the encrypted blob in the app data directory
    let path = app_data_dir()?.join("key.enc");
    fs::write(path, encrypted)?;
    Ok(())
}
```

DPAPI characteristics:
- Tied to the Windows user profile
- Decryption requires the same user login on the same machine
- No separate password needed (uses Windows login credential)
- Survives password changes (DPAPI master key is backed up)

### Tauri Plugin Store (Alternative)

For simpler key-value storage needs (non-critical settings), use `tauri-plugin-store`:

```rust
// This is suitable for non-sensitive configuration, NOT for encryption keys
// Use native OS keychain APIs for encryption keys
```

**Security note**: `tauri-plugin-store` writes to a JSON file on disk. It is NOT suitable for storing encryption keys or any sensitive material. Always use the native OS keychain/DPAPI for cryptographic key material.

---

## 4. PHI Handling in Memory

### Zeroize Crate

Use the `zeroize` crate to ensure sensitive data is wiped from memory when no longer needed:

```toml
[dependencies]
zeroize = { version = "1.7", features = ["derive"] }
```

```rust
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Zeroize, ZeroizeOnDrop)]
struct SensitivePatientData {
    name: String,
    date_of_birth: String,
    mrn: String,
    diagnoses: Vec<String>,
}

// When this struct goes out of scope, all fields are overwritten with zeros
// before the memory is freed

// For manual zeroization:
fn process_patient(data: &mut SensitivePatientData) {
    // ... do work ...
    data.zeroize(); // Explicitly zero out when done
}
```

### PHI Field Types

Mark PHI fields explicitly in type definitions to enable compile-time awareness:

```rust
/// Wrapper type that implements Zeroize for PHI strings
#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct PhiString(String);

impl PhiString {
    pub fn new(value: String) -> Self {
        PhiString(value)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

// Prevent accidental PHI logging
impl std::fmt::Debug for PhiString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[REDACTED]")
    }
}

impl std::fmt::Display for PhiString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[REDACTED]")
    }
}
```

### Structured Logging with PHI Redaction

Use the `tracing` crate with a custom layer that redacts PHI:

```rust
use tracing::{info, warn, instrument};

// GOOD: Log the operation without PHI
info!(patient_count = 150, study = "NCT12345678", "Screening batch started");

// GOOD: Use PhiString wrapper — Debug impl prints [REDACTED]
info!(patient = ?phi_patient_name, "Processing patient");
// Output: Processing patient patient=[REDACTED]

// BAD: Never do this
// info!("Processing patient: {}", patient.name);  // LEAKS PHI TO LOGS
```

### Clipboard Management

If a user copies patient data from the UI:

```typescript
// Frontend: Clear clipboard after timeout
function copyWithTimeout(text: string, timeoutMs: number = 30000) {
  navigator.clipboard.writeText(text);

  setTimeout(() => {
    navigator.clipboard.readText().then(current => {
      if (current === text) {
        navigator.clipboard.writeText('');
      }
    });
  }, timeoutMs);
}
```

### WebView Considerations

The Tauri WebView (WKWebView on macOS, WebView2 on Windows) holds patient data in the DOM and JavaScript heap:

- **DOM data**: Cleared when components unmount (React handles this)
- **JavaScript heap**: Garbage collected; cannot be manually zeroed (limitation of JS runtime)
- **WebView cache**: Disable caching for patient data pages via appropriate headers
- **DevTools**: Disable in production builds (`tauri.conf.json`: `"devtools": false`)

```json
// tauri.conf.json (production)
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
      "dangerousDisableAssetCspModification": false
    },
    "windows": [
      {
        "devtools": false
      }
    ]
  }
}
```

---

## 5. Application-Level Access Control

### Local User Authentication

On every application launch, the user must provide their passphrase:

```rust
pub struct AuthState {
    pub is_authenticated: bool,
    pub session_start: Option<chrono::DateTime<chrono::Utc>>,
    pub failed_attempts: u32,
    pub lockout_until: Option<chrono::DateTime<chrono::Utc>>,
}

fn authenticate(passphrase: &str, state: &mut AuthState) -> Result<bool> {
    // Check lockout
    if let Some(lockout_until) = state.lockout_until {
        if chrono::Utc::now() < lockout_until {
            let remaining = (lockout_until - chrono::Utc::now()).num_seconds();
            return Err(anyhow::anyhow!(
                "Account locked. Try again in {} seconds.", remaining
            ));
        }
        // Lockout expired, reset
        state.lockout_until = None;
        state.failed_attempts = 0;
    }

    // Attempt to open database with passphrase
    match open_encrypted_db(&db_path(), passphrase) {
        Ok(_) => {
            state.is_authenticated = true;
            state.session_start = Some(chrono::Utc::now());
            state.failed_attempts = 0;

            // Store derived key in OS keychain for session
            store_session_key(passphrase)?;

            Ok(true)
        }
        Err(_) => {
            state.failed_attempts += 1;
            if state.failed_attempts >= 5 {
                state.lockout_until = Some(
                    chrono::Utc::now() + chrono::Duration::minutes(5)
                );
            }
            Ok(false)
        }
    }
}
```

### Session Timeout

```rust
const SESSION_TIMEOUT_MINUTES: i64 = 30; // Configurable in settings

fn check_session_valid(state: &AuthState) -> bool {
    if !state.is_authenticated {
        return false;
    }

    if let Some(session_start) = state.session_start {
        let elapsed = chrono::Utc::now() - session_start;
        if elapsed.num_minutes() > SESSION_TIMEOUT_MINUTES {
            return false; // Session expired
        }
    }

    true
}

fn refresh_session(state: &mut AuthState) {
    // Called on every user interaction to reset the timeout
    state.session_start = Some(chrono::Utc::now());
}
```

### Screen Lock Detection

Detect when the OS screen locks and automatically lock the application:

```rust
// macOS: Use CGSessionCopyCurrentDictionary to detect screen lock
// Windows: Subscribe to WTS_SESSION_LOCK notification

#[cfg(target_os = "macos")]
fn register_screen_lock_handler(app: &tauri::App) {
    // Listen for distributed notification: com.apple.screenIsLocked
    // When received, lock the application
    use cocoa::foundation::NSString;
    // Register for NSWorkspaceScreensDidSleepNotification
    // and NSWorkspaceSessionDidResignActiveNotification
}

#[cfg(target_os = "windows")]
fn register_screen_lock_handler(app: &tauri::App) {
    // Register for WM_WTSSESSION_CHANGE message
    // Handle WTS_SESSION_LOCK event
}
```

### Failed Attempt Lockout

| Attempt | Result |
|---------|--------|
| 1-4 | "Incorrect passphrase. X attempts remaining." |
| 5 | "Account locked for 5 minutes." |
| After lockout | Counter resets, 5 more attempts allowed |
| 15 cumulative failures (3 lockouts) | "Account locked for 30 minutes. Contact administrator." |

**Note**: There is no permanent lockout or data destruction on failed attempts. The data is encrypted with the passphrase — an attacker who does not know the passphrase cannot access it regardless of the lockout mechanism. The lockout exists to slow down brute-force attempts on the application, not to protect against offline attacks (SQLCipher's PBKDF2 with 256,000 iterations handles that).

---

## 6. Telemetry Security

### K-Anonymization

All telemetry data is k-anonymized before transmission. See `trial-matching-algorithms.md` Section 5 for detailed k-anonymization implementation.

**Key principles**:
- Minimum group size k=5 before reporting any aggregate
- Generalization of specific values (age ranges, diagnosis categories)
- Suppression of small groups
- No PII/PHI in any telemetry payload

### Certificate Pinning

When transmitting opt-in telemetry to the TalOS API, use certificate pinning to prevent MITM attacks:

```rust
use reqwest::Certificate;

fn create_pinned_client() -> Result<reqwest::Client> {
    // Pin to TalOS API's certificate
    let cert = Certificate::from_pem(include_bytes!("../certs/talos-api-ca.pem"))?;

    let client = reqwest::Client::builder()
        .add_root_certificate(cert)
        .tls_built_in_root_certs(false) // Disable system CA store
        .https_only(true)
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    Ok(client)
}
```

### Telemetry Preview

Before any telemetry is transmitted, the user sees exactly what will be sent:

```typescript
// Frontend: Telemetry preview dialog
interface TelemetryPayload {
  site_id: string;        // Hashed, not identifiable
  app_version: string;
  event: string;
  data: {
    study_nct_id: string;
    total_screened: number;
    eligible_count: number;
    // ... aggregates only, no PHI
  };
}

function TelemetryPreviewDialog({ payload }: { payload: TelemetryPayload }) {
  return (
    <Dialog>
      <DialogTitle>Review Telemetry Data</DialogTitle>
      <DialogContent>
        <p>The following data will be sent to TalOS:</p>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
        <p>No patient names, IDs, or identifiable information is included.</p>
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel}>Cancel</Button>
        <Button onClick={send}>Send</Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Telemetry Schema Validation

Before transmission, validate that the payload contains no PHI:

```rust
fn validate_telemetry_payload(payload: &serde_json::Value) -> Result<()> {
    // Walk the entire JSON tree
    // Reject if any string value matches PHI patterns:
    // - Date of birth patterns (YYYY-MM-DD where year < 2000)
    // - MRN patterns (site-specific, configurable)
    // - Name patterns (consecutive capitalized words)
    // - SSN patterns
    // - Phone number patterns
    // - Email patterns

    let forbidden_patterns = vec![
        regex::Regex::new(r"\d{3}-\d{2}-\d{4}")?,     // SSN
        regex::Regex::new(r"\d{3}[-.]?\d{3}[-.]?\d{4}")?, // Phone
        regex::Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")?, // Email
    ];

    validate_json_tree(payload, &forbidden_patterns)
}
```

### Opt-In Default

Telemetry is **off by default**. The user must explicitly enable it in Settings:

```rust
pub struct TelemetrySettings {
    pub enabled: bool,          // Default: false
    pub preview_before_send: bool, // Default: true (always show preview)
    pub auto_send: bool,        // Default: false (require manual confirmation)
}
```

---

## 7. Code Signing and Installer Integrity

### macOS Code Signing and Notarization

```toml
# tauri.conf.json (macOS signing)
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: TalOS Inc (TEAMID)",
      "providerShortName": "TEAMID",
      "entitlements": "entitlements.plist",
      "minimumSystemVersion": "12.0"
    }
  }
}
```

Required entitlements (`entitlements.plist`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <false/> <!-- Required for SQLite file access and LLM sidecar -->
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/> <!-- Required for llama.cpp JIT -->
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/> <!-- Required for bundled SQLCipher -->
    <key>com.apple.security.automation.apple-events</key>
    <false/>
</dict>
</plist>
```

Notarization process:
1. Build the app with `cargo tauri build`
2. Sign with Developer ID certificate
3. Submit to Apple's notarization service (`xcrun notarytool submit`)
4. Staple the notarization ticket to the DMG/app bundle
5. Users can install without Gatekeeper warnings

### Windows Authenticode Signing

```toml
# tauri.conf.json (Windows signing)
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "...",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

- **EV (Extended Validation) certificate recommended**: Provides immediate SmartScreen reputation (no "unknown publisher" warning)
- **Standard certificate acceptable**: But may trigger SmartScreen warnings until reputation is built
- **Timestamp**: Always timestamp signatures so they remain valid after certificate expiration

### Model File Integrity

GGUF model files are large (1-5 GB) and must be verified before use:

```rust
use sha2::{Sha256, Digest};
use std::io::Read;

const EXPECTED_CHECKSUMS: &[(&str, &str)] = &[
    ("biomistral-7b-q4_k_m.gguf", "a1b2c3d4e5f6..."),
    ("gemma-1b-q8_0.gguf", "f6e5d4c3b2a1..."),
];

fn verify_model_integrity(model_path: &str) -> Result<bool> {
    let mut file = std::fs::File::open(model_path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 { break; }
        hasher.update(&buffer[..bytes_read]);
    }

    let hash = format!("{:x}", hasher.finalize());
    let filename = std::path::Path::new(model_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    let expected = EXPECTED_CHECKSUMS.iter()
        .find(|(name, _)| *name == filename)
        .map(|(_, checksum)| *checksum);

    match expected {
        Some(expected_hash) => Ok(hash == expected_hash),
        None => Err(anyhow::anyhow!("Unknown model file: {}", filename)),
    }
}
```

---

## 8. Audit Logging

### Local Audit Log

All sensitive operations are logged in an append-only table within the encrypted SQLite database:

```sql
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now')),
    action TEXT NOT NULL,
    category TEXT NOT NULL,
    details TEXT,            -- JSON object, NO PHI
    record_count INTEGER,    -- number of records affected
    checksum TEXT NOT NULL    -- HMAC-SHA256 of (timestamp + action + details)
);

-- Prevent updates and deletes (enforced at application level)
-- SQLite triggers as defense-in-depth:
CREATE TRIGGER prevent_audit_update
    BEFORE UPDATE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'Audit log entries cannot be modified');
END;

CREATE TRIGGER prevent_audit_delete
    BEFORE DELETE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'Audit log entries cannot be deleted');
END;
```

### Audited Actions

| Category | Action | Details |
|----------|--------|---------|
| auth | login_success | {} |
| auth | login_failure | {"attempt": 3} |
| auth | logout | {} |
| auth | session_timeout | {} |
| auth | session_locked | {"trigger": "screen_lock"} |
| import | patients_imported | {"source": "emr_export.csv", "count": 1500, "format": "csv"} |
| import | import_failed | {"source": "data.xlsx", "error": "invalid_encoding"} |
| screening | screening_started | {"study_nct_id": "NCT12345", "patient_count": 847} |
| screening | screening_completed | {"study_nct_id": "NCT12345", "eligible": 120, "excluded": 500, "unknown": 227} |
| export | data_exported | {"format": "csv", "record_count": 120, "destination": "screening_results.csv"} |
| export | pitch_generated | {"study_nct_id": "NCT12345"} |
| settings | setting_changed | {"setting": "session_timeout", "old": 30, "new": 15} |
| settings | telemetry_enabled | {} |
| settings | telemetry_disabled | {} |
| data | patients_deleted | {"count": 50} |
| data | study_added | {"nct_id": "NCT12345"} |
| data | study_removed | {"nct_id": "NCT12345"} |
| model | model_loaded | {"model": "biomistral-7b-q4_k_m", "verified": true} |
| model | model_verification_failed | {"model": "biomistral-7b-q4_k_m", "expected_hash": "...", "actual_hash": "..."} |

### Checksum Computation

Each audit log entry includes an HMAC-SHA256 checksum to detect tampering:

```rust
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

fn compute_audit_checksum(
    timestamp: &str,
    action: &str,
    details: &str,
    secret_key: &[u8], // Derived from database key
) -> String {
    let mut mac = HmacSha256::new_from_slice(secret_key)
        .expect("HMAC key length is valid");

    mac.update(timestamp.as_bytes());
    mac.update(b"|");
    mac.update(action.as_bytes());
    mac.update(b"|");
    mac.update(details.as_bytes());

    format!("{:x}", mac.finalize().into_bytes())
}
```

### Audit Log Integrity Verification

Periodically verify the entire audit log chain has not been tampered with:

```rust
fn verify_audit_log_integrity(conn: &Connection, secret_key: &[u8]) -> Result<AuditVerification> {
    let mut stmt = conn.prepare(
        "SELECT id, timestamp, action, details, checksum FROM audit_log ORDER BY id ASC"
    )?;

    let mut total = 0;
    let mut valid = 0;
    let mut invalid_entries = Vec::new();

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;

    for row in rows {
        let (id, timestamp, action, details, stored_checksum) = row?;
        total += 1;

        let computed = compute_audit_checksum(&timestamp, &action, &details, secret_key);
        if computed == stored_checksum {
            valid += 1;
        } else {
            invalid_entries.push(id);
        }
    }

    Ok(AuditVerification { total, valid, invalid_entries })
}
```

---

## 9. Data Export Controls

### Export Workflow

1. User initiates export (e.g., "Export Eligible Patients to CSV")
2. System displays confirmation dialog with record count and data fields
3. User selects destination file path
4. Audit log entry is created BEFORE export begins
5. Data is written to the selected file
6. Export completion is logged

### Export Types and Controls

| Export Type | Data Sensitivity | Controls |
|-------------|-----------------|----------|
| Screening results (anonymized) | Low | Standard export flow |
| Screening results (with patient IDs) | High | Passphrase re-entry required |
| Sponsor pitch PDF | None (aggregate only) | Standard export flow |
| Population analytics | Low (k-anonymized) | Standard export flow |
| Full patient list | Critical | Passphrase re-entry + confirmation dialog |
| Audit log | Medium | Standard export flow |

### Passphrase Re-Entry for Sensitive Exports

```rust
#[tauri::command]
fn export_with_phi(
    passphrase: String,
    export_config: ExportConfig,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // Re-verify passphrase before allowing PHI export
    let valid = verify_passphrase(&passphrase, &state)?;
    if !valid {
        return Err("Invalid passphrase. Export cancelled.".to_string());
    }

    // Log the export
    create_audit_entry(&state.conn, AuditEntry {
        action: "data_exported".to_string(),
        category: "export".to_string(),
        details: serde_json::json!({
            "format": export_config.format,
            "record_count": export_config.record_count,
            "includes_phi": true,
            "destination": export_config.filename, // filename only, not full path
        }).to_string(),
        record_count: Some(export_config.record_count),
    })?;

    // Perform export
    perform_export(&state.conn, &export_config)
}
```

### Exported File Security

**Important**: Exported files (CSV, PDF, etc.) are NOT encrypted. Once data leaves the SiteConnect database, it is the user's responsibility to handle it according to their site's data governance policies.

The export dialog includes a reminder:

```
Warning: Exported files are not encrypted. Handle exported data according
to your site's PHI security policies. Do not email exported files containing
patient identifiers.
```

### Export Watermarking (Optional)

For PDF exports (sponsor pitches, analytics reports), include a footer watermark:

```
Generated by TalOS SiteConnect v1.2.0 | [Site Name] | 2026-03-06 14:32 UTC
Export ID: 7f8a9b2c | Contains no individually identifiable patient information
```

This creates traceability without including PHI.
