# Tauri v2 Development Reference -- Knowledge Reference

> Comprehensive guide to Tauri v2 architecture, APIs, and patterns for building TalOS SiteConnect as a secure, cross-platform desktop application.

---

## 1. Tauri v2 Architecture

### Core Architecture

Tauri v2 applications consist of two processes:

1. **Rust Core Process** -- The backend that manages the application lifecycle, system APIs, file access, database operations, and sidecar processes. This is the trusted, privileged process.

2. **WebView Frontend** -- The UI rendered in the platform's native WebView (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux). This is the untrusted, sandboxed process.

```
+--------------------------------------------------+
|                  Tauri Application                |
|                                                    |
|  +--------------------+  +---------------------+  |
|  |   Rust Core        |  |   WebView Frontend  |  |
|  |   Process          |  |   (HTML/CSS/JS)     |  |
|  |                    |  |                     |  |
|  | - Commands         |<-|-> invoke("cmd")     |  |
|  | - State mgmt       |  | - React/Svelte/Vue |  |
|  | - File system      |  | - Tailwind CSS     |  |
|  | - SQLite/SQLCipher  |  | - TypeScript       |  |
|  | - Sidecar mgmt     |  |                     |  |
|  | - System tray      |  |                     |  |
|  +--------------------+  +---------------------+  |
|           |                                        |
|           | IPC (JSON serialization)               |
|           |                                        |
+--------------------------------------------------+
```

### IPC Model

Communication between the Rust core and WebView frontend uses a JSON-based IPC channel:

- **Frontend to Backend:** `invoke("command_name", { args })` -- calls a Rust command and returns a Promise
- **Backend to Frontend:** `emit("event_name", payload)` -- sends events the frontend can listen to
- **Frontend to Backend events:** `emit("event_name", payload)` -- frontend can also emit events
- **Channels:** Streaming data from backend to frontend (new in v2)

### Security Model (Capabilities)

Tauri v2 replaces the v1 allowlist with a **capabilities** system:

- Capabilities are defined in JSON files in `src-tauri/capabilities/`
- Each capability grants specific permissions to specific windows
- Permissions are scoped per-plugin (e.g., `fs:read`, `fs:write`, `dialog:open`)
- The principle of least privilege: only grant what is needed

```json
// src-tauri/capabilities/main.json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-capability",
  "description": "Main window permissions",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "fs:default",
    "fs:allow-read",
    "dialog:allow-open",
    "shell:allow-sidecar",
    "notification:default"
  ]
}
```

---

## 2. Command System

### Basic Command

```rust
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

// Register in main.rs
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Frontend invocation:

```typescript
import { invoke } from '@tauri-apps/api/core';

const greeting = await invoke<string>('greet', { name: 'World' });
```

### Async Commands

```rust
#[tauri::command]
async fn read_patient_data(db: tauri::State<'_, DbPool>, mrn: String) -> Result<Patient, AppError> {
    let conn = db.get().map_err(|e| AppError::Database(e.to_string()))?;
    let patient = conn.query_row(
        "SELECT * FROM patients WHERE mrn = ?1",
        params![mrn],
        |row| Ok(Patient::from_row(row)),
    ).map_err(|e| AppError::Database(e.to_string()))?;
    Ok(patient)
}
```

### State Management with tauri::State

```rust
use std::sync::Mutex;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

type DbPool = Pool<SqliteConnectionManager>;

struct AppState {
    db: DbPool,
    llm_port: Mutex<Option<u16>>,
    screening_active: Mutex<bool>,
}

#[tauri::command]
async fn get_screening_status(state: tauri::State<'_, AppState>) -> Result<bool, AppError> {
    let active = state.screening_active.lock().unwrap();
    Ok(*active)
}

