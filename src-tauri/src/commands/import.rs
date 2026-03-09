use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::db::DbState;
use crate::db::audit::{write_audit_entry, AuditAction};
use crate::import::{
    self, FileFormat, FileFormatInfo, ImportPreview, ImportResult, ImportRowError,
    PatientRecord, ValidationReport,
};
use crate::import::mapping::{ColumnMapping, MappedField};

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

    let patients = parse_patients_from_file(file_path, &mapping)?;

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

    let patients = parse_patients_from_file(file_path, &mapping)?;

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

/// Parse patients from a file, automatically detecting multi-sheet XLSX workbooks.
/// For multi-sheet XLSX: uses parse_xlsx_multi to merge sheets by patient ID.
/// For single-sheet XLSX: converts to temp CSV then parses.
/// For CSV/TSV/pipe: parses directly.
fn parse_patients_from_file(file_path: &Path, mapping: &ColumnMapping) -> Result<Vec<PatientRecord>, String> {
    let format_info = import::detect_file_format(file_path).map_err(|e| {
        let cmd_err = ImportCommandError::from(e);
        serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
    })?;

    if format_info.format == FileFormat::Xlsx {
        // Check if this is a multi-sheet workbook with multiple data sheets
        let is_multi = import::is_multi_sheet_xlsx(file_path).map_err(|e| {
            let cmd_err = ImportCommandError::from(e);
            serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
        })?;

        if is_multi {
            tracing::info!("Detected multi-sheet XLSX, using multi-sheet parser");
            return import::parse_xlsx_multi(file_path, mapping).map_err(|e| {
                let cmd_err = ImportCommandError::from(e);
                serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
            });
        }

        // Single-sheet XLSX: convert to temp CSV
        let temp_path = import::xlsx_to_csv_temp(file_path).map_err(|e| {
            let cmd_err = ImportCommandError::from(e);
            serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
        })?;

        let patients = import::parse_csv(&temp_path, mapping).map_err(|e| {
            let cmd_err = ImportCommandError::from(e);
            serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
        });

        // Clean up temp file
        let _ = std::fs::remove_file(&temp_path);

        patients
    } else {
        // CSV/TSV/pipe: parse directly
        import::parse_csv(file_path, mapping).map_err(|e| {
            let cmd_err = ImportCommandError::from(e);
            serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
        })
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

            // Insert lab results (dedup by patient_id, test_name, result_date, value)
            for lab in &patient.lab_results {
                let exists: bool = conn.query_row(
                    "SELECT COUNT(*) > 0 FROM lab_results WHERE patient_id = ?1 AND test_name = ?2 AND result_date IS ?3 AND value IS ?4",
                    rusqlite::params![patient_id, lab.test_name, lab.result_date, lab.value],
                    |row| row.get(0),
                ).unwrap_or(false);

                if !exists {
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

            // Insert vitals (dedup by patient_id, vital_type, measurement_date, value)
            for vital in &patient.vitals {
                let exists: bool = conn.query_row(
                    "SELECT COUNT(*) > 0 FROM vitals WHERE patient_id = ?1 AND vital_type = ?2 AND measurement_date IS ?3 AND value IS ?4",
                    rusqlite::params![patient_id, vital.vital_type, vital.measurement_date, vital.value],
                    |row| row.get(0),
                ).unwrap_or(false);

                if !exists {
                    let vital_id = uuid::Uuid::new_v4().to_string();
                    let _ = conn.execute(
                        "INSERT INTO vitals (id, patient_id, vital_type, value, unit, measurement_date)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        rusqlite::params![vital_id, patient_id, vital.vital_type, vital.value, vital.unit, vital.measurement_date],
                    );
                }
            }

            // Insert procedures (dedup by description)
            for proc in &patient.procedures {
                let exists: bool = conn.query_row(
                    "SELECT COUNT(*) > 0 FROM procedures WHERE patient_id = ?1 AND description = ?2",
                    rusqlite::params![patient_id, proc.description],
                    |row| row.get(0),
                ).unwrap_or(false);
                if !exists {
                    let proc_id = uuid::Uuid::new_v4().to_string();
                    let _ = conn.execute(
                        "INSERT INTO procedures (id, patient_id, cpt_code, description, procedure_date, status)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        rusqlite::params![proc_id, patient_id, proc.cpt_code, proc.description, proc.procedure_date, proc.status.as_deref().unwrap_or("completed")],
                    );
                }
            }

            // Insert allergies (dedup by allergen)
            for allergy in &patient.allergies {
                let exists: bool = conn.query_row(
                    "SELECT COUNT(*) > 0 FROM allergies WHERE patient_id = ?1 AND allergen = ?2",
                    rusqlite::params![patient_id, allergy.allergen],
                    |row| row.get(0),
                ).unwrap_or(false);
                if !exists {
                    let allergy_id = uuid::Uuid::new_v4().to_string();
                    let _ = conn.execute(
                        "INSERT INTO allergies (id, patient_id, allergen, reaction, severity, allergy_type, onset_date, status)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        rusqlite::params![allergy_id, patient_id, allergy.allergen, allergy.reaction, allergy.severity, allergy.allergy_type, allergy.onset_date, allergy.status.as_deref().unwrap_or("active")],
                    );
                }
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

    // After successful commit, record file hash for future dedup detection
    if let Ok(hash) = import::compute_file_hash(Path::new(file_name)) {
        let hash_id = uuid::Uuid::new_v4().to_string();
        let _ = conn.execute(
            "INSERT INTO import_file_hashes (id, file_hash, file_name, records_count) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![hash_id, hash, file_name, records_imported + records_updated],
        );
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

/// Check if a file has been imported before based on its content hash.
#[tauri::command]
pub fn check_duplicate_import(app: AppHandle, path: String) -> Result<DuplicateCheckResult, String> {
    let file_path = Path::new(&path);
    let hash = import::compute_file_hash(file_path).map_err(|e| {
        let cmd_err = ImportCommandError::from(e);
        serde_json::to_string(&cmd_err).unwrap_or_else(|_| cmd_err.message)
    })?;

    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;

    if let Some(pool) = lock.as_ref() {
        let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

        let result: Option<(String, i64)> = conn.query_row(
            "SELECT imported_at, records_count FROM import_file_hashes WHERE file_hash = ?1 ORDER BY imported_at DESC LIMIT 1",
            [&hash],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).ok();

        if let Some((imported_at, records_count)) = result {
            Ok(DuplicateCheckResult {
                is_duplicate: true,
                previous_import_date: Some(imported_at),
                previous_record_count: Some(records_count as u32),
                file_hash: hash,
            })
        } else {
            Ok(DuplicateCheckResult {
                is_duplicate: false,
                previous_import_date: None,
                previous_record_count: None,
                file_hash: hash,
            })
        }
    } else {
        // No DB available, can't check for duplicates
        Ok(DuplicateCheckResult {
            is_duplicate: false,
            previous_import_date: None,
            previous_record_count: None,
            file_hash: hash,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateCheckResult {
    pub is_duplicate: bool,
    pub previous_import_date: Option<String>,
    pub previous_record_count: Option<u32>,
    pub file_hash: String,
}

/// Adjust a column mapping by reassigning a source column to a new target field.
#[tauri::command]
pub fn adjust_column_mapping(
    current_mapping: ColumnMapping,
    source_column: String,
    new_target_field: String,
) -> Result<ColumnMapping, String> {
    let mut mapping = current_mapping;

    // Remove any existing mapping to the new_target_field (to avoid duplicates)
    mapping.field_mappings.retain(|m| m.target_field != new_target_field);

    // Update or add the mapping for source_column
    if let Some(existing) = mapping.field_mappings.iter_mut().find(|m| m.source_column == source_column) {
        existing.target_field = new_target_field;
        existing.confidence = 1.0; // User-specified = max confidence
        existing.auto_detected = false;
    } else {
        mapping.field_mappings.push(MappedField {
            source_column,
            target_field: new_target_field,
            confidence: 1.0,
            auto_detected: false,
        });
    }

    Ok(mapping)
}

/// Get the list of all available target fields for mapping.
#[tauri::command]
pub fn get_available_target_fields() -> Vec<TargetFieldInfo> {
    vec![
        TargetFieldInfo { field: "site_patient_id".into(), label: "Patient ID".into(), required: true, category: "demographics".into() },
        TargetFieldInfo { field: "date_of_birth".into(), label: "Date of Birth".into(), required: false, category: "demographics".into() },
        TargetFieldInfo { field: "gender".into(), label: "Gender".into(), required: false, category: "demographics".into() },
        TargetFieldInfo { field: "race".into(), label: "Race".into(), required: false, category: "demographics".into() },
        TargetFieldInfo { field: "ethnicity".into(), label: "Ethnicity".into(), required: false, category: "demographics".into() },
        TargetFieldInfo { field: "insurance_type".into(), label: "Insurance Type".into(), required: false, category: "demographics".into() },
        TargetFieldInfo { field: "diagnosis_description".into(), label: "Diagnosis".into(), required: false, category: "diagnoses".into() },
        TargetFieldInfo { field: "icd10_code".into(), label: "ICD-10 Code".into(), required: false, category: "diagnoses".into() },
        TargetFieldInfo { field: "diagnosis_onset_date".into(), label: "Diagnosis Date".into(), required: false, category: "diagnoses".into() },
        TargetFieldInfo { field: "diagnosis_status".into(), label: "Diagnosis Status".into(), required: false, category: "diagnoses".into() },
        TargetFieldInfo { field: "drug_name".into(), label: "Medication Name".into(), required: false, category: "medications".into() },
        TargetFieldInfo { field: "rxnorm_code".into(), label: "RxNorm Code".into(), required: false, category: "medications".into() },
        TargetFieldInfo { field: "dose".into(), label: "Dose".into(), required: false, category: "medications".into() },
        TargetFieldInfo { field: "frequency".into(), label: "Frequency".into(), required: false, category: "medications".into() },
        TargetFieldInfo { field: "medication_start_date".into(), label: "Medication Start".into(), required: false, category: "medications".into() },
        TargetFieldInfo { field: "medication_end_date".into(), label: "Medication End".into(), required: false, category: "medications".into() },
        TargetFieldInfo { field: "medication_status".into(), label: "Medication Status".into(), required: false, category: "medications".into() },
        TargetFieldInfo { field: "test_name".into(), label: "Lab Test Name".into(), required: false, category: "labs".into() },
        TargetFieldInfo { field: "loinc_code".into(), label: "LOINC Code".into(), required: false, category: "labs".into() },
        TargetFieldInfo { field: "lab_value".into(), label: "Lab Value".into(), required: false, category: "labs".into() },
        TargetFieldInfo { field: "lab_unit".into(), label: "Lab Unit".into(), required: false, category: "labs".into() },
        TargetFieldInfo { field: "reference_range".into(), label: "Reference Range".into(), required: false, category: "labs".into() },
        TargetFieldInfo { field: "result_date".into(), label: "Result Date".into(), required: false, category: "labs".into() },
        TargetFieldInfo { field: "abnormal_flag".into(), label: "Abnormal Flag".into(), required: false, category: "labs".into() },
        TargetFieldInfo { field: "vital_type".into(), label: "Vital Type".into(), required: false, category: "vitals".into() },
        TargetFieldInfo { field: "vital_value".into(), label: "Vital Value".into(), required: false, category: "vitals".into() },
        TargetFieldInfo { field: "vital_unit".into(), label: "Vital Unit".into(), required: false, category: "vitals".into() },
        TargetFieldInfo { field: "vital_date".into(), label: "Vital Date".into(), required: false, category: "vitals".into() },
        TargetFieldInfo { field: "procedure_description".into(), label: "Procedure".into(), required: false, category: "procedures".into() },
        TargetFieldInfo { field: "cpt_code".into(), label: "CPT Code".into(), required: false, category: "procedures".into() },
        TargetFieldInfo { field: "procedure_date".into(), label: "Procedure Date".into(), required: false, category: "procedures".into() },
        TargetFieldInfo { field: "procedure_status".into(), label: "Procedure Status".into(), required: false, category: "procedures".into() },
        TargetFieldInfo { field: "allergen".into(), label: "Allergen".into(), required: false, category: "allergies".into() },
        TargetFieldInfo { field: "allergy_reaction".into(), label: "Reaction".into(), required: false, category: "allergies".into() },
        TargetFieldInfo { field: "allergy_severity".into(), label: "Severity".into(), required: false, category: "allergies".into() },
        TargetFieldInfo { field: "allergy_type".into(), label: "Allergy Type".into(), required: false, category: "allergies".into() },
        TargetFieldInfo { field: "allergy_onset_date".into(), label: "Allergy Onset".into(), required: false, category: "allergies".into() },
        TargetFieldInfo { field: "allergy_status".into(), label: "Allergy Status".into(), required: false, category: "allergies".into() },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetFieldInfo {
    pub field: String,
    pub label: String,
    pub required: bool,
    pub category: String,
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

// --- Import Profile types and commands ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProfile {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub emr_system: Option<String>,
    pub file_format: String,
    pub column_mapping: ColumnMapping,
    pub header_row_index: usize,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub use_count: u32,
}

#[tauri::command]
pub fn save_import_profile(
    app: AppHandle,
    name: String,
    description: Option<String>,
    emr_system: Option<String>,
    file_format: String,
    mapping: ColumnMapping,
    header_row_index: usize,
) -> Result<ImportProfile, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let id = uuid::Uuid::new_v4().to_string();
    let mapping_json = serde_json::to_string(&mapping)
        .map_err(|e| format!("Failed to serialize mapping: {}", e))?;

    conn.execute(
        "INSERT INTO import_profiles (id, name, description, emr_system, file_format, column_mapping, header_row_index)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, name, description, emr_system, file_format, mapping_json, header_row_index as i64],
    ).map_err(|e| format!("Failed to save profile: {}", e))?;

    let created_at: String = conn.query_row(
        "SELECT created_at FROM import_profiles WHERE id = ?1",
        [&id],
        |row| row.get(0),
    ).map_err(|e| format!("Failed to read profile: {}", e))?;

    tracing::info!(profile_id = %id, profile_name = %name, "Import profile saved");

    Ok(ImportProfile {
        id,
        name,
        description,
        emr_system,
        file_format,
        column_mapping: mapping,
        header_row_index,
        created_at,
        last_used_at: None,
        use_count: 0,
    })
}

#[tauri::command]
pub fn list_import_profiles(app: AppHandle) -> Result<Vec<ImportProfile>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT id, name, description, emr_system, file_format, column_mapping, header_row_index, created_at, last_used_at, use_count
         FROM import_profiles
         ORDER BY last_used_at DESC NULLS LAST, use_count DESC"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let profiles = stmt.query_map([], |row| {
        let mapping_json: String = row.get(5)?;
        let column_mapping: ColumnMapping = serde_json::from_str(&mapping_json)
            .map_err(|e| rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(e)))?;
        let header_row_index: i64 = row.get(6)?;
        Ok(ImportProfile {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            emr_system: row.get(3)?,
            file_format: row.get(4)?,
            column_mapping,
            header_row_index: header_row_index as usize,
            created_at: row.get(7)?,
            last_used_at: row.get(8)?,
            use_count: row.get(9)?,
        })
    }).map_err(|e| format!("Failed to query profiles: {}", e))?;

    let mut result = Vec::new();
    for profile in profiles {
        result.push(profile.map_err(|e| format!("Failed to read profile row: {}", e))?);
    }

    Ok(result)
}

#[tauri::command]
pub fn delete_import_profile(app: AppHandle, profile_id: String) -> Result<(), String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    let rows_affected = conn.execute(
        "DELETE FROM import_profiles WHERE id = ?1",
        [&profile_id],
    ).map_err(|e| format!("Failed to delete profile: {}", e))?;

    if rows_affected == 0 {
        return Err(format!("Profile not found: {}", profile_id));
    }

    tracing::info!(profile_id = %profile_id, "Import profile deleted");
    Ok(())
}

#[tauri::command]
pub fn use_import_profile(app: AppHandle, profile_id: String) -> Result<ImportProfile, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    conn.execute(
        "UPDATE import_profiles SET use_count = use_count + 1, last_used_at = datetime('now') WHERE id = ?1",
        [&profile_id],
    ).map_err(|e| format!("Failed to update profile: {}", e))?;

    let profile = conn.query_row(
        "SELECT id, name, description, emr_system, file_format, column_mapping, header_row_index, created_at, last_used_at, use_count
         FROM import_profiles WHERE id = ?1",
        [&profile_id],
        |row| {
            let mapping_json: String = row.get(5)?;
            let column_mapping: ColumnMapping = serde_json::from_str(&mapping_json)
                .map_err(|e| rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(e)))?;
            let header_row_index: i64 = row.get(6)?;
            Ok(ImportProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                emr_system: row.get(3)?,
                file_format: row.get(4)?,
                column_mapping,
                header_row_index: header_row_index as usize,
                created_at: row.get(7)?,
                last_used_at: row.get(8)?,
                use_count: row.get(9)?,
            })
        },
    ).map_err(|e| format!("Profile not found: {}", e))?;

    tracing::info!(profile_id = %profile_id, use_count = profile.use_count, "Import profile used");
    Ok(profile)
}
