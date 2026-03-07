pub mod mapping;

use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::import::mapping::{auto_map_columns, ColumnMapping, MappedField};

#[derive(Error, Debug)]
pub enum ImportError {
    #[error("File not found: {0}")]
    FileNotFound(String),
    #[error("Unsupported file format: {0}")]
    UnsupportedFormat(String),
    #[error("CSV parse error: {0}")]
    CsvError(#[from] csv::Error),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Missing required column mapping: {0}")]
    MissingRequiredMapping(String),
    #[error("Invalid data in row {row}: {message}")]
    InvalidData { row: usize, message: String },
    #[error("Database error: {0}")]
    DatabaseError(String),
}

/// Detected file format information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileFormatInfo {
    pub format: FileFormat,
    pub mime_type: String,
    pub file_size_bytes: u64,
    pub estimated_rows: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileFormat {
    Csv,
    Tsv,
    Xlsx,
    Json,
    Xml,
    Unknown,
}

/// A preview of the import, including headers, sample rows, and suggested mappings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreview {
    pub headers: Vec<String>,
    pub sample_rows: Vec<Vec<String>>,
    pub total_rows: usize,
    pub suggested_mapping: ColumnMapping,
    pub format_detected: DataLayoutFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DataLayoutFormat {
    /// One row per patient, columns represent different fields
    Wide,
    /// Multiple rows per patient (e.g., one row per diagnosis)
    Long,
}

/// Result of an import execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub records_imported: u32,
    pub records_updated: u32,
    pub records_skipped: u32,
    pub errors: Vec<ImportRowError>,
    pub import_log_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportRowError {
    pub row: usize,
    pub message: String,
}

/// A patient record parsed from an import file, matching the DB schema.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatientRecord {
    pub site_patient_id: String,
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,
    pub race: Option<String>,
    pub ethnicity: Option<String>,
    pub insurance_type: Option<String>,
    pub diagnoses: Vec<DiagnosisRecord>,
    pub medications: Vec<MedicationRecord>,
    pub lab_results: Vec<LabResultRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosisRecord {
    pub icd10_code: Option<String>,
    pub description: String,
    pub onset_date: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MedicationRecord {
    pub rxnorm_code: Option<String>,
    pub drug_name: String,
    pub dose: Option<String>,
    pub frequency: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabResultRecord {
    pub loinc_code: Option<String>,
    pub test_name: String,
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub reference_range: Option<String>,
    pub result_date: Option<String>,
    pub abnormal_flag: Option<String>,
}

/// Detect file format from extension and content sniffing.
pub fn detect_file_format(path: &Path) -> Result<FileFormatInfo, ImportError> {
    if !path.exists() {
        return Err(ImportError::FileNotFound(
            path.display().to_string(),
        ));
    }

    let metadata = std::fs::metadata(path)?;
    let file_size_bytes = metadata.len();

    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let (format, mime_type) = match extension.as_str() {
        "csv" => (FileFormat::Csv, "text/csv".to_string()),
        "tsv" | "tab" => (FileFormat::Tsv, "text/tab-separated-values".to_string()),
        "xlsx" | "xls" => (FileFormat::Xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string()),
        "json" => (FileFormat::Json, "application/json".to_string()),
        "xml" => (FileFormat::Xml, "application/xml".to_string()),
        _ => {
            // Try content sniffing for CSV (check if first few bytes look like CSV)
            if let Ok(content) = std::fs::read_to_string(path) {
                let first_line = content.lines().next().unwrap_or("");
                if first_line.contains(',') {
                    (FileFormat::Csv, "text/csv".to_string())
                } else if first_line.contains('\t') {
                    (FileFormat::Tsv, "text/tab-separated-values".to_string())
                } else {
                    (FileFormat::Unknown, "application/octet-stream".to_string())
                }
            } else {
                (FileFormat::Unknown, "application/octet-stream".to_string())
            }
        }
    };

    // Estimate row count for CSV/TSV by counting newlines
    let estimated_rows = if format == FileFormat::Csv || format == FileFormat::Tsv {
        // Quick estimate: read file and count lines, subtract 1 for header
        if let Ok(content) = std::fs::read_to_string(path) {
            let line_count = content.lines().count();
            Some(if line_count > 0 { (line_count - 1) as u64 } else { 0 })
        } else {
            None
        }
    } else {
        None
    };

    Ok(FileFormatInfo {
        format,
        mime_type,
        file_size_bytes,
        estimated_rows,
    })
}

/// Read a CSV/TSV file and return headers plus sample rows for preview.
pub fn preview_csv(path: &Path, max_rows: usize) -> Result<(Vec<String>, Vec<Vec<String>>, usize), ImportError> {
    let format_info = detect_file_format(path)?;
    let delimiter = match format_info.format {
        FileFormat::Tsv => b'\t',
        _ => b',',
    };

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_path(path)?;

    let headers: Vec<String> = reader
        .headers()?
        .iter()
        .map(|h| h.to_string())
        .collect();

    let mut sample_rows = Vec::new();
    let mut total_rows = 0;

    for result in reader.records() {
        total_rows += 1;
        if sample_rows.len() < max_rows {
            match result {
                Ok(record) => {
                    sample_rows.push(record.iter().map(|f| f.to_string()).collect());
                }
                Err(_) => {
                    // Skip malformed rows in preview
                    continue;
                }
            }
        } else {
            // Count remaining rows without storing them
            if result.is_ok() {
                // just counting
            }
        }
    }

    Ok((headers, sample_rows, total_rows))
}

/// Detect if data is in wide format (one row per patient) or long format.
pub fn detect_data_layout(headers: &[String], sample_rows: &[Vec<String>], mapping: &ColumnMapping) -> DataLayoutFormat {
    // If there's a patient ID column, check for duplicate patient IDs in sample data
    if let Some(patient_id_field) = mapping.field_mappings.iter().find(|m| m.target_field == "site_patient_id") {
        if let Some(col_idx) = headers.iter().position(|h| h == &patient_id_field.source_column) {
            let mut seen_ids: HashMap<String, usize> = HashMap::new();
            for row in sample_rows {
                if let Some(val) = row.get(col_idx) {
                    *seen_ids.entry(val.clone()).or_insert(0) += 1;
                }
            }
            // If any patient ID appears more than once, it's long format
            if seen_ids.values().any(|&count| count > 1) {
                return DataLayoutFormat::Long;
            }
        }
    }
    DataLayoutFormat::Wide
}

/// Parse a CSV file into PatientRecords using the provided column mapping.
pub fn parse_csv(path: &Path, mapping: &ColumnMapping) -> Result<Vec<PatientRecord>, ImportError> {
    // Validate that we have the required patient_id mapping
    let has_patient_id = mapping.field_mappings.iter().any(|m| m.target_field == "site_patient_id");
    if !has_patient_id {
        return Err(ImportError::MissingRequiredMapping(
            "site_patient_id (Patient ID)".to_string(),
        ));
    }

    let format_info = detect_file_format(path)?;
    let delimiter = match format_info.format {
        FileFormat::Tsv => b'\t',
        _ => b',',
    };

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_path(path)?;

    let headers: Vec<String> = reader
        .headers()?
        .iter()
        .map(|h| h.to_string())
        .collect();

    // Build column index lookup from mapping
    let field_indices: HashMap<String, usize> = mapping
        .field_mappings
        .iter()
        .filter_map(|m| {
            headers
                .iter()
                .position(|h| h == &m.source_column)
                .map(|idx| (m.target_field.clone(), idx))
        })
        .collect();

    // For wide format: one row = one patient
    // For long format: aggregate rows by patient ID
    let mut patients_map: HashMap<String, PatientRecord> = HashMap::new();

    for (row_idx, result) in reader.records().enumerate() {
        let record = result.map_err(|e| ImportError::InvalidData {
            row: row_idx + 2, // +2 for 1-indexed + header row
            message: e.to_string(),
        })?;

        let get_field = |target: &str| -> Option<String> {
            field_indices
                .get(target)
                .and_then(|&idx| record.get(idx))
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        };

        let patient_id = match get_field("site_patient_id") {
            Some(id) => id,
            None => continue, // Skip rows without patient ID
        };

        let patient = patients_map.entry(patient_id.clone()).or_insert_with(|| PatientRecord {
            site_patient_id: patient_id.clone(),
            date_of_birth: get_field("date_of_birth"),
            gender: get_field("gender"),
            race: get_field("race"),
            ethnicity: get_field("ethnicity"),
            insurance_type: get_field("insurance_type"),
            diagnoses: Vec::new(),
            medications: Vec::new(),
            lab_results: Vec::new(),
        });

        // Update demographic fields if they were empty and this row has them
        if patient.date_of_birth.is_none() {
            patient.date_of_birth = get_field("date_of_birth");
        }
        if patient.gender.is_none() {
            patient.gender = get_field("gender");
        }
        if patient.race.is_none() {
            patient.race = get_field("race");
        }
        if patient.ethnicity.is_none() {
            patient.ethnicity = get_field("ethnicity");
        }
        if patient.insurance_type.is_none() {
            patient.insurance_type = get_field("insurance_type");
        }

        // Extract diagnosis if present
        let diagnosis_desc = get_field("diagnosis_description")
            .or_else(|| get_field("diagnosis"));
        if let Some(desc) = diagnosis_desc {
            patient.diagnoses.push(DiagnosisRecord {
                icd10_code: get_field("icd10_code"),
                description: desc,
                onset_date: get_field("diagnosis_onset_date"),
                status: get_field("diagnosis_status"),
            });
        }

        // Extract medication if present
        let drug_name = get_field("drug_name")
            .or_else(|| get_field("medication"));
        if let Some(name) = drug_name {
            patient.medications.push(MedicationRecord {
                rxnorm_code: get_field("rxnorm_code"),
                drug_name: name,
                dose: get_field("dose"),
                frequency: get_field("frequency"),
                start_date: get_field("medication_start_date"),
                end_date: get_field("medication_end_date"),
                status: get_field("medication_status"),
            });
        }

        // Extract lab result if present
        let test_name = get_field("test_name")
            .or_else(|| get_field("lab_test"));
        if let Some(name) = test_name {
            let value = get_field("lab_value")
                .or_else(|| get_field("result_value"))
                .and_then(|v| v.parse::<f64>().ok());

            patient.lab_results.push(LabResultRecord {
                loinc_code: get_field("loinc_code"),
                test_name: name,
                value,
                unit: get_field("lab_unit").or_else(|| get_field("unit")),
                reference_range: get_field("reference_range"),
                result_date: get_field("result_date"),
                abnormal_flag: get_field("abnormal_flag"),
            });
        }
    }

    let patients: Vec<PatientRecord> = patients_map.into_values().collect();
    tracing::info!(count = patients.len(), "Parsed patient records from CSV");
    Ok(patients)
}

/// Generate an ImportPreview for a given file path.
pub fn generate_preview(path: &Path) -> Result<ImportPreview, ImportError> {
    let (headers, sample_rows, total_rows) = preview_csv(path, 10)?;
    let suggested_mapping = auto_map_columns(&headers);
    let format_detected = detect_data_layout(&headers, &sample_rows, &suggested_mapping);

    Ok(ImportPreview {
        headers,
        sample_rows,
        total_rows,
        suggested_mapping,
        format_detected,
    })
}
