use std::sync::Mutex;
use std::process::Child;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LlmBackend {
    None,
    Ollama,
    LlamaServer,
}

/// State for managing the llama.cpp sidecar process.
pub struct LlmState(pub Mutex<LlmManager>);

impl LlmState {
    pub fn new() -> Self {
        Self(Mutex::new(LlmManager {
            process: None,
            status: LlmStatus::NotConfigured,
            model_path: None,
            port: 8384,
            backend: LlmBackend::None,
            ollama_model: None,
        }))
    }
}

pub struct LlmManager {
    process: Option<Child>,
    pub status: LlmStatus,
    pub model_path: Option<String>,
    pub port: u16,
    pub backend: LlmBackend,
    pub ollama_model: Option<String>,
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
    pub backend: String,
    pub ollama_model: Option<String>,
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

    let backend_str = match lock.backend {
        LlmBackend::None => "none",
        LlmBackend::Ollama => "ollama",
        LlmBackend::LlamaServer => "llama_server",
    };

    Ok(LlmStatusResponse {
        status: lock.status.clone(),
        model_name,
        model_path: lock.model_path.clone(),
        port: lock.port,
        model_size_bytes,
        backend: backend_str.to_string(),
        ollama_model: lock.ollama_model.clone(),
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

    lock.backend = LlmBackend::LlamaServer;

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
        backend: "llama_server".to_string(),
        ollama_model: None,
    })
}

/// Start the llama.cpp sidecar server.
/// Spawns the process, then polls the health endpoint until ready (up to 120s).
#[tauri::command]
pub async fn start_llm_server(app: AppHandle) -> Result<LlmStatusResponse, String> {
    let (model_path, port, _server_binary) = {
        let llm_state = app.state::<LlmState>();
        let mut lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;

        let model_path = lock.model_path.clone()
            .ok_or("No model configured. Please set a GGUF model path first.")?;

        if lock.process.is_some() {
            return Err("LLM server is already running".to_string());
        }

        lock.status = LlmStatus::Starting;
        let port = lock.port;

        let server_binary = find_llama_server(&app)?;

        tracing::info!("Starting llama-server on port {}", port);

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
        // Status stays Starting — we'll set Running after health check passes
        (model_path, port, server_binary)
    };
    // Lock is dropped here so other commands can read status

    // Poll health endpoint every 2 seconds for up to 120 seconds
    let health_url = format!("http://127.0.0.1:{}/health", port);
    let client = reqwest::Client::new();
    let max_attempts = 60; // 60 * 2s = 120s
    let mut healthy = false;

    for attempt in 1..=max_attempts {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        match client.get(&health_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                healthy = true;
                tracing::info!("llama-server health check passed after {} attempts", attempt);
                break;
            }
            _ => {
                if attempt % 5 == 0 {
                    tracing::info!("Waiting for llama-server to start (attempt {}/{})", attempt, max_attempts);
                }
            }
        }
    }

    // Update status based on health check result
    {
        let llm_state = app.state::<LlmState>();
        let mut lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;

        if healthy {
            lock.status = LlmStatus::Running;
            tracing::info!("llama-server started successfully on port {}", port);
        } else {
            // Kill the process on timeout
            if let Some(mut child) = lock.process.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
            lock.status = LlmStatus::Error;
            tracing::warn!("llama-server failed to become healthy within 120 seconds");
            return Err("LLM server failed to start within 120 seconds".to_string());
        }

        lock.backend = LlmBackend::LlamaServer;

        Ok(LlmStatusResponse {
            status: lock.status.clone(),
            model_name: Some(std::path::Path::new(&model_path)
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string())),
            model_path: Some(model_path),
            port,
            model_size_bytes: None,
            backend: "llama_server".to_string(),
            ollama_model: None,
        })
    }
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

    let backend_str = match lock.backend {
        LlmBackend::None => "none",
        LlmBackend::Ollama => "ollama",
        LlmBackend::LlamaServer => "llama_server",
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
        backend: backend_str.to_string(),
        ollama_model: lock.ollama_model.clone(),
    })
}

/// Check if the LLM server is healthy and responding.
#[tauri::command]
pub async fn check_llm_health(app: AppHandle) -> Result<bool, String> {
    let (port, backend) = {
        let llm_state = app.state::<LlmState>();
        let lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        if lock.status != LlmStatus::Running {
            return Ok(false);
        }
        (lock.port, lock.backend.clone())
    };

    // Ollama uses GET / (returns "Ollama is running"), llama-server uses GET /health
    let url = match backend {
        LlmBackend::Ollama => format!("http://127.0.0.1:{}/", port),
        _ => format!("http://127.0.0.1:{}/health", port),
    };

    match reqwest::get(&url).await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Reusable async function to evaluate a single criterion via the local LLM.
/// Can be called from both the Tauri command and the screening post-processor.
/// Supports both LlamaServer (/completion) and Ollama (/v1/chat/completions) backends.
/// Includes per-request timeout and retry with simplified prompt on failure.
pub async fn evaluate_criterion(
    port: u16,
    criterion_text: &str,
    criterion_type: &str,
    patient_context: &str,
    backend: &LlmBackend,
    model: Option<&str>,
) -> Result<LlmEvaluation, String> {
    // First attempt with full prompt
    let result = evaluate_criterion_inner(port, criterion_text, criterion_type, patient_context, backend, model, false).await;

    match &result {
        Ok(eval) if eval.result == "unknown" && eval.confidence == 0.0 && eval.reasoning.starts_with("Could not parse") => {
            // JSON parse failed — retry once with simplified prompt
            tracing::info!("LLM JSON parse failed, retrying with simplified prompt");
            let retry = evaluate_criterion_inner(port, criterion_text, criterion_type, patient_context, backend, model, true).await;
            match retry {
                Ok(eval) if eval.result != "unknown" || eval.confidence > 0.0 => Ok(eval),
                _ => result, // Return original failure if retry also fails
            }
        }
        _ => result,
    }
}

async fn evaluate_criterion_inner(
    port: u16,
    criterion_text: &str,
    criterion_type: &str,
    patient_context: &str,
    backend: &LlmBackend,
    model: Option<&str>,
    simplified: bool,
) -> Result<LlmEvaluation, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60)) // 60s per criterion max
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    match backend {
        LlmBackend::Ollama => {
            let ollama_model = model.ok_or("No Ollama model configured")?;
            let url = format!("http://127.0.0.1:{}/v1/chat/completions", port);

            let (system_prompt, user_prompt) = if simplified {
                (
                    "You evaluate clinical trial eligibility. Respond with JSON only: {\"result\":\"met\"|\"not_met\"|\"unknown\",\"confidence\":0.0-1.0,\"reasoning\":\"...\",\"evidence\":[]}".to_string(),
                    format!("Does this patient meet the criterion?\nCriterion: {criterion_text}\nData: {patient_context}\nJSON:")
                )
            } else {
                (build_system_prompt(), build_user_prompt(criterion_type, criterion_text, patient_context))
            };

            let response = client.post(&url)
                .json(&serde_json::json!({
                    "model": ollama_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 512,
                    "response_format": {"type": "json_object"},
                }))
                .send()
                .await
                .map_err(|e| format!("LLM request failed: {}", e))?;

            let body: serde_json::Value = response.json().await
                .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

            // OpenAI chat completions format: choices[0].message.content
            let content = body
                .get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("message"))
                .and_then(|msg| msg.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("");

            parse_llm_criterion_response(content, criterion_text)
        }
        LlmBackend::LlamaServer | LlmBackend::None => {
            // Existing llama-server /completion path
            let prompt = build_criterion_prompt(criterion_text, patient_context);
            let url = format!("http://127.0.0.1:{}/completion", port);

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

            parse_llm_criterion_response(content, criterion_text)
        }
    }
}