fn main() {
    let manager = SqliteConnectionManager::file("data.db");
    let pool = Pool::new(manager).expect("Failed to create pool");

    tauri::Builder::default()
        .manage(AppState {
            db: pool,
            llm_port: Mutex::new(None),
            screening_active: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![get_screening_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Error Handling Across Rust/JS Boundary

Commands must return `Result<T, E>` where `E` implements `serde::Serialize`. Errors are surfaced as rejected Promises in JavaScript.

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("LLM error: {0}")]
    LlmError(String),

    #[error("Import error: {0}")]
    ImportError(String),

    #[error("Validation error: {0}")]
    ValidationError(String),
}

// Implement From for common error types
impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::FileNotFound(err.to_string())
    }
}
```

Frontend error handling:

```typescript
try {
  const result = await invoke<ScreeningResult>('run_screening', { studyId: '123' });
} catch (error) {
  // error is the serialized AppError
  console.error('Screening failed:', error);
}
```

### Returning Complex Types

All types crossing the IPC boundary must implement `serde::Serialize` (for return values) and `serde::Deserialize` (for parameters):

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct Patient {
    pub mrn: String,
    pub date_of_birth: String,  // ISO 8601
    pub sex: String,
    pub diagnoses: Vec<Diagnosis>,
    pub labs: Vec<LabResult>,
    pub medications: Vec<Medication>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ScreeningResult {
    pub patient_mrn: String,
    pub study_id: String,
    pub overall_match: MatchStatus,
    pub criteria_results: Vec<CriterionResult>,
    pub confidence: f64,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum MatchStatus {
    Eligible,
    Ineligible,
    NeedsReview,
    InsufficientData,
}
```

**Important:** Use `#[serde(rename_all = "camelCase")]` to match JavaScript naming conventions.

---

## 3. Sidecar Processes

### Configuration in tauri.conf.json

```json
{
  "bundle": {
    "externalBin": [
      "binaries/llama-server"
    ]
  }
}
```

Sidecar binaries must follow the naming convention:
- `binaries/llama-server-x86_64-apple-darwin` (macOS Intel)
- `binaries/llama-server-aarch64-apple-darwin` (macOS Apple Silicon)
- `binaries/llama-server-x86_64-pc-windows-msvc.exe` (Windows)

### Spawning with tauri-plugin-shell

```rust
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[tauri::command]
async fn start_llm_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    model_path: String,
    port: u16,
) -> Result<(), AppError> {
    let sidecar = app.shell()
        .sidecar("llama-server")
        .map_err(|e| AppError::LlmError(e.to_string()))?
        .args([
            "--model", &model_path,
            "--host", "127.0.0.1",
            "--port", &port.to_string(),
            "--ctx-size", "4096",
            "--threads", &num_threads().to_string(),
        ]);

    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| AppError::LlmError(e.to_string()))?;

    // Store the child process handle for later cleanup
    *state.llm_child.lock().unwrap() = Some(child);
    *state.llm_port.lock().unwrap() = Some(port);

    // Monitor stdout/stderr in background
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    log::info!("llama-server: {}", line_str);
                }
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    log::warn!("llama-server stderr: {}", line_str);
                }
                CommandEvent::Terminated(payload) => {
                    log::info!("llama-server terminated with code: {:?}", payload.code);
                }
                _ => {}
            }
        }
    });

    Ok(())
}
```

### Health Checks

```rust
use reqwest::Client;
use std::time::Duration;

async fn wait_for_llm_ready(port: u16, timeout_secs: u64) -> Result<(), AppError> {
    let client = Client::new();
    let url = format!("http://127.0.0.1:{}/health", port);
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    loop {
        if start.elapsed() > timeout {
            return Err(AppError::LlmError("LLM server failed to start within timeout".into()));
        }

        match client.get(&url).timeout(Duration::from_secs(2)).send().await {
            Ok(resp) if resp.status().is_success() => {
                log::info!("LLM server is ready on port {}", port);
                return Ok(());
            }
            _ => {
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    }
}
```

### Graceful Shutdown

```rust
#[tauri::command]
async fn stop_llm_server(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    if let Some(child) = state.llm_child.lock().unwrap().take() {
        child.kill().map_err(|e| AppError::LlmError(e.to_string()))?;
    }
    *state.llm_port.lock().unwrap() = None;
    Ok(())
}
```

---

