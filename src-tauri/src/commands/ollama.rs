use serde::{Deserialize, Serialize};
use sysinfo::{Disks, System};
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::llm::{LlmBackend, LlmState, LlmStatus, LlmStatusResponse};

// --- Response types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub modified_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OllamaStatus {
    pub installed: bool,
    pub running: bool,
    pub models: Vec<OllamaModel>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemHardware {
    pub total_ram_bytes: u64,
    pub total_ram_gb: f64,
    pub free_disk_bytes: u64,
    pub free_disk_gb: f64,
    pub recommended_tier: String,
    pub recommended_model: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PullProgress {
    pub model: String,
    pub status: String,
    pub total: u64,
    pub completed: u64,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct TestInferenceResult {
    pub success: bool,
    pub latency_ms: u64,
    pub error: Option<String>,
}

// --- Helper: check if ollama binary exists ---

fn ollama_binary_exists() -> bool {
    // Check PATH
    let lookup_cmd = if cfg!(target_os = "windows") { "where" } else { "which" };
    let binary_name = if cfg!(target_os = "windows") { "ollama.exe" } else { "ollama" };

    if let Ok(output) = std::process::Command::new(lookup_cmd).arg(binary_name).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).lines().next().unwrap_or("").trim().to_string();
            if !path.is_empty() {
                return true;
            }
        }
    }

    // Check common locations
    #[cfg(not(target_os = "windows"))]
    {
        let common_paths = ["/usr/local/bin/ollama", "/opt/homebrew/bin/ollama"];
        for path in &common_paths {
            if std::path::Path::new(path).exists() {
                return true;
            }
        }
    }

    false
}

// --- Helper: fetch models from running Ollama ---

