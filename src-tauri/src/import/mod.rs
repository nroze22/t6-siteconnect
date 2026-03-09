pub mod mapping;

use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;

use calamine::{open_workbook_auto, Reader};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::import::mapping::{auto_map_columns, ColumnMapping};

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
    #[error("XLSX parse error: {0}")]
    XlsxError(String),
    #[error("Missing required column mapping: {0}")]
    MissingRequiredMapping(String),
    #[error("Invalid data in row {row}: {message}")]
    InvalidData { row: usize, message: String },
    #[error("Database error: {0}")]
    DatabaseError(String),
}

impl From<calamine::Error> for ImportError {
    fn from(err: calamine::Error) -> Self {
        ImportError::XlsxError(err.to_string())
    }
}

impl From<calamine::XlsxError> for ImportError {
    fn from(err: calamine::XlsxError) -> Self {
        ImportError::XlsxError(err.to_string())
    }
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
    Pipe,
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
    /// Present for multi-sheet XLSX files with detected sheet metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sheets: Option<Vec<SheetInfo>>,
    /// 0-based index of the detected header row (rows before this are metadata).
    #[serde(default)]
    pub header_row_index: usize,
}

/// Metadata about a single sheet in a multi-sheet XLSX workbook.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetInfo {
    pub name: String,
    pub headers: Vec<String>,
    pub row_count: usize,
    pub detected_type: SheetDataType,
    pub patient_id_column: Option<String>,
}

/// The type of clinical data a sheet contains, inferred from its column headers.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SheetDataType {
    Demographics,
    Diagnoses,
    Medications,
    Labs,
    Vitals,
    Procedures,
    Allergies,
    Mixed,
    Unknown,
}