## 4. File System Access

### tauri-plugin-fs

```rust
use tauri_plugin_fs;

// In main.rs
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Path Resolution

```rust
use tauri::Manager;

#[tauri::command]
async fn get_data_dir(app: tauri::AppHandle) -> Result<String, AppError> {
    let app_data = app.path().app_data_dir()
        .map_err(|e| AppError::FileNotFound(e.to_string()))?;
    Ok(app_data.to_string_lossy().to_string())
}
```

Key directories:

| Directory | macOS | Windows | Use Case |
|-----------|-------|---------|----------|
| App Data | `~/Library/Application Support/com.talos.siteconnect` | `%APPDATA%\com.talos.siteconnect` | Database, models, config |
| App Config | `~/Library/Application Support/com.talos.siteconnect` | `%APPDATA%\com.talos.siteconnect` | User settings |
| App Cache | `~/Library/Caches/com.talos.siteconnect` | `%LOCALAPPDATA%\com.talos.siteconnect\cache` | Temporary data |
| Temp | System temp dir | System temp dir | Transient files |
| Resource | App bundle resources | App install resources | Bundled assets |

### File Picker Dialogs (tauri-plugin-dialog)

```rust
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn pick_import_file(app: tauri::AppHandle) -> Result<Option<String>, AppError> {
    let file = app.dialog()
        .file()
        .add_filter("Supported Files", &["csv", "tsv", "xlsx", "json", "xml"])
        .add_filter("CSV Files", &["csv", "tsv"])
        .add_filter("Excel Files", &["xlsx"])
        .add_filter("FHIR JSON", &["json"])
        .add_filter("C-CDA XML", &["xml"])
        .blocking_pick_file();

    Ok(file.map(|f| f.to_string_lossy().to_string()))
}
```

---

## 5. SQLite Integration

### Using rusqlite with Connection Pooling

```toml
# Cargo.toml
[dependencies]
rusqlite = { version = "0.31", features = ["bundled-sqlcipher"] }
r2d2 = "0.8"
r2d2_sqlite = "0.24"
```

### SQLCipher for Encryption

```rust
use rusqlite::Connection;

fn open_encrypted_db(path: &str, key: &str) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "key", key)?;
    // Verify the key works
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))?;
    Ok(conn)
}
```

### Migration Patterns

```rust
const MIGRATIONS: &[&str] = &[
    // Migration 1: Initial schema
    "CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mrn TEXT NOT NULL UNIQUE,
        date_of_birth TEXT NOT NULL,
        sex TEXT NOT NULL,
        race TEXT,
        ethnicity TEXT,
        import_source TEXT NOT NULL,
        import_timestamp TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS diagnoses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL REFERENCES patients(id),
        icd10_code TEXT NOT NULL,
        description TEXT,
        clinical_status TEXT DEFAULT 'active',
        onset_date TEXT,
        recorded_date TEXT,
        import_source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lab_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL REFERENCES patients(id),
        loinc_code TEXT,
        test_name TEXT NOT NULL,
        value_numeric REAL,
        value_text TEXT,
        unit TEXT,
        reference_range_low REAL,
        reference_range_high REAL,
        result_date TEXT NOT NULL,
        status TEXT DEFAULT 'final',
        import_source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL REFERENCES patients(id),
        rxnorm_code TEXT,
        drug_name TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        start_date TEXT,
        end_date TEXT,
        dose_value REAL,
        dose_unit TEXT,
        frequency TEXT,
        import_source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO schema_version (version) VALUES (1);",

    // Migration 2: Add screening results
    "CREATE TABLE IF NOT EXISTS screening_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL REFERENCES patients(id),
        study_id TEXT NOT NULL,
        overall_status TEXT NOT NULL,
        confidence REAL NOT NULL,
        screened_at TEXT NOT NULL DEFAULT (datetime('now')),
        screened_by TEXT
    );

    CREATE TABLE IF NOT EXISTS criterion_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        screening_id INTEGER NOT NULL REFERENCES screening_results(id),
        criterion_id TEXT NOT NULL,
        criterion_text TEXT NOT NULL,
        status TEXT NOT NULL,
        confidence REAL NOT NULL,
        matched_data TEXT,
        notes TEXT
    );

    INSERT INTO schema_version (version) VALUES (2);",

    // Migration 3: Add audit log
    "CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details TEXT
    );

    CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX idx_audit_user ON audit_log(user_id);

    INSERT INTO schema_version (version) VALUES (3);"
];

fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    let current_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    for (i, migration) in MIGRATIONS.iter().enumerate() {
        let version = (i + 1) as i64;
        if version > current_version {
            conn.execute_batch(migration)?;
            log::info!("Applied migration {}", version);
        }
    }

    Ok(())
}
```

### Connection Pool Setup

```rust
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

fn create_pool(db_path: &str) -> Result<Pool<SqliteConnectionManager>, r2d2::Error> {
    let manager = SqliteConnectionManager::file(db_path)
        .with_init(|conn| {
            // Enable WAL mode for better concurrent read performance
            conn.pragma_update(None, "journal_mode", "WAL")?;
            // Enable foreign keys
            conn.pragma_update(None, "foreign_keys", "ON")?;
            Ok(())
        });

    Pool::builder()
        .max_size(4)  // Desktop app, limited connections needed
        .build(manager)
}
```

---

## 6. Plugin Ecosystem

### Key Plugins for SiteConnect

| Plugin | Crate | Use Case |
|--------|-------|----------|
| fs | `tauri-plugin-fs` | Read/write files, watch directories |
| dialog | `tauri-plugin-dialog` | File picker, save dialog, message boxes |
| shell | `tauri-plugin-shell` | Spawn sidecar processes (llama-server) |
| notification | `tauri-plugin-notification` | System notifications for screening completion |
| updater | `tauri-plugin-updater` | Auto-update the application |
| store | `tauri-plugin-store` | Persistent key-value store for settings |
| clipboard | `tauri-plugin-clipboard-manager` | Copy results to clipboard |
| os | `tauri-plugin-os` | Detect OS, arch, memory for model selection |
| log | `tauri-plugin-log` | Structured logging |
| process | `tauri-plugin-process` | Application restart, exit |

### Plugin Registration

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_log::Builder::default()
            .target(tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::LogDir { file_name: Some("siteconnect".into()) }
            ))
            .build())
        .invoke_handler(tauri::generate_handler![/* commands */])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 7. Frontend Communication

### invoke() API

```typescript
import { invoke } from '@tauri-apps/api/core';

// Simple command
const count = await invoke<number>('count_eligible_patients', { studyId: 'STUDY-001' });

// Command with complex return type
interface ScreeningResult {
  patientMrn: string;
  overallMatch: 'Eligible' | 'Ineligible' | 'NeedsReview' | 'InsufficientData';
  criteriaResults: CriterionResult[];
  confidence: number;
}

const results = await invoke<ScreeningResult[]>('run_screening', {
  studyId: 'STUDY-001',
  criteria: parsedCriteria,
});
```

### Event System

```typescript
import { listen, emit } from '@tauri-apps/api/event';

// Listen for events from the backend
const unlisten = await listen<{ progress: number; message: string }>('screening-progress', (event) => {
  console.log(`Progress: ${event.payload.progress}% - ${event.payload.message}`);
});

// Emit event to backend
await emit('cancel-screening', { studyId: 'STUDY-001' });

// Clean up listener
unlisten();
```

Backend event emission:

```rust
use tauri::Emitter;

#[tauri::command]
async fn run_screening(app: tauri::AppHandle, study_id: String) -> Result<Vec<ScreeningResult>, AppError> {
    let patients = get_all_patients()?;
    let total = patients.len();

    for (i, patient) in patients.iter().enumerate() {
        // Emit progress
        app.emit("screening-progress", serde_json::json!({
            "progress": ((i + 1) as f64 / total as f64 * 100.0) as u32,
            "message": format!("Screening patient {} of {}", i + 1, total),
        })).ok();

        // Process patient...
    }

    Ok(results)
}
```

### Channel API for Streaming (Tauri v2)

```rust
use tauri::ipc::Channel;