async fn fetch_ollama_models() -> Result<Vec<OllamaModel>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .get("http://127.0.0.1:11434/api/tags")
        .send()
        .await
        .map_err(|e| format!("Failed to reach Ollama: {}", e))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    let models = body
        .get("models")
        .and_then(|m| m.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let name = m.get("name")?.as_str()?.to_string();
                    let size = m.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
                    let modified_at = m
                        .get("modified_at")
                        .and_then(|s| s.as_str())
                        .unwrap_or("")
                        .to_string();
                    Some(OllamaModel {
                        name,
                        size,
                        modified_at,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

// --- Tauri commands ---

/// Check whether Ollama is installed and running, and list installed models.
#[tauri::command]
pub async fn check_ollama_status() -> Result<OllamaStatus, String> {
    let installed = ollama_binary_exists();

    // Check if running by hitting the root endpoint
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let running = match client.get("http://127.0.0.1:11434/").send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    };

    let models = if running {
        fetch_ollama_models().await.unwrap_or_default()
    } else {
        vec![]
    };

    // If Ollama is running we know it's installed even if we didn't find the binary on PATH
    Ok(OllamaStatus {
        installed: installed || running,
        running,
        models,
    })
}

/// List models available in the running Ollama instance.
#[tauri::command]
pub async fn get_ollama_models() -> Result<Vec<OllamaModel>, String> {
    fetch_ollama_models().await
}

/// Install Ollama on macOS by downloading and extracting the official app bundle.
/// On Linux: uses the official install script.
/// On Windows: returns an error directing users to the download page.
#[tauri::command]
pub async fn install_ollama(app: AppHandle) -> Result<String, String> {
    let _ = &app;

    #[cfg(target_os = "windows")]
    {
        return Err("On Windows, please download Ollama from https://ollama.com/download".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        tracing::info!("Installing Ollama on macOS");

        let download_url = "https://ollama.com/download/Ollama-darwin.zip";
        let tmp_dir = std::env::temp_dir();
        let zip_path = tmp_dir.join("Ollama-darwin.zip");

        // Clean up any leftover zip from a previous failed attempt
        let _ = tokio::fs::remove_file(&zip_path).await;

        // Step 1: Download the official macOS zip
        let output = tokio::process::Command::new("curl")
            .args(["-fSL", "-o", zip_path.to_str().unwrap_or("/tmp/Ollama-darwin.zip"), download_url])
            .output()
            .await
            .map_err(|e| {
                let _ = std::fs::remove_file(&zip_path);
                format!("Failed to download Ollama: {}", e)
            })?;

        if !output.status.success() {
            let _ = tokio::fs::remove_file(&zip_path).await;
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Download failed: {}", stderr.lines().last().unwrap_or("Unknown error")));
        }

        // Verify the zip file exists and has reasonable size (> 10 MB)
        let zip_meta = tokio::fs::metadata(&zip_path).await.map_err(|e| {
            let _ = std::fs::remove_file(&zip_path);
            format!("Downloaded file missing: {}", e)
        })?;

        if zip_meta.len() < 10_000_000 {
            let _ = tokio::fs::remove_file(&zip_path).await;
            return Err("Downloaded file appears corrupt (too small). Please check your internet connection and try again.".to_string());
        }

        // Step 2: Unzip to /Applications
        let output = tokio::process::Command::new("unzip")
            .args(["-o", "-q", zip_path.to_str().unwrap_or(""), "-d", "/Applications"])
            .output()
            .await
            .map_err(|e| {
                let _ = std::fs::remove_file(&zip_path);
                format!("Failed to extract Ollama: {}", e)
            })?;

        // Always clean up the zip after extraction attempt
        let _ = tokio::fs::remove_file(&zip_path).await;

        if !output.status.success() {
            // Clean up partial extraction
            let _ = tokio::fs::remove_dir_all("/Applications/Ollama.app").await;
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Extraction failed: {}", stderr.lines().last().unwrap_or("Unknown error")));
        }

        // Step 3: Launch Ollama.app (which starts the server)
        let _ = tokio::process::Command::new("open")
            .arg("/Applications/Ollama.app")
            .output()
            .await;

        // Give it a moment to start
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        tracing::info!("Ollama installed and launched successfully");
        Ok("Ollama installed to /Applications and launched".to_string())
    }

    #[cfg(target_os = "linux")]
    {
        tracing::info!("Installing Ollama on Linux via install script");

        let output = tokio::process::Command::new("sh")
            .arg("-c")
            .arg("curl -fsSL https://ollama.com/install.sh | sh 2>&1")
            .output()
            .await
            .map_err(|e| format!("Failed to run install script: {}", e))?;

        if output.status.success() {
            tracing::info!("Ollama installed successfully");
            Ok("Ollama installed successfully".to_string())
        } else {
            let combined = String::from_utf8_lossy(&output.stdout);
            // Get just the last few lines, not the entire curl progress
            let last_lines: String = combined.lines().rev().take(5).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
            Err(format!("Installation failed: {}", last_lines))
        }
    }
}

/// Start the Ollama server. On macOS: opens Ollama.app. On Linux: runs `ollama serve` in background.
#[tauri::command]
pub async fn start_ollama() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        // Try opening the app bundle first (standard install location)
        let app_path = "/Applications/Ollama.app";
        if std::path::Path::new(app_path).exists() {
            let _ = tokio::process::Command::new("open")
                .arg(app_path)
                .output()
                .await
                .map_err(|e| format!("Failed to launch Ollama.app: {}", e))?;
        } else {
            // Fallback: run ollama serve in background
            let _ = tokio::process::Command::new("ollama")
                .arg("serve")
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .map_err(|e| format!("Failed to start ollama serve: {}", e))?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        let _ = tokio::process::Command::new("ollama")
            .arg("serve")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to start ollama serve: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        return Err("On Windows, please start Ollama from the Start menu.".to_string());
    }

    // Wait for server to become reachable
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    for _ in 0..10 {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        if let Ok(resp) = client.get("http://127.0.0.1:11434/").send().await {
            if resp.status().is_success() {
                tracing::info!("Ollama server started and reachable");
                return Ok("Ollama started successfully".to_string());
            }
        }
    }

    Err("Ollama was launched but did not become reachable within 10 seconds. It may still be starting up — try again in a moment.".to_string())
}

/// Pull a model from the Ollama registry, streaming progress events.
#[tauri::command]
pub async fn pull_ollama_model(app: AppHandle, model: String) -> Result<(), String> {
    tracing::info!("Pulling Ollama model: {}", model);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600)) // models can be large
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .post("http://127.0.0.1:11434/api/pull")
        .json(&serde_json::json!({ "name": model, "stream": true }))
        .send()
        .await
        .map_err(|e| format!("Failed to start model pull: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama pull returned status {}", resp.status()));
    }

    // Stream NDJSON lines
    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete lines
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim().to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.is_empty() {
                continue;
            }

            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                let total = val.get("total").and_then(|t| t.as_u64()).unwrap_or(0);
                let completed = val.get("completed").and_then(|c| c.as_u64()).unwrap_or(0);
                let percent = if total > 0 { (completed as f64 / total as f64) * 100.0 } else { 0.0 };
                let progress = PullProgress {
                    model: model.clone(),
                    status: val
                        .get("status")
                        .and_then(|s| s.as_str())
                        .unwrap_or("")
                        .to_string(),
                    total,
                    completed,
                    percent,
                };
                let _ = app.emit("ollama://pull-progress", &progress);
            }
        }
    }

    let _ = app.emit(
        "ollama://pull-complete",
        serde_json::json!({ "model": model, "success": true, "error": serde_json::Value::Null }),
    );
    tracing::info!("Ollama model pull complete: {}", model);

    Ok(())
}