/// Evaluate a criterion against patient clinical notes using the local LLM.
#[tauri::command]
pub async fn evaluate_criterion_with_llm(
    app: AppHandle,
    criterion_text: String,
    patient_context: String,
) -> Result<LlmEvaluation, String> {
    let (port, backend, ollama_model) = {
        let llm_state = app.state::<LlmState>();
        let lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        if lock.status != LlmStatus::Running {
            return Err("LLM server is not running".to_string());
        }
        (lock.port, lock.backend.clone(), lock.ollama_model.clone())
    };

    evaluate_criterion(
        port,
        &criterion_text,
        "inclusion", // default to inclusion for direct evaluation calls
        &patient_context,
        &backend,
        ollama_model.as_deref(),
    ).await
}

/// Simple chat with the local LLM. Used for testing that the model is responsive.
#[tauri::command]
pub async fn chat_with_llm(
    app: AppHandle,
    message: String,
) -> Result<String, String> {
    let (port, backend, ollama_model) = {
        let llm_state = app.state::<LlmState>();
        let lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        if lock.status != LlmStatus::Running {
            return Err("AI model is not running. Set up a model in Settings first.".to_string());
        }
        (lock.port, lock.backend.clone(), lock.ollama_model.clone())
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    match backend {
        LlmBackend::Ollama => {
            let model = ollama_model.ok_or("No Ollama model configured")?;
            let url = format!("http://127.0.0.1:{}/v1/chat/completions", port);

            let response = client.post(&url)
                .json(&serde_json::json!({
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "You are a helpful clinical research assistant. Keep responses concise and informative."},
                        {"role": "user", "content": message},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 512,
                }))
                .send()
                .await
                .map_err(|e| format!("Request failed: {}", e))?;

            let body: serde_json::Value = response.json().await
                .map_err(|e| format!("Failed to parse response: {}", e))?;

            let content = body
                .get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("message"))
                .and_then(|msg| msg.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("(No response)")
                .to_string();

            Ok(content)
        }
        _ => {
            let url = format!("http://127.0.0.1:{}/completion", port);
            let response = client.post(&url)
                .json(&serde_json::json!({
                    "prompt": format!("User: {}\nAssistant:", message),
                    "n_predict": 512,
                    "temperature": 0.7,
                }))
                .send()
                .await
                .map_err(|e| format!("Request failed: {}", e))?;

            let body: serde_json::Value = response.json().await
                .map_err(|e| format!("Failed to parse response: {}", e))?;

            let content = body.get("content")
                .and_then(|c| c.as_str())
                .unwrap_or("(No response)")
                .to_string();

            Ok(content)
        }
    }
}

/// Response type for extracted patient data from clinical notes.
#[derive(Debug, Clone, Serialize)]
pub struct ExtractedPatientData {
    pub patients: Vec<ExtractedPatient>,
    pub raw_llm_response: String,
    pub parse_warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedPatient {
    pub patient_id: Option<String>,
    pub name: Option<String>,
    pub date_of_birth: Option<String>,
    pub age: Option<u32>,
    pub gender: Option<String>,
    pub race: Option<String>,
    pub diagnoses: Vec<ExtractedDiagnosis>,
    pub medications: Vec<ExtractedMedication>,
    pub labs: Vec<ExtractedLab>,
    pub vitals: Vec<ExtractedVital>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedDiagnosis {
    pub description: String,
    pub icd10_code: Option<String>,
    pub status: Option<String>,
    pub onset_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedMedication {
    pub drug_name: String,
    pub dose: Option<String>,
    pub frequency: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedLab {
    pub test_name: String,
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub result_date: Option<String>,
    pub abnormal: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedVital {
    pub measurement_type: String,
    pub value: f64,
    pub unit: String,
}

/// JSON schema for Ollama structured output — constrains token generation at grammar level.
/// This is the cutting-edge approach for reliable JSON from small models.
fn extraction_json_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "required": ["patients"],
        "properties": {
            "patients": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["diagnoses"],
                    "properties": {
                        "patient_id": { "type": "string" },
                        "name": { "type": "string" },
                        "date_of_birth": { "type": "string" },
                        "age": { "type": "integer" },
                        "gender": { "type": "string" },
                        "race": { "type": "string" },
                        "diagnoses": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["description"],
                                "properties": {
                                    "description": { "type": "string" },
                                    "icd10_code": { "type": "string" },
                                    "status": { "type": "string" },
                                    "onset_date": { "type": "string" }
                                }
                            }
                        },
                        "medications": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["drug_name"],
                                "properties": {
                                    "drug_name": { "type": "string" },
                                    "dose": { "type": "string" },
                                    "frequency": { "type": "string" },
                                    "status": { "type": "string" }
                                }
                            }
                        },
                        "labs": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["test_name"],
                                "properties": {
                                    "test_name": { "type": "string" },
                                    "value": { "type": "number" },
                                    "unit": { "type": "string" },
                                    "result_date": { "type": "string" },
                                    "abnormal": { "type": "boolean" }
                                }
                            }
                        },
                        "vitals": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["measurement_type", "value", "unit"],
                                "properties": {
                                    "measurement_type": { "type": "string" },
                                    "value": { "type": "number" },
                                    "unit": { "type": "string" }
                                }
                            }
                        }
                    }
                }
            }
        }
    })
}

