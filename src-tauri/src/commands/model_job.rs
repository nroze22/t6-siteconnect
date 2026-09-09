//! Native setup survives renderer navigation. Restart requires explicit resume and re-verification.
use super::{ollama, rehearsal};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;
static ACTIVE: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);
static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
#[derive(Clone, Serialize, Deserialize)]
pub struct ModelJob {
    pub model: String,
    pub phase: String,
    pub message: String,
    pub updated: String,
}
fn save(app: &AppHandle, model: &str, phase: &str, message: &str) -> Result<ModelJob, String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    let job = ModelJob {
        model: model.into(),
        phase: phase.into(),
        message: message.into(),
        updated: chrono::Utc::now().to_rfc3339(),
    };
    let old = rehearsal::read_operation(app.clone(), "model-setup".into())?;
    rehearsal::write_operation(
        app.clone(),
        "model-setup".into(),
        old.map(|v| v.revision).unwrap_or(0),
        serde_json::to_string(&job).map_err(|e| e.to_string())?,
    )?;
    Ok(job)
}
fn checkpoint() -> Result<(), String> {
    if CANCEL.load(Ordering::SeqCst) {
        Err(
            "Setup cancelled. Installed files are preserved; resume to check and reuse them."
                .into(),
        )
    } else {
        Ok(())
    }
}
#[tauri::command]
pub fn get_model_job(app: AppHandle) -> Result<Option<ModelJob>, String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    let saved = rehearsal::read_operation(app, "model-setup".into())?;
    let mut job: Option<ModelJob> = saved
        .map(|s| serde_json::from_str(&s.payload))
        .transpose()
        .map_err(|e| format!("Cannot restore model setup: {e}"))?;
    if let Some(ref mut j) = job {
        if !ACTIVE.load(Ordering::SeqCst)
            && !["done", "error", "cancelled", "interrupted"].contains(&j.phase.as_str())
        {
            j.phase = "interrupted".into();
            j.message="Setup was interrupted. Resume to inspect installed files and verify the model again.".into();
        }
    }
    Ok(job)
}
#[tauri::command]
pub fn cancel_model_job() -> Result<(), String> {
    CANCEL.store(true, Ordering::SeqCst);
    Ok(())
}
#[tauri::command]
pub fn start_model_job(app: AppHandle, model: String) -> Result<ModelJob, String> {
    if ACTIVE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("A model setup is already running. Reopen its progress instead.".into());
    }
    CANCEL.store(false, Ordering::SeqCst);
    let queued = match save(
        &app,
        &model,
        "starting_ollama",
        "Checking this computer and installed models",
    ) {
        Ok(v) => v,
        Err(e) => {
            ACTIVE.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };
    tauri::async_runtime::spawn(async move {
        let result = run(&app, &model).await;
        match result {
            Ok(()) => {
                let _ = save(
                    &app,
                    &model,
                    "done",
                    "Model response verified. You can open the synthetic note.",
                );
            }
            Err(e) => {
                let phase = if CANCEL.load(Ordering::SeqCst) {
                    "cancelled"
                } else {
                    "error"
                };
                let _ = save(&app, &model, phase, &e);
            }
        }
        ACTIVE.store(false, Ordering::SeqCst);
    });
    Ok(queued)
}
async fn run(app: &AppHandle, model: &str) -> Result<(), String> {
    let hw = ollama::detect_system_hardware()?;
    let (size, ram) = match model {
        "gemma4:e2b" => (7.2, 16.),
        "gemma4:e4b" => (9.6, 24.),
        "gemma4:12b" => (7.6, 24.),
        "gemma4:26b" => (19., 32.),
        "gemma3:1b" => (1., 4.),
        _ => return Err("Unsupported local model".into()),
    };
    let mut status = ollama::check_ollama_status().await?;
    let installed = status.models.iter().any(|m| m.name == model);
    if hw.total_ram_gb < ram {
        return Err(format!(
            "This model needs at least {ram} GiB under our memory policy."
        ));
    }
    let reserve = if installed {
        2.
    } else {
        size * 1e9 / 1024_f64.powi(3) + 5.
    };
    if hw.free_disk_gb < reserve {
        return Err(format!(
            "Need {reserve:.1} GiB free on the model drive. Free space and resume."
        ));
    }
    checkpoint()?;
    if !status.installed && !status.running {
        save(
            app,
            model,
            "installing_ollama",
            "Installing official runtime. Cancellation takes effect after this installer step.",
        )?;
        let message = ollama::install_ollama(app.clone()).await?;
        checkpoint()?;
        status = ollama::check_ollama_status().await?;
        if !status.installed && !status.running {
            return Err(format!(
                "{message} Complete the runtime installer, then resume."
            ));
        }
    }
    if !status.running {
        save(app, model, "starting_ollama", "Starting local engine")?;
        ollama::start_ollama().await?;
    }
    checkpoint()?;
    status = ollama::check_ollama_status().await?;
    if !status.models.iter().any(|m| m.name == model) {
        save(app,model,"downloading_model","Downloading model layers. You may navigate elsewhere; reopen Administration to see progress.")?;
        let pull = ollama::pull_ollama_model(app.clone(), model.into());
        tokio::pin!(pull);
        loop {
            tokio::select! {result=&mut pull=>{result?;break;},_=tokio::time::sleep(std::time::Duration::from_millis(200))=>checkpoint()?}
        }
    }
    checkpoint()?;
    save(app, model, "activating", "Configuring downloaded model")?;
    ollama::configure_ollama_backend(app.clone(), model.into()).await?;
    checkpoint()?;
    save(
        app,
        model,
        "testing",
        "Verifying a response; cold startup may take up to three minutes",
    )?;
    let result = ollama::test_ollama_inference(app.clone()).await?;
    checkpoint()?;
    if !result.success {
        return Err(result.error.unwrap_or("Model response check failed".into()));
    }
    Ok(())
}
