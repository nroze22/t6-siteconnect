# Skill: LLM Sidecar Management

> **Purpose**: Manage the lifecycle of a local llama-server process that provides
> on-device LLM inference for clinical NLP tasks (eligibility criterion
> evaluation, entity extraction, sponsor pitch generation). The sidecar runs as
> a child process of the Tauri application, exposes an OpenAI-compatible HTTP
> API on localhost, and is fully air-gapped -- no patient data ever leaves the
> machine.

---

## Table of Contents

1. [Sidecar Lifecycle](#sidecar-lifecycle)
2. [Platform-Specific Binary Management](#platform-specific-binary-management)
3. [Model Management](#model-management)
4. [Hardware Detection & Tier Selection](#hardware-detection--tier-selection)
5. [API Client](#api-client)
6. [Graceful Degradation](#graceful-degradation)
7. [Frontend Status Display](#frontend-status-display)
8. [Error Handling & Logging](#error-handling--logging)
9. [Testing](#testing)

---

## Sidecar Lifecycle

### Core State Machine

```
  App Launch
      |
      v
  [Starting] --spawn--> health check loop
      |                        |
      | (fail x3)        (status: ok)
      v                        v
  [Disabled] <--crash x3-- [Ready] --shutdown--> [Stopped]
      |                        |
      v                        v
  (notify user)           (serving requests)
```

### State Enum

```rust
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum LlmStatus {
    /// Process is being spawned, model is loading into memory
    Starting,
    /// Health check passed, API is accepting requests
    Ready,
    /// Process crashed or failed to start, may retry
    Error(String),
    /// Max retries exhausted or insufficient hardware; LLM features off
    Disabled,
    /// Graceful shutdown completed
    Stopped,
}
```

### Sidecar Struct

```rust
use std::path::PathBuf;
use std::process::Child;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct LlmSidecar {
    /// Handle to the child process (None when not running)
    process: Option<Child>,
    /// Localhost port the server is bound to
    port: u16,
    /// Current status
    status: LlmStatus,
    /// Absolute path to the .gguf model file
    model_path: PathBuf,
    /// Number of consecutive restart attempts since last Ready state
    restart_count: u32,
    /// Context window size (tokens)
    ctx_size: u32,
    /// Number of CPU threads to allocate
    threads: u32,
}

/// Maximum consecutive restarts before disabling LLM
const MAX_RESTART_ATTEMPTS: u32 = 3;

/// Interval between health check polls (milliseconds)
const HEALTH_CHECK_INTERVAL_MS: u64 = 2_000;

/// Maximum time to wait for the sidecar to become ready (seconds)
const STARTUP_TIMEOUT_SECS: u64 = 120;

/// Base delay for exponential backoff on restart (milliseconds)
const RESTART_BASE_DELAY_MS: u64 = 1_000;
```

### Spawning the Process

```rust
impl LlmSidecar {
    /// Spawn the llama-server process.
    ///
    /// 1. Find an available port starting at 8081.
    /// 2. Resolve the platform-specific binary path.
    /// 3. Spawn the child process with appropriate CLI args.
    /// 4. Begin the health check loop.
    /// 5. Transition to Ready or Error.
    pub async fn spawn(&mut self) -> Result<(), SidecarError> {
        if self.status == LlmStatus::Ready {
            return Ok(());
        }

        self.status = LlmStatus::Starting;
        self.emit_status_event();

        // 1. Find available port
        self.port = find_available_port(8081)?;

        // 2. Resolve binary
        let binary_path = resolve_sidecar_binary()?;

        // 3. Build command
        let child = std::process::Command::new(&binary_path)
            .args([
                "--model", self.model_path.to_str().unwrap(),
                "--ctx-size", &self.ctx_size.to_string(),
                "--threads", &self.threads.to_string(),
                "--port", &self.port.to_string(),
                "--host", "127.0.0.1",
                // Force JSON output support
                "--grammar-file", "",
                // Disable remote access
                "--no-mmap",
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| SidecarError::SpawnFailed(e.to_string()))?;

        self.process = Some(child);

        // 4. Health check loop
        let ready = self.wait_for_ready().await;

        if ready {
            self.status = LlmStatus::Ready;
            self.restart_count = 0;
            self.emit_status_event();
            Ok(())
        } else {
            self.status = LlmStatus::Error("Startup timeout".into());
            self.emit_status_event();
            Err(SidecarError::StartupTimeout)
        }
    }
}
```

### Port Discovery

```rust
/// Find an available TCP port starting from `start_port`.
/// Increments until a free port is found or 100 attempts exhausted.
fn find_available_port(start_port: u16) -> Result<u16, SidecarError> {
    for port in start_port..start_port + 100 {
        match std::net::TcpListener::bind(("127.0.0.1", port)) {
            Ok(listener) => {
                drop(listener); // Release immediately
                return Ok(port);
            }
            Err(_) => continue,
        }
    }
    Err(SidecarError::NoAvailablePort)
}
```

### Health Check Loop

```rust
impl LlmSidecar {
    /// Poll GET http://127.0.0.1:{port}/health every 2 seconds.
    /// Returns true when `{"status":"ok"}` is received.
    /// Returns false if STARTUP_TIMEOUT_SECS elapses without success.
    async fn wait_for_ready(&self) -> bool {
        let deadline = std::time::Instant::now()
            + std::time::Duration::from_secs(STARTUP_TIMEOUT_SECS);

        while std::time::Instant::now() < deadline {
            if self.health_check().await {
                return true;
            }

            // Check if process has exited unexpectedly
            // (checked via try_wait in the actual implementation)

            tokio::time::sleep(
                std::time::Duration::from_millis(HEALTH_CHECK_INTERVAL_MS)
            ).await;
        }

        false
    }

    /// Single health check: GET /health, expect {"status":"ok"}.
    pub async fn health_check(&self) -> bool {
        let url = format!("http://127.0.0.1:{}/health", self.port);

        match reqwest::Client::new()
            .get(&url)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
        {
            Ok(resp) => {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    body.get("status")
                        .and_then(|s| s.as_str())
                        .map(|s| s == "ok")
                        .unwrap_or(false)
                } else {
                    false
                }
            }
            Err(_) => false,
        }
    }
}
```

### Graceful Shutdown

```rust
impl LlmSidecar {
    /// Gracefully shut down the sidecar process.
    ///
    /// - Unix: send SIGTERM, wait up to 10 seconds, then SIGKILL.
    /// - Windows: call TerminateProcess.
    pub async fn shutdown(&mut self) -> Result<(), SidecarError> {
        if let Some(ref mut child) = self.process {
            #[cfg(unix)]
            {
                use nix::sys::signal::{kill, Signal};
                use nix::unistd::Pid;

                let pid = Pid::from_raw(child.id() as i32);
                let _ = kill(pid, Signal::SIGTERM);

                // Wait up to 10 seconds for graceful exit
                let timeout = tokio::time::timeout(
                    std::time::Duration::from_secs(10),
                    tokio::task::spawn_blocking({
                        // Wait for the child in a blocking thread
                        let mut child_handle = self.process.take().unwrap();
                        move || child_handle.wait()
                    }),
                ).await;

                if timeout.is_err() {
                    // Force kill if graceful shutdown timed out
                    let _ = kill(pid, Signal::SIGKILL);
                }
            }

            #[cfg(windows)]
            {
                let _ = child.kill();
                let _ = child.wait();
            }

            self.process = None;
            self.status = LlmStatus::Stopped;
            self.emit_status_event();
        }

        Ok(())
    }
}
```

### Crash Detection & Auto-Restart

```rust
impl LlmSidecar {
    /// Attempt to restart the sidecar with exponential backoff.
    ///
    /// Backoff schedule:
    ///   Attempt 1: 1 second delay
    ///   Attempt 2: 2 second delay
    ///   Attempt 3: 4 second delay
    ///   After 3 failures: disable LLM permanently for this session
    pub async fn restart(&mut self) -> Result<(), SidecarError> {
        self.restart_count += 1;

        if self.restart_count > MAX_RESTART_ATTEMPTS {
            self.status = LlmStatus::Disabled;
            self.emit_status_event();
            self.emit_notification(
                "LLM Disabled",
                "The local AI model failed to start after 3 attempts. \
                 AI-powered features are unavailable. The application \
                 will continue with rule-based screening only.",
            );
            return Err(SidecarError::MaxRestartsExceeded);
        }

        // Exponential backoff: 1s, 2s, 4s
        let delay_ms = RESTART_BASE_DELAY_MS * 2u64.pow(self.restart_count - 1);
        log::warn!(
            "LLM sidecar restart attempt {}/{} in {}ms",
            self.restart_count, MAX_RESTART_ATTEMPTS, delay_ms
        );

        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;

        // Clean up the old process
        self.shutdown().await.ok();

        // Attempt fresh spawn
        self.spawn().await
    }

    /// Background monitor task. Call once after initial spawn.
    /// Watches for unexpected process exit and triggers restart.
    pub async fn monitor_loop(sidecar: Arc<Mutex<LlmSidecar>>) {
        loop {
            tokio::time::sleep(
                std::time::Duration::from_millis(HEALTH_CHECK_INTERVAL_MS)
            ).await;

            let mut guard = sidecar.lock().await;

            match guard.status {
                LlmStatus::Ready => {
                    // Check if process is still alive
                    let process_alive = if let Some(ref mut child) = guard.process {
                        match child.try_wait() {
                            Ok(None) => true,  // Still running
                            Ok(Some(exit)) => {
                                log::error!("LLM sidecar exited: {:?}", exit);
                                false
                            }
                            Err(e) => {
                                log::error!("Failed to check sidecar status: {}", e);
                                false
                            }
                        }
                    } else {
                        false
                    };

                    if !process_alive {
                        guard.status = LlmStatus::Error("Process exited unexpectedly".into());
                        guard.emit_status_event();

                        if let Err(e) = guard.restart().await {
                            log::error!("Restart failed: {}", e);
                            break; // Stop monitoring if disabled
                        }
                    }
                }
                LlmStatus::Disabled | LlmStatus::Stopped => break,
                _ => {}
            }
        }
    }
}
```

### Event Emission (Tauri Integration)

```rust
impl LlmSidecar {
    /// Emit a Tauri event so the frontend can update the status bar.
    fn emit_status_event(&self) {
        // In the actual Tauri command context, use app_handle.emit_all()
        // This is called via the shared AppState
        // app_handle.emit_all("llm-status-changed", LlmStatusPayload {
        //     status: self.status.clone(),
        //     port: self.port,
        //     model: self.model_path.file_name().unwrap().to_string_lossy().into(),
        // });
    }

    fn emit_notification(&self, title: &str, body: &str) {
        // app_handle.emit_all("notification", NotificationPayload {
        //     title: title.to_string(),
        //     body: body.to_string(),
        //     level: "warning".to_string(),
        // });
    }
}
```

---

## Platform-Specific Binary Management

### Supported Platforms

| Platform      | Binary Name                                  | Architecture |
| ------------- | -------------------------------------------- | ------------ |
| macOS Intel   | `llama-server-x86_64-apple-darwin`           | x86_64       |
| macOS ARM     | `llama-server-aarch64-apple-darwin`          | aarch64      |
| Windows x64   | `llama-server-x86_64-pc-windows-msvc.exe`    | x86_64       |

### Binary Resolution

```rust
/// Resolve the correct llama-server binary for the current platform.
///
/// Binaries are bundled in the Tauri resource directory (configured in
/// tauri.conf.json under `bundle.resources`).
fn resolve_sidecar_binary() -> Result<PathBuf, SidecarError> {
    let resource_dir = tauri::api::path::resource_dir(
        &tauri::Config::default(),
        &tauri::Env::default(),
    ).ok_or(SidecarError::ResourceDirNotFound)?;

    let binary_name = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "llama-server-aarch64-apple-darwin"
        } else {
            "llama-server-x86_64-apple-darwin"
        }
    } else if cfg!(target_os = "windows") {
        "llama-server-x86_64-pc-windows-msvc.exe"
    } else {
        return Err(SidecarError::UnsupportedPlatform);
    };

    let binary_path = resource_dir.join("bin").join(binary_name);

    if !binary_path.exists() {
        return Err(SidecarError::BinaryNotFound(binary_path));
    }

    // Ensure executable permission on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&binary_path)
            .map_err(|e| SidecarError::PermissionError(e.to_string()))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&binary_path, perms)
            .map_err(|e| SidecarError::PermissionError(e.to_string()))?;
    }

    Ok(binary_path)
}
```

### Tauri Configuration

Add to `tauri.conf.json`:

```jsonc
{
  "bundle": {
    "resources": [
      "bin/llama-server-*"
    ]
  },
  "allowlist": {
    "shell": {
      "sidecar": true,
      "scope": [
        {
          "name": "llama-server",
          "cmd": "bin/llama-server-*",
          "args": true
        }
      ]
    }
  }
}
```

### Alternative: tauri-plugin-shell Sidecar

```rust
use tauri_plugin_shell::ShellExt;

/// Spawn using Tauri's built-in sidecar support.
/// The sidecar name in tauri.conf.json maps to the platform-specific binary.
async fn spawn_via_tauri_shell(
    app: &tauri::AppHandle,
    model_path: &str,
    port: u16,
    ctx_size: u32,
    threads: u32,
) -> Result<tauri_plugin_shell::process::CommandChild, SidecarError> {
    let (mut rx, child) = app
        .shell()
        .sidecar("llama-server")
        .map_err(|e| SidecarError::SpawnFailed(e.to_string()))?
        .args([
            "--model", model_path,
            "--ctx-size", &ctx_size.to_string(),
            "--threads", &threads.to_string(),
            "--port", &port.to_string(),
            "--host", "127.0.0.1",
        ])
        .spawn()
        .map_err(|e| SidecarError::SpawnFailed(e.to_string()))?;

    // Spawn a task to log stdout/stderr
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    log::debug!("[llama-server stdout] {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    log::warn!("[llama-server stderr] {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                    log::info!("[llama-server] terminated: {:?}", payload);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(child)
}
```

---

## Model Management

### Supported Models

All models use the **Gemma 4** family (Google DeepMind, April 2026, Apache 2.0 license).

| Model            | Params (Total/Active) | Size (Q4_K_M) | RAM Required | Context  | Use Case                          |
| ---------------- | --------------------- | ------------- | ------------ | -------- | --------------------------------- |
| Gemma-4-E2B      | 4.5B / 2.3B active    | ~3.1 GB       | 4-8 GB       | 128K     | Edge-optimized AI screening       |
| Gemma-4-E4B      | 8B / 4.5B active      | ~5.0 GB       | 16 GB+       | 128K     | Full AI features, structured JSON |
| Gemma-4-26B-A4B  | 26B / 3.8B active MoE | ~16.9 GB      | 24 GB+       | 256K     | Near-frontier clinical reasoning  |

**Key capabilities:** Native function calling + JSON schema conformance (86.4% t2-bench), 128K-256K context windows, configurable thinking mode (chain-of-thought before JSON output).

### GGUF Format Requirements

- All models MUST be in GGUF format (llama.cpp native).
- Quantization: Q4_K_M provides the best quality/size trade-off.
- Never use unquantized (F16/F32) models -- they are too large for desktop use.

### Model Storage

```rust
/// Get the model storage directory.
/// Location: {app_data_dir}/models/
fn model_storage_dir(app: &tauri::AppHandle) -> PathBuf {
    let data_dir = app.path_resolver()
        .app_data_dir()
        .expect("App data dir must exist");
    data_dir.join("models")
}

/// List available models in the storage directory.
fn list_available_models(models_dir: &Path) -> Vec<ModelInfo> {
    std::fs::read_dir(models_dir)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()?.to_str()? == "gguf" {
                Some(ModelInfo {
                    name: path.file_stem()?.to_string_lossy().into(),
                    path: path.clone(),
                    size_bytes: entry.metadata().ok()?.len(),
                })
            } else {
                None
            }
        })
        .collect()
}
```

### First-Run Download

```rust
/// Download a model from a known URL with progress reporting.
/// Alternatively, users can sideload from USB by copying .gguf files
/// into the models directory.
async fn download_model(
    url: &str,
    dest: &Path,
    expected_sha256: &str,
    progress_callback: impl Fn(u64, u64), // (downloaded, total)
) -> Result<(), ModelError> {
    let response = reqwest::get(url).await
        .map_err(|e| ModelError::DownloadFailed(e.to_string()))?;

    let total = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file = tokio::fs::File::create(dest).await
        .map_err(|e| ModelError::IoError(e.to_string()))?;

    let mut stream = response.bytes_stream();
    use futures::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| ModelError::DownloadFailed(e.to_string()))?;
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk).await
            .map_err(|e| ModelError::IoError(e.to_string()))?;
        downloaded += chunk.len() as u64;
        progress_callback(downloaded, total);
    }

    // Verify checksum
    verify_sha256(dest, expected_sha256)?;

    Ok(())
}
```

### SHA-256 Checksum Verification

```rust
use sha2::{Sha256, Digest};

/// Verify the SHA-256 checksum of a downloaded model file.
fn verify_sha256(path: &Path, expected: &str) -> Result<(), ModelError> {
    let mut file = std::fs::File::open(path)
        .map_err(|e| ModelError::IoError(e.to_string()))?;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        use std::io::Read;
        let n = file.read(&mut buffer)
            .map_err(|e| ModelError::IoError(e.to_string()))?;
        if n == 0 { break; }
        hasher.update(&buffer[..n]);
    }

    let hash = format!("{:x}", hasher.finalize());

    if hash != expected {
        // Delete the corrupted file
        let _ = std::fs::remove_file(path);
        return Err(ModelError::ChecksumMismatch {
            expected: expected.to_string(),
            actual: hash,
        });
    }

    Ok(())
}
```

### USB Sideload

Users in air-gapped environments can sideload models:

1. Copy the `.gguf` file to a USB drive.
2. Open the Model Management screen in the app.
3. Click "Import from File" and select the `.gguf` file.
4. The app copies it to the models directory and verifies the checksum.
5. The model appears in the model selector dropdown.

---

## Hardware Detection & Tier Selection

### Hardware Profile

```rust
pub struct HardwareProfile {
    /// Total system RAM in bytes
    pub total_ram_bytes: u64,
    /// Available (free) RAM in bytes
    pub available_ram_bytes: u64,
    /// Number of logical CPU cores
    pub cpu_cores: usize,
    /// Recommended model tier
    pub recommended_tier: ModelTier,
    /// Recommended thread count (cores - 2, minimum 2)
    pub recommended_threads: u32,
    /// Recommended context size
    pub recommended_ctx_size: u32,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum ModelTier {
    /// < 4 GB RAM: Gemma-4-E2B with IQ2_M quantization (basic AI)
    Minimum,
    /// 4-8 GB RAM: Gemma-4-E2B Q4_K_M with 128K context
    Recommended,
    /// 16+ GB RAM: Gemma-4-E4B Q4_K_M with 128K context
    Optimal,
    /// 24+ GB RAM: Gemma-4-26B-A4B Q4_K_M with 256K context (MoE)
    Premium,
}
```

### Detection Logic

```rust
fn detect_hardware() -> HardwareProfile {
    let total_ram = sys_info::mem_info()
        .map(|m| m.total * 1024) // Convert KB to bytes
        .unwrap_or(0);

    let available_ram = sys_info::mem_info()
        .map(|m| m.avail * 1024)
        .unwrap_or(0);

    let cpu_cores = num_cpus::get();

    let total_ram_gb = total_ram / (1024 * 1024 * 1024);

    let recommended_tier = match total_ram_gb {
        0..=3   => ModelTier::Minimum,
        4..=15  => ModelTier::Recommended,
        16..=23 => ModelTier::Optimal,
        _       => ModelTier::Premium,
    };

    let recommended_threads = std::cmp::max(2, cpu_cores as u32 - 2);

    let recommended_ctx_size = match recommended_tier {
        ModelTier::Minimum     => 4096,    // E2B IQ2_M still supports 128K, but limit for RAM
        ModelTier::Recommended => 32768,   // E2B Q4_K_M — generous context
        ModelTier::Optimal     => 131072,  // E4B Q4_K_M — full 128K context
        ModelTier::Premium     => 262144,  // 26B-A4B — full 256K context
    };

    HardwareProfile {
        total_ram_bytes: total_ram,
        available_ram_bytes: available_ram,
        cpu_cores,
        recommended_tier,
        recommended_threads,
        recommended_ctx_size,
    }
}
```

### Tier-Based Configuration

```rust
fn configure_for_tier(tier: &ModelTier) -> Option<SidecarConfig> {
    match tier {
        ModelTier::Minimum => Some(SidecarConfig {
            model_name: "gemma-4-e2b.IQ2_M.gguf",
            ctx_size: 4096,
            // ~2.3 GB model, leaves headroom on 4 GB systems
        }),
        ModelTier::Recommended => Some(SidecarConfig {
            model_name: "gemma-4-e2b.Q4_K_M.gguf",
            ctx_size: 32768,
        }),
        ModelTier::Optimal => Some(SidecarConfig {
            model_name: "gemma-4-e4b.Q4_K_M.gguf",
            ctx_size: 131072,
        }),
        ModelTier::Premium => Some(SidecarConfig {
            model_name: "gemma-4-26b-a4b.Q4_K_M.gguf",
            ctx_size: 262144,
        }),
    }
}
```

---

## API Client

### OpenAI-Compatible Client

The llama-server exposes an OpenAI-compatible `/v1/chat/completions` endpoint.
All requests go to `http://127.0.0.1:{port}`.

```rust
pub struct LlmClient {
    /// Base URL, e.g., "http://127.0.0.1:8081"
    base_url: String,
    /// HTTP client with timeout
    client: reqwest::Client,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ChatMessage {
    pub role: String,     // "system" | "user" | "assistant"
    pub content: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct LlmParams {
    /// 0.1-0.3 for clinical extraction (deterministic)
    pub temperature: f32,
    /// 512 for criterion evaluation, 1024 for entity extraction
    pub max_tokens: u32,
    /// Force JSON output when true
    pub json_mode: bool,
    /// Top-p sampling (0.9 default)
    pub top_p: f32,
}

impl Default for LlmParams {
    fn default() -> Self {
        Self {
            temperature: 0.1,
            max_tokens: 512,
            json_mode: true,
            top_p: 0.9,
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct ChatResponse {
    pub id: String,
    pub choices: Vec<ChatChoice>,
    pub usage: Option<UsageInfo>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct ChatChoice {
    pub index: u32,
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct UsageInfo {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}
```

### Client Implementation

```rust
/// Request timeout for a single LLM call.
const REQUEST_TIMEOUT_SECS: u64 = 60;

impl LlmClient {
    pub fn new(port: u16) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            base_url: format!("http://127.0.0.1:{}", port),
            client,
        }
    }

    /// Send a chat completion request.
    pub async fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
        params: LlmParams,
    ) -> Result<ChatResponse, LlmClientError> {
        let mut body = serde_json::json!({
            "messages": messages,
            "temperature": params.temperature,
            "max_tokens": params.max_tokens,
            "top_p": params.top_p,
            "stream": false,
        });

        // Force JSON mode via response_format
        if params.json_mode {
            body["response_format"] = serde_json::json!({"type": "json_object"});
        }

        let response = self.client
            .post(format!("{}/v1/chat/completions", self.base_url))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| LlmClientError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(LlmClientError::ServerError(status.as_u16(), body));
        }

        response.json::<ChatResponse>()
            .await
            .map_err(|e| LlmClientError::ParseError(e.to_string()))
    }

    /// Check if the LLM server is healthy.
    pub async fn health(&self) -> bool {
        self.client
            .get(format!("{}/health", self.base_url))
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}
```

### Request Queue

LLM inference is single-threaded and slow. Serialize requests to avoid
overloading the sidecar.

```rust
use tokio::sync::mpsc;
use tokio::sync::oneshot;

pub struct LlmRequestQueue {
    sender: mpsc::Sender<QueuedRequest>,
}

struct QueuedRequest {
    messages: Vec<ChatMessage>,
    params: LlmParams,
    response_tx: oneshot::Sender<Result<ChatResponse, LlmClientError>>,
}

impl LlmRequestQueue {
    pub fn new(client: LlmClient) -> Self {
        let (sender, mut receiver) = mpsc::channel::<QueuedRequest>(100);

        // Single consumer processes requests sequentially
        tokio::spawn(async move {
            while let Some(req) = receiver.recv().await {
                let result = client.chat_completion(req.messages, req.params).await;
                let _ = req.response_tx.send(result);
            }
        });

        Self { sender }
    }

    /// Enqueue a request and await the result.
    pub async fn request(
        &self,
        messages: Vec<ChatMessage>,
        params: LlmParams,
    ) -> Result<ChatResponse, LlmClientError> {
        let (response_tx, response_rx) = oneshot::channel();

        self.sender.send(QueuedRequest {
            messages,
            params,
            response_tx,
        }).await.map_err(|_| LlmClientError::QueueFull)?;

        response_rx.await
            .map_err(|_| LlmClientError::RequestCancelled)?
    }
}
```

### Clinical-Specific Parameters

```rust
/// Parameters optimized for criterion evaluation.
/// Low temperature for deterministic results.
pub fn criterion_eval_params() -> LlmParams {
    LlmParams {
        temperature: 0.1,
        max_tokens: 512,
        json_mode: true,
        top_p: 0.9,
    }
}

/// Parameters optimized for entity extraction from clinical notes.
pub fn entity_extraction_params() -> LlmParams {
    LlmParams {
        temperature: 0.2,
        max_tokens: 1024,
        json_mode: true,
        top_p: 0.9,
    }
}

/// Parameters for sponsor pitch narrative generation.
pub fn narrative_generation_params() -> LlmParams {
    LlmParams {
        temperature: 0.3,
        max_tokens: 2048,
        json_mode: false, // Free-form text output
        top_p: 0.9,
    }
}
```

### JSON Mode via System Prompt

When `json_mode` is true but the server does not support `response_format`,
enforce JSON output through the system prompt:

```rust
fn enforce_json_system_prompt(messages: &mut Vec<ChatMessage>) {
    if let Some(system_msg) = messages.iter_mut().find(|m| m.role == "system") {
        if !system_msg.content.contains("JSON") {
            system_msg.content.push_str(
                "\n\nIMPORTANT: You MUST respond with valid JSON only. \
                 No markdown, no explanation, no text outside the JSON object."
            );
        }
    }
}
```

---

## Graceful Degradation

### Feature Availability by Tier

| Feature                        | Minimum (E2B IQ2) | Recommended (E2B Q4) | Optimal (E4B Q4) | Premium (26B-A4B Q4) |
| ------------------------------ | ----------------- | -------------------- | ----------------- | -------------------- |
| Rule-based criterion eval      | Yes               | Yes                  | Yes               | Yes                  |
| AI criterion eval              | Basic             | Yes                  | Full              | Full                 |
| Structured JSON output         | Yes               | Yes                  | Yes               | Yes                  |
| Entity extraction from notes   | Basic             | Yes                  | Full              | Full                 |
| Sponsor pitch generation       | No                | Basic                | Full              | Full                 |
| Semantic trial search          | No                | Basic                | Yes               | Yes                  |
| Full patient record (single prompt) | No           | Partial (32K ctx)    | Yes (128K ctx)    | Yes (256K ctx)       |

### Feature Flags

```typescript
// frontend/src/stores/llm-store.ts

interface LlmFeatureFlags {
  /** Rule-based screening always available */
  ruleBasedScreening: true;
  /** AI-assisted criterion evaluation */
  aiCriterionEval: boolean;
  /** NLP entity extraction from clinical notes */
  entityExtraction: boolean;
  /** AI-generated sponsor pitch documents */
  pitchGeneration: boolean;
  /** Semantic search across trial database */
  semanticSearch: boolean;
}

function featureFlagsForTier(tier: ModelTier): LlmFeatureFlags {
  switch (tier) {
    case 'minimum':
      return {
        ruleBasedScreening: true,
        aiCriterionEval: true,
        entityExtraction: true,
        pitchGeneration: false,
        semanticSearch: false,
      };
    case 'recommended':
      return {
        ruleBasedScreening: true,
        aiCriterionEval: true,
        entityExtraction: true,
        pitchGeneration: true,
        semanticSearch: true,
      };
    case 'optimal':
    case 'premium':
      return {
        ruleBasedScreening: true,
        aiCriterionEval: true,
        entityExtraction: true,
        pitchGeneration: true,
        semanticSearch: true,
      };
  }
}
```

### UI Adaptation

```typescript
// When a feature is unavailable, the UI should:
// 1. Hide the feature entirely (preferred) or
// 2. Show a disabled state with explanation

// Example: AI badge on criterion card
function CriterionAiBadge({ available }: { available: boolean }) {
  if (!available) return null; // Hide entirely when LLM unavailable
  return <Badge variant="outline">AI</Badge>;
}

// Example: Feature gate wrapper
function AiFeatureGate({
  feature,
  children,
  fallback
}: {
  feature: keyof LlmFeatureFlags;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const flags = useLlmStore((s) => s.featureFlags);
  if (!flags[feature]) {
    return fallback ?? null;
  }
  return <>{children}</>;
}
```

---

## Frontend Status Display

### StatusBar Component

```typescript
// frontend/src/components/llm/LlmStatusBar.tsx

interface LlmStatusBarProps {
  className?: string;
}

export function LlmStatusBar({ className }: LlmStatusBarProps) {
  const { status, modelName, memoryUsageMb } = useLlmStore();

  return (
    <div className={cn("flex items-center gap-2 text-xs", className)}>
      <StatusDot status={status} />
      <span className="text-muted-foreground">
        {statusLabel(status, modelName)}
      </span>
      {status === 'starting' && (
        <Progress value={loadingProgress} className="w-20 h-1.5" />
      )}
      {status === 'ready' && memoryUsageMb > 0 && (
        <span className="text-muted-foreground">
          {memoryUsageMb.toFixed(0)} MB
        </span>
      )}
      {status === 'error' && (
        <Button variant="ghost" size="sm" onClick={showTroubleshooting}>
          Help
        </Button>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: LlmStatus }) {
  const color = {
    starting: 'bg-amber-400 animate-pulse',
    ready: 'bg-emerald-500',
    error: 'bg-red-500',
    disabled: 'bg-gray-400',
    stopped: 'bg-gray-400',
  }[status];

  return <div className={cn("w-2 h-2 rounded-full", color)} />;
}

function statusLabel(status: LlmStatus, modelName: string): string {
  switch (status) {
    case 'starting': return `Loading ${modelName}...`;
    case 'ready': return modelName;
    case 'error': return 'AI Error';
    case 'disabled': return 'AI Unavailable';
    case 'stopped': return 'AI Stopped';
  }
}
```

### Troubleshooting Dialog

When the LLM is in an error or disabled state, show actionable information:

```typescript
function LlmTroubleshootingDialog() {
  const { status, lastError, hardwareProfile } = useLlmStore();

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI Model Troubleshooting</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <h4 className="font-medium">Status</h4>
            <p className="text-sm text-muted-foreground">{lastError}</p>
          </div>
          <div>
            <h4 className="font-medium">System Resources</h4>
            <p className="text-sm">
              RAM: {formatBytes(hardwareProfile.availableRamBytes)} available
              of {formatBytes(hardwareProfile.totalRamBytes)}
            </p>
            <p className="text-sm">
              CPU Cores: {hardwareProfile.cpuCores}
            </p>
          </div>
          <div>
            <h4 className="font-medium">Possible Solutions</h4>
            <ul className="text-sm list-disc pl-4 space-y-1">
              <li>Close other applications to free memory</li>
              <li>Try a smaller model (Gemma 4 E2B instead of E4B or 26B)</li>
              <li>Restart the application</li>
              <li>Rule-based screening is still fully functional</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Error Handling & Logging

### Error Types

```rust
#[derive(Debug, thiserror::Error)]
pub enum SidecarError {
    #[error("Failed to spawn sidecar process: {0}")]
    SpawnFailed(String),

    #[error("No available port in range")]
    NoAvailablePort,

    #[error("Sidecar binary not found at: {0}")]
    BinaryNotFound(PathBuf),

    #[error("Resource directory not found")]
    ResourceDirNotFound,

    #[error("Unsupported platform")]
    UnsupportedPlatform,

    #[error("Startup timeout (>{} seconds)", STARTUP_TIMEOUT_SECS)]
    StartupTimeout,

    #[error("Max restart attempts ({}) exceeded", MAX_RESTART_ATTEMPTS)]
    MaxRestartsExceeded,

    #[error("Permission error: {0}")]
    PermissionError(String),
}

#[derive(Debug, thiserror::Error)]
pub enum LlmClientError {
    #[error("Request failed: {0}")]
    RequestFailed(String),

    #[error("Server error (HTTP {0}): {1}")]
    ServerError(u16, String),

    #[error("Failed to parse response: {0}")]
    ParseError(String),

    #[error("Request queue is full")]
    QueueFull,

    #[error("Request was cancelled")]
    RequestCancelled,
}

#[derive(Debug, thiserror::Error)]
pub enum ModelError {
    #[error("Download failed: {0}")]
    DownloadFailed(String),

    #[error("IO error: {0}")]
    IoError(String),

    #[error("Checksum mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch { expected: String, actual: String },
}
```

### Logging Strategy

- All sidecar lifecycle events logged at INFO level.
- Process stdout/stderr forwarded to application log at DEBUG level.
- Errors logged at ERROR level with full context.
- Health check failures logged at WARN level (expected during startup).
- Log files stored in app data directory for troubleshooting.

---

## Testing

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_available_port() {
        let port = find_available_port(8081).unwrap();
        assert!(port >= 8081);
        assert!(port < 8181);
    }

    #[test]
    fn test_hardware_detection() {
        let profile = detect_hardware();
        assert!(profile.total_ram_bytes > 0);
        assert!(profile.cpu_cores > 0);
        assert!(profile.recommended_threads >= 2);
    }

    #[test]
    fn test_tier_configuration() {
        assert!(configure_for_tier(&ModelTier::None).is_none());
        assert!(configure_for_tier(&ModelTier::Small).is_some());
        assert!(configure_for_tier(&ModelTier::Large).is_some());
    }

    #[test]
    fn test_model_tier_from_ram() {
        // 2 GB -> None
        assert_eq!(ram_to_tier(2 * GB), ModelTier::None);
        // 8 GB -> Medium
        assert_eq!(ram_to_tier(8 * GB), ModelTier::Medium);
        // 16 GB -> Large
        assert_eq!(ram_to_tier(16 * GB), ModelTier::Large);
    }
}
```

### Integration Tests

- Start a mock HTTP server on a random port that mimics llama-server /health and /v1/chat/completions.
- Test full spawn-healthcheck-ready lifecycle against mock.
- Test crash detection by killing mock server and verifying restart.
- Test max restarts by failing the mock 4 times and verifying Disabled state.

---

## Checklist

Before modifying the LLM sidecar system:

- [ ] Binary exists for all three platforms in bundle resources
- [ ] Model file verified with SHA-256 checksum
- [ ] Hardware profile checked before attempting to spawn
- [ ] Health check loop runs with 2-second interval
- [ ] Graceful shutdown sends SIGTERM before SIGKILL
- [ ] Restart count tracked, max 3 attempts with exponential backoff
- [ ] Request queue serializes concurrent requests
- [ ] Timeout set to 60 seconds per request
- [ ] Feature flags match model tier capabilities
- [ ] Frontend status bar reflects current LLM state
- [ ] All errors are logged with full context
- [ ] No patient data sent to external services (air-gapped)