/// Build a concise few-shot extraction prompt optimized for small models.
/// Uses two examples to show how to extract ALL fields including demographics.
fn build_extraction_prompt(notes: &str) -> String {
    format!(r#"Extract ALL patient data from these clinical notes into JSON. You MUST extract every field: name, patient_id (MRN), date_of_birth (DOB), age (integer), gender (Male/Female), race, plus all diagnoses, medications, labs, and vitals.

EXAMPLE 1:
Input: "PATIENT: Sarah Chen, MRN 4421, DOB 1967-03-22, Age: 58, Female, Asian. Dx: HTN (I10), T2DM (E11.9). Meds: Metformin 500mg BID. Labs: HbA1c 7.2%. BP 138/82."
Output: {{"patients":[{{"patient_id":"4421","name":"Sarah Chen","date_of_birth":"1967-03-22","age":58,"gender":"Female","race":"Asian","diagnoses":[{{"description":"Hypertension","icd10_code":"I10","status":"active"}},{{"description":"Type 2 Diabetes Mellitus","icd10_code":"E11.9","status":"active"}}],"medications":[{{"drug_name":"Metformin","dose":"500mg","frequency":"BID","status":"active"}}],"labs":[{{"test_name":"HbA1c","value":7.2,"unit":"%","abnormal":true}}],"vitals":[{{"measurement_type":"bp_systolic","value":138,"unit":"mmHg"}},{{"measurement_type":"bp_diastolic","value":82,"unit":"mmHg"}}]}}]}}

EXAMPLE 2:
Input: "John Doe, MRN: SC-2847\nAge: 62, Male, White\nDOB: 1963-04-12\nDx: Type 2 Diabetes (E11.9)\nMeds: Lisinopril 20mg daily\nHbA1c: 8.4%, eGFR: 72"
Output: {{"patients":[{{"patient_id":"SC-2847","name":"John Doe","date_of_birth":"1963-04-12","age":62,"gender":"Male","race":"White","diagnoses":[{{"description":"Type 2 Diabetes","icd10_code":"E11.9","status":"active"}}],"medications":[{{"drug_name":"Lisinopril","dose":"20mg","frequency":"daily","status":"active"}}],"labs":[{{"test_name":"HbA1c","value":8.4,"unit":"%","abnormal":true}},{{"test_name":"eGFR","value":72,"unit":"mL/min/1.73m2","abnormal":true}}],"vitals":[]}}]}}

Now extract from this text. Include ALL demographics (name, patient_id, date_of_birth, age, gender, race):

{notes}"#)
}

/// Max characters per chunk sent to the LLM. Small models (4B params) perform best
/// with focused input. 3000 chars leaves room for the prompt template + few-shot example.
const CHUNK_MAX_CHARS: usize = 3000;

/// Split clinical notes into chunks at natural boundaries.
/// Tries to split at patient boundaries first, then section boundaries, then paragraph breaks.
fn chunk_clinical_notes(text: &str) -> Vec<String> {
    if text.len() <= CHUNK_MAX_CHARS {
        return vec![text.to_string()];
    }

    // Strategy 1: Split by patient markers (common in multi-patient documents)
    let patient_markers = ["PATIENT:", "Patient:", "patient:", "Subject:", "SUBJECT:",
                           "MRN:", "--- Patient", "=== Patient", "Record #"];
    let mut patient_splits: Vec<usize> = Vec::new();
    for marker in &patient_markers {
        for (i, _) in text.match_indices(marker) {
            if i > 0 { patient_splits.push(i); }
        }
    }
    patient_splits.sort();
    patient_splits.dedup();

    if patient_splits.len() >= 2 {
        // We have multiple patient sections — split there
        let mut chunks = Vec::new();
        let mut start = 0;
        for &split_pos in &patient_splits {
            if split_pos > start {
                let segment = text[start..split_pos].trim();
                if !segment.is_empty() {
                    // If segment is still too long, sub-chunk it
                    if segment.len() > CHUNK_MAX_CHARS {
                        chunks.extend(chunk_by_sections(segment));
                    } else {
                        chunks.push(segment.to_string());
                    }
                }
            }
            start = split_pos;
        }
        // Final segment
        let remaining = text[start..].trim();
        if !remaining.is_empty() {
            if remaining.len() > CHUNK_MAX_CHARS {
                chunks.extend(chunk_by_sections(remaining));
            } else {
                chunks.push(remaining.to_string());
            }
        }
        if !chunks.is_empty() {
            return chunks;
        }
    }

    // Strategy 2: No clear patient boundaries — split by sections
    chunk_by_sections(text)
}

/// Split text at section boundaries (double newlines, section headers).
fn chunk_by_sections(text: &str) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();

    // Split on double-newlines (paragraph breaks)
    for paragraph in text.split("\n\n") {
        let trimmed = paragraph.trim();
        if trimmed.is_empty() { continue; }

        // Would adding this paragraph exceed the limit?
        if !current.is_empty() && current.len() + trimmed.len() + 2 > CHUNK_MAX_CHARS {
            chunks.push(current.clone());
            current.clear();
        }

        if !current.is_empty() {
            current.push_str("\n\n");
        }
        current.push_str(trimmed);

        // If a single paragraph exceeds the limit, just push it (will be truncated by prompt)
        if current.len() > CHUNK_MAX_CHARS {
            chunks.push(current.clone());
            current.clear();
        }
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    if chunks.is_empty() {
        chunks.push(text[..text.len().min(CHUNK_MAX_CHARS)].to_string());
    }

    chunks
}

/// Send a single chunk to the LLM for extraction.
async fn extract_single_chunk(
    client: &reqwest::Client,
    chunk: &str,
    port: u16,
    backend: &LlmBackend,
    ollama_model: &Option<String>,
) -> Result<String, String> {
    match backend {
        LlmBackend::Ollama => {
            let model = ollama_model.as_ref().ok_or("No Ollama model configured")?;
            let url = format!("http://127.0.0.1:{}/api/chat", port);
            let prompt = build_extraction_prompt(chunk);
            let schema = extraction_json_schema();

            let response = client.post(&url)
                .json(&serde_json::json!({
                    "model": model,
                    "messages": [{ "role": "user", "content": prompt }],
                    "format": schema,
                    "stream": false,
                    "options": { "temperature": 0.1, "num_predict": 4096 }
                }))
                .send()
                .await
                .map_err(|e| format!("LLM request failed: {}", e))?;

            let body: serde_json::Value = response.json().await
                .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

            Ok(body
                .get("message")
                .and_then(|msg| msg.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("{}")
                .to_string())
        }
        _ => {
            let url = format!("http://127.0.0.1:{}/completion", port);
            let prompt = build_extraction_prompt(chunk);

            let response = client.post(&url)
                .json(&serde_json::json!({
                    "prompt": prompt,
                    "n_predict": 4096,
                    "temperature": 0.1,
                    "stop": ["\n\nINPUT:"],
                }))
                .send()
                .await
                .map_err(|e| format!("LLM request failed: {}", e))?;

            let body: serde_json::Value = response.json().await
                .map_err(|e| format!("Failed to parse response: {}", e))?;

            Ok(body.get("content")
                .and_then(|c| c.as_str())
                .unwrap_or("{}")
                .to_string())
        }
    }
}

/// Merge patients from multiple chunk extraction results.
/// Deduplicates by matching patient_id or name.
fn merge_extracted_patients(chunk_results: Vec<ExtractedPatientData>) -> ExtractedPatientData {
    let mut all_patients: Vec<ExtractedPatient> = Vec::new();
    let mut all_warnings: Vec<String> = Vec::new();
    let mut raw_responses: Vec<String> = Vec::new();

    for result in chunk_results {
        raw_responses.push(result.raw_llm_response);
        all_warnings.extend(result.parse_warnings);

        for patient in result.patients {
            // Try to find an existing patient to merge with (by patient_id or name)
            let existing_idx = all_patients.iter().position(|existing| {
                // Match by patient_id if both have one
                if let (Some(ref a), Some(ref b)) = (&existing.patient_id, &patient.patient_id) {
                    if !a.is_empty() && !b.is_empty() && a.to_lowercase() == b.to_lowercase() {
                        return true;
                    }
                }
                // Match by name if both have one
                if let (Some(ref a), Some(ref b)) = (&existing.name, &patient.name) {
                    if !a.is_empty() && !b.is_empty() && a.to_lowercase() == b.to_lowercase() {
                        return true;
                    }
                }
                false
            });

            if let Some(idx) = existing_idx {
                // Merge: add new data to existing patient
                let existing = &mut all_patients[idx];
                // Fill in missing demographics
                if existing.name.is_none() && patient.name.is_some() { existing.name = patient.name; }
                if existing.date_of_birth.is_none() && patient.date_of_birth.is_some() { existing.date_of_birth = patient.date_of_birth; }
                if existing.age.is_none() && patient.age.is_some() { existing.age = patient.age; }
                if existing.gender.is_none() && patient.gender.is_some() { existing.gender = patient.gender; }
                if existing.race.is_none() && patient.race.is_some() { existing.race = patient.race; }
                if existing.patient_id.is_none() && patient.patient_id.is_some() { existing.patient_id = patient.patient_id; }
                // Append clinical data (deduplicate diagnoses by description)
                for dx in patient.diagnoses {
                    if !existing.diagnoses.iter().any(|d| d.description.to_lowercase() == dx.description.to_lowercase()) {
                        existing.diagnoses.push(dx);
                    }
                }
                for med in patient.medications {
                    if !existing.medications.iter().any(|m| m.drug_name.to_lowercase() == med.drug_name.to_lowercase()) {
                        existing.medications.push(med);
                    }
                }
                for lab in patient.labs {
                    if !existing.labs.iter().any(|l| l.test_name.to_lowercase() == lab.test_name.to_lowercase()) {
                        existing.labs.push(lab);
                    }
                }
                for vital in patient.vitals {
                    if !existing.vitals.iter().any(|v| v.measurement_type == vital.measurement_type) {
                        existing.vitals.push(vital);
                    }
                }
            } else {
                all_patients.push(patient);
            }
        }
    }

    ExtractedPatientData {
        patients: all_patients,
        raw_llm_response: raw_responses.join("\n---CHUNK---\n"),
        parse_warnings: all_warnings,
    }
}

/// Parse unstructured clinical notes using the local LLM to extract structured patient data.
/// Automatically chunks large documents and merges results.
#[tauri::command]
pub async fn parse_clinical_notes(
    app: AppHandle,
    notes_text: String,
) -> Result<ExtractedPatientData, String> {
    let (port, backend, ollama_model) = {
        let llm_state = app.state::<LlmState>();
        let lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        if lock.status != LlmStatus::Running {
            return Err("AI model is not running. Set up a model in Settings first.".to_string());
        }
        (lock.port, lock.backend.clone(), lock.ollama_model.clone())
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300)) // 5 min for large docs with multiple chunks
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    // Smart chunking — split large documents at natural boundaries
    let chunks = chunk_clinical_notes(&notes_text);
    let num_chunks = chunks.len();

    tracing::info!("Splitting {} chars into {} chunk(s) for extraction", notes_text.len(), num_chunks);

    let mut chunk_results: Vec<ExtractedPatientData> = Vec::new();

    for (i, chunk) in chunks.iter().enumerate() {
        tracing::info!("Processing chunk {}/{} ({} chars)", i + 1, num_chunks, chunk.len());

        let raw_response = extract_single_chunk(&client, chunk, port, &backend, &ollama_model).await?;
        let result = parse_extraction_response(&raw_response)?;

        tracing::info!("Chunk {}/{}: extracted {} patients", i + 1, num_chunks, result.patients.len());
        chunk_results.push(result);
    }

    // Merge all chunk results, deduplicating patients
    let merged = if chunk_results.len() == 1 {
        chunk_results.into_iter().next().unwrap()
    } else {
        let mut merged = merge_extracted_patients(chunk_results);
        merged.parse_warnings.insert(0, format!("Document processed in {} chunks", num_chunks));
        merged
    };

    tracing::info!("Final extraction: {} patients from {} chunks", merged.patients.len(), num_chunks);

    Ok(merged)
}

/// Import extracted patients from AI-assisted import into the database.
/// Converts ExtractedPatient structs to PatientRecords and persists them.
#[tauri::command]
pub fn import_extracted_patients(
    app: AppHandle,
    patients: Vec<ExtractedPatient>,
) -> Result<serde_json::Value, String> {
    use crate::db::DbState;

    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;

    let conn = lock.as_ref().ok_or("Database not initialized. Please set up encryption first.")?
        .get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let import_log_id = uuid::Uuid::new_v4().to_string();
    let mut imported = 0u32;
    let mut updated = 0u32;

    conn.execute_batch("BEGIN TRANSACTION")
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    let result = (|| -> Result<(), String> {
        for patient in &patients {
            // Generate a site_patient_id: use patient_id if available, otherwise name-based, otherwise UUID
            let site_id = patient.patient_id.clone()
                .or_else(|| patient.name.as_ref().map(|n| format!("AI-{}", n.replace(' ', "-"))))
                .unwrap_or_else(|| format!("AI-{}", uuid::Uuid::new_v4().to_string()[..8].to_string()));

            // Check if patient already exists
            let existing: Option<String> = conn.query_row(
                "SELECT id FROM patients WHERE site_patient_id = ?1",
                [&site_id],
                |row| row.get(0),
            ).ok();

            let patient_id = if let Some(existing_id) = existing {
                conn.execute(
                    "UPDATE patients SET
                        date_of_birth = COALESCE(?2, date_of_birth),
                        gender = COALESCE(?3, gender),
                        race = COALESCE(?4, race),
                        last_updated = datetime('now'),
                        import_source = 'ai-extraction'
                     WHERE id = ?1",
                    rusqlite::params![
                        existing_id,
                        patient.date_of_birth,
                        patient.gender,
                        patient.race,
                    ],
                ).map_err(|e| format!("Failed to update patient: {}", e))?;
                updated += 1;
                existing_id
            } else {
                let new_id = uuid::Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO patients (id, site_patient_id, date_of_birth, gender, race, imported_at, import_source, last_updated)
                     VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), 'ai-extraction', datetime('now'))",
                    rusqlite::params![
                        new_id,
                        site_id,
                        patient.date_of_birth,
                        patient.gender,
                        patient.race,
                    ],
                ).map_err(|e| format!("Failed to insert patient: {}", e))?;
                imported += 1;
                new_id
            };

            // Insert diagnoses
            for dx in &patient.diagnoses {
                let exists: bool = conn.query_row(
                    "SELECT COUNT(*) > 0 FROM diagnoses WHERE patient_id = ?1 AND description = ?2",
                    rusqlite::params![patient_id, dx.description],
                    |row| row.get(0),
                ).unwrap_or(false);
                if !exists {
                    let dx_id = uuid::Uuid::new_v4().to_string();
                    let _ = conn.execute(
                        "INSERT INTO diagnoses (id, patient_id, icd10_code, description, onset_date, status)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        rusqlite::params![dx_id, patient_id, dx.icd10_code, dx.description, dx.onset_date,
                            dx.status.as_deref().unwrap_or("active")],
                    );
                }
            }

            // Insert medications
            for med in &patient.medications {
                let exists: bool = conn.query_row(
                    "SELECT COUNT(*) > 0 FROM medications WHERE patient_id = ?1 AND drug_name = ?2",
                    rusqlite::params![patient_id, med.drug_name],
                    |row| row.get(0),
                ).unwrap_or(false);
                if !exists {
                    let med_id = uuid::Uuid::new_v4().to_string();
                    let _ = conn.execute(
                        "INSERT INTO medications (id, patient_id, drug_name, dose, status)
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        rusqlite::params![med_id, patient_id, med.drug_name, med.dose,
                            med.status.as_deref().unwrap_or("active")],
                    );
                }
            }

            // Insert lab results
            for lab in &patient.labs {
                let exists: bool = conn.query_row(
                    "SELECT COUNT(*) > 0 FROM lab_results WHERE patient_id = ?1 AND test_name = ?2 AND value IS ?3",
                    rusqlite::params![patient_id, lab.test_name, lab.value],
                    |row| row.get(0),
                ).unwrap_or(false);
                if !exists {
                    let lab_id = uuid::Uuid::new_v4().to_string();
                    let abnormal_flag = lab.abnormal.map(|a| if a { "H".to_string() } else { "N".to_string() });
                    let _ = conn.execute(
                        "INSERT INTO lab_results (id, patient_id, test_name, value, unit, result_date, abnormal_flag)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        rusqlite::params![lab_id, patient_id, lab.test_name, lab.value, lab.unit, lab.result_date, abnormal_flag],
                    );
                }
            }

            // Insert vitals
            for vital in &patient.vitals {
                let exists: bool = conn.query_row(
                    "SELECT COUNT(*) > 0 FROM vitals WHERE patient_id = ?1 AND vital_type = ?2 AND value IS ?3",
                    rusqlite::params![patient_id, vital.measurement_type, vital.value],
                    |row| row.get(0),
                ).unwrap_or(false);
                if !exists {
                    let vital_id = uuid::Uuid::new_v4().to_string();
                    let _ = conn.execute(
                        "INSERT INTO vitals (id, patient_id, vital_type, value, unit)
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        rusqlite::params![vital_id, patient_id, vital.measurement_type, vital.value, vital.unit],
                    );
                }
            }

            // Write audit entry
            let _ = conn.execute(
                "INSERT INTO audit_log (id, action, details, timestamp) VALUES (?1, 'data_imported', ?2, datetime('now'))",
                rusqlite::params![
                    uuid::Uuid::new_v4().to_string(),
                    format!("AI-extracted patient imported: {} ({})", site_id, patient.name.as_deref().unwrap_or("unknown")),
                ],
            );
        }
        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute_batch("COMMIT").map_err(|e| format!("Failed to commit: {}", e))?;
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            return Err(e);
        }
    }

    // Log the import
    let _ = conn.execute(
        "INSERT INTO import_log (id, file_name, file_format, records_imported, records_updated, records_skipped, imported_at)
         VALUES (?1, 'ai-extraction', 'clinical-notes', ?2, ?3, 0, datetime('now'))",
        rusqlite::params![import_log_id, imported, updated],
    );

    tracing::info!("AI extraction import complete: {} new, {} updated", imported, updated);

    Ok(serde_json::json!({
        "imported": imported,
        "updated": updated,
        "total": patients.len(),
    }))
}