/// A preview encompassing all sheets of a multi-sheet XLSX workbook.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiSheetPreview {
    pub sheets: Vec<SheetInfo>,
    pub is_multi_sheet: bool,
    /// Merged preview using first sheet's structure for backward compatibility.
    pub merged_preview: ImportPreview,
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
    pub vitals: Vec<VitalRecord>,
    pub procedures: Vec<ProcedureRecord>,
    pub allergies: Vec<AllergyRecord>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VitalRecord {
    pub vital_type: String,        // "weight", "height", "bmi", "systolic_bp", "diastolic_bp", "heart_rate", "temperature", "respiratory_rate", "spo2"
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub measurement_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcedureRecord {
    pub cpt_code: Option<String>,
    pub description: String,
    pub procedure_date: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllergyRecord {
    pub allergen: String,
    pub reaction: Option<String>,
    pub severity: Option<String>,   // "mild", "moderate", "severe"
    pub allergy_type: Option<String>, // "drug", "food", "environmental"
    pub onset_date: Option<String>,
    pub status: Option<String>,      // "active", "inactive", "resolved"
}

// --- Validation types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationReport {
    pub total_records: usize,
    pub valid_records: usize,
    pub warnings: Vec<ValidationWarning>,
    pub errors: Vec<ValidationError>,
    pub field_coverage: Vec<FieldCoverage>,
    pub duplicate_patient_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationWarning {
    pub patient_id: String,
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub patient_id: String,
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldCoverage {
    pub field_name: String,
    pub populated_count: usize,
    pub total_count: usize,
    pub coverage_percent: f64,
}

// --- Date normalization ---

/// Normalize a date string to YYYY-MM-DD format.
/// Handles: YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY, MM-DD-YYYY, M/D/YYYY,
/// DD/MM/YYYY (when day > 12), YYYYMMDD (HL7 compact), timestamps with time
/// components, DD-Mon-YYYY, DD Mon YYYY, Mon DD YYYY, Month DD, YYYY.
/// Returns None for unrecognizable formats.
pub fn normalize_date(input: &str) -> Option<String> {
    let input = input.trim();
    if input.is_empty() {
        return None;
    }

    // Strip time component (anything after T or space followed by time)
    let date_part = strip_time_component(input);

    // Try YYYYMMDD (8 digits, no separators — HL7 compact format)
    if let Some(d) = parse_yyyymmdd(&date_part) {
        return Some(d);
    }

    // Try YYYY-MM-DD or YYYY/MM/DD
    if let Some(d) = parse_ymd(&date_part) {
        return Some(d);
    }

    // Try MM/DD/YYYY or MM-DD-YYYY (also handles DD/MM/YYYY when day > 12)
    if let Some(d) = parse_mdy(&date_part) {
        return Some(d);
    }

    // Try DD-Mon-YYYY, DD Mon YYYY, Mon DD YYYY, Month DD, YYYY
    if let Some(d) = parse_named_month(&date_part) {
        return Some(d);
    }

    None
}

/// Strip time component from a date-time string, returning just the date part.
fn strip_time_component(input: &str) -> String {
    // Handle ISO 8601: "2024-03-15T10:30:00"
    if let Some(idx) = input.find('T') {
        return input[..idx].to_string();
    }
    // Handle "2024-03-15 14:22:00" or "03/15/2024 14:22"
    // Look for space followed by a time-like pattern (contains colon)
    let parts: Vec<&str> = input.splitn(2, ' ').collect();
    if parts.len() == 2 {
        if let Some(after_space) = parts.get(1) {
            if after_space.contains(':') {
                return parts[0].to_string();
            }
        }
    }
    input.to_string()
}

/// Parse YYYYMMDD compact format (e.g., "20240315").
fn parse_yyyymmdd(input: &str) -> Option<String> {
    if input.len() != 8 || !input.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let year: u32 = input[0..4].parse().ok()?;
    let month: u32 = input[4..6].parse().ok()?;
    let day: u32 = input[6..8].parse().ok()?;
    if year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31 {
        Some(format!("{:04}-{:02}-{:02}", year, month, day))
    } else {
        None
    }
}

fn parse_ymd(input: &str) -> Option<String> {
    // Split on - or /
    let parts: Vec<&str> = if input.contains('-') {
        input.splitn(3, '-').collect()
    } else if input.contains('/') {
        input.splitn(3, '/').collect()
    } else {
        return None;
    };

    if parts.len() != 3 {
        return None;
    }

    let first: u32 = parts[0].parse().ok()?;
    let second: u32 = parts[1].parse().ok()?;
    let third: u32 = parts[2].parse().ok()?;

    // If first part is >= 1000, treat as year (YYYY-MM-DD or YYYY/MM/DD)
    if first >= 1000 {
        let year = first;
        let month = second;
        let day = third;
        if month >= 1 && month <= 12 && day >= 1 && day <= 31 {
            return Some(format!("{:04}-{:02}-{:02}", year, month, day));
        }
    }

    None
}

fn parse_mdy(input: &str) -> Option<String> {
    let parts: Vec<&str> = if input.contains('/') {
        input.splitn(3, '/').collect()
    } else if input.contains('-') {
        input.splitn(3, '-').collect()
    } else {
        return None;
    };

    if parts.len() != 3 {
        return None;
    }

    let first: u32 = parts[0].parse().ok()?;
    let second: u32 = parts[1].parse().ok()?;
    let third: u32 = parts[2].parse().ok()?;

    // If third part is >= 1000, it's the year
    if third >= 1000 {
        // DD/MM/YYYY — first must be day since > 12
        if first > 12 && second >= 1 && second <= 12 && first >= 1 && first <= 31 {
            return Some(format!("{:04}-{:02}-{:02}", third, second, first));
        }
        // MM/DD/YYYY (US convention default when ambiguous)
        if first >= 1 && first <= 12 && second >= 1 && second <= 31 {
            return Some(format!("{:04}-{:02}-{:02}", third, first, second));
        }
    }

    None
}

/// Parse dates with named months: "15-Mar-2024", "15 Mar 2024", "Mar 15, 2024",
/// "March 15, 2024".
fn parse_named_month(input: &str) -> Option<String> {
    const MONTH_NAMES: &[(&str, u32)] = &[
        ("january", 1), ("february", 2), ("march", 3), ("april", 4),
        ("may", 5), ("june", 6), ("july", 7), ("august", 8),
        ("september", 9), ("october", 10), ("november", 11), ("december", 12),
        ("jan", 1), ("feb", 2), ("mar", 3), ("apr", 4),
        ("jun", 6), ("jul", 7), ("aug", 8), ("sep", 9),
        ("oct", 10), ("nov", 11), ("dec", 12),
    ];

    let lower = input.to_lowercase();
    // Remove commas for parsing
    let cleaned = lower.replace(',', " ");
    let tokens: Vec<&str> = cleaned.split_whitespace().collect();

    if tokens.len() >= 3 {
        // Try "DD Mon YYYY"
        if let Ok(day) = tokens[0].parse::<u32>() {
            if let Some(&(_, month)) = MONTH_NAMES.iter().find(|&&(name, _)| name == tokens[1]) {
                if let Ok(year) = tokens[2].parse::<u32>() {
                    if day >= 1 && day <= 31 && year >= 1900 && year <= 2100 {
                        return Some(format!("{:04}-{:02}-{:02}", year, month, day));
                    }
                }
            }
        }

        // Try "Mon DD YYYY" or "Month DD YYYY"
        if let Some(&(_, month)) = MONTH_NAMES.iter().find(|&&(name, _)| name == tokens[0]) {
            if let Ok(day) = tokens[1].parse::<u32>() {
                if let Ok(year) = tokens[2].parse::<u32>() {
                    if day >= 1 && day <= 31 && year >= 1900 && year <= 2100 {
                        return Some(format!("{:04}-{:02}-{:02}", year, month, day));
                    }
                }
            }
        }

        return None;
    }

    // Try DD-Mon-YYYY with hyphens (fewer than 3 space-separated tokens)
    let parts: Vec<&str> = cleaned.splitn(3, '-').collect();
    if parts.len() == 3 {
        // Try DD-Mon-YYYY
        if let Ok(day) = parts[0].trim().parse::<u32>() {
            if let Some(&(_, month)) = MONTH_NAMES.iter().find(|&&(name, _)| name == parts[1].trim()) {
                if let Ok(year) = parts[2].trim().parse::<u32>() {
                    if day >= 1 && day <= 31 && year >= 1900 && year <= 2100 {
                        return Some(format!("{:04}-{:02}-{:02}", year, month, day));
                    }
                }
            }
        }
    }

    None
}

// --- Gender normalization ---

/// Normalize gender values to "Male", "Female", or "Other".
pub fn normalize_gender(input: &str) -> String {
    match input.trim().to_lowercase().as_str() {
        "m" | "male" => "Male".to_string(),
        "f" | "female" => "Female".to_string(),
        "" => String::new(),
        _ => "Other".to_string(),
    }
}

// --- ICD-10 validation ---

fn is_valid_icd10(code: &str) -> bool {
    let code = code.trim();
    if code.is_empty() {
        return true; // empty is not invalid, just missing
    }
    // Pattern: [A-Z][0-9]{2}(.[0-9]{1,4})?
    let bytes = code.as_bytes();
    if bytes.len() < 3 {
        return false;
    }
    if !bytes[0].is_ascii_uppercase() {
        return false;
    }
    if !bytes[1].is_ascii_digit() || !bytes[2].is_ascii_digit() {
        return false;
    }
    if bytes.len() == 3 {
        return true;
    }
    if bytes[3] != b'.' {
        return false;
    }
    let decimal_part = &code[4..];
    if decimal_part.is_empty() || decimal_part.len() > 4 {
        return false;
    }
    decimal_part.bytes().all(|b| b.is_ascii_digit())
}

// --- Validation ---

/// Validate a set of parsed patient records, returning a detailed report.
pub fn validate_patient_records(records: &[PatientRecord]) -> ValidationReport {
    let total_records = records.len();
    let mut warnings: Vec<ValidationWarning> = Vec::new();
    let mut errors: Vec<ValidationError> = Vec::new();
    let mut valid_count = 0usize;

    // Field coverage counters
    let mut dob_count = 0usize;
    let mut gender_count = 0usize;
    let mut race_count = 0usize;
    let mut ethnicity_count = 0usize;
    let mut insurance_count = 0usize;

    // Duplicate detection
    let mut id_counts: HashMap<String, usize> = HashMap::new();
    for r in records {
        *id_counts.entry(r.site_patient_id.clone()).or_insert(0) += 1;
    }
    let duplicate_patient_ids: Vec<String> = id_counts
        .iter()
        .filter(|(_, &count)| count > 1)
        .map(|(id, _)| id.clone())
        .collect();

    for record in records {
        let pid = &record.site_patient_id;
        let mut has_error = false;

        // --- Date of birth validation ---
        if let Some(ref dob) = record.date_of_birth {
            dob_count += 1;
            if normalize_date(dob).is_none() && !dob.is_empty() {
                warnings.push(ValidationWarning {
                    patient_id: pid.clone(),
                    field: "date_of_birth".to_string(),
                    message: format!("Unrecognized date format: '{}'", dob),
                });
            }
        }

        // --- Gender ---
        if let Some(ref gender) = record.gender {
            if !gender.is_empty() {
                gender_count += 1;
            }
        }

        // --- Race ---
        if let Some(ref race) = record.race {
            if !race.is_empty() {
                race_count += 1;
            }
        }

        // --- Ethnicity ---
        if let Some(ref eth) = record.ethnicity {
            if !eth.is_empty() {
                ethnicity_count += 1;
            }
        }

        // --- Insurance ---
        if let Some(ref ins) = record.insurance_type {
            if !ins.is_empty() {
                insurance_count += 1;
            }
        }

        // --- ICD-10 validation ---
        for dx in &record.diagnoses {
            if let Some(ref code) = dx.icd10_code {
                if !is_valid_icd10(code) {
                    warnings.push(ValidationWarning {
                        patient_id: pid.clone(),
                        field: "icd10_code".to_string(),
                        message: format!("Invalid ICD-10 format: '{}'", code),
                    });
                }
            }
            // Onset date validation
            if let Some(ref d) = dx.onset_date {
                if !d.is_empty() && normalize_date(d).is_none() {
                    warnings.push(ValidationWarning {
                        patient_id: pid.clone(),
                        field: "onset_date".to_string(),
                        message: format!("Unrecognized date format: '{}'", d),
                    });
                }
            }
        }

        // --- Lab value range checks ---
        for lab in &record.lab_results {
            if let Some(val) = lab.value {
                if val < 0.0 {
                    warnings.push(ValidationWarning {
                        patient_id: pid.clone(),
                        field: "lab_value".to_string(),
                        message: format!("Negative lab value for '{}': {}", lab.test_name, val),
                    });
                }
                let test_lower = lab.test_name.to_lowercase();
                if test_lower.contains("hba1c") || test_lower.contains("a1c") {
                    if val > 20.0 {
                        warnings.push(ValidationWarning {
                            patient_id: pid.clone(),
                            field: "lab_value".to_string(),
                            message: format!("HbA1c value {} exceeds expected maximum of 20", val),
                        });
                    }
                }
                if test_lower.contains("egfr") || test_lower.contains("gfr") {
                    if val > 300.0 {
                        warnings.push(ValidationWarning {
                            patient_id: pid.clone(),
                            field: "lab_value".to_string(),
                            message: format!("eGFR value {} exceeds expected maximum of 300", val),
                        });
                    }
                }
            }
            // Result date validation
            if let Some(ref d) = lab.result_date {
                if !d.is_empty() && normalize_date(d).is_none() {
                    warnings.push(ValidationWarning {
                        patient_id: pid.clone(),
                        field: "result_date".to_string(),
                        message: format!("Unrecognized date format: '{}'", d),
                    });
                }
            }
        }

        // --- Medication date validation ---
        for med in &record.medications {
            if let Some(ref d) = med.start_date {
                if !d.is_empty() && normalize_date(d).is_none() {
                    warnings.push(ValidationWarning {
                        patient_id: pid.clone(),
                        field: "start_date".to_string(),
                        message: format!("Unrecognized date format: '{}'", d),
                    });
                }
            }
            if let Some(ref d) = med.end_date {
                if !d.is_empty() && normalize_date(d).is_none() {
                    warnings.push(ValidationWarning {
                        patient_id: pid.clone(),
                        field: "end_date".to_string(),
                        message: format!("Unrecognized date format: '{}'", d),
                    });
                }
            }
        }

        // --- Empty record detection ---
        if record.diagnoses.is_empty() && record.medications.is_empty() && record.lab_results.is_empty()
            && record.vitals.is_empty() && record.procedures.is_empty() && record.allergies.is_empty() {
            warnings.push(ValidationWarning {
                patient_id: pid.clone(),
                field: "clinical_data".to_string(),
                message: "No diagnoses, medications, or lab results".to_string(),
            });
        }

        // --- Patient ID empty ---
        if pid.trim().is_empty() {
            errors.push(ValidationError {
                patient_id: pid.clone(),
                field: "site_patient_id".to_string(),
                message: "Empty patient ID".to_string(),
            });
            has_error = true;
        }

        if !has_error {
            valid_count += 1;
        }
    }

    let field_coverage = vec![
        FieldCoverage {
            field_name: "date_of_birth".to_string(),
            populated_count: dob_count,
            total_count: total_records,
            coverage_percent: if total_records > 0 { (dob_count as f64 / total_records as f64) * 100.0 } else { 0.0 },
        },
        FieldCoverage {
            field_name: "gender".to_string(),
            populated_count: gender_count,
            total_count: total_records,
            coverage_percent: if total_records > 0 { (gender_count as f64 / total_records as f64) * 100.0 } else { 0.0 },
        },
        FieldCoverage {
            field_name: "race".to_string(),
            populated_count: race_count,
            total_count: total_records,
            coverage_percent: if total_records > 0 { (race_count as f64 / total_records as f64) * 100.0 } else { 0.0 },
        },
        FieldCoverage {
            field_name: "ethnicity".to_string(),
            populated_count: ethnicity_count,
            total_count: total_records,
            coverage_percent: if total_records > 0 { (ethnicity_count as f64 / total_records as f64) * 100.0 } else { 0.0 },
        },
        FieldCoverage {
            field_name: "insurance_type".to_string(),
            populated_count: insurance_count,
            total_count: total_records,
            coverage_percent: if total_records > 0 { (insurance_count as f64 / total_records as f64) * 100.0 } else { 0.0 },
        },
    ];

    ValidationReport {
        total_records,
        valid_records: valid_count,
        warnings,
        errors,
        field_coverage,
        duplicate_patient_ids,
    }
}

/// Read file contents, handling BOM and common encodings.
/// Strips UTF-8 BOM if present. Falls back to Windows-1252 if UTF-8 fails.
fn read_file_with_encoding(path: &Path) -> Result<String, ImportError> {
    let bytes = std::fs::read(path)?;

    // Strip UTF-8 BOM (EF BB BF)
    let bytes = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        &bytes
    };

    // Try UTF-8 first
    match std::str::from_utf8(bytes) {
        Ok(s) => Ok(s.to_string()),
        Err(_) => {
            // Fall back to Windows-1252 (ISO 8859-1 superset)
            // Each byte maps directly to a Unicode code point in Windows-1252
            Ok(bytes.iter().map(|&b| b as char).collect())
        }
    }
}

/// Compute a simple hash of file contents for dedup detection.
pub fn compute_file_hash(path: &Path) -> Result<String, ImportError> {
    let bytes = std::fs::read(path)?;
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    Ok(format!("{:016x}", hasher.finish()))
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
        "pip" | "dat" => (FileFormat::Pipe, "text/plain".to_string()),
        "xlsx" | "xls" => (FileFormat::Xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string()),
        "json" => (FileFormat::Json, "application/json".to_string()),
        "xml" => (FileFormat::Xml, "application/xml".to_string()),
        _ => {
            // Try content sniffing for delimited files
            if let Ok(content) = read_file_with_encoding(path) {
                let first_line = content.lines().next().unwrap_or("");
                if first_line.contains('|') {
                    (FileFormat::Pipe, "text/plain".to_string())
                } else if first_line.contains(',') {
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
    let estimated_rows = if format == FileFormat::Csv || format == FileFormat::Tsv || format == FileFormat::Pipe {
        // Quick estimate: read file and count lines, subtract 1 for header
        if let Ok(content) = read_file_with_encoding(path) {
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
        FileFormat::Pipe => b'|',
        _ => b',',
    };

    let content = read_file_with_encoding(path)?;
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(std::io::Cursor::new(content));

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

/// Read an XLSX/XLS file and return headers plus sample rows for preview.
pub fn preview_xlsx(path: &Path, max_rows: usize) -> Result<(Vec<String>, Vec<Vec<String>>, usize), ImportError> {
    let mut workbook = open_workbook_auto(path).map_err(|e| ImportError::XlsxError(e.to_string()))?;

    let sheet_names = workbook.sheet_names().to_vec();
    let first_sheet = sheet_names.first().ok_or_else(|| {
        ImportError::XlsxError("Workbook contains no sheets".to_string())
    })?;

    let range = workbook
        .worksheet_range(first_sheet)
        .map_err(|e| ImportError::XlsxError(e.to_string()))?;

    let mut rows_iter = range.rows();

    // Extract headers from row 0
    let headers: Vec<String> = match rows_iter.next() {
        Some(row) => row.iter().map(|cell| cell.to_string().trim().to_string()).collect(),
        None => return Ok((Vec::new(), Vec::new(), 0)),
    };

    let mut sample_rows = Vec::new();
    let mut total_rows = 0;

    for row in rows_iter {
        total_rows += 1;
        if sample_rows.len() < max_rows {
            let row_data: Vec<String> = row.iter().map(|cell| cell.to_string().trim().to_string()).collect();
            // Skip completely empty rows
            if row_data.iter().all(|v| v.is_empty()) {
                total_rows -= 1;
                continue;
            }
            sample_rows.push(row_data);
        }
    }

    Ok((headers, sample_rows, total_rows))
}

/// Convert an XLSX file to a temporary CSV file for parsing.
/// Returns the path to the temporary CSV file.
pub fn xlsx_to_csv_temp(path: &Path) -> Result<std::path::PathBuf, ImportError> {
    let mut workbook = open_workbook_auto(path).map_err(|e| ImportError::XlsxError(e.to_string()))?;

    let sheet_names = workbook.sheet_names().to_vec();
    let first_sheet = sheet_names.first().ok_or_else(|| {
        ImportError::XlsxError("Workbook contains no sheets".to_string())
    })?;

    let range = workbook
        .worksheet_range(first_sheet)
        .map_err(|e| ImportError::XlsxError(e.to_string()))?;

    // Build temp CSV path in same directory
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("import");
    let temp_path = parent.join(format!("{}.tmp.csv", stem));

    let mut writer = csv::Writer::from_path(&temp_path)?;

    for row in range.rows() {
        let fields: Vec<String> = row.iter().map(|cell| cell.to_string()).collect();
        writer.write_record(&fields).map_err(|e| {
            ImportError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
        })?;
    }

    writer.flush()?;

    tracing::info!(path = %temp_path.display(), "Converted XLSX to temporary CSV");
    Ok(temp_path)
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
/// Applies date normalization and gender normalization during parsing.
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
        FileFormat::Pipe => b'|',
        _ => b',',
    };

    let content = read_file_with_encoding(path)?;
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(std::io::Cursor::new(content));

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

        // Get a date field, normalizing the format.
        let get_date_field = |target: &str| -> Option<String> {
            field_indices
                .get(target)
                .and_then(|&idx| record.get(idx))
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .map(|v| normalize_date(&v).unwrap_or(v))
        };

        // Get a gender field, normalizing the value.
        let get_gender_field = |target: &str| -> Option<String> {
            field_indices
                .get(target)
                .and_then(|&idx| record.get(idx))
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .map(|v| normalize_gender(&v))
                .filter(|v| !v.is_empty())
        };

        let patient_id = match get_field("site_patient_id") {
            Some(id) => id,
            None => continue, // Skip rows without patient ID
        };

        let patient = patients_map.entry(patient_id.clone()).or_insert_with(|| PatientRecord {
            site_patient_id: patient_id.clone(),
            date_of_birth: get_date_field("date_of_birth"),
            gender: get_gender_field("gender"),
            race: get_field("race"),
            ethnicity: get_field("ethnicity"),
            insurance_type: get_field("insurance_type"),
            diagnoses: Vec::new(),
            medications: Vec::new(),
            lab_results: Vec::new(),
            vitals: Vec::new(),
            procedures: Vec::new(),
            allergies: Vec::new(),
        });

        // Update demographic fields if they were empty and this row has them
        if patient.date_of_birth.is_none() {
            patient.date_of_birth = get_date_field("date_of_birth");
        }
        if patient.gender.is_none() {
            patient.gender = get_gender_field("gender");
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
                onset_date: get_date_field("diagnosis_onset_date"),
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
                start_date: get_date_field("medication_start_date"),
                end_date: get_date_field("medication_end_date"),
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
                result_date: get_date_field("result_date"),
                abnormal_flag: get_field("abnormal_flag"),
            });
        }

        // Extract vitals if present
        let vital_type = get_field("vital_type");
        let vital_value = get_field("vital_value");
        if let Some(vtype) = vital_type {
            if let Some(vval) = vital_value {
                patient.vitals.push(VitalRecord {
                    vital_type: vtype.to_lowercase(),
                    value: vval.parse::<f64>().ok(),
                    unit: get_field("vital_unit"),
                    measurement_date: get_date_field("vital_date"),
                });
            }
        }

        // Extract procedure if present
        let proc_desc = get_field("procedure_description");
        if let Some(desc) = proc_desc {
            patient.procedures.push(ProcedureRecord {
                cpt_code: get_field("cpt_code"),
                description: desc,
                procedure_date: get_date_field("procedure_date"),
                status: get_field("procedure_status"),
            });
        }

        // Extract allergy if present
        let allergen = get_field("allergen");
        if let Some(name) = allergen {
            patient.allergies.push(AllergyRecord {
                allergen: name,
                reaction: get_field("allergy_reaction"),
                severity: get_field("allergy_severity"),
                allergy_type: get_field("allergy_type"),
                onset_date: get_date_field("allergy_onset_date"),
                status: get_field("allergy_status"),
            });
        }
    }

    let patients: Vec<PatientRecord> = patients_map.into_values().collect();
    tracing::info!(count = patients.len(), "Parsed patient records from CSV");
    Ok(patients)
}

// --- Multi-sheet XLSX support ---

/// Classify a sheet based on which target fields its headers map to.
fn classify_sheet(headers: &[String]) -> SheetDataType {
    let mapping = auto_map_columns(headers);
    let targets: Vec<&str> = mapping
        .field_mappings
        .iter()
        .map(|m| m.target_field.as_str())
        .collect();

    let has_demographics = targets.iter().any(|t| {
        matches!(*t, "date_of_birth" | "gender" | "race" | "ethnicity" | "insurance_type")
    });
    let has_diagnoses = targets.iter().any(|t| {
        matches!(*t, "icd10_code" | "diagnosis_description" | "diagnosis_onset_date" | "diagnosis_status")
    });
    let has_medications = targets.iter().any(|t| {
        matches!(*t, "drug_name" | "rxnorm_code" | "dose" | "frequency"
            | "medication_start_date" | "medication_end_date" | "medication_status")
    });
    let has_labs = targets.iter().any(|t| {
        matches!(*t, "test_name" | "loinc_code" | "lab_value" | "lab_unit"
            | "reference_range" | "result_date" | "abnormal_flag")
    });
    let has_vitals = targets.iter().any(|t| {
        matches!(*t, "vital_type" | "vital_value" | "vital_unit" | "vital_date")
    });
    let has_procedures = targets.iter().any(|t| {
        matches!(*t, "procedure_description" | "cpt_code" | "procedure_date" | "procedure_status")
    });
    let has_allergies = targets.iter().any(|t| {
        matches!(*t, "allergen" | "allergy_reaction" | "allergy_severity"
            | "allergy_type" | "allergy_status" | "allergy_onset_date")
    });

    let categories = [
        has_demographics, has_diagnoses, has_medications, has_labs,
        has_vitals, has_procedures, has_allergies,
    ];
    let count = categories.iter().filter(|&&v| v).count();

    if count == 0 {
        SheetDataType::Unknown
    } else if count > 1 {
        SheetDataType::Mixed
    } else if has_demographics {
        SheetDataType::Demographics
    } else if has_diagnoses {
        SheetDataType::Diagnoses
    } else if has_medications {
        SheetDataType::Medications
    } else if has_labs {
        SheetDataType::Labs
    } else if has_vitals {
        SheetDataType::Vitals
    } else if has_procedures {
        SheetDataType::Procedures
    } else {
        SheetDataType::Allergies
    }
}

/// Detect the type of a sheet using both header-based classification and sheet name heuristics.
fn classify_sheet_with_name(name: &str, headers: &[String]) -> SheetDataType {
    let lower_name = name.to_lowercase();

    // Check sheet name for types that might not be fully detectable by headers alone
    if lower_name.contains("vital") {
        let header_type = classify_sheet(headers);
        if header_type == SheetDataType::Unknown {
            return SheetDataType::Vitals;
        }
        return header_type;
    }
    if lower_name.contains("procedure") || lower_name.contains("surgery") || lower_name.contains("operation") {
        let header_type = classify_sheet(headers);
        if header_type == SheetDataType::Unknown {
            return SheetDataType::Procedures;
        }
        return header_type;
    }
    if lower_name.contains("allerg") {
        let header_type = classify_sheet(headers);
        if header_type == SheetDataType::Unknown {
            return SheetDataType::Allergies;
        }
        return header_type;
    }
    if lower_name.contains("demo") || lower_name.contains("patient") {
        let header_type = classify_sheet(headers);
        if header_type == SheetDataType::Unknown {
            return SheetDataType::Demographics;
        }
        return header_type;
    }
    if lower_name.contains("diag") || lower_name.contains("problem") || lower_name.contains("condition") {
        let header_type = classify_sheet(headers);
        if header_type == SheetDataType::Unknown {
            return SheetDataType::Diagnoses;
        }
        return header_type;
    }
    if lower_name.contains("med") || lower_name.contains("rx") || lower_name.contains("drug") || lower_name.contains("prescription") {
        let header_type = classify_sheet(headers);
        if header_type == SheetDataType::Unknown {
            return SheetDataType::Medications;
        }
        return header_type;
    }
    if lower_name.contains("lab") || lower_name.contains("result") || lower_name.contains("test") {
        let header_type = classify_sheet(headers);
        if header_type == SheetDataType::Unknown {
            return SheetDataType::Labs;
        }
        return header_type;
    }

    classify_sheet(headers)
}

/// Find the patient ID column header on a sheet.
fn find_patient_id_column(headers: &[String]) -> Option<String> {
    let mapping = auto_map_columns(headers);
    mapping
        .field_mappings
        .iter()
        .find(|m| m.target_field == "site_patient_id")
        .map(|m| m.source_column.clone())
}

/// Detect all sheets in an XLSX workbook and classify each one.
pub fn detect_xlsx_sheets(path: &Path) -> Result<Vec<SheetInfo>, ImportError> {
    let mut workbook = open_workbook_auto(path).map_err(|e| ImportError::XlsxError(e.to_string()))?;
    let sheet_names = workbook.sheet_names().to_vec();

    let mut sheets = Vec::new();

    for name in &sheet_names {
        let range = workbook
            .worksheet_range(name)
            .map_err(|e| ImportError::XlsxError(e.to_string()))?;

        let mut rows_iter = range.rows();

        let headers: Vec<String> = match rows_iter.next() {
            Some(row) => row.iter().map(|cell| cell.to_string().trim().to_string()).collect(),
            None => continue, // Skip empty sheets
        };

        if headers.is_empty() || headers.iter().all(|h| h.is_empty()) {
            continue;
        }

        // Count non-empty data rows
        let mut row_count = 0usize;
        for row in rows_iter {
            let row_data: Vec<String> = row.iter().map(|cell| cell.to_string().trim().to_string()).collect();
            if !row_data.iter().all(|v| v.is_empty()) {
                row_count += 1;
            }
        }

        let detected_type = classify_sheet_with_name(name, &headers);
        let patient_id_column = find_patient_id_column(&headers);

        sheets.push(SheetInfo {
            name: name.clone(),
            headers,
            row_count,
            detected_type,
            patient_id_column,
        });
    }

    Ok(sheets)
}

/// Preview all sheets in a multi-sheet XLSX workbook.
pub fn preview_xlsx_multi(path: &Path, max_rows: usize) -> Result<MultiSheetPreview, ImportError> {
    let sheets = detect_xlsx_sheets(path)?;
    let is_multi_sheet = sheets.len() > 1;

    // Build a merged preview from the first sheet (backward compat)
    let (headers, sample_rows, total_rows) = preview_xlsx(path, max_rows)?;
    let suggested_mapping = auto_map_columns(&headers);
    let format_detected = detect_data_layout(&headers, &sample_rows, &suggested_mapping);

    let merged_preview = ImportPreview {
        headers,
        sample_rows,
        total_rows,
        suggested_mapping,
        format_detected,
        sheets: if is_multi_sheet { Some(sheets.clone()) } else { None },
        header_row_index: 0,
    };

    Ok(MultiSheetPreview {
        sheets,
        is_multi_sheet,
        merged_preview,
    })
}

/// Parse rows (in-memory) using a column mapping, returning partial PatientRecords.
/// Mirrors parse_csv logic but operates on pre-read data.
fn parse_rows_to_patients(
    headers: &[String],
    rows: &[Vec<String>],
    mapping: &ColumnMapping,
) -> Vec<PatientRecord> {
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

    let mut patients_map: HashMap<String, PatientRecord> = HashMap::new();

    for row in rows {
        let get_field = |target: &str| -> Option<String> {
            field_indices
                .get(target)
                .and_then(|&idx| row.get(idx))
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        };

        let get_date_field = |target: &str| -> Option<String> {
            field_indices
                .get(target)
                .and_then(|&idx| row.get(idx))
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .map(|v| normalize_date(&v).unwrap_or(v))
        };

        let get_gender_field = |target: &str| -> Option<String> {
            field_indices
                .get(target)
                .and_then(|&idx| row.get(idx))
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .map(|v| normalize_gender(&v))
                .filter(|v| !v.is_empty())
        };

        let patient_id = match get_field("site_patient_id") {
            Some(id) => id,
            None => continue,
        };

        let patient = patients_map.entry(patient_id.clone()).or_insert_with(|| PatientRecord {
            site_patient_id: patient_id.clone(),
            date_of_birth: get_date_field("date_of_birth"),
            gender: get_gender_field("gender"),
            race: get_field("race"),
            ethnicity: get_field("ethnicity"),
            insurance_type: get_field("insurance_type"),
            diagnoses: Vec::new(),
            medications: Vec::new(),
            lab_results: Vec::new(),
            vitals: Vec::new(),
            procedures: Vec::new(),
            allergies: Vec::new(),
        });

        // Update demographic fields if empty
        if patient.date_of_birth.is_none() {
            patient.date_of_birth = get_date_field("date_of_birth");
        }
        if patient.gender.is_none() {
            patient.gender = get_gender_field("gender");
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
                onset_date: get_date_field("diagnosis_onset_date"),
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
                start_date: get_date_field("medication_start_date"),
                end_date: get_date_field("medication_end_date"),
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
                result_date: get_date_field("result_date"),
                abnormal_flag: get_field("abnormal_flag"),
            });
        }

        // Extract vitals if present
        let vital_type = get_field("vital_type");
        let vital_value = get_field("vital_value");
        if let Some(vtype) = vital_type {
            if let Some(vval) = vital_value {
                patient.vitals.push(VitalRecord {
                    vital_type: vtype.to_lowercase(),
                    value: vval.parse::<f64>().ok(),
                    unit: get_field("vital_unit"),
                    measurement_date: get_date_field("vital_date"),
                });
            }
        }

        // Extract procedure if present
        let proc_desc = get_field("procedure_description");
        if let Some(desc) = proc_desc {
            patient.procedures.push(ProcedureRecord {
                cpt_code: get_field("cpt_code"),
                description: desc,
                procedure_date: get_date_field("procedure_date"),
                status: get_field("procedure_status"),
            });
        }

        // Extract allergy if present
        let allergen = get_field("allergen");
        if let Some(name) = allergen {
            patient.allergies.push(AllergyRecord {
                allergen: name,
                reaction: get_field("allergy_reaction"),
                severity: get_field("allergy_severity"),
                allergy_type: get_field("allergy_type"),
                onset_date: get_date_field("allergy_onset_date"),
                status: get_field("allergy_status"),
            });
        }
    }

    patients_map.into_values().collect()
}

/// Read all rows from a single XLSX sheet as string vectors.
fn read_xlsx_sheet_rows(path: &Path, sheet_name: &str) -> Result<(Vec<String>, Vec<Vec<String>>), ImportError> {
    let mut workbook = open_workbook_auto(path).map_err(|e| ImportError::XlsxError(e.to_string()))?;

    let range = workbook
        .worksheet_range(sheet_name)
        .map_err(|e| ImportError::XlsxError(e.to_string()))?;

    let mut rows_iter = range.rows();

    let headers: Vec<String> = match rows_iter.next() {
        Some(row) => row.iter().map(|cell| cell.to_string().trim().to_string()).collect(),
        None => return Ok((Vec::new(), Vec::new())),
    };

    let mut data_rows = Vec::new();
    for row in rows_iter {
        let row_data: Vec<String> = row.iter().map(|cell| cell.to_string().trim().to_string()).collect();
        if !row_data.iter().all(|v| v.is_empty()) {
            data_rows.push(row_data);
        }
    }

    Ok((headers, data_rows))
}

/// Merge partial patient records from multiple sheets into unified records.
/// Demographics come first, then clinical data is appended by patient ID.
fn merge_patient_records(all_partials: Vec<Vec<PatientRecord>>) -> Vec<PatientRecord> {
    let mut merged: HashMap<String, PatientRecord> = HashMap::new();

    for patients in all_partials {
        for patient in patients {
            let entry = merged.entry(patient.site_patient_id.clone()).or_insert_with(|| PatientRecord {
                site_patient_id: patient.site_patient_id.clone(),
                date_of_birth: None,
                gender: None,
                race: None,
                ethnicity: None,
                insurance_type: None,
                diagnoses: Vec::new(),
                medications: Vec::new(),
                lab_results: Vec::new(),
                vitals: Vec::new(),
                procedures: Vec::new(),
                allergies: Vec::new(),
            });

            // Fill in demographics if not yet set
            if entry.date_of_birth.is_none() {
                entry.date_of_birth = patient.date_of_birth;
            }
            if entry.gender.is_none() {
                entry.gender = patient.gender;
            }
            if entry.race.is_none() {
                entry.race = patient.race;
            }
            if entry.ethnicity.is_none() {
                entry.ethnicity = patient.ethnicity;
            }
            if entry.insurance_type.is_none() {
                entry.insurance_type = patient.insurance_type;
            }

            // Append clinical data
            entry.diagnoses.extend(patient.diagnoses);
            entry.medications.extend(patient.medications);
            entry.lab_results.extend(patient.lab_results);
            entry.vitals.extend(patient.vitals);
            entry.procedures.extend(patient.procedures);
            entry.allergies.extend(patient.allergies);
        }
    }

    merged.into_values().collect()
}

/// Parse a multi-sheet XLSX workbook, auto-mapping each sheet's columns and
/// merging all data by patient ID.
pub fn parse_xlsx_multi(path: &Path, mapping: &ColumnMapping) -> Result<Vec<PatientRecord>, ImportError> {
    let sheets = detect_xlsx_sheets(path)?;

    // Filter to sheets that have a patient ID column
    let usable_sheets: Vec<&SheetInfo> = sheets
        .iter()
        .filter(|s| s.patient_id_column.is_some() && s.detected_type != SheetDataType::Unknown)
        .collect();

    if usable_sheets.is_empty() {
        return Err(ImportError::XlsxError(
            "No sheets with a recognizable patient ID column found".to_string(),
        ));
    }

    let mut all_partials: Vec<Vec<PatientRecord>> = Vec::new();

    for sheet in &usable_sheets {
        let (headers, rows) = read_xlsx_sheet_rows(path, &sheet.name)?;
        if headers.is_empty() {
            continue;
        }

        // Auto-map columns for this specific sheet, then overlay any user-provided mappings
        let mut sheet_mapping = auto_map_columns(&headers);

        // Apply user overrides: if a user mapping's source_column exists in this sheet's headers,
        // replace the auto-detected mapping for that target field
        for user_field in &mapping.field_mappings {
            if headers.contains(&user_field.source_column) {
                // Remove any existing auto-mapping for this target
                sheet_mapping.field_mappings.retain(|m| m.target_field != user_field.target_field);
                sheet_mapping.field_mappings.push(user_field.clone());
            }
        }

        let patients = parse_rows_to_patients(&headers, &rows, &sheet_mapping);
        all_partials.push(patients);
    }

    let merged = merge_patient_records(all_partials);
    tracing::info!(
        sheets = usable_sheets.len(),
        patients = merged.len(),
        "Parsed multi-sheet XLSX"
    );
    Ok(merged)
}

/// Check if an XLSX file has multiple data sheets (more than one with a patient ID column).
pub fn is_multi_sheet_xlsx(path: &Path) -> Result<bool, ImportError> {
    let sheets = detect_xlsx_sheets(path)?;
    let data_sheets = sheets
        .iter()
        .filter(|s| s.patient_id_column.is_some() && s.detected_type != SheetDataType::Unknown)
        .count();
    Ok(data_sheets > 1)
}

/// Generate an ImportPreview for a given file path.
/// For CSV/TSV/Pipe formats, detects the header row automatically (skipping metadata rows).
pub fn generate_preview(path: &Path) -> Result<ImportPreview, ImportError> {
    let format_info = detect_file_format(path)?;

    if format_info.format == FileFormat::Xlsx {
        // Check for multi-sheet workbook
        let multi = preview_xlsx_multi(path, 10)?;
        return Ok(multi.merged_preview);
    }

    // Detect header row (skip metadata rows above actual column headers)
    let header_row = detect_header_row(path)?;

    if header_row > 0 {
        tracing::info!(header_row = header_row, "Detected header row offset, skipping metadata rows");
        let (headers, sample_rows, total_rows) = preview_csv_with_offset(path, 10, header_row)?;
        let suggested_mapping = auto_map_columns(&headers);
        let format_detected = detect_data_layout(&headers, &sample_rows, &suggested_mapping);

        Ok(ImportPreview {
            headers,
            sample_rows,
            total_rows,
            suggested_mapping,
            format_detected,
            sheets: None,
            header_row_index: header_row,
        })
    } else {
        let (headers, sample_rows, total_rows) = preview_csv(path, 10)?;
        let suggested_mapping = auto_map_columns(&headers);
        let format_detected = detect_data_layout(&headers, &sample_rows, &suggested_mapping);

        Ok(ImportPreview {
            headers,
            sample_rows,
            total_rows,
            suggested_mapping,
            format_detected,
            sheets: None,
            header_row_index: 0,
        })
    }
}

/// Detect the actual header row index in a file.
/// Scans the first 20 rows looking for the row that best matches known column aliases.
/// Returns the 0-based row index of the header row.
pub fn detect_header_row(path: &Path) -> Result<usize, ImportError> {
    let content = read_file_with_encoding(path)?;
    let format_info = detect_file_format(path)?;
    let delimiter = match format_info.format {
        FileFormat::Tsv => b'\t',
        FileFormat::Pipe => b'|',
        _ => b',',
    };

    let lines: Vec<&str> = content.lines().take(20).collect();

    let mut best_row = 0usize;
    let mut best_score = 0usize;

    for (idx, line) in lines.iter().enumerate() {
        let mut reader = csv::ReaderBuilder::new()
            .has_headers(false)
            .flexible(true)
            .delimiter(delimiter)
            .trim(csv::Trim::All)
            .from_reader(std::io::Cursor::new(line.as_bytes()));

        if let Some(Ok(record)) = reader.records().next() {
            let fields: Vec<String> = record.iter().map(|f| f.to_string()).collect();

            // Skip rows with very few fields (likely metadata lines)
            if fields.len() < 2 {
                continue;
            }

            let mapping = auto_map_columns(&fields);
            let matched = mapping.field_mappings.len();

            // Score: number of recognized columns, with bonus for having patient_id
            let has_patient_id = mapping.field_mappings.iter().any(|m| m.target_field == "site_patient_id");
            let score = matched + if has_patient_id { 5 } else { 0 };

            if score > best_score {
                best_score = score;
                best_row = idx;
            }
        }
    }

    Ok(best_row)
}

/// Read a CSV/TSV file starting from a specific row offset, returning headers plus sample rows.
/// The `header_row` parameter specifies the 0-based index of the row to treat as headers.
/// Rows before `header_row` are skipped (metadata rows).
pub fn preview_csv_with_offset(path: &Path, max_rows: usize, header_row: usize) -> Result<(Vec<String>, Vec<Vec<String>>, usize), ImportError> {
    let format_info = detect_file_format(path)?;
    let delimiter = match format_info.format {
        FileFormat::Tsv => b'\t',
        FileFormat::Pipe => b'|',
        _ => b',',
    };

    let content = read_file_with_encoding(path)?;
    let lines: Vec<&str> = content.lines().collect();

    if header_row >= lines.len() {
        return Ok((Vec::new(), Vec::new(), 0));
    }

    // Join lines from header_row onward
    let relevant_content = lines[header_row..].join("\n");

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(std::io::Cursor::new(relevant_content));

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
                    continue;
                }
            }
        } else if result.is_ok() {
            // just counting
        }
    }

    Ok((headers, sample_rows, total_rows))
}

