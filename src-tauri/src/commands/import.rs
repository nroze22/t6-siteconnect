use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::db::DbState;
use crate::db::audit::{write_audit_entry, AuditAction};
use crate::import::{
    self, FileFormat, FileFormatInfo, ImportPreview, ImportResult, ImportRowError,
    PatientRecord, ValidationReport,
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
            import::ImportError::XlsxError(_) => ("XLSX_PARSE_ERROR", "Failed to parse the XLSX file. Please verify the file is valid.".to_string()),
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

/// Validate an import file: parse and return a validation report without persisting.
#[tauri::command]
pub fn validate_import(path: String, mapping: ColumnMapping) -> Result<ValidationReport, String> {
    let file_path = Path::new(&path);
    tracing::info!("Validating import data");

    // Handle XLSX by converting to temp CSV first
    let (parse_path, temp_file) = prepare_parse_path(file_path)?;

    let patients = import::parse_csv(&parse_path, &mapping).map_err(|e| {
        let cmd_err = ImportCommandError::from(e);
        serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
    })?;

    // Clean up temp file if created
    if let Some(ref tf) = temp_file {
        let _ = std::fs::remove_file(tf);
    }

    let report = import::validate_patient_records(&patients);
    Ok(report)
}

/// Execute the import: parse the file with the given column mapping and store records in the database.
#[tauri::command]
pub fn execute_import(
    app: AppHandle,
    path: String,
    mapping: ColumnMapping,
) -> Result<ImportResult, String> {
    let file_path = Path::new(&path);
    tracing::info!("Executing patient data import");

    // Handle XLSX by converting to temp CSV first
    let (parse_path, temp_file) = prepare_parse_path(file_path)?;

    // Parse the CSV file
    let patients = import::parse_csv(&parse_path, &mapping).map_err(|e| {
        let cmd_err = ImportCommandError::from(e);
        serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
    })?;

    // Clean up temp file if created
    if let Some(ref tf) = temp_file {
        let _ = std::fs::remove_file(tf);
    }

    // Try to persist to DB if available
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;

    if let Some(pool) = lock.as_ref() {
        let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;
        let result = persist_patients(&conn, &patients, &path)?;

        // Write audit entry
        let _ = write_audit_entry(
            &conn,
            AuditAction::DataImported,
            &format!("Imported {} patients from {}", result.records_imported, path),
        );

        // Log the import
        let file_format = if path.ends_with(".xlsx") || path.ends_with(".xls") {
            "xlsx"
        } else {
            "csv"
        };
        let _ = conn.execute(
            "INSERT INTO import_log (id, file_name, file_format, records_imported, records_updated, records_skipped, imported_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
            rusqlite::params![
                result.import_log_id,
                path,
                file_format,
                result.records_imported,
                result.records_updated,
                result.records_skipped,
            ],
        );

        Ok(result)
    } else {
        // No DB — return summary without persisting
        store_patients_dry_run(&patients, &path)
    }
}

/// Determine the parse path, converting XLSX to temp CSV if needed.
/// Returns (path_to_parse, optional_temp_file_to_cleanup).
fn prepare_parse_path(file_path: &Path) -> Result<(std::path::PathBuf, Option<std::path::PathBuf>), String> {
    let format_info = import::detect_file_format(file_path).map_err(|e| {
        let cmd_err = ImportCommandError::from(e);
        serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
    })?;

    if format_info.format == FileFormat::Xlsx {
        let temp_path = import::xlsx_to_csv_temp(file_path).map_err(|e| {
            let cmd_err = ImportCommandError::from(e);
            serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
        })?;
        Ok((temp_path.clone(), Some(temp_path)))
    } else {
        Ok((file_path.to_path_buf(), None))
    }
}

/// Persist parsed patients into the SQLite database, wrapped in a transaction.
fn persist_patients(
    conn: &rusqlite::Connection,
    patients: &[PatientRecord],
    file_name: &str,
) -> Result<ImportResult, String> {
    let import_log_id = uuid::Uuid::new_v4().to_string();
    let mut records_imported: u32 = 0;
    let mut records_updated: u32 = 0;
    let mut records_skipped: u32 = 0;
    let mut errors: Vec<ImportRowError> = Vec::new();

    // Begin transaction for atomicity
    conn.execute_batch("BEGIN TRANSACTION")
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    let result = (|| -> Result<(), String> {
        for (idx, patient) in patients.iter().enumerate() {
            if patient.site_patient_id.trim().is_empty() {
                errors.push(ImportRowError {
                    row: idx + 1,
                    message: "Empty patient ID".to_string(),
                });
                records_skipped += 1;
                continue;
            }

            // Check if patient already exists
            let existing: Option<String> = conn.query_row(
                "SELECT id FROM patients WHERE site_patient_id = ?1",
                [&patient.site_patient_id],
                |row| row.get(0),
            ).ok();

            let patient_id = if let Some(existing_id) = existing {
                // Update existing patient demographics
                conn.execute(
                    "UPDATE patients SET
                        date_of_birth = COALESCE(?2, date_of_birth),
                        gender = COALESCE(?3, gender),
                        race = COALESCE(?4, race),
                        ethnicity = COALESCE(?5, ethnicity),
                        insurance_type = COALESCE(?6, insurance_type),
                        last_updated = datetime('now'),
                        import_source = ?7
                     WHERE id = ?1",
                    rusqlite::params![
                        existing_id,
                        patient.date_of_birth,
                        patient.gender,
                        patient.race,
                        patient.ethnicity,
                        patient.insurance_type,
                        file_name,
                    ],
                ).map_err(|e| format!("Failed to update patient: {}", e))?;
                records_updated += 1;
                existing_id
            } else {
                // Insert new patient
                let new_id = uuid::Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO patients (id, site_patient_id, date_of_birth, gender, race, ethnicity, insurance_type, imported_at, import_source, last_updated)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), ?8, datetime('now'))",
                    rusqlite::params![
                        new_id,
                        patient.site_patient_id,
                        patient.date_of_birth,
                        patient.gender,
                        patient.race,
                        patient.ethnicity,
                        patient.insurance_type,
                        file_name,
                    ],
                ).map_err(|e| format!("Failed to insert patient: {}", e))?;
                records_imported += 1;
                new_id
            };

            // Insert diagnoses (dedup by icd10_code for this patient)
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
                        rusqlite::params![
                            dx_id, patient_id, dx.icd10_code, dx.description, dx.onset_date,
                            dx.status.as_deref().unwrap_or("active"),
                        ],
                    );
                }
            }

            // Insert medications (dedup by drug_name)
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
                        rusqlite::params![
                            med_id, patient_id, med.drug_name, med.dose,
                            med.status.as_deref().unwrap_or("active"),
                        ],
                    );
                }
            }

            // Insert lab results (always insert — labs are time-series data)
            for lab in &patient.lab_results {
                let lab_id = uuid::Uuid::new_v4().to_string();
                let _ = conn.execute(
                    "INSERT INTO lab_results (id, patient_id, test_name, value, unit, reference_range, result_date, abnormal_flag)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    rusqlite::params![
                        lab_id, patient_id, lab.test_name, lab.value, lab.unit,
                        lab.reference_range, lab.result_date, lab.abnormal_flag,
                    ],
                );
            }
        }
        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute_batch("COMMIT")
                .map_err(|e| format!("Failed to commit transaction: {}", e))?;
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            return Err(e);
        }
    }

    tracing::info!(
        imported = records_imported,
        updated = records_updated,
        skipped = records_skipped,
        errors = errors.len(),
        "Import persisted to database"
    );

    Ok(ImportResult {
        records_imported,
        records_updated,
        records_skipped,
        errors,
        import_log_id,
    })
}

/// Dry-run store (when DB is not available).
fn store_patients_dry_run(
    patients: &[PatientRecord],
    _file_name: &str,
) -> Result<ImportResult, String> {
    let import_log_id = uuid::Uuid::new_v4().to_string();
    let mut records_imported: u32 = 0;
    let mut records_skipped: u32 = 0;
    let mut errors: Vec<ImportRowError> = Vec::new();

    for (idx, patient) in patients.iter().enumerate() {
        if patient.site_patient_id.trim().is_empty() {
            errors.push(ImportRowError {
                row: idx + 1,
                message: "Empty patient ID".to_string(),
            });
            records_skipped += 1;
            continue;
        }
        records_imported += 1;
    }

    Ok(ImportResult {
        records_imported,
        records_updated: 0,
        records_skipped,
        errors,
        import_log_id,
    })
}
