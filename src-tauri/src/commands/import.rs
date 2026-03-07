use std::path::Path;

use serde::Serialize;

use crate::import::{
    self, FileFormatInfo, ImportPreview, ImportResult, ImportRowError,
    PatientRecord,
};
use crate::import::mapping::ColumnMapping;

/// Wrapper for user-friendly error responses from import commands.
#[derive(Debug, Serialize)]
pub struct ImportCommandError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for ImportCommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl From<import::ImportError> for ImportCommandError {
    fn from(err: import::ImportError) -> Self {
        let (code, message) = match &err {
            import::ImportError::FileNotFound(_) => ("FILE_NOT_FOUND", err.to_string()),
            import::ImportError::UnsupportedFormat(_) => ("UNSUPPORTED_FORMAT", err.to_string()),
            import::ImportError::CsvError(_) => ("CSV_PARSE_ERROR", "Failed to parse the CSV file. Please verify the file is valid CSV.".to_string()),
            import::ImportError::IoError(_) => ("IO_ERROR", "Could not read the file. Please check file permissions.".to_string()),
            import::ImportError::MissingRequiredMapping(_) => ("MISSING_MAPPING", err.to_string()),
            import::ImportError::InvalidData { row, message } => ("INVALID_DATA", format!("Invalid data at row {}: {}", row, message)),
            import::ImportError::DatabaseError(_) => ("DATABASE_ERROR", "A database error occurred during import.".to_string()),
        };
        ImportCommandError {
            code: code.to_string(),
            message,
        }
    }
}

/// Detect the format of a file at the given path.
///
/// Returns file format, MIME type, size, and estimated row count.
#[tauri::command]
pub fn detect_file_format(path: String) -> Result<FileFormatInfo, String> {
    let file_path = Path::new(&path);
    tracing::info!("Detecting file format for import");

    import::detect_file_format(file_path)
        .map_err(|e| {
            let cmd_err = ImportCommandError::from(e);
            serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
        })
}

/// Preview an import file: read headers, first 10 rows, and suggest column mappings.
///
/// This allows users to review and adjust mappings before executing the import.
#[tauri::command]
pub fn preview_import(path: String) -> Result<ImportPreview, String> {
    let file_path = Path::new(&path);
    tracing::info!("Generating import preview");

    import::generate_preview(file_path)
        .map_err(|e| {
            let cmd_err = ImportCommandError::from(e);
            serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
        })
}

/// Execute the import: parse the file with the given column mapping and store records in the database.
///
/// The mapping can be the auto-detected one from preview_import or a user-adjusted version.
#[tauri::command]
pub fn execute_import(
    path: String,
    mapping: ColumnMapping,
) -> Result<ImportResult, String> {
    let file_path = Path::new(&path);
    tracing::info!("Executing patient data import");

    // Parse the CSV file
    let patients = import::parse_csv(file_path, &mapping).map_err(|e| {
        let cmd_err = ImportCommandError::from(e);
        serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
    })?;

    // Store records in the database
    // NOTE: Database connection pool integration is pending; for now we return
    // the parsed result without persisting. When the DB pool is wired into
    // Tauri managed state, replace this with actual inserts.
    let result = store_patients(&patients, &path, &mapping);

    result.map_err(|e| {
        let cmd_err = ImportCommandError::from(e);
        serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
    })
}

/// Store parsed patient records into the SQLite database.
///
/// In production, this takes a connection from the managed pool.
/// Currently returns a summary without database persistence (DB pool not yet in Tauri state).
fn store_patients(
    patients: &[PatientRecord],
    file_name: &str,
    mapping: &ColumnMapping,
) -> Result<ImportResult, import::ImportError> {
    let now = chrono::Utc::now().to_rfc3339();
    let import_log_id = uuid::Uuid::new_v4().to_string();

    let mut records_imported: u32 = 0;
    let mut records_skipped: u32 = 0;
    let mut errors: Vec<ImportRowError> = Vec::new();

    for (idx, patient) in patients.iter().enumerate() {
        // Validate minimum data quality
        if patient.site_patient_id.trim().is_empty() {
            errors.push(ImportRowError {
                row: idx + 1,
                message: "Empty patient ID".to_string(),
            });
            records_skipped += 1;
            continue;
        }

        // TODO: When DB pool is available in Tauri managed state, insert here:
        // - Insert/upsert patient record
        // - Insert diagnoses, medications, lab results in a transaction
        // For now, count as imported for the result summary.
        records_imported += 1;
    }

    tracing::info!(
        imported = records_imported,
        skipped = records_skipped,
        error_count = errors.len(),
        "Import execution completed"
    );

    Ok(ImportResult {
        records_imported,
        records_updated: 0,
        records_skipped,
        errors,
        import_log_id,
    })
}
