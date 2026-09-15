//! Fixed synthetic note only. Never writes clinical data or accepts arbitrary source text.
use super::llm::{LlmState, LlmStatus};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn extract_demo_note(app: AppHandle) -> Result<Value, String> {
    let (port, model) = {
        let state = app.state::<LlmState>();
        let lock = state.0.lock().map_err(|e| e.to_string())?;
        if lock.status != LlmStatus::Running {
            return Err("Verify your local model in Model setup first.".into());
        }
        (lock.port, lock.model.clone().ok_or("No model selected")?)
    };
    let spec: Value =
        serde_json::from_str(include_str!("../../../src/lib/data-counts/note-spec.json"))
            .map_err(|e| e.to_string())?;
    let mut request = spec["request"].clone();
    request["model"] = json!(model);
    let started = std::time::Instant::now();
    let response: Value = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?
        .post(format!("http://127.0.0.1:{port}/api/chat"))
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Local extraction failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Local model returned an error: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    if response["done"] != true || response["done_reason"] == "length" {
        return Err(
            "Model response was incomplete. Retry the note after warming the model.".into(),
        );
    }
    let result: Value = serde_json::from_str(
        response["message"]["content"]
            .as_str()
            .ok_or("No model response")?,
    )
    .map_err(|e| format!("Model returned invalid JSON: {e}"))?;
    Ok(json!({"model":model,"latency_ms":started.elapsed().as_millis() as u64,"result":result}))
}

#[tauri::command]
pub fn check_demo_export(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!(
        "synthetic-export-check-{}.txt",
        uuid::Uuid::new_v4()
    ));
    let content = "SiteConnect synthetic export check. No patient data.";
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|e| e.to_string())?;
        use std::io::Write;
        file.write_all(content.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        if std::fs::read_to_string(&path).map_err(|e| e.to_string())? != content {
            return Err("Export round-trip mismatch".into());
        }
        Ok("Temporary file write/read verified. Choose and verify your presentation export folder separately.".into())
    })();
    let cleanup = std::fs::remove_file(&path);
    result.and_then(|message| {
        cleanup.map_err(|e| format!("Check file cleanup failed: {e}"))?;
        Ok(message)
    })
}