#[tauri::command]
async fn stream_screening_results(
    channel: Channel<ScreeningResult>,
    study_id: String,
) -> Result<(), AppError> {
    let patients = get_all_patients()?;

    for patient in patients {
        let result = screen_patient(&patient, &study_id)?;
        channel.send(result).map_err(|e| AppError::LlmError(e.to_string()))?;
    }

    Ok(())
}
```

Frontend:

```typescript
import { invoke, Channel } from '@tauri-apps/api/core';

const channel = new Channel<ScreeningResult>();
channel.onmessage = (result) => {
  console.log('Received result:', result);
  // Update UI incrementally
};

await invoke('stream_screening_results', {
  channel,
  studyId: 'STUDY-001',
});
```

---

## 8. Build Configuration

### tauri.conf.json Key Sections

```json
{
  "$schema": "https://raw.githubusercontent.com/nicepage/tauri-plugin-positioner/v2/schemas/tauri.conf.schema.json",
  "productName": "TalOS SiteConnect",
  "version": "0.1.0",
  "identifier": "com.talos.siteconnect",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "TalOS SiteConnect",
        "width": 1280,
        "height": 800,
        "minWidth": 1024,
        "minHeight": 700,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' http://127.0.0.1:*; style-src 'self' 'unsafe-inline'; script-src 'self'"
    }
  },
  "bundle": {
    "active": true,
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "externalBin": [
      "binaries/llama-server"
    ],
    "resources": [
      "resources/*"
    ],
    "macOS": {
      "minimumSystemVersion": "10.15",
      "signingIdentity": null,
      "entitlements": null
    },
    "windows": {
      "nsis": {
        "installMode": "perMachine"
      }
    }
  }
}
```

### Resource Bundling

Place files in `src-tauri/resources/` to include them in the bundle. Access at runtime:

```rust
use tauri::Manager;

#[tauri::command]
async fn get_resource_path(app: tauri::AppHandle, filename: String) -> Result<String, AppError> {
    let resource_path = app.path().resource_dir()
        .map_err(|e| AppError::FileNotFound(e.to_string()))?
        .join(&filename);
    Ok(resource_path.to_string_lossy().to_string())
}
```

---

## 9. Cross-Platform Considerations

### Bundle Formats

| Platform | Formats | Notes |
|----------|---------|-------|
| macOS | `.dmg`, `.app` | Universal binary (x86_64 + aarch64) recommended |
| Windows | `.msi`, `.exe` (NSIS) | NSIS is simpler for end-users |

### File Path Differences

```rust
use std::path::PathBuf;

fn get_separator() -> &'static str {
    std::path::MAIN_SEPARATOR_STR
}

// Always use PathBuf for cross-platform path construction
let db_path = app_data_dir.join("siteconnect.db");
```

### Platform-Specific Code

```rust
#[cfg(target_os = "macos")]
fn get_thread_count() -> usize {
    num_cpus::get_physical().saturating_sub(1).max(1)
}

#[cfg(target_os = "windows")]
fn get_thread_count() -> usize {
    num_cpus::get_physical().saturating_sub(1).max(1)
}

#[cfg(target_os = "macos")]
fn kill_process(child: &tauri_plugin_shell::process::CommandChild) -> Result<(), String> {
    child.kill().map_err(|e| e.to_string())
}
```

---

## 10. Auto-Updater

### Configuration

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::default().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = check_for_updates(handle).await {
                    log::error!("Update check failed: {}", e);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn check_for_updates(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_updater::UpdaterExt;

    if let Some(update) = app.updater()?.check().await? {
        log::info!("Update available: {}", update.version);
        // Prompt user, then:
        // update.download_and_install(|_, _| {}, || {}).await?;
    }
    Ok(())
}
```

---

## 11. Security Best Practices

### Content Security Policy

