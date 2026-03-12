use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

/// State that holds the active folder watcher.
pub struct WatcherState {
    inner: Mutex<Option<WatcherHandle>>,
}

struct WatcherHandle {
    _watcher: RecommendedWatcher,
    path: String,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

#[derive(Clone, Serialize)]
pub struct FileDetectedEvent {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
}

#[derive(Serialize)]
pub struct WatcherStatus {
    pub active: bool,
    pub path: Option<String>,
}

/// Start watching a folder for new data files (CSV, TSV, XLSX, XLS).
/// Emits `watcher://file-detected` events to the frontend when a supported file appears.
#[tauri::command]
pub fn start_folder_watcher(
    app: AppHandle,
    path: String,
) -> Result<WatcherStatus, String> {
    let state = app.state::<WatcherState>();
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;

    // Stop existing watcher if any
    *guard = None;

    let watch_path = PathBuf::from(&path);
    if !watch_path.exists() || !watch_path.is_dir() {
        return Err(format!("Directory does not exist: {}", path));
    }

    let app_handle = app.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                // Only care about new/modified files
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) => {}
                    _ => return,
                }

                for file_path in &event.paths {
                    let ext = file_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    // Only supported import file types
                    if !matches!(ext.as_str(), "csv" | "tsv" | "xlsx" | "xls" | "pip" | "dat" | "json" | "hl7") {
                        continue;
                    }

                    // Skip temp/partial files
                    let file_name = file_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("");
                    if file_name.starts_with('.') || file_name.starts_with('~') {
                        continue;
                    }

                    let size = std::fs::metadata(file_path)
                        .map(|m| m.len())
                        .unwrap_or(0);

                    // Skip empty files (still being written)
                    if size == 0 {
                        continue;
                    }

                    let payload = FileDetectedEvent {
                        path: file_path.to_string_lossy().to_string(),
                        file_name: file_name.to_string(),
                        size_bytes: size,
                    };

                    tracing::info!(
                        file = %payload.file_name,
                        size = payload.size_bytes,
                        "Data file detected in watched folder"
                    );

                    let _ = app_handle.emit("watcher://file-detected", payload);
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create file watcher: {}", e))?;

    watcher
        .watch(&watch_path, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    tracing::info!(path = %path, "Folder watcher started");

    *guard = Some(WatcherHandle {
        _watcher: watcher,
        path: path.clone(),
    });

    Ok(WatcherStatus {
        active: true,
        path: Some(path),
    })
}

/// Stop the folder watcher.
#[tauri::command]
pub fn stop_folder_watcher(app: AppHandle) -> Result<WatcherStatus, String> {
    let state = app.state::<WatcherState>();
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = None;
    tracing::info!("Folder watcher stopped");

    Ok(WatcherStatus {
        active: false,
        path: None,
    })
}

/// Get the current watcher status.
#[tauri::command]
pub fn get_watcher_status(app: AppHandle) -> Result<WatcherStatus, String> {
    let state = app.state::<WatcherState>();
    let guard = state.inner.lock().map_err(|e| e.to_string())?;

    Ok(match guard.as_ref() {
        Some(handle) => WatcherStatus {
            active: true,
            path: Some(handle.path.clone()),
        },
        None => WatcherStatus {
            active: false,
            path: None,
        },
    })
}
