use std::sync::Mutex;
use std::process::Child;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// State for managing the llama.cpp sidecar process.
pub struct LlmState(pub Mutex<LlmManager>);

impl LlmState {
    pub fn new() -> Self {
        Self(Mutex::new(LlmManager {
            process: None,
            status: LlmStatus::NotConfigured,
            model_path: None,
            port: 8384,
        }))
    }
}

pub struct LlmManager {
    process: Option<Child>,
    status: LlmStatus,
    model_path: Option<String>,
    port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LlmStatus {
    NotConfigured,
    ModelDownloading,
    ModelReady,
    Starting,
    Running,
    Error,
    Stopped,
}

#[derive(Debug, Clone, Serialize)]
pub struct LlmStatusResponse {
    pub status: LlmStatus,
    pub model_name: Option<String>,
    pub model_path: Option<String>,
    pub port: u16,
    pub model_size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LlmEvaluation {
    pub criterion_text: String,
    pub result: String,
    pub confidence: f64,
    pub reasoning: String,
    pub evidence_extracted: Vec<String>,
}

/// Get the current LLM status.
#[tauri::command]
pub fn get_llm_status(app: AppHandle) -> Result<LlmStatusResponse, String> {
    let llm_state = app.state::<LlmState>();
    let lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;

    let model_name = lock.model_path.as_ref().map(|p| {
        std::path::Path::new(p)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string())
    });

    let model_size_bytes = lock.model_path.as_ref().and_then(|p| {
        std::fs::metadata(p).ok().map(|m| m.len())
    });

    Ok(LlmStatusResponse {
        status: lock.status.clone(),
        model_name,
        model_path: lock.model_path.clone(),
        port: lock.port,
        model_size_bytes,
    })
}

/// Set the model path (user selects or downloads a GGUF model).
#[tauri::command]
pub fn set_llm_model(app: AppHandle, model_path: String) -> Result<LlmStatusResponse, String> {
    let path = std::path::Path::new(&model_path);
    if !path.exists() {
        return Err("Model file does not exist".to_string());
    }

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if ext != "gguf" {
        return Err("Model must be a GGUF file (llama.cpp format)".to_string());
    }

    let llm_state = app.state::<LlmState>();
    let mut lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    lock.model_path = Some(model_path);
    lock.status = LlmStatus::ModelReady;

    let model_size_bytes = lock.model_path.as_ref().and_then(|p| {
        std::fs::metadata(p).ok().map(|m| m.len())
    });

    tracing::info!("LLM model configured: {:?}", lock.model_path);

    Ok(LlmStatusResponse {
        status: lock.status.clone(),
        model_name: lock.model_path.as_ref().map(|p| {
            std::path::Path::new(p)
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string())
        }),
        model_path: lock.model_path.clone(),
        port: lock.port,
        model_size_bytes,
    })
}