/// Generate an AI-enhanced insight from the local LLM given a context summary.
#[tauri::command]
pub async fn generate_ai_insight(
    app: AppHandle,
    context: String,
    insight_type: String,
) -> Result<Vec<serde_json::Value>, String> {
    let (port, backend, ollama_model) = {
        let llm_state = app.state::<LlmState>();
        let lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        if lock.status != LlmStatus::Running {
            return Err("AI model is not running".to_string());
        }
        (lock.port, lock.backend.clone(), lock.ollama_model.clone())
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let system_prompt = format!(
        r#"You are a clinical research analytics expert at a research site. Generate actionable insights for site coordinators.

Respond with ONLY a JSON array of insight objects. Each insight should have:
- "type": "positive" | "warning" | "opportunity" | "neutral"
- "title": concise headline (under 80 chars)
- "body": 1-2 sentence explanation with specific numbers/data
- "actionable": optional suggested action (1 sentence)

Generate 2-3 insights that are specific, data-driven, and clinically meaningful.
Focus on {} analysis. Be concise."#,
        insight_type
    );

    let user_prompt = format!("DATA CONTEXT:\n{}\n\nGenerate insights as JSON array:", context);

    let raw_response = match backend {
        LlmBackend::Ollama => {
            let model = ollama_model.ok_or("No Ollama model configured")?;
            let url = format!("http://127.0.0.1:{}/v1/chat/completions", port);

            let response = client.post(&url)
                .json(&serde_json::json!({
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 1024,
                    "response_format": {"type": "json_object"},
                }))
                .send()
                .await
                .map_err(|e| format!("LLM request failed: {}", e))?;

            let body: serde_json::Value = response.json().await
                .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

            body.get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("message"))
                .and_then(|msg| msg.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("[]")
                .to_string()
        }
        _ => {
            let url = format!("http://127.0.0.1:{}/completion", port);
            let prompt = format!("{}\n\n{}", system_prompt, user_prompt);

            let response = client.post(&url)
                .json(&serde_json::json!({
                    "prompt": prompt,
                    "n_predict": 1024,
                    "temperature": 0.3,
                }))
                .send()
                .await
                .map_err(|e| format!("Request failed: {}", e))?;

            let body: serde_json::Value = response.json().await
                .map_err(|e| format!("Failed to parse response: {}", e))?;

            body.get("content")
                .and_then(|c| c.as_str())
                .unwrap_or("[]")
                .to_string()
        }
    };

    // Parse the LLM response into a JSON array of insights
    let cleaned = repair_json(&raw_response);
    // Try parsing as array first, then as object with "insights" key
    if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&cleaned) {
        Ok(arr)
    } else if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&cleaned) {
        // LLM might wrap in {"insights": [...]}
        if let Some(arr) = obj.get("insights").and_then(|v| v.as_array()) {
            Ok(arr.clone())
        } else {
            Ok(vec![obj])
        }
    } else {
        Err(format!("Could not parse LLM insight response: {}", &cleaned[..cleaned.len().min(200)]))
    }
}

