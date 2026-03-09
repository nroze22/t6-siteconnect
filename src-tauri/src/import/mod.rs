pub mod mapping;

use std::collections::HashMap;
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
        if record.diagnoses.is_empty() && record.medications.is_empty() && record.lab_results.is_empty() {
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
    }

    let patients: Vec<PatientRecord> = patients_map.into_values().collect();
    tracing::info!(count = patients.len(), "Parsed patient records from CSV");
    Ok(patients)
}

/// Generate an ImportPreview for a given file path.
pub fn generate_preview(path: &Path) -> Result<ImportPreview, ImportError> {
    let format_info = detect_file_format(path)?;

    let (headers, sample_rows, total_rows) = match format_info.format {
        FileFormat::Xlsx => preview_xlsx(path, 10)?,
        _ => preview_csv(path, 10)?,
    };

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