/// Parse a CSV file into PatientRecords, skipping rows before the header row.
/// This is a variant of `parse_csv` that accepts a header row offset for files
/// with metadata rows above the actual column headers.
pub fn parse_csv_with_offset(path: &Path, mapping: &ColumnMapping, header_row: usize) -> Result<Vec<PatientRecord>, ImportError> {
    if header_row == 0 {
        return parse_csv(path, mapping);
    }

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
        FileFormat::Pipe => b'|',
        _ => b',',
    };

    let content = read_file_with_encoding(path)?;
    let lines: Vec<&str> = content.lines().collect();

    if header_row >= lines.len() {
        return Ok(Vec::new());
    }

    let relevant_content = lines[header_row..].join("\n");

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(std::io::Cursor::new(relevant_content));

    let headers: Vec<String> = reader
        .headers()?
        .iter()
        .map(|h| h.to_string())
        .collect();

    // Build column index lookup from mapping
    let field_indices: std::collections::HashMap<String, usize> = mapping
        .field_mappings
        .iter()
        .filter_map(|m| {
            headers
                .iter()
                .position(|h| h == &m.source_column)
                .map(|idx| (m.target_field.clone(), idx))
        })
        .collect();

    let mut patients_map: std::collections::HashMap<String, PatientRecord> = std::collections::HashMap::new();

    for (row_idx, result) in reader.records().enumerate() {
        let record = result.map_err(|e| ImportError::InvalidData {
            row: row_idx + header_row + 2,
            message: e.to_string(),
        })?;

        let get_field = |target: &str| -> Option<String> {
            field_indices
                .get(target)
                .and_then(|&idx| record.get(idx))
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        };

        let get_date_field = |target: &str| -> Option<String> {
            field_indices
                .get(target)
                .and_then(|&idx| record.get(idx))
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .map(|v| normalize_date(&v).unwrap_or(v))
        };

        let get_gender_field = |target: &str| -> Option<String> {
            field_indices
                .get(target)
                .and_then(|&idx| record.get(idx))
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .map(|v| normalize_gender(&v))
                .filter(|v| !v.is_empty())
        };

        let patient_id = match get_field("site_patient_id") {
            Some(id) => id,
            None => continue,
        };

        let patient = patients_map.entry(patient_id.clone()).or_insert_with(|| PatientRecord {
            site_patient_id: patient_id.clone(),
            date_of_birth: get_date_field("date_of_birth"),
            gender: get_gender_field("gender"),
            race: get_field("race"),
            ethnicity: get_field("ethnicity"),
            insurance_type: get_field("insurance_type"),
            diagnoses: Vec::new(),
            medications: Vec::new(),
            lab_results: Vec::new(),
            vitals: Vec::new(),
            procedures: Vec::new(),
            allergies: Vec::new(),
        });

        if patient.date_of_birth.is_none() {
            patient.date_of_birth = get_date_field("date_of_birth");
        }
        if patient.gender.is_none() {
            patient.gender = get_gender_field("gender");
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

        let diagnosis_desc = get_field("diagnosis_description")
            .or_else(|| get_field("diagnosis"));
        if let Some(desc) = diagnosis_desc {
            patient.diagnoses.push(DiagnosisRecord {
                icd10_code: get_field("icd10_code"),
                description: desc,
                onset_date: get_date_field("diagnosis_onset_date"),
                status: get_field("diagnosis_status"),
            });
        }

        let drug_name = get_field("drug_name")
            .or_else(|| get_field("medication"));
        if let Some(name) = drug_name {
            patient.medications.push(MedicationRecord {
                rxnorm_code: get_field("rxnorm_code"),
                drug_name: name,
                dose: get_field("dose"),
                frequency: get_field("frequency"),
                start_date: get_date_field("medication_start_date"),
                end_date: get_date_field("medication_end_date"),
                status: get_field("medication_status"),
            });
        }

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
                result_date: get_date_field("result_date"),
                abnormal_flag: get_field("abnormal_flag"),
            });
        }

        let vital_type = get_field("vital_type");
        let vital_value = get_field("vital_value");
        if let Some(vtype) = vital_type {
            if let Some(vval) = vital_value {
                patient.vitals.push(VitalRecord {
                    vital_type: vtype.to_lowercase(),
                    value: vval.parse::<f64>().ok(),
                    unit: get_field("vital_unit"),
                    measurement_date: get_date_field("vital_date"),
                });
            }
        }

        let proc_desc = get_field("procedure_description");
        if let Some(desc) = proc_desc {
            patient.procedures.push(ProcedureRecord {
                cpt_code: get_field("cpt_code"),
                description: desc,
                procedure_date: get_date_field("procedure_date"),
                status: get_field("procedure_status"),
            });
        }

        let allergen = get_field("allergen");
        if let Some(name) = allergen {
            patient.allergies.push(AllergyRecord {
                allergen: name,
                reaction: get_field("allergy_reaction"),
                severity: get_field("allergy_severity"),
                allergy_type: get_field("allergy_type"),
                onset_date: get_date_field("allergy_onset_date"),
                status: get_field("allergy_status"),
            });
        }
    }

    let patients: Vec<PatientRecord> = patients_map.into_values().collect();
    tracing::info!(count = patients.len(), header_row = header_row, "Parsed patient records from CSV with offset");
    Ok(patients)
}