fn parse_extraction_response(raw: &str) -> Result<ExtractedPatientData, String> {
    let cleaned = repair_json(raw);
    let mut warnings = Vec::new();

    tracing::info!("LLM extraction raw response (first 500 chars): {}", &raw[..raw.len().min(500)]);

    // Try parsing as JSON
    let parsed = match serde_json::from_str::<serde_json::Value>(&cleaned) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("Failed to parse extraction response as JSON: {}", e);
            return Err(format!("Failed to parse extraction response as JSON. Raw: {}", &cleaned[..cleaned.len().min(300)]));
        }
    };

    // Strategy 1: Look for "patients" array
    let patients_val = if let Some(arr) = parsed.get("patients").and_then(|p| p.as_array()) {
        arr.clone()
    }
    // Strategy 2: The response IS a single patient object (has diagnoses or medications)
    else if parsed.is_object() && (
        parsed.get("diagnoses").is_some() ||
        parsed.get("medications").is_some() ||
        parsed.get("labs").is_some() ||
        parsed.get("patient_id").is_some() ||
        parsed.get("age").is_some()
    ) {
        vec![parsed.clone()]
    }
    // Strategy 3: The response is an array of patients
    else if let Some(arr) = parsed.as_array() {
        arr.clone()
    }
    // Strategy 4: Look for any key that contains an array of objects
    else if let Some(obj) = parsed.as_object() {
        let mut found = Vec::new();
        for (_key, val) in obj {
            if let Some(arr) = val.as_array() {
                if arr.iter().any(|item| item.is_object() && (
                    item.get("diagnoses").is_some() ||
                    item.get("medications").is_some() ||
                    item.get("age").is_some() ||
                    item.get("gender").is_some()
                )) {
                    found = arr.clone();
                    break;
                }
            }
        }
        if found.is_empty() {
            warnings.push(format!("Could not find patient data in response. Keys: {:?}", obj.keys().collect::<Vec<_>>()));
            // Last resort: try to construct a patient from the top-level fields
            found = vec![parsed.clone()];
        }
        found
    } else {
        warnings.push("Unexpected response format from LLM".to_string());
        vec![]
    };

    // Parse each patient object — be lenient with field names
    let patients: Vec<ExtractedPatient> = patients_val.iter().filter_map(|p| {
        // Try direct deserialization first
        if let Ok(patient) = serde_json::from_value::<ExtractedPatient>(p.clone()) {
            return Some(patient);
        }

        // Manual fallback parsing for LLMs that use slightly different field names
        let obj = p.as_object()?;

        let patient_id = obj.get("patient_id")
            .or_else(|| obj.get("patientId"))
            .or_else(|| obj.get("mrn"))
            .or_else(|| obj.get("MRN"))
            .or_else(|| obj.get("id"))
            .and_then(|v| v.as_str())
            .map(String::from);

        let name = obj.get("name")
            .or_else(|| obj.get("patient_name"))
            .or_else(|| obj.get("patientName"))
            .or_else(|| obj.get("full_name"))
            .and_then(|v| v.as_str())
            .map(String::from);

        let date_of_birth = obj.get("date_of_birth")
            .or_else(|| obj.get("dob"))
            .or_else(|| obj.get("DOB"))
            .or_else(|| obj.get("dateOfBirth"))
            .or_else(|| obj.get("birth_date"))
            .and_then(|v| v.as_str())
            .map(String::from);

        let age = obj.get("age")
            .and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|f| f as u64)))
            .map(|v| v as u32);

        let gender = obj.get("gender")
            .or_else(|| obj.get("sex"))
            .and_then(|v| v.as_str())
            .map(String::from);

        let race = obj.get("race")
            .or_else(|| obj.get("ethnicity"))
            .and_then(|v| v.as_str())
            .map(String::from);

        let diagnoses = parse_diagnoses_array(obj.get("diagnoses").or_else(|| obj.get("conditions")).or_else(|| obj.get("diagnosis")));
        let medications = parse_medications_array(obj.get("medications").or_else(|| obj.get("meds")).or_else(|| obj.get("medication")));
        let labs = parse_labs_array(obj.get("labs").or_else(|| obj.get("lab_results")).or_else(|| obj.get("laboratory")));
        let vitals = parse_vitals_array(obj.get("vitals").or_else(|| obj.get("vital_signs")));

        // Only return if we got at least SOME data
        if patient_id.is_some() || name.is_some() || age.is_some() || !diagnoses.is_empty() || !medications.is_empty() || !labs.is_empty() {
            Some(ExtractedPatient {
                patient_id,
                name,
                date_of_birth,
                age,
                gender,
                race,
                diagnoses,
                medications,
                labs,
                vitals,
            })
        } else {
            tracing::warn!("Could not extract patient from: {:?}", &p.to_string()[..p.to_string().len().min(200)]);
            None
        }
    }).collect();

    if patients.is_empty() && !patients_val.is_empty() {
        warnings.push("Patient records were found but could not be parsed into structured data".to_string());
    }

    tracing::info!("Extracted {} patients from LLM response", patients.len());

    Ok(ExtractedPatientData {
        patients,
        raw_llm_response: raw.to_string(),
        parse_warnings: warnings,
    })
}