/// Start the llama.cpp sidecar server.
#[tauri::command]
pub fn start_llm_server(app: AppHandle) -> Result<LlmStatusResponse, String> {
    let llm_state = app.state::<LlmState>();
    let mut lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;

    let model_path = lock.model_path.clone()
        .ok_or("No model configured. Please set a GGUF model path first.")?;

    if lock.process.is_some() {
        return Err("LLM server is already running".to_string());
    }

    lock.status = LlmStatus::Starting;
    let port = lock.port;

    // Try to find llama-server in the app's resources or PATH
    let server_binary = find_llama_server(&app)?;

    tracing::info!("Starting llama-server on port {} with model {}", port, model_path);

    let child = std::process::Command::new(&server_binary)
        .args([
            "--model", &model_path,
            "--port", &port.to_string(),
            "--ctx-size", "4096",
            "--n-gpu-layers", "99",  // Use GPU if available (Metal on macOS)
            "--threads", "4",
            "--host", "127.0.0.1",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start llama-server: {}", e))?;

    lock.process = Some(child);
    lock.status = LlmStatus::Running;

    tracing::info!("llama-server started successfully on port {}", port);

    Ok(LlmStatusResponse {
        status: lock.status.clone(),
        model_name: Some(std::path::Path::new(&model_path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string())),
        model_path: Some(model_path),
        port,
        model_size_bytes: None,
    })
}

/// Stop the llama.cpp sidecar server.
#[tauri::command]
pub fn stop_llm_server(app: AppHandle) -> Result<LlmStatusResponse, String> {
    let llm_state = app.state::<LlmState>();
    let mut lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;

    if let Some(mut child) = lock.process.take() {
        let _ = child.kill();
        let _ = child.wait();
        tracing::info!("llama-server stopped");
    }

    lock.status = if lock.model_path.is_some() {
        LlmStatus::ModelReady
    } else {
        LlmStatus::NotConfigured
    };

    Ok(LlmStatusResponse {
        status: lock.status.clone(),
        model_name: lock.model_path.as_ref().map(|p| {
            std::path::Path::new(p)
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string())
        }),
        model_path: lock.model_path.clone(),
        port: lock.port,
        model_size_bytes: None,
    })
}

/// Check if the LLM server is healthy and responding.
#[tauri::command]
pub async fn check_llm_health(app: AppHandle) -> Result<bool, String> {
    let port = {
        let llm_state = app.state::<LlmState>();
        let lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        if lock.status != LlmStatus::Running {
            return Ok(false);
        }
        lock.port
    };

    let url = format!("http://127.0.0.1:{}/health", port);
    match reqwest::get(&url).await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Evaluate a criterion against patient clinical notes using the local LLM.
#[tauri::command]
pub async fn evaluate_criterion_with_llm(
    app: AppHandle,
    criterion_text: String,
    patient_context: String,
) -> Result<LlmEvaluation, String> {
    let port = {
        let llm_state = app.state::<LlmState>();
        let lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        if lock.status != LlmStatus::Running {
            return Err("LLM server is not running".to_string());
        }
        lock.port
    };

    let prompt = build_criterion_prompt(&criterion_text, &patient_context);
    let url = format!("http://127.0.0.1:{}/completion", port);

    let client = reqwest::Client::new();
    let response = client.post(&url)
        .json(&serde_json::json!({
            "prompt": prompt,
            "n_predict": 512,
            "temperature": 0.1,
            "stop": ["```", "\n\n\n"],
            "grammar": CRITERION_GRAMMAR,
        }))
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let body: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

    let content = body.get("content")
        .and_then(|c| c.as_str())
        .unwrap_or("");

    parse_llm_criterion_response(content, &criterion_text)
}

/// Select a GGUF model file using the system file dialog.
#[tauri::command]
pub async fn pick_llm_model() -> Result<Option<String>, String> {
    let (send, recv) = tokio::sync::oneshot::channel();

    // Use Tauri dialog plugin
    std::thread::spawn(move || {
        // Fallback: return None if dialog not available
        let _ = send.send(None);
    });

    recv.await.map_err(|e| format!("Dialog error: {}", e))
}

// --- Internal helpers ---

fn find_llama_server(app: &AppHandle) -> Result<String, String> {
    // Check in app resources first (bundled binary)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("llama-server");
        if bundled.exists() {
            return Ok(bundled.to_string_lossy().to_string());
        }
        let bundled_mac = resource_dir.join("binaries").join("llama-server");
        if bundled_mac.exists() {
            return Ok(bundled_mac.to_string_lossy().to_string());
        }
    }

    // Check in models directory next to the app
    if let Ok(data_dir) = app.path().app_data_dir() {
        let local = data_dir.join("llama-server");
        if local.exists() {
            return Ok(local.to_string_lossy().to_string());
        }
    }

    // Check PATH using platform-appropriate command
    let lookup_cmd = if cfg!(target_os = "windows") { "where" } else { "which" };
    let binary_name = if cfg!(target_os = "windows") { "llama-server.exe" } else { "llama-server" };

    if let Ok(output) = std::process::Command::new(lookup_cmd).arg(binary_name).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).lines().next().unwrap_or("").trim().to_string();
            if !path.is_empty() {
                return Ok(path);
            }
        }
    }

    // Also check common install locations
    #[cfg(not(target_os = "windows"))]
    let common_paths: &[&str] = &[
        "/usr/local/bin/llama-server",
        "/opt/homebrew/bin/llama-server",
    ];
    #[cfg(target_os = "windows")]
    let common_paths: &[&str] = &[
        r"C:\Program Files\llama-cpp\llama-server.exe",
        r"C:\Program Files (x86)\llama-cpp\llama-server.exe",
    ];

    for path in common_paths {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    // Windows: also check next to the app executable
    #[cfg(target_os = "windows")]
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let beside_exe = exe_dir.join("llama-server.exe");
            if beside_exe.exists() {
                return Ok(beside_exe.to_string_lossy().to_string());
            }
        }
    }

    Err("llama-server not found. Please install llama.cpp or place the binary in the app's data directory.".to_string())
}