/// Detect system hardware (RAM, disk space) and recommend a model tier.
#[tauri::command]
pub fn detect_system_hardware() -> Result<SystemHardware, String> {
    let mut sys = System::new_all();
    sys.refresh_memory();

    let total_ram_bytes = sys.total_memory(); // bytes
    let total_ram_gb = total_ram_bytes as f64 / (1024.0 * 1024.0 * 1024.0);

    // Get free disk space on the root/home disk (where Ollama stores models)
    let disks = Disks::new_with_refreshed_list();
    let free_disk_bytes = disks.iter()
        .filter(|d| d.mount_point() == std::path::Path::new("/") || d.mount_point() == std::path::Path::new("C:\\"))
        .map(|d| d.available_space())
        .next()
        .or_else(|| disks.iter().map(|d| d.available_space()).max())
        .unwrap_or(0);
    let free_disk_gb = free_disk_bytes as f64 / (1024.0 * 1024.0 * 1024.0);

    let (recommended_tier, recommended_model) = if total_ram_gb >= 16.0 {
        ("standard", "gemma3:4b")
    } else if total_ram_gb >= 8.0 {
        ("lite", "gemma3:1b")
    } else {
        ("none", "none")
    };

    Ok(SystemHardware {
        total_ram_bytes,
        total_ram_gb,
        free_disk_bytes,
        free_disk_gb,
        recommended_tier: recommended_tier.to_string(),
        recommended_model: recommended_model.to_string(),
    })
}

/// Configure the LLM backend to use Ollama with a specific model.
#[tauri::command]
pub async fn configure_ollama_backend(
    app: AppHandle,
    model: String,
) -> Result<LlmStatusResponse, String> {
    // Verify Ollama is running
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .get("http://127.0.0.1:11434/")
        .send()
        .await
        .map_err(|_| "Ollama is not running. Please start Ollama first.".to_string())?;

    if !resp.status().is_success() {
        return Err("Ollama is not responding correctly.".to_string());
    }

    // Verify the model is available
    // Ollama model names may include :latest suffix (e.g., "gemma3:4b" listed as "gemma3:4b")
    // or the tag may be implicit (e.g., user passes "gemma3" which maps to "gemma3:latest")
    let models = fetch_ollama_models().await?;
    let model_found = models.iter().any(|m| {
        m.name == model
            || m.name == format!("{}:latest", model)
            || m.name.starts_with(&format!("{}:", model))
            || model == m.name.split(':').next().unwrap_or("")
    });
    if !model_found {
        return Err(format!(
            "Model '{}' is not available in Ollama. Pull it first.",
            model
        ));
    }

    // Update LlmState
    let llm_state = app.state::<LlmState>();
    let mut lock = llm_state
        .0
        .lock()
        .map_err(|e| format!("Lock poisoned: {}", e))?;

    lock.backend = LlmBackend::Ollama;
    lock.status = LlmStatus::Running;
    lock.ollama_model = Some(model.clone());
    lock.port = 11434;

    tracing::info!("LLM backend configured: Ollama with model {}", model);

    Ok(LlmStatusResponse {
        status: lock.status.clone(),
        model_name: Some(model.clone()),
        model_path: lock.model_path.clone(),
        port: lock.port,
        model_size_bytes: None,
        backend: "ollama".to_string(),
        ollama_model: Some(model),
    })
}

/// Test Ollama inference with a trivial prompt.
#[tauri::command]
pub async fn test_ollama_inference(app: AppHandle) -> Result<TestInferenceResult, String> {
    let model = {
        let llm_state = app.state::<LlmState>();
        let lock = llm_state
            .0
            .lock()
            .map_err(|e| format!("Lock poisoned: {}", e))?;

        if lock.backend != LlmBackend::Ollama {
            return Err("Backend is not set to Ollama".to_string());
        }

        lock.ollama_model
            .clone()
            .ok_or("No Ollama model configured")?
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let start = std::time::Instant::now();

    let result = client
        .post("http://127.0.0.1:11434/v1/chat/completions")
        .json(&serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "Reply with the word 'ok'"}],
            "temperature": 0.0,
            "max_tokens": 8,
        }))
        .send()
        .await;

    let latency_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(resp) if resp.status().is_success() => Ok(TestInferenceResult {
            success: true,
            latency_ms,
            error: None,
        }),
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Ok(TestInferenceResult {
                success: false,
                latency_ms,
                error: Some(format!("Status {}: {}", status, body)),
            })
        }
        Err(e) => Ok(TestInferenceResult {
            success: false,
            latency_ms,
            error: Some(format!("Request failed: {}", e)),
        }),
    }
}