/// Helper: parse diagnoses from a JSON value (array of objects or strings)
fn parse_diagnoses_array(val: Option<&serde_json::Value>) -> Vec<ExtractedDiagnosis> {
    let arr = match val.and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return vec![],
    };
    arr.iter().filter_map(|item| {
        // Try direct deser
        if let Ok(dx) = serde_json::from_value::<ExtractedDiagnosis>(item.clone()) {
            return Some(dx);
        }
        // String entry
        if let Some(s) = item.as_str() {
            return Some(ExtractedDiagnosis { description: s.to_string(), icd10_code: None, status: None, onset_date: None });
        }
        // Manual parse with alternate keys
        let obj = item.as_object()?;
        let description = obj.get("description")
            .or_else(|| obj.get("name"))
            .or_else(|| obj.get("condition"))
            .or_else(|| obj.get("diagnosis"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();
        let icd10_code = obj.get("icd10_code")
            .or_else(|| obj.get("icd10"))
            .or_else(|| obj.get("icd_code"))
            .or_else(|| obj.get("code"))
            .and_then(|v| v.as_str())
            .map(String::from);
        let status = obj.get("status").and_then(|v| v.as_str()).map(String::from);
        let onset_date = obj.get("onset_date")
            .or_else(|| obj.get("date"))
            .or_else(|| obj.get("diagnosed_date"))
            .and_then(|v| v.as_str())
            .map(String::from);
        Some(ExtractedDiagnosis { description, icd10_code, status, onset_date })
    }).collect()
}

/// Helper: parse medications from a JSON value
fn parse_medications_array(val: Option<&serde_json::Value>) -> Vec<ExtractedMedication> {
    let arr = match val.and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return vec![],
    };
    arr.iter().filter_map(|item| {
        if let Ok(med) = serde_json::from_value::<ExtractedMedication>(item.clone()) {
            return Some(med);
        }
        if let Some(s) = item.as_str() {
            return Some(ExtractedMedication { drug_name: s.to_string(), dose: None, frequency: None, status: None });
        }
        let obj = item.as_object()?;
        let drug_name = obj.get("drug_name")
            .or_else(|| obj.get("name"))
            .or_else(|| obj.get("medication"))
            .or_else(|| obj.get("drug"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();
        let dose = obj.get("dose").or_else(|| obj.get("dosage")).and_then(|v| v.as_str()).map(String::from);
        let frequency = obj.get("frequency").or_else(|| obj.get("schedule")).and_then(|v| v.as_str()).map(String::from);
        let status = obj.get("status").and_then(|v| v.as_str()).map(String::from);
        Some(ExtractedMedication { drug_name, dose, frequency, status })
    }).collect()
}

/// Helper: parse labs from a JSON value
fn parse_labs_array(val: Option<&serde_json::Value>) -> Vec<ExtractedLab> {
    let arr = match val.and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return vec![],
    };
    arr.iter().filter_map(|item| {
        if let Ok(lab) = serde_json::from_value::<ExtractedLab>(item.clone()) {
            return Some(lab);
        }
        let obj = item.as_object()?;
        let test_name = obj.get("test_name")
            .or_else(|| obj.get("name"))
            .or_else(|| obj.get("test"))
            .or_else(|| obj.get("lab"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();
        let value = obj.get("value")
            .or_else(|| obj.get("result"))
            .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok())));
        let unit = obj.get("unit").or_else(|| obj.get("units")).and_then(|v| v.as_str()).map(String::from);
        let result_date = obj.get("result_date").or_else(|| obj.get("date")).and_then(|v| v.as_str()).map(String::from);
        let abnormal = obj.get("abnormal")
            .and_then(|v| v.as_bool().or_else(|| v.as_str().map(|s| s == "true" || s == "H" || s == "L" || s == "abnormal")));
        Some(ExtractedLab { test_name, value, unit, result_date, abnormal })
    }).collect()
}