The CSP in `tauri.conf.json` restricts what the WebView can load:

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; connect-src 'self' http://127.0.0.1:*; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:"
    }
  }
}
```

- `connect-src http://127.0.0.1:*` -- Allow connections to local llama-server
- No external domains -- PHI never leaves the machine
- No `unsafe-eval` -- Prevent code injection

### IPC Security

- Never expose system-level commands without input validation
- Validate all command parameters in Rust before processing
- Use Tauri's capability system to limit which windows can call which commands
- Sanitize file paths to prevent directory traversal

```rust
#[tauri::command]
async fn import_file(app: tauri::AppHandle, file_path: String) -> Result<ImportResult, AppError> {
    let path = std::path::Path::new(&file_path);

    // Validate the file exists and is a regular file
    if !path.exists() || !path.is_file() {
        return Err(AppError::FileNotFound(format!("File not found: {}", file_path)));
    }

    // Validate file extension
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if !["csv", "tsv", "xlsx", "json", "xml"].contains(&ext) {
        return Err(AppError::ValidationError("Unsupported file type".into()));
    }

    // Process the file...
    Ok(result)
}
```

---

## 12. Performance Optimization

### Minimizing IPC Calls

- Batch multiple data requests into a single command
- Use channels for streaming large result sets instead of multiple invokes
- Cache frequently accessed data in the frontend (e.g., study criteria)
- Perform data transformations in Rust, not JavaScript

### Batching Database Operations

```rust
#[tauri::command]
async fn import_patients(
    state: tauri::State<'_, AppState>,
    patients: Vec<PatientImport>,
) -> Result<ImportSummary, AppError> {
    let conn = state.db.get()?;

    // Use a transaction for batch insert
    let tx = conn.unchecked_transaction()?;
    let mut inserted = 0;
    let mut skipped = 0;

    for patient in &patients {
        match tx.execute(
            "INSERT OR IGNORE INTO patients (mrn, date_of_birth, sex, import_source, import_timestamp)
             VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            params![patient.mrn, patient.dob, patient.sex, patient.source],
        ) {
            Ok(1) => inserted += 1,
            Ok(_) => skipped += 1,
            Err(e) => log::warn!("Failed to insert patient {}: {}", patient.mrn, e),
        }
    }

    tx.commit()?;

    Ok(ImportSummary { inserted, skipped, errors: 0 })
}
```

---

## 13. Testing

### Rust Unit Tests for Commands

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_patient_insert() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO patients (mrn, date_of_birth, sex, import_source, import_timestamp)
             VALUES ('MRN001', '1965-03-22', 'M', 'test', datetime('now'))",
            [],
        ).unwrap();

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM patients",
            [],
            |row| row.get(0),
        ).unwrap();

        assert_eq!(count, 1);
    }

    #[test]
    fn test_age_calculation() {
        let dob = "1965-03-22";
        let reference_date = "2024-03-15";
        let age = calculate_age(dob, reference_date);
        assert_eq!(age, 58); // Birthday hasn't occurred yet in the reference period
    }
}
```

### WebDriver E2E Testing

Tauri supports WebDriver for E2E testing:

```rust
// In Cargo.toml: features = ["test"]
// Use tauri-driver for WebDriver protocol
```

```javascript
// E2E test with WebDriverIO
describe('Patient Import', () => {
  it('should import a CSV file', async () => {
    const importButton = await $('[data-testid="import-button"]');
    await importButton.click();
    // ... file dialog interaction via WebDriver
  });
});
```

---

## 14. Error Handling Patterns Summary

```
Rust Command Error Flow:
  rusqlite::Error → AppError::Database → serde::Serialize → JSON → JS Promise rejection
  std::io::Error  → AppError::FileNotFound → serde::Serialize → JSON → JS Promise rejection
  reqwest::Error  → AppError::LlmError → serde::Serialize → JSON → JS Promise rejection

Frontend Error Handling:
  try {
    await invoke('command', args);
  } catch (error: string) {
    // error is the serialized error message
    showErrorToast(error);
  }
```

Always provide user-friendly error messages that do not expose internal details (file paths, SQL queries, etc.) to the UI. Log detailed errors to the log file for debugging.