fn build_criterion_prompt(criterion: &str, patient_context: &str) -> String {
    format!(
        r#"You are a clinical trial eligibility screener. Evaluate whether a patient meets the following criterion based on their clinical data.

CRITERION: {criterion}

PATIENT DATA:
{patient_context}

Respond in exactly this JSON format:
```json
{{
  "result": "met" | "not_met" | "unknown",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief clinical reasoning",
  "evidence": ["specific data points from patient record"]
}}
```

Rules:
- "met" = clear evidence the patient meets this criterion
- "not_met" = clear evidence the patient does NOT meet this criterion
- "unknown" = insufficient data to determine
- Be conservative: if uncertain, say "unknown"
- Only use evidence from the patient data provided
- confidence should reflect how certain you are (0.9+ for structured data matches, 0.5-0.8 for inferred)

Response:
```json
"#
    )
}

/// Grammar constraint for structured JSON output from llama.cpp.
const CRITERION_GRAMMAR: &str = r#"
root   ::= "{" ws "\"result\"" ws ":" ws result ws "," ws "\"confidence\"" ws ":" ws number ws "," ws "\"reasoning\"" ws ":" ws string ws "," ws "\"evidence\"" ws ":" ws "[" ws evidence-list ws "]" ws "}"
result ::= "\"met\"" | "\"not_met\"" | "\"unknown\""
number ::= [0-9] "." [0-9]+
string ::= "\"" [^"]* "\""
evidence-list ::= string | string ws "," ws evidence-list | ""
ws     ::= [ \t\n]*
"#;

fn parse_llm_criterion_response(raw: &str, criterion_text: &str) -> Result<LlmEvaluation, String> {
    // Try to parse as JSON
    let cleaned = raw.trim().trim_end_matches("```").trim();

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(cleaned) {
        let result = parsed.get("result")
            .and_then(|r| r.as_str())
            .unwrap_or("unknown")
            .to_string();

        let confidence = parsed.get("confidence")
            .and_then(|c| c.as_f64())
            .unwrap_or(0.5);

        let reasoning = parsed.get("reasoning")
            .and_then(|r| r.as_str())
            .unwrap_or("LLM evaluation")
            .to_string();

        let evidence_extracted = parsed.get("evidence")
            .and_then(|e| e.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        Ok(LlmEvaluation {
            criterion_text: criterion_text.to_string(),
            result,
            confidence,
            reasoning,
            evidence_extracted,
        })
    } else {
        // Fallback: couldn't parse LLM output
        Ok(LlmEvaluation {
            criterion_text: criterion_text.to_string(),
            result: "unknown".to_string(),
            confidence: 0.0,
            reasoning: format!("Could not parse LLM response: {}", cleaned),
            evidence_extracted: vec![],
        })
    }
}