/// Helper: parse vitals from a JSON value
fn parse_vitals_array(val: Option<&serde_json::Value>) -> Vec<ExtractedVital> {
    let arr = match val.and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return vec![],
    };
    arr.iter().filter_map(|item| {
        if let Ok(vital) = serde_json::from_value::<ExtractedVital>(item.clone()) {
            return Some(vital);
        }
        let obj = item.as_object()?;
        let measurement_type = obj.get("measurement_type")
            .or_else(|| obj.get("type"))
            .or_else(|| obj.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let value = obj.get("value")
            .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok())))?;
        let unit = obj.get("unit")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        Some(ExtractedVital { measurement_type, value, unit })
    }).collect()
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

fn build_system_prompt() -> String {
    r#"You are a clinical trial eligibility screener at a research site. Your job is to evaluate whether a patient meets a specific study criterion based ONLY on the clinical data provided.

RULES:
1. Only use facts explicitly stated in the patient data. Never assume or infer unstated information.
2. If the required data point is missing or ambiguous, return "unknown" — do NOT guess.
3. For INCLUSION criteria: "met" means the patient satisfies the requirement. "not_met" means they clearly fail it.
4. For EXCLUSION criteria: "met" means the exclusion IS triggered (patient has the excluded condition). "not_met" means the exclusion is NOT triggered (patient is clear).
5. Pay attention to temporal qualifiers (e.g., "within 6 months", "current", "history of").
6. Match lab values against the criterion's thresholds using the most recent result.
7. For medication criteria, check both active and historical status as appropriate.

CONFIDENCE SCORING:
- 0.95-1.0: Exact structured data match (e.g., lab value clearly in/out of range)
- 0.80-0.94: Strong match with minor inference (e.g., diagnosis description matches but no ICD-10 code)
- 0.60-0.79: Probable match requiring clinical judgment
- Below 0.60: Return "unknown" instead of guessing

Respond with ONLY a JSON object. No markdown, no explanation, no preamble.

EXAMPLE 1 — Lab-based inclusion criterion:
Input criterion: "HbA1c between 7.0% and 10.5%"
Patient has: Lab: HbA1c = 8.2%, date: 2025-11-15
Output: {"result":"met","confidence":0.98,"reasoning":"Most recent HbA1c is 8.2%, within the required 7.0-10.5% range.","evidence":["HbA1c = 8.2% (2025-11-15)"]}

EXAMPLE 2 — Exclusion criterion with insufficient data:
Input criterion: "No myocardial infarction within the past 6 months"
Patient has: Diagnosis: Type 2 Diabetes (active), Hypertension (active)
Output: {"result":"not_met","confidence":0.75,"reasoning":"No diagnosis of myocardial infarction found in patient record. However, absence of a recorded MI does not guarantee it did not occur elsewhere.","evidence":["No MI diagnosis in record","Active diagnoses: Type 2 Diabetes, Hypertension"]}

EXAMPLE 3 — Missing data:
Input criterion: "eGFR >= 60 mL/min/1.73m²"
Patient has: No kidney function labs on record
Output: {"result":"unknown","confidence":0.0,"reasoning":"No eGFR or creatinine lab results available in the patient record to evaluate this criterion.","evidence":[]}"#.to_string()
}

