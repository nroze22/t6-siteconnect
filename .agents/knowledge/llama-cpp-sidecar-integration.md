# llama.cpp Sidecar Integration -- Knowledge Reference

> Comprehensive guide to integrating llama-server (llama.cpp HTTP server) as a Tauri v2 sidecar process for local LLM inference in TalOS SiteConnect.

---

## 1. llama-server Overview

`llama-server` is the HTTP server component of the [llama.cpp](https://github.com/ggerganov/llama.cpp) project. It wraps the llama.cpp inference engine in an OpenAI-compatible REST API, enabling local LLM inference without cloud dependencies.

### Key Characteristics

- **Self-contained binary:** Single executable, no runtime dependencies
- **OpenAI-compatible API:** Drop-in replacement for OpenAI's API endpoints
- **CPU and GPU support:** Runs on CPU (all platforms), Metal (macOS), CUDA (NVIDIA), Vulkan
- **GGUF model format:** Loads quantized models in GGUF format for efficient memory usage
- **No network required:** Runs entirely locally on 127.0.0.1

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check -- returns `{"status":"ok"}` when ready |
| `/v1/chat/completions` | POST | Chat completions (messages array) |
| `/v1/completions` | POST | Text completions (raw prompt) |
| `/v1/models` | GET | List loaded models |
| `/v1/embeddings` | POST | Generate embeddings |
| `/slots` | GET | View active inference slots |
| `/metrics` | GET | Prometheus-format metrics |

### Health Check Response States

| Status | Meaning |
|--------|---------|
| `{"status":"ok"}` | Model loaded, ready for inference |
| `{"status":"loading model"}` | Model is being loaded into memory |
| `{"status":"error"}` | Model failed to load |
| Connection refused | Server not yet started |

---

## 2. Sidecar Lifecycle in Tauri

### 2.1 Spawning llama-server

```rust
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use std::sync::Mutex;

pub struct LlmState {
    pub child: Mutex<Option<CommandChild>>,
    pub port: Mutex<Option<u16>>,
    pub model_name: Mutex<Option<String>>,
    pub status: Mutex<LlmStatus>,
}

#[derive(Clone, serde::Serialize)]
pub enum LlmStatus {
    Stopped,
    Starting,
    Ready,
    Error(String),
}

#[tauri::command]
async fn start_llm(
    app: tauri::AppHandle,
    state: tauri::State<'_, LlmState>,
    model_path: String,
) -> Result<u16, AppError> {
    // Check if already running
    if state.child.lock().unwrap().is_some() {
        return Err(AppError::LlmError("LLM server is already running".into()));
    }

    // Find available port
    let port = find_available_port(8080, 8180)?;

    // Determine thread count
    let threads = get_optimal_thread_count();

    // Determine context size based on available RAM
    let ctx_size = get_optimal_context_size();

    *state.status.lock().unwrap() = LlmStatus::Starting;

    let sidecar = app.shell()
        .sidecar("llama-server")
        .map_err(|e| AppError::LlmError(format!("Failed to locate llama-server binary: {}", e)))?
        .args([
            "--model", &model_path,
            "--host", "127.0.0.1",
            "--port", &port.to_string(),
            "--ctx-size", &ctx_size.to_string(),
            "--threads", &threads.to_string(),
            "--log-disable",           // Reduce noise
            "--no-mmap",               // More predictable memory usage
        ]);

    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| AppError::LlmError(format!("Failed to spawn llama-server: {}", e)))?;

    *state.child.lock().unwrap() = Some(child);
    *state.port.lock().unwrap() = Some(port);

    // Monitor process output in background
    let app_handle = app.clone();
    let status_clone = state.status.clone(); // Not possible with State, use Arc instead in real code
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    log::debug!("llama-server: {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    let msg = String::from_utf8_lossy(&line);
                    log::warn!("llama-server: {}", msg);
                    if msg.contains("error") || msg.contains("failed") {
                        app_handle.emit("llm-error", msg.to_string()).ok();
                    }
                }
                CommandEvent::Terminated(payload) => {
                    log::info!("llama-server terminated: code={:?}", payload.code);
                    app_handle.emit("llm-terminated", payload.code).ok();
                }
                _ => {}
            }
        }
    });

    // Wait for server to be ready
    wait_for_health(port, 120).await?;

    *state.status.lock().unwrap() = LlmStatus::Ready;

    Ok(port)
}
```

### 2.2 Command-Line Arguments Reference

| Argument | Description | Recommended Value |
|----------|-------------|-------------------|
| `--model <path>` | Path to GGUF model file | App data directory |
| `--host <addr>` | Bind address | `127.0.0.1` (always localhost) |
| `--port <port>` | Listen port | Dynamic (find available) |
| `--ctx-size <n>` | Context window in tokens | 2048-4096 |
| `--threads <n>` | CPU threads for inference | physical_cores - 1 |
| `--batch-size <n>` | Prompt processing batch size | 512 (default) |
| `--n-gpu-layers <n>` | Layers to offload to GPU | 0 for CPU-only, -1 for all |
| `--log-disable` | Disable request logging | Use in production |
| `--no-mmap` | Load model into RAM instead of memory-mapping | More predictable memory |
| `--chat-template <name>` | Override chat template | Use if model's built-in template is wrong |
| `--temp <float>` | Default temperature | 0.1-0.3 for clinical |
| `--seed <int>` | Random seed for reproducibility | Set for deterministic output |

### 2.3 Health Check Loop

```rust
use reqwest::Client;
use std::time::Duration;

async fn wait_for_health(port: u16, timeout_secs: u64) -> Result<(), AppError> {
    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| AppError::LlmError(e.to_string()))?;

    let url = format!("http://127.0.0.1:{}/health", port);
    let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);

    loop {
        if std::time::Instant::now() > deadline {
            return Err(AppError::LlmError(format!(
                "LLM server did not become ready within {} seconds. \
                 The model may be too large for available memory.",
                timeout_secs
            )));
        }

        match client.get(&url).send().await {
            Ok(resp) => {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    match body["status"].as_str() {
                        Some("ok") => return Ok(()),
                        Some("loading model") => {
                            log::info!("LLM model loading...");
                        }
                        Some("error") => {
                            return Err(AppError::LlmError(
                                "LLM server reported error loading model".into()
                            ));
                        }
                        _ => {}
                    }
                }
            }
            Err(_) => {
                // Server not ready yet, keep waiting
            }
        }

        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}
```

### 2.4 Graceful Shutdown

```rust
#[tauri::command]
async fn stop_llm(state: tauri::State<'_, LlmState>) -> Result<(), AppError> {
    if let Some(child) = state.child.lock().unwrap().take() {
        // On Unix: sends SIGTERM, which llama-server handles gracefully
        // On Windows: calls TerminateProcess
        child.kill().map_err(|e| AppError::LlmError(
            format!("Failed to stop LLM server: {}", e)
        ))?;
        log::info!("LLM server stopped");
    }
    *state.port.lock().unwrap() = None;
    *state.model_name.lock().unwrap() = None;
    *state.status.lock().unwrap() = LlmStatus::Stopped;
    Ok(())
}
```

### 2.5 Crash Detection and Auto-Restart

```rust
async fn monitor_llm_process(
    app: tauri::AppHandle,
    state: Arc<LlmState>,
    model_path: String,
) {
    let mut restart_count = 0;
    let max_restarts = 3;
    let base_backoff_ms = 2000;

    loop {
        // Wait for termination event
        let terminated = wait_for_termination(&state).await;

        if !terminated || restart_count >= max_restarts {
            log::error!("LLM server crashed {} times, disabling LLM features", restart_count);
            *state.status.lock().unwrap() = LlmStatus::Error(
                "LLM server failed repeatedly. Running in rule-based mode only.".into()
            );
            app.emit("llm-disabled", "Too many crashes").ok();
            break;
        }

        restart_count += 1;
        let backoff = base_backoff_ms * (1 << restart_count.min(4));
        log::warn!(
            "LLM server crashed. Restarting in {}ms (attempt {}/{})",
            backoff, restart_count, max_restarts
        );

        tokio::time::sleep(Duration::from_millis(backoff)).await;

        // Attempt restart
        match restart_llm_server(&app, &state, &model_path).await {
            Ok(_) => {
                log::info!("LLM server restarted successfully");
                restart_count = 0; // Reset counter on successful restart
            }
            Err(e) => {
                log::error!("Failed to restart LLM server: {}", e);
            }
        }
    }
}
```

### 2.6 Port Selection

```rust
use std::net::TcpListener;

fn find_available_port(start: u16, end: u16) -> Result<u16, AppError> {
    for port in start..=end {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }
    Err(AppError::LlmError(format!(
        "No available port found in range {}-{}", start, end
    )))
}
```

---

## 3. Model Management

### 3.1 GGUF Format and Quantization Levels

GGUF (GPT-Generated Unified Format) is the standard model format for llama.cpp. Models are quantized to reduce size and memory requirements:

| Quantization | Bits | Size Ratio | Quality | Speed | Use Case |
|-------------|------|-----------|---------|-------|----------|
| F16 | 16 | 1.0x | Best | Slowest | Reference, not practical for desktop |
| Q8_0 | 8 | ~0.5x | Excellent | Good | High quality, needs 16GB+ RAM |
| Q6_K | 6 | ~0.38x | Very Good | Good | Good balance if RAM permits |
| Q5_K_M | 5 | ~0.33x | Good | Fast | Recommended for 16GB systems |
| Q4_K_M | 4 | ~0.27x | Good | Fastest | **Default choice for 8-16GB systems** |
| Q3_K_M | 3 | ~0.22x | Acceptable | Fastest | Only for very constrained systems |
| Q2_K | 2 | ~0.18x | Poor | Fastest | Not recommended for clinical use |

**For clinical screening, Q4_K_M is the recommended minimum.** Below Q4, output quality degrades significantly for medical reasoning tasks.

### 3.2 Model Recommendations

All models use the **Gemma 4** family (Google DeepMind, April 2026, **Apache 2.0** license).

#### Primary Model: Gemma-4-E4B-GGUF (Optimal Tier)

- **Base:** Gemma 4 E4B (8B total params, 4.5B active — edge-optimized dense)
- **Size at Q4_K_M:** ~5.0 GB
- **RAM Required:** ~6-8 GB (model + context)
- **Strengths:** Strong reasoning (GPQA 58.6%), native JSON schema output, function calling (86.4% t2-bench)
- **Context Window:** 128K tokens native
- **Prompt Template:** Gemma 4 instruct format

#### Edge Model: Gemma-4-E2B-GGUF (Recommended Tier)

- **Base:** Gemma 4 E2B (4.5B total params, 2.3B active — edge-optimized dense)
- **Size at Q4_K_M:** ~3.1 GB (IQ2_M: ~2.3 GB for minimum tier)
- **RAM Required:** ~3-5 GB (model + context)
- **Strengths:** Fast CPU inference, native structured JSON, 128K context
- **Context Window:** 128K tokens native
- **Use Case:** Primary model for 4-8 GB RAM systems

#### Premium Model: Gemma-4-26B-A4B-GGUF (Premium Tier)

- **Base:** Gemma 4 26B A4B (26B total params, 3.8B active — Mixture of Experts)
- **Size at Q4_K_M:** ~16.9 GB
- **RAM Required:** ~18-20 GB (model + context)
- **Strengths:** Near-frontier reasoning (GPQA 82.3%, AIME 88.3%), 256K context, MoE efficiency
- **Context Window:** 256K tokens native
- **Use Case:** Premium tier for 24GB+ systems (Mac Studio, high-end laptops)

### 3.3 Model File Storage

```rust
use tauri::Manager;

fn get_models_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, AppError> {
    let app_data = app.path().app_data_dir()
        .map_err(|e| AppError::FileNotFound(e.to_string()))?;
    let models_dir = app_data.join("models");
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| AppError::FileNotFound(e.to_string()))?;
    Ok(models_dir)
}

#[tauri::command]
async fn list_available_models(app: tauri::AppHandle) -> Result<Vec<ModelInfo>, AppError> {
    let models_dir = get_models_dir(&app)?;
    let mut models = Vec::new();

    for entry in std::fs::read_dir(&models_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("gguf") {
            let metadata = entry.metadata()?;
            models.push(ModelInfo {
                name: path.file_stem().unwrap().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                size_bytes: metadata.len(),
                size_display: format_file_size(metadata.len()),
            });
        }
    }

    Ok(models)
}
```

### 3.4 First-Run Model Download or USB Sideload

```rust
#[derive(serde::Serialize, Clone)]
pub struct DownloadProgress {
    pub bytes_downloaded: u64,
    pub total_bytes: Option<u64>,
    pub percent: Option<f64>,
    pub speed_mbps: f64,
}

#[tauri::command]
async fn download_model(
    app: tauri::AppHandle,
    url: String,
    filename: String,
    expected_sha256: String,
) -> Result<String, AppError> {
    let models_dir = get_models_dir(&app)?;
    let dest_path = models_dir.join(&filename);

    // Stream download with progress
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await
        .map_err(|e| AppError::LlmError(format!("Download failed: {}", e)))?;

    let total_size = resp.content_length();
    let mut downloaded: u64 = 0;
    let mut file = tokio::fs::File::create(&dest_path).await
        .map_err(|e| AppError::LlmError(e.to_string()))?;

    let mut stream = resp.bytes_stream();
    let start = std::time::Instant::now();

    use tokio::io::AsyncWriteExt;
    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::LlmError(e.to_string()))?;
        file.write_all(&chunk).await
            .map_err(|e| AppError::LlmError(e.to_string()))?;
        downloaded += chunk.len() as u64;

        let elapsed = start.elapsed().as_secs_f64();
        let speed = if elapsed > 0.0 { (downloaded as f64 / elapsed) / 1_000_000.0 } else { 0.0 };

        app.emit("model-download-progress", DownloadProgress {
            bytes_downloaded: downloaded,
            total_bytes: total_size,
            percent: total_size.map(|t| downloaded as f64 / t as f64 * 100.0),
            speed_mbps: speed,
        }).ok();
    }

    file.flush().await.map_err(|e| AppError::LlmError(e.to_string()))?;

    // Verify checksum
    verify_sha256(&dest_path, &expected_sha256).await?;

    Ok(dest_path.to_string_lossy().to_string())
}

// USB sideload: user picks the GGUF file from a USB drive
#[tauri::command]
async fn sideload_model(
    app: tauri::AppHandle,
    source_path: String,
    expected_sha256: Option<String>,
) -> Result<String, AppError> {
    let models_dir = get_models_dir(&app)?;
    let source = std::path::Path::new(&source_path);
    let filename = source.file_name()
        .ok_or(AppError::ValidationError("Invalid file path".into()))?;
    let dest_path = models_dir.join(filename);

    // Copy file
    std::fs::copy(&source_path, &dest_path)
        .map_err(|e| AppError::LlmError(format!("Failed to copy model: {}", e)))?;

    // Verify checksum if provided
    if let Some(sha) = expected_sha256 {
        verify_sha256(&dest_path, &sha).await?;
    }

    Ok(dest_path.to_string_lossy().to_string())
}
```

### 3.5 Model Integrity Verification

```rust
use sha2::{Sha256, Digest};
use tokio::io::AsyncReadExt;

async fn verify_sha256(path: &std::path::Path, expected: &str) -> Result<(), AppError> {
    let mut file = tokio::fs::File::open(path).await
        .map_err(|e| AppError::LlmError(e.to_string()))?;

    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 8192];

    loop {
        let bytes_read = file.read(&mut buffer).await
            .map_err(|e| AppError::LlmError(e.to_string()))?;
        if bytes_read == 0 { break; }
        hasher.update(&buffer[..bytes_read]);
    }

    let hash = format!("{:x}", hasher.finalize());
    if hash != expected.to_lowercase() {
        // Delete corrupted file
        tokio::fs::remove_file(path).await.ok();
        return Err(AppError::LlmError(format!(
            "Model integrity check failed. Expected SHA-256: {}, got: {}. File deleted.",
            expected, hash
        )));
    }

    log::info!("Model integrity verified: {}", path.display());
    Ok(())
}
```

---

## 4. API Usage Patterns

### 4.1 Chat Completions for Eligibility Reasoning

```rust
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f64,
    max_tokens: u32,
    response_format: Option<ResponseFormat>,
}

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ResponseFormat {
    #[serde(rename = "type")]
    format_type: String,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<Choice>,
    usage: Usage,
}

#[derive(Deserialize)]
struct Choice {
    message: ResponseMessage,
    finish_reason: String,
}

#[derive(Deserialize)]
struct ResponseMessage {
    content: String,
}

#[derive(Deserialize)]
struct Usage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

async fn evaluate_criterion_with_llm(
    port: u16,
    patient_data: &str,
    criterion_text: &str,
) -> Result<CriterionEvaluation, AppError> {
    let client = Client::new();
    let url = format!("http://127.0.0.1:{}/v1/chat/completions", port);

    let request = ChatCompletionRequest {
        model: "local".to_string(),
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: CLINICAL_SCREENING_SYSTEM_PROMPT.to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "## Patient Data\n{}\n\n## Eligibility Criterion\n{}\n\n\
                     Evaluate whether this patient meets the criterion. \
                     Respond with JSON only.",
                    patient_data, criterion_text
                ),
            },
        ],
        temperature: 0.1,
        max_tokens: 512,
        response_format: Some(ResponseFormat {
            format_type: "json_object".to_string(),
        }),
    };

    let response = client.post(&url)
        .json(&request)
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| AppError::LlmError(format!("LLM request failed: {}", e)))?;

    let completion: ChatCompletionResponse = response.json().await
        .map_err(|e| AppError::LlmError(format!("Failed to parse LLM response: {}", e)))?;

    let content = &completion.choices[0].message.content;
    let evaluation: CriterionEvaluation = serde_json::from_str(content)
        .map_err(|e| AppError::LlmError(format!(
            "Failed to parse LLM output as JSON: {}. Raw output: {}", e, content
        )))?;

    Ok(evaluation)
}

#[derive(Deserialize, Serialize)]
struct CriterionEvaluation {
    status: String,       // "met", "not_met", "unknown", "needs_review"
    confidence: f64,      // 0.0 - 1.0
    reasoning: String,    // Brief explanation
    matched_data: Option<String>,  // What data was matched
}
```

### 4.2 Temperature Settings for Clinical Use

| Temperature | Use Case | Rationale |
|------------|----------|-----------|
| 0.0-0.1 | Structured data extraction, JSON output | Maximum determinism, reproducible results |
| 0.1-0.3 | Eligibility criterion evaluation | Slight creativity for reasoning, mostly deterministic |
| 0.3-0.5 | Free-text summarization | Allow some variation in phrasing |
| >0.5 | **Not recommended** | Too much randomness for clinical applications |

**Default for SiteConnect: 0.1**

### 4.3 Streaming vs Non-Streaming

**Non-streaming (recommended for SiteConnect):**
- Simpler error handling
- Response is complete before processing
- Easier to validate JSON output
- Better for batch processing

**Streaming (optional for UX):**
- Shows "thinking" indicator in UI
- Better perceived responsiveness for single-criterion evaluation
- More complex error handling (partial JSON)

```rust
// Non-streaming (default)
let request = ChatCompletionRequest {
    // ... fields
    stream: false,
};

// Streaming
let request = ChatCompletionRequest {
    // ... fields
    stream: true,
};

// Handle SSE stream
let mut stream = response.bytes_stream();
while let Some(chunk) = stream.next().await {
    let chunk = chunk?;
    let text = String::from_utf8_lossy(&chunk);
    // Parse "data: {json}\n\n" lines
    for line in text.lines() {
        if line.starts_with("data: ") && line != "data: [DONE]" {
            let json_str = &line[6..];
            // Parse and emit to frontend
        }
    }
}
```

### 4.4 Timeout Handling

```rust
const LLM_REQUEST_TIMEOUT_SECS: u64 = 120;  // 2 minutes max for a single request
const LLM_HEALTH_TIMEOUT_SECS: u64 = 5;

async fn llm_request_with_timeout(
    port: u16,
    request: &ChatCompletionRequest,
) -> Result<ChatCompletionResponse, AppError> {
    let client = Client::builder()
        .timeout(Duration::from_secs(LLM_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::LlmError(e.to_string()))?;

    let url = format!("http://127.0.0.1:{}/v1/chat/completions", port);

    match client.post(&url).json(request).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                resp.json().await
                    .map_err(|e| AppError::LlmError(format!("Invalid response: {}", e)))
            } else {
                Err(AppError::LlmError(format!("LLM returned status {}", resp.status())))
            }
        }
        Err(e) if e.is_timeout() => {
            Err(AppError::LlmError(
                "LLM request timed out. The criterion may be too complex. \
                 Try breaking it into simpler sub-criteria.".into()
            ))
        }
        Err(e) if e.is_connect() => {
            Err(AppError::LlmError(
                "Cannot connect to LLM server. It may have crashed.".into()
            ))
        }
        Err(e) => Err(AppError::LlmError(e.to_string())),
    }
}
```

---

## 5. Memory Management

### 5.1 RAM Requirements Estimation

```
Total RAM needed = model_file_size * 1.2 + context_tokens * 2 MB / 1024

Examples:
- Gemma-4-E2B Q4_K_M (3.1 GB) + 32K ctx:
  3.1 * 1.2 + 32768 * 0.002 = 3.72 + 65.5 = ~69 GB theoretical
  (practically ~4-5 GB due to memory mapping and GQA)

- Gemma-4-E4B Q4_K_M (5.0 GB) + 128K ctx:
  5.0 * 1.2 + 131072 * 0.002 = 6.0 + 262 = ~268 GB theoretical
  (practically ~6-8 GB due to memory mapping, GQA, and KV cache optimization)

- Gemma-4-26B-A4B Q4_K_M (16.9 GB) + 256K ctx:
  Practically ~18-20 GB (MoE only activates 3.8B params per token)
```

**Note:** The 1.2x multiplier accounts for KV cache, computation buffers, and overhead. Context memory scales linearly with context size and model dimensions.

### 5.2 Context Window Sizing

| Use Case | Recommended Context | Rationale |
|----------|-------------------|-----------|
| Single criterion evaluation | 2048 tokens | Short patient data summary + criterion + response |
| Multi-criterion evaluation | 4096 tokens | Full patient profile + multiple criteria |
| Clinical note analysis | 4096-8192 tokens | Longer free-text input |
| Simple structured data only | 1024 tokens | Minimal input, structured JSON output |

**Rule of thumb:** 1 token is roughly 4 characters of English text, or 0.75 words.

### 5.3 Detecting Available System RAM

```rust
use sysinfo::System;

fn get_available_ram_gb() -> f64 {
    let mut sys = System::new_all();
    sys.refresh_memory();
    sys.total_memory() as f64 / 1_073_741_824.0  // bytes to GB
}

fn get_free_ram_gb() -> f64 {
    let mut sys = System::new_all();
    sys.refresh_memory();
    sys.available_memory() as f64 / 1_073_741_824.0
}

#[tauri::command]
fn get_system_capabilities() -> SystemCapabilities {
    let total_ram = get_available_ram_gb();
    let free_ram = get_free_ram_gb();
    let cpu_cores = num_cpus::get_physical();

    SystemCapabilities {
        total_ram_gb: total_ram,
        free_ram_gb: free_ram,
        cpu_cores,
        recommended_model: recommend_model(total_ram),
        llm_available: total_ram >= 6.0,
    }
}
```

### 5.4 OOM Handling

```rust
async fn safe_llm_inference(
    port: u16,
    request: &ChatCompletionRequest,
) -> Result<ChatCompletionResponse, AppError> {
    // Check available memory before inference
    let free_ram = get_free_ram_gb();
    if free_ram < 1.0 {
        return Err(AppError::LlmError(
            "Insufficient free memory for LLM inference. \
             Close other applications and try again, or use rule-based screening only.".into()
        ));
    }

    match llm_request_with_timeout(port, request).await {
        Ok(response) => Ok(response),
        Err(AppError::LlmError(msg)) if msg.contains("killed") || msg.contains("signal") => {
            // Process was killed, likely OOM
            log::error!("LLM process killed, likely OOM");
            Err(AppError::LlmError(
                "LLM process was terminated due to insufficient memory. \
                 Switching to rule-based screening mode. \
                 Consider using a smaller model or closing other applications.".into()
            ))
        }
        Err(e) => Err(e),
    }
}
```

---

## 6. Performance Optimization

### 6.1 Thread Count

```rust
fn get_optimal_thread_count() -> usize {
    let physical = num_cpus::get_physical();
    // Reserve 1 core for the OS and Tauri app
    // Never use fewer than 1 thread
    physical.saturating_sub(1).max(1)
}
```

**Guidelines:**
- Use **physical cores**, not logical cores (hyperthreading does not help llama.cpp)
- Reserve at least 1 core for the application and OS
- On Apple Silicon Macs, all cores are efficient for llama.cpp inference

### 6.2 Batch Size Tuning

The `--batch-size` parameter controls how many tokens are processed in parallel during prompt evaluation:

| Batch Size | Effect |
|-----------|--------|
| 128 | Lower memory usage, slower prompt processing |
| 512 | **Default, good balance** |
| 1024 | Faster prompt processing, higher memory usage |
| 2048 | Maximum throughput for long prompts |

For SiteConnect, the default (512) is appropriate. Increase to 1024 if prompts are long and the system has sufficient RAM.

### 6.3 Prompt Caching

llama-server automatically caches the KV state for the system prompt across requests. To take advantage of this:

- **Use the same system prompt for all requests** -- do not vary it between calls
- **Put variable content in the user message** -- patient data, criterion text
- **Keep the system prompt at the beginning** -- the cache works prefix-based

```rust
// GOOD: Same system prompt, different user messages
// The system prompt KV cache is reused across all criterion evaluations

const SYSTEM_PROMPT: &str = "You are a clinical trial screening assistant...";

// Request 1: Evaluate criterion A
messages: [
    { role: "system", content: SYSTEM_PROMPT },      // Cached after first request
    { role: "user", content: "Patient: ...\nCriterion A: ..." }  // Different each time
]

// Request 2: Evaluate criterion B
messages: [
    { role: "system", content: SYSTEM_PROMPT },      // Cache hit!
    { role: "user", content: "Patient: ...\nCriterion B: ..." }  // Different each time
]
```

### 6.4 Request Queuing

llama-server can handle concurrent requests, but for desktop use, serial processing is more reliable:

```rust
use tokio::sync::Semaphore;

struct LlmRequestQueue {
    semaphore: Semaphore,
}

impl LlmRequestQueue {
    fn new() -> Self {
        Self {
            semaphore: Semaphore::new(1),  // Only 1 concurrent request
        }
    }

    async fn execute<F, T>(&self, f: F) -> Result<T, AppError>
    where
        F: std::future::Future<Output = Result<T, AppError>>,
    {
        let _permit = self.semaphore.acquire().await
            .map_err(|_| AppError::LlmError("Request queue closed".into()))?;
        f.await
    }
}
```

---

## 7. Prompt Engineering for Medical LLMs

### 7.1 Gemma 4 Prompt Format

Gemma 4 uses its native instruct template with optional thinking mode:

```
<start_of_turn>user
{user_message}<end_of_turn>
<start_of_turn>model
```

When using `/v1/chat/completions`, the server applies the template automatically. Gemma 4 natively supports:
- **JSON mode:** Set `response_format: { "type": "json_object" }` for guaranteed JSON output
- **Function calling:** Define tools via JSON schemas in the system prompt
- **Thinking mode:** Configurable chain-of-thought reasoning before producing the final response

### 7.2 System Prompts for Clinical Reasoning

```rust
const CLINICAL_SCREENING_SYSTEM_PROMPT: &str = r#"You are a clinical trial eligibility screening assistant. Your role is to evaluate whether a patient's medical data meets specific eligibility criteria from a clinical trial protocol.

INSTRUCTIONS:
1. Analyze the patient data provided against the given eligibility criterion.
2. Determine if the criterion is MET, NOT_MET, or UNKNOWN based solely on the available data.
3. If the data is insufficient to make a determination, respond with UNKNOWN.
4. Provide a brief reasoning for your determination.
5. Cite the specific data points that support your determination.
6. Assign a confidence score from 0.0 to 1.0.

IMPORTANT RULES:
- Base your assessment ONLY on the data provided. Do not assume or infer missing data.
- If a lab value, diagnosis, or medication is not listed, it is UNKNOWN, not absent.
- For temporal criteria (e.g., "within 4 weeks"), use the provided dates to calculate intervals.
- For ULN/LLN references, use standard reference ranges unless the data includes lab-specific ranges.
- Always respond in valid JSON format.

RESPONSE FORMAT:
{
  "status": "met" | "not_met" | "unknown",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of determination",
  "matched_data": "Specific data points used",
  "flags": ["any concerns or caveats"]
}"#;
```

### 7.3 Few-Shot Examples for Consistent JSON Output

```rust
const FEW_SHOT_EXAMPLES: &str = r#"
## Example 1
Patient Data: Age: 62, Sex: M, Diagnoses: [E11.9 - Type 2 DM, I10 - Hypertension]
Criterion: "Age >= 18 years"
Response: {"status": "met", "confidence": 1.0, "reasoning": "Patient is 62 years old, which is >= 18.", "matched_data": "Age: 62", "flags": []}

## Example 2
Patient Data: Age: 45, Sex: F, Labs: [HbA1c: 8.2% (2024-01-15), eGFR: 55 mL/min (2024-02-01)]
Criterion: "eGFR >= 60 mL/min/1.73m2"
Response: {"status": "not_met", "confidence": 0.95, "reasoning": "Patient's most recent eGFR is 55 mL/min, which is below the 60 mL/min threshold.", "matched_data": "eGFR: 55 mL/min (2024-02-01)", "flags": ["eGFR is close to threshold (55 vs 60), may warrant recheck"]}

## Example 3
Patient Data: Age: 58, Sex: M, Diagnoses: [C34.9 - Lung cancer], Medications: [Carboplatin (completed 2023-06-15)]
Criterion: "No prior immune checkpoint inhibitor therapy"
Response: {"status": "unknown", "confidence": 0.3, "reasoning": "The patient has a history of carboplatin (a platinum agent) but no checkpoint inhibitors are listed in the medication history. However, the medication list may be incomplete.", "matched_data": "Medications listed: Carboplatin only", "flags": ["Medication history may be incomplete", "Manual chart review recommended"]}
"#;
```

### 7.4 Handling Hallucination

LLMs may hallucinate medical knowledge or infer information not present in the data. Mitigations:

1. **Explicit "unknown" option:** Always include UNKNOWN as a valid response, with instructions to use it when data is insufficient.

2. **Grounding instructions:** "Base your assessment ONLY on the data provided."

3. **Confidence scoring:** Low confidence scores trigger manual review.

4. **Post-processing validation:**

```rust
fn validate_llm_output(evaluation: &CriterionEvaluation, patient_data: &PatientData) -> CriterionEvaluation {
    let mut validated = evaluation.clone();

    // If LLM claims data was matched, verify it actually exists in patient data
    if let Some(ref matched) = evaluation.matched_data {
        if !patient_data_contains_reference(patient_data, matched) {
            log::warn!("LLM referenced data not found in patient record: {}", matched);
            validated.confidence *= 0.5;
            validated.flags.push("LLM referenced data not verified in patient record".into());
        }
    }

    // Cap confidence at 0.8 for LLM evaluations (rule-based gets higher)
    if validated.confidence > 0.8 {
        validated.confidence = 0.8;
    }

    // Force unknown if no matched data provided
    if validated.matched_data.is_none() && validated.status == "met" {
        validated.status = "unknown".into();
        validated.confidence = 0.0;
        validated.reasoning = "LLM claimed criterion was met but cited no supporting data.".into();
    }

    validated
}
```

5. **Never trust LLM for definitive eligibility determination.** LLM results are always advisory and subject to human review. The application UI should clearly indicate which results came from AI vs rule-based evaluation.

---

## 8. Graceful Degradation Strategy

### 8.1 Hardware Detection and Model Selection

```rust
#[derive(Serialize, Clone)]
pub struct LlmCapability {
    pub model: Option<String>,
    pub features: Vec<String>,
    pub tier: CapabilityTier,
    pub reason: String,
}

#[derive(Serialize, Clone)]
pub enum CapabilityTier {
    Premium,      // Gemma-4-26B-A4B, near-frontier reasoning, 256K context
    Optimal,      // Gemma-4-E4B, full AI features, 128K context
    Recommended,  // Gemma-4-E2B Q4_K_M, AI screening + structured JSON
    Minimum,      // Gemma-4-E2B IQ2_M, basic AI screening
}

fn determine_capability(total_ram_gb: f64) -> LlmCapability {
    if total_ram_gb >= 24.0 {
        LlmCapability {
            model: Some("Gemma-4-26B-A4B-Q4_K_M".into()),
            features: vec![
                "criterion_evaluation".into(),
                "free_text_extraction".into(),
                "clinical_reasoning".into(),
                "confidence_scoring".into(),
                "structured_json".into(),
                "function_calling".into(),
            ],
            tier: CapabilityTier::Premium,
            reason: format!("{:.0} GB RAM detected. Premium tier with near-frontier reasoning.", total_ram_gb),
        }
    } else if total_ram_gb >= 16.0 {
        LlmCapability {
            model: Some("Gemma-4-E4B-Q4_K_M".into()),
            features: vec![
                "criterion_evaluation".into(),
                "free_text_extraction".into(),
                "clinical_reasoning".into(),
                "confidence_scoring".into(),
                "structured_json".into(),
                "function_calling".into(),
            ],
            tier: CapabilityTier::Optimal,
            reason: format!("{:.0} GB RAM detected. Full AI capability with 128K context.", total_ram_gb),
        }
    } else if total_ram_gb >= 4.0 {
        LlmCapability {
            model: Some("Gemma-4-E2B-Q4_K_M".into()),
            features: vec![
                "criterion_evaluation".into(),
                "confidence_scoring".into(),
                "structured_json".into(),
                "basic_text_extraction".into(),
            ],
            tier: CapabilityTier::Recommended,
            reason: format!(
                "{:.0} GB RAM detected. AI screening with Gemma 4 E2B.",
                total_ram_gb
            ),
        }
    } else {
        LlmCapability {
            model: Some("Gemma-4-E2B-IQ2_M".into()),
            features: vec![
                "basic_criterion_evaluation".into(),
                "structured_json".into(),
            ],
            tier: CapabilityTier::Minimum,
            reason: format!(
                "{:.0} GB RAM detected. Basic AI with Gemma 4 E2B (IQ2_M quantization).",
                total_ram_gb
            ),
        }
    }
}
```

### 8.2 Feature Availability Matrix

| Feature | Premium (24GB+) | Optimal (16GB+) | Recommended (4-16GB) | Minimum (<4GB) |
|---------|----------------|----------------|---------------------|----------------|
| Age/sex/demographics matching | Rule | Rule | Rule | Rule |
| ICD-10 diagnosis matching | Rule | Rule | Rule | Rule |
| Lab value comparison | Rule | Rule | Rule | Rule |
| RxNorm medication matching | Rule | Rule | Rule | Rule |
| Vital sign comparison | Rule | Rule | Rule | Rule |
| Washout period calculation | Rule | Rule | Rule | Rule |
| Structured JSON output | LLM (native) | LLM (native) | LLM (native) | LLM (native) |
| Free-text diagnosis extraction | LLM (256K ctx) | LLM (128K ctx) | LLM (32K ctx) | LLM (4K ctx) |
| Complex criterion reasoning | LLM (full) | LLM (full) | LLM | LLM (basic) |
| Clinical note analysis | LLM (256K ctx) | LLM (128K ctx) | LLM (32K ctx) | LLM (4K ctx) |
| Confidence explanation | LLM | LLM | LLM | LLM (basic) |
| Multi-criterion synthesis | LLM | LLM | LLM | LLM (basic) |
| Full patient record in single prompt | Yes (256K) | Yes (128K) | Partial (32K) | No (4K) |

### 8.3 Feature Flags Tied to Model Availability

```rust
pub struct FeatureFlags {
    pub llm_criterion_evaluation: bool,
    pub llm_free_text_extraction: bool,
    pub llm_clinical_notes: bool,
    pub llm_confidence_explanation: bool,
    pub max_context_tokens: u32,
}

impl From<&LlmCapability> for FeatureFlags {
    fn from(cap: &LlmCapability) -> Self {
        match cap.tier {
            CapabilityTier::Premium => FeatureFlags {
                llm_criterion_evaluation: true,
                llm_free_text_extraction: true,
                llm_clinical_notes: true,
                llm_confidence_explanation: true,
                max_context_tokens: 262144, // 256K (Gemma 4 26B-A4B)
            },
            CapabilityTier::Optimal => FeatureFlags {
                llm_criterion_evaluation: true,
                llm_free_text_extraction: true,
                llm_clinical_notes: true,
                llm_confidence_explanation: true,
                max_context_tokens: 131072, // 128K (Gemma 4 E4B)
            },
            CapabilityTier::Recommended => FeatureFlags {
                llm_criterion_evaluation: true,
                llm_free_text_extraction: true,
                llm_clinical_notes: true,
                llm_confidence_explanation: true,
                max_context_tokens: 32768, // 32K (Gemma 4 E2B, RAM-limited)
            },
            CapabilityTier::Minimum => FeatureFlags {
                llm_criterion_evaluation: true,
                llm_free_text_extraction: true,
                llm_clinical_notes: false,
                llm_confidence_explanation: false,
                max_context_tokens: 4096, // 4K (Gemma 4 E2B IQ2_M, RAM-limited)
            },
        }
    }
}
```

### 8.4 Hybrid Screening Pipeline

The screening engine should use rules first, then LLM only when rules are insufficient:

```rust
async fn screen_criterion(
    criterion: &EligibilityCriterion,
    patient: &PatientData,
    llm_port: Option<u16>,
    features: &FeatureFlags,
) -> CriterionResult {
    // Step 1: Try rule-based evaluation first (fast, deterministic)
    if let Some(result) = evaluate_with_rules(criterion, patient) {
        return CriterionResult {
            source: "rule_engine",
            ..result
        };
    }

    // Step 2: If rule engine cannot determine, try LLM (if available)
    if features.llm_criterion_evaluation {
        if let Some(port) = llm_port {
            match evaluate_with_llm(port, patient, criterion).await {
                Ok(result) => {
                    return CriterionResult {
                        source: "llm",
                        ..result
                    };
                }
                Err(e) => {
                    log::warn!("LLM evaluation failed for criterion {}: {}", criterion.id, e);
                    // Fall through to manual review
                }
            }
        }
    }

    // Step 3: If neither can determine, flag for manual review
    CriterionResult {
        criterion_id: criterion.id.clone(),
        status: MatchStatus::NeedsReview,
        confidence: 0.0,
        reasoning: "Could not be evaluated automatically. Manual chart review required.".into(),
        source: "manual_review_required",
        matched_data: None,
    }
}
```

---

## 9. Context Window Token Budget

When constructing prompts, manage the token budget carefully:

```
Total Context Budget: 4096 tokens (example)

System prompt:          ~400 tokens  (fixed)
Few-shot examples:      ~600 tokens  (optional, include for complex criteria)
Patient data summary:   ~800 tokens  (variable, trim if needed)
Criterion text:         ~200 tokens  (variable)
Reserved for response:  ~500 tokens  (max_tokens setting)
Safety margin:          ~100 tokens

Remaining budget:       ~1,496 tokens available for additional context
```

### Patient Data Summarization

When patient data exceeds the budget, prioritize fields relevant to the criterion:

```rust
fn summarize_patient_for_criterion(
    patient: &PatientData,
    criterion: &EligibilityCriterion,
    max_tokens: u32,
) -> String {
    let mut summary = String::new();

    // Always include demographics (small, always relevant)
    summary.push_str(&format!(
        "Age: {}, Sex: {}\n",
        patient.age, patient.sex
    ));

    // Include data categories relevant to the criterion
    match criterion.category {
        CriterionCategory::Diagnosis | CriterionCategory::Comorbidity => {
            summary.push_str(&format_diagnoses(&patient.diagnoses));
        }
        CriterionCategory::LabValues | CriterionCategory::OrganFunction => {
            summary.push_str(&format_recent_labs(&patient.labs, 90)); // Last 90 days
        }
        CriterionCategory::Medications | CriterionCategory::WashoutPeriod => {
            summary.push_str(&format_medications(&patient.medications));
        }
        _ => {
            // Include all categories but truncated
            summary.push_str(&format_diagnoses_short(&patient.diagnoses, 10));
            summary.push_str(&format_recent_labs_short(&patient.labs, 30, 10));
            summary.push_str(&format_medications_short(&patient.medications, 10));
        }
    }

    // Estimate token count (rough: 4 chars per token)
    let estimated_tokens = summary.len() / 4;
    if estimated_tokens > max_tokens as usize {
        // Truncate to budget
        let char_limit = max_tokens as usize * 4;
        summary.truncate(char_limit);
        summary.push_str("\n[Data truncated due to length]");
    }

    summary
}
```