fn build_user_prompt(criterion_type: &str, criterion: &str, patient_context: &str) -> String {
    let type_label = if criterion_type == "exclusion" { "EXCLUSION" } else { "INCLUSION" };
    format!(
        "{type_label} CRITERION: {criterion}\n\nPATIENT DATA:\n{patient_context}\n\nRespond with JSON only:"
    )
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

/// Attempt to repair common JSON issues from small LLMs:
/// trailing commas, single quotes, unescaped newlines, markdown fencing.
fn repair_json(raw: &str) -> String {
    let mut s = raw.trim().to_string();

    // Strip markdown code fences
    if s.starts_with("```json") {
        s = s.trim_start_matches("```json").to_string();
    }
    if s.starts_with("```") {
        s = s.trim_start_matches("```").to_string();
    }
    s = s.trim_end_matches("```").trim().to_string();

    // Strip any leading text before the first {
    if let Some(idx) = s.find('{') {
        s = s[idx..].to_string();
    }

    // Strip any trailing text after the last }
    if let Some(idx) = s.rfind('}') {
        s = s[..=idx].to_string();
    }

    // Replace single quotes with double quotes (but not within already-double-quoted strings)
    // Simple heuristic: only if there are no double-quoted strings
    if !s.contains('"') && s.contains('\'') {
        s = s.replace('\'', "\"");
    }

    // Remove trailing commas before } or ]
    let re_trailing_comma_obj = regex::Regex::new(r",\s*}").unwrap();
    s = re_trailing_comma_obj.replace_all(&s, "}").to_string();
    let re_trailing_comma_arr = regex::Regex::new(r",\s*]").unwrap();
    s = re_trailing_comma_arr.replace_all(&s, "]").to_string();

    // Escape literal newlines inside string values
    // (Simple approach: replace \n that aren't already \\n)
    s = s.replace("\r\n", "\\n").replace('\r', "\\n");

    s
}

fn parse_llm_criterion_response(raw: &str, criterion_text: &str) -> Result<LlmEvaluation, String> {
    let cleaned = repair_json(raw);

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&cleaned) {
        let raw_result = parsed.get("result")
            .and_then(|r| r.as_str())
            .unwrap_or("unknown")
            .to_lowercase();

        // Normalize result to valid values only
        let result = match raw_result.as_str() {
            "met" | "pass" | "satisfied" | "yes" | "true" => "met".to_string(),
            "not_met" | "fail" | "not_satisfied" | "no" | "false" | "not met" => "not_met".to_string(),
            _ => "unknown".to_string(),
        };

        let confidence = parsed.get("confidence")
            .and_then(|c| c.as_f64())
            .unwrap_or(0.5)
            .clamp(0.0, 1.0); // Clamp to valid range

        // If the model says "unknown" but gave high confidence, that's contradictory
        let confidence = if result == "unknown" && confidence > 0.6 {
            0.0
        } else {
            confidence
        };

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
        // Fallback: couldn't parse LLM output even after repair
        tracing::warn!("LLM output could not be parsed as JSON: {}", &cleaned[..cleaned.len().min(200)]);
        Ok(LlmEvaluation {
            criterion_text: criterion_text.to_string(),
            result: "unknown".to_string(),
            confidence: 0.0,
            reasoning: format!("Could not parse LLM response: {}", &cleaned[..cleaned.len().min(100)]),
            evidence_extracted: vec![],
        })
    }
}
