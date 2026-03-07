# Skill: Data Import Pipeline

> **Purpose**: Import patient data from multiple file formats (CSV, XLSX, FHIR R4 JSON,
> C-CDA XML, HL7v2) into the local SQLCipher database. Handle format detection, column
> mapping, entity extraction, code normalization, deduplication, and audit logging.

---

## Table of Contents

1. [Overview](#overview)
2. [File Format Detection](#file-format-detection)
3. [CSV/Excel Import](#csvexcel-import)
4. [FHIR R4 JSON Import](#fhir-r4-json-import)
5. [C-CDA XML Import](#c-cda-xml-import)
6. [Entity Extraction](#entity-extraction)
7. [Incremental Import](#incremental-import)
8. [Audit Logging](#audit-logging)
9. [Progress Events](#progress-events)
10. [Error Handling](#error-handling)
11. [Testing](#testing)

---

## Overview

The data import pipeline ingests patient records from heterogeneous sources
and normalizes them into a unified patient data model for screening. Sites
may export data from EHRs in various formats, so the pipeline must be
flexible and fault-tolerant.

### Design Principles

1. **No data loss**: Original source data is preserved alongside normalized data.
2. **Transparency**: Every transformation is logged. Users see exactly what was
   mapped and can correct errors.
3. **Incremental**: Re-importing the same file updates existing records rather
   than creating duplicates.
4. **Local-first**: All processing happens on-device. No patient data leaves the
   machine during import.
5. **PHI safety**: Parsed data goes directly to SQLCipher. No temp files, no logs
   with PHI content.

### Data Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  File Input   │────▶│  Format      │────▶│  Parser      │
│  (drag-drop)  │     │  Detector    │     │  (per type)  │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  SQLCipher    │◀────│  Dedup /     │◀────│  Normalizer  │
│  Database     │     │  Merge       │     │  + Extractor │
└──────────────┘     └──────────────┘     └──────────────┘
       │
       ▼
┌──────────────┐
│  Audit Log   │
└──────────────┘
```

---

## File Format Detection

Format detection uses a two-pass strategy: file extension first, then content
sniffing for ambiguous cases.

```rust
use std::path::Path;

#[derive(Debug, Clone, PartialEq)]
pub enum ImportFormat {
    Csv,
    Xlsx,
    FhirJson,
    CdaXml,
    Hl7v2,
    Unknown(String),
}

/// Detect the import format from file extension and content.
pub fn detect_format(path: &Path) -> Result<ImportFormat, ImportError> {
    // Pass 1: Extension-based detection
    let ext_format = match path.extension().and_then(|e| e.to_str()) {
        Some("csv") | Some("tsv") => Some(ImportFormat::Csv),
        Some("xlsx") | Some("xls") => Some(ImportFormat::Xlsx),
        Some("json") => None, // Could be FHIR or generic JSON — need sniffing
        Some("xml") => None,  // Could be CDA or generic XML — need sniffing
        Some("hl7") | Some("adt") => Some(ImportFormat::Hl7v2),
        Some(ext) => Some(ImportFormat::Unknown(ext.to_string())),
        None => None,
    };

    if let Some(format) = ext_format {
        return Ok(format);
    }

    // Pass 2: Content sniffing for JSON and XML files
    let content = std::fs::read_to_string(path)
        .map_err(|e| ImportError::FileReadError(e.to_string()))?;

    let trimmed = content.trim_start();

    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        // JSON content — check for FHIR markers
        if content.contains("\"resourceType\"") && content.contains("\"Bundle\"") {
            return Ok(ImportFormat::FhirJson);
        }
        if content.contains("\"resourceType\"") {
            return Ok(ImportFormat::FhirJson);
        }
        return Ok(ImportFormat::Unknown("json".to_string()));
    }

    if trimmed.starts_with('<') {
        // XML content — check for CDA markers
        if content.contains("ClinicalDocument") {
            return Ok(ImportFormat::CdaXml);
        }
        return Ok(ImportFormat::Unknown("xml".to_string()));
    }

    if trimmed.starts_with("MSH|") {
        return Ok(ImportFormat::Hl7v2);
    }

    // Fallback: try parsing as CSV
    if content.contains(',') || content.contains('\t') {
        return Ok(ImportFormat::Csv);
    }

    Ok(ImportFormat::Unknown("unknown".to_string()))
}
```

---

## CSV/Excel Import

### Parsing

CSV files are parsed with `csv` crate on the Rust side. Excel files use the
`calamine` crate for native Rust parsing without external dependencies.

```rust
use calamine::{Reader, open_workbook, Xlsx, DataType};
use csv::ReaderBuilder;

/// Parse a CSV file into raw row data.
pub fn parse_csv(path: &Path) -> Result<RawTableData, ImportError> {
    let mut reader = ReaderBuilder::new()
        .has_headers(true)
        .flexible(true) // Allow variable column counts
        .trim(csv::Trim::All)
        .from_path(path)
        .map_err(|e| ImportError::ParseError(format!("CSV parse error: {}", e)))?;

    let headers: Vec<String> = reader.headers()
        .map_err(|e| ImportError::ParseError(format!("CSV headers error: {}", e)))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    let mut rows = Vec::new();
    for (idx, result) in reader.records().enumerate() {
        let record = result.map_err(|e| ImportError::ParseError(
            format!("CSV row {} error: {}", idx + 1, e)
        ))?;
        let row: Vec<String> = record.iter().map(|f| f.to_string()).collect();
        rows.push(row);
    }

    Ok(RawTableData {
        headers,
        rows,
        source_format: ImportFormat::Csv,
    })
}

/// Parse an XLSX file into raw row data.
/// Uses the first sheet by default, or a named sheet if specified.
pub fn parse_xlsx(path: &Path, sheet_name: Option<&str>) -> Result<RawTableData, ImportError> {
    let mut workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| ImportError::ParseError(format!("XLSX open error: {}", e)))?;

    let sheet_name = match sheet_name {
        Some(name) => name.to_string(),
        None => workbook.sheet_names().first()
            .ok_or_else(|| ImportError::ParseError("No sheets in workbook".to_string()))?
            .clone(),
    };

    let range = workbook.worksheet_range(&sheet_name)
        .map_err(|e| ImportError::ParseError(format!("Sheet read error: {}", e)))?;

    let mut rows_iter = range.rows();

    // First row is headers
    let headers: Vec<String> = rows_iter.next()
        .ok_or_else(|| ImportError::ParseError("Empty spreadsheet".to_string()))?
        .iter()
        .map(|cell| match cell {
            DataType::String(s) => s.clone(),
            DataType::Float(f) => f.to_string(),
            DataType::Int(i) => i.to_string(),
            DataType::Bool(b) => b.to_string(),
            _ => String::new(),
        })
        .collect();

    let mut rows = Vec::new();
    for row_data in rows_iter {
        let row: Vec<String> = row_data.iter().map(|cell| match cell {
            DataType::String(s) => s.clone(),
            DataType::Float(f) => f.to_string(),
            DataType::Int(i) => i.to_string(),
            DataType::Bool(b) => b.to_string(),
            DataType::DateTime(dt) => dt.to_string(),
            _ => String::new(),
        }).collect();

        // Skip entirely empty rows
        if row.iter().all(|c| c.is_empty()) {
            continue;
        }
        rows.push(row);
    }

    Ok(RawTableData {
        headers,
        rows,
        source_format: ImportFormat::Xlsx,
    })
}

/// Raw parsed table data before column mapping.
#[derive(Debug, Clone)]
pub struct RawTableData {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub source_format: ImportFormat,
}
```

### Column Mapping

Column mapping is a three-step process:
1. Auto-detect mappings using header name similarity and value patterns
2. Present suggestions to the user in the UI
3. User confirms or adjusts mappings

#### Standard Target Fields

```rust
/// The canonical patient data fields that source columns can map to.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Hash, Eq)]
pub enum TargetField {
    PatientId,
    FirstName,
    LastName,
    DateOfBirth,
    Gender,
    Race,
    Ethnicity,
    DiagnosisCode,      // ICD-10
    DiagnosisDescription,
    DiagnosisDate,
    MedicationCode,     // RxNorm
    MedicationName,
    MedicationStartDate,
    MedicationEndDate,
    MedicationDose,
    LabCode,            // LOINC
    LabName,
    LabValue,
    LabUnit,
    LabDate,
    VitalType,          // e.g., "blood_pressure", "heart_rate", "bmi"
    VitalValue,
    VitalUnit,
    VitalDate,
    NoteText,
    NoteDate,
    NoteType,
    Ignore,             // Column should be skipped
}
```

#### Auto-Mapping Algorithm

```rust
use strsim::jaro_winkler;

/// A suggested column mapping with confidence score.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnMapping {
    pub source_column: String,
    pub source_index: usize,
    pub target_field: TargetField,
    pub confidence: f64,
    pub match_reason: String,
}

/// Auto-suggest column mappings based on header names and sample values.
pub fn auto_map_columns(data: &RawTableData) -> Vec<ColumnMapping> {
    let mut mappings = Vec::new();

    // Known header aliases for each target field
    let aliases: Vec<(TargetField, Vec<&str>)> = vec![
        (TargetField::PatientId, vec![
            "patient_id", "patientid", "pat_id", "mrn", "medical_record_number",
            "subject_id", "subjectid", "id", "patient id", "chart_number"
        ]),
        (TargetField::FirstName, vec![
            "first_name", "firstname", "fname", "given_name", "first name"
        ]),
        (TargetField::LastName, vec![
            "last_name", "lastname", "lname", "family_name", "surname", "last name"
        ]),
        (TargetField::DateOfBirth, vec![
            "dob", "date_of_birth", "birthdate", "birth_date", "dateofbirth",
            "date of birth", "birthday"
        ]),
        (TargetField::Gender, vec![
            "gender", "sex", "patient_gender", "patient_sex"
        ]),
        (TargetField::Race, vec![
            "race", "patient_race"
        ]),
        (TargetField::Ethnicity, vec![
            "ethnicity", "ethnic_group", "patient_ethnicity"
        ]),
        (TargetField::DiagnosisCode, vec![
            "diagnosis_code", "icd10", "icd_10", "icd10_code", "dx_code",
            "diagnosis code", "icd-10", "icd_code", "condition_code"
        ]),
        (TargetField::DiagnosisDescription, vec![
            "diagnosis", "diagnosis_description", "dx_description", "condition",
            "diagnosis_name", "condition_name", "diagnosis description"
        ]),
        (TargetField::DiagnosisDate, vec![
            "diagnosis_date", "dx_date", "onset_date", "condition_date",
            "diagnosis date"
        ]),
        (TargetField::MedicationCode, vec![
            "medication_code", "rxnorm", "rxnorm_code", "rx_code", "ndc",
            "drug_code", "medication code"
        ]),
        (TargetField::MedicationName, vec![
            "medication", "medication_name", "drug_name", "drug", "med_name",
            "medication name"
        ]),
        (TargetField::LabCode, vec![
            "lab_code", "loinc", "loinc_code", "test_code", "lab code"
        ]),
        (TargetField::LabName, vec![
            "lab_name", "lab_test", "test_name", "lab name", "test"
        ]),
        (TargetField::LabValue, vec![
            "lab_value", "result", "result_value", "value", "lab value",
            "test_result"
        ]),
        (TargetField::LabUnit, vec![
            "lab_unit", "unit", "units", "result_unit", "lab unit"
        ]),
        (TargetField::LabDate, vec![
            "lab_date", "result_date", "test_date", "collection_date", "lab date"
        ]),
    ];

    for (col_idx, header) in data.headers.iter().enumerate() {
        let normalized = header.to_lowercase().trim().replace(' ', "_");
        let mut best_match: Option<ColumnMapping> = None;

        for (target, alias_list) in &aliases {
            // Check exact alias match
            for alias in alias_list {
                let alias_normalized = alias.to_lowercase().replace(' ', "_");
                if normalized == alias_normalized {
                    best_match = Some(ColumnMapping {
                        source_column: header.clone(),
                        source_index: col_idx,
                        target_field: target.clone(),
                        confidence: 1.0,
                        match_reason: format!("Exact match with alias '{}'", alias),
                    });
                    break;
                }
            }

            if best_match.as_ref().map(|m| m.confidence) == Some(1.0) {
                break;
            }

            // Fuzzy match using Jaro-Winkler similarity
            for alias in alias_list {
                let similarity = jaro_winkler(&normalized, &alias.replace(' ', "_"));
                if similarity > 0.85 {
                    let current_best = best_match.as_ref().map(|m| m.confidence).unwrap_or(0.0);
                    if similarity > current_best {
                        best_match = Some(ColumnMapping {
                            source_column: header.clone(),
                            source_index: col_idx,
                            target_field: target.clone(),
                            confidence: similarity,
                            match_reason: format!(
                                "Fuzzy match with '{}' (similarity: {:.2})",
                                alias, similarity
                            ),
                        });
                    }
                }
            }
        }

        // If no alias matched, try pattern-based detection from sample values
        if best_match.is_none() || best_match.as_ref().unwrap().confidence < 0.7 {
            if let Some(pattern_match) = detect_by_value_pattern(data, col_idx) {
                let current_best = best_match.as_ref().map(|m| m.confidence).unwrap_or(0.0);
                if pattern_match.confidence > current_best {
                    best_match = Some(pattern_match);
                }
            }
        }

        if let Some(mapping) = best_match {
            if mapping.confidence >= 0.5 {
                mappings.push(mapping);
            }
        }
    }

    mappings
}

/// Detect target field by analyzing sample values in a column.
fn detect_by_value_pattern(data: &RawTableData, col_idx: usize) -> Option<ColumnMapping> {
    let sample_size = data.rows.len().min(20);
    let samples: Vec<&str> = data.rows.iter()
        .take(sample_size)
        .filter_map(|row| row.get(col_idx).map(|s| s.as_str()))
        .filter(|s| !s.is_empty())
        .collect();

    if samples.is_empty() {
        return None;
    }

    let header = &data.headers[col_idx];

    // ICD-10 pattern: letter followed by digits, optional dot + digits
    let icd10_regex = regex::Regex::new(r"^[A-Z]\d{2}(\.\d{1,4})?$").unwrap();
    let icd10_matches = samples.iter().filter(|s| icd10_regex.is_match(s)).count();
    if icd10_matches as f64 / samples.len() as f64 > 0.7 {
        return Some(ColumnMapping {
            source_column: header.clone(),
            source_index: col_idx,
            target_field: TargetField::DiagnosisCode,
            confidence: 0.85,
            match_reason: format!(
                "Value pattern matches ICD-10 ({}/{} samples)",
                icd10_matches, samples.len()
            ),
        });
    }

    // Date pattern: various date formats
    let date_regex = regex::Regex::new(
        r"^\d{4}-\d{2}-\d{2}$|^\d{1,2}/\d{1,2}/\d{2,4}$|^\d{2}-\w{3}-\d{4}$"
    ).unwrap();
    let date_matches = samples.iter().filter(|s| date_regex.is_match(s)).count();
    if date_matches as f64 / samples.len() as f64 > 0.7 {
        // It's a date — but which date? Use column name hints
        return Some(ColumnMapping {
            source_column: header.clone(),
            source_index: col_idx,
            target_field: TargetField::DiagnosisDate, // Default, user can adjust
            confidence: 0.6,
            match_reason: format!(
                "Value pattern matches date format ({}/{} samples)",
                date_matches, samples.len()
            ),
        });
    }

    // Numeric pattern: could be lab value, vital, age
    let numeric_regex = regex::Regex::new(r"^-?\d+\.?\d*$").unwrap();
    let numeric_matches = samples.iter().filter(|s| numeric_regex.is_match(s)).count();
    if numeric_matches as f64 / samples.len() as f64 > 0.8 {
        return Some(ColumnMapping {
            source_column: header.clone(),
            source_index: col_idx,
            target_field: TargetField::LabValue, // Default, user can adjust
            confidence: 0.5,
            match_reason: format!(
                "Value pattern is numeric ({}/{} samples)",
                numeric_matches, samples.len()
            ),
        });
    }

    None
}
```

### Column Mapping UI Component

```typescript
// src/components/import/ColumnMapper.tsx

import React, { useState, useMemo } from 'react';

interface ColumnMapping {
  sourceColumn: string;
  sourceIndex: number;
  targetField: string;
  confidence: number;
  matchReason: string;
}

interface RawTableData {
  headers: string[];
  rows: string[][];
}

interface ColumnMapperProps {
  data: RawTableData;
  suggestedMappings: ColumnMapping[];
  onConfirm: (mappings: ColumnMapping[]) => void;
  onCancel: () => void;
}

const TARGET_FIELDS = [
  { value: 'patient_id', label: 'Patient ID', required: true },
  { value: 'first_name', label: 'First Name', required: false },
  { value: 'last_name', label: 'Last Name', required: false },
  { value: 'date_of_birth', label: 'Date of Birth', required: false },
  { value: 'gender', label: 'Gender', required: false },
  { value: 'race', label: 'Race', required: false },
  { value: 'ethnicity', label: 'Ethnicity', required: false },
  { value: 'diagnosis_code', label: 'Diagnosis Code (ICD-10)', required: false },
  { value: 'diagnosis_description', label: 'Diagnosis Description', required: false },
  { value: 'diagnosis_date', label: 'Diagnosis Date', required: false },
  { value: 'medication_code', label: 'Medication Code (RxNorm)', required: false },
  { value: 'medication_name', label: 'Medication Name', required: false },
  { value: 'medication_start_date', label: 'Medication Start Date', required: false },
  { value: 'medication_end_date', label: 'Medication End Date', required: false },
  { value: 'lab_code', label: 'Lab Code (LOINC)', required: false },
  { value: 'lab_name', label: 'Lab Name', required: false },
  { value: 'lab_value', label: 'Lab Value', required: false },
  { value: 'lab_unit', label: 'Lab Unit', required: false },
  { value: 'lab_date', label: 'Lab Date', required: false },
  { value: 'vital_type', label: 'Vital Type', required: false },
  { value: 'vital_value', label: 'Vital Value', required: false },
  { value: 'vital_date', label: 'Vital Date', required: false },
  { value: 'note_text', label: 'Clinical Note', required: false },
  { value: 'note_date', label: 'Note Date', required: false },
  { value: 'ignore', label: '-- Ignore --', required: false },
] as const;

export function ColumnMapper({
  data,
  suggestedMappings,
  onConfirm,
  onCancel,
}: ColumnMapperProps) {
  const [mappings, setMappings] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const mapping of suggestedMappings) {
      initial[mapping.sourceIndex] = mapping.targetField;
    }
    return initial;
  });

  const previewRows = useMemo(() => data.rows.slice(0, 5), [data]);

  const handleMappingChange = (colIndex: number, targetField: string) => {
    setMappings((prev) => ({ ...prev, [colIndex]: targetField }));
  };

  const handleConfirm = () => {
    const finalMappings: ColumnMapping[] = Object.entries(mappings)
      .filter(([_, target]) => target !== 'ignore' && target !== '')
      .map(([colIdx, target]) => ({
        sourceColumn: data.headers[parseInt(colIdx)],
        sourceIndex: parseInt(colIdx),
        targetField: target,
        confidence: 1.0, // User-confirmed
        matchReason: 'User confirmed',
      }));
    onConfirm(finalMappings);
  };

  const hasPatientId = Object.values(mappings).includes('patient_id');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Map Columns to Patient Fields</h3>
      <p className="text-sm text-muted-foreground">
        Review the suggested mappings below. Adjust as needed, then confirm.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {data.headers.map((header, idx) => (
                <th key={idx} className="border p-2 bg-muted">
                  <div className="space-y-2">
                    <div className="font-mono text-xs">{header}</div>
                    <select
                      value={mappings[idx] || ''}
                      onChange={(e) => handleMappingChange(idx, e.target.value)}
                      className="w-full text-xs border rounded p-1"
                    >
                      <option value="">-- Select --</option>
                      {TARGET_FIELDS.map((field) => (
                        <option key={field.value} value={field.value}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                    {suggestedMappings.find((m) => m.sourceIndex === idx) && (
                      <div className="text-xs text-blue-600">
                        Auto-detected ({Math.round(
                          suggestedMappings.find((m) => m.sourceIndex === idx)!
                            .confidence * 100
                        )}% confidence)
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} className="border p-2 text-xs font-mono">
                    {cell || <span className="text-muted-foreground">empty</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!hasPatientId && (
        <div className="text-sm text-destructive">
          A Patient ID column mapping is required.
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn btn-outline">
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!hasPatientId}
          className="btn btn-primary"
        >
          Confirm Mappings
        </button>
      </div>
    </div>
  );
}
```

### Long Format vs Wide Format

Patient data may arrive in two layouts:

**Long format** (multi-row per patient): Each row represents a single observation
(diagnosis, lab result, medication). The patient ID repeats across rows.

```
patient_id | code_type | code    | value | date
P001       | ICD10     | E11.65  |       | 2024-01-15
P001       | LOINC     | 4548-4  | 7.2   | 2024-06-01
P001       | RxNorm    | 860975  |       | 2024-03-10
P002       | ICD10     | I10     |       | 2023-11-20
```

**Wide format** (single-row per patient): Each row is a patient with all data
in columns.

```
patient_id | age | gender | diagnosis_1 | diagnosis_2 | hba1c | metformin
P001       | 54  | M      | E11.65      | I10         | 7.2   | yes
P002       | 67  | F      | I10         |             | 6.1   | no
```

```rust
/// Detect whether the data is long or wide format.
pub fn detect_data_layout(data: &RawTableData, patient_id_col: usize) -> DataLayout {
    let mut patient_ids = std::collections::HashSet::new();
    let mut duplicate_count = 0;

    for row in &data.rows {
        if let Some(id) = row.get(patient_id_col) {
            if !patient_ids.insert(id.clone()) {
                duplicate_count += 1;
            }
        }
    }

    let duplication_ratio = duplicate_count as f64 / data.rows.len() as f64;

    if duplication_ratio > 0.3 {
        DataLayout::Long
    } else {
        DataLayout::Wide
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum DataLayout {
    Long,  // Multiple rows per patient
    Wide,  // Single row per patient
}
```

---

## FHIR R4 JSON Import

FHIR Bundle resources are parsed into the internal patient data model.

```rust
use serde_json::Value;

/// Parse a FHIR R4 Bundle JSON into patient records.
pub fn parse_fhir_bundle(json: &str) -> Result<Vec<PatientData>, ImportError> {
    let bundle: Value = serde_json::from_str(json)
        .map_err(|e| ImportError::ParseError(format!("Invalid JSON: {}", e)))?;

    let resource_type = bundle.get("resourceType")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if resource_type != "Bundle" {
        return Err(ImportError::ParseError(
            format!("Expected Bundle, got {}", resource_type)
        ));
    }

    let entries = bundle.get("entry")
        .and_then(|v| v.as_array())
        .ok_or_else(|| ImportError::ParseError("No entry array in Bundle".to_string()))?;

    // Group resources by patient reference
    let mut patients: std::collections::HashMap<String, PatientData> =
        std::collections::HashMap::new();

    for entry in entries {
        let resource = entry.get("resource")
            .ok_or_else(|| ImportError::ParseError("Entry missing resource".to_string()))?;

        let resource_type = resource.get("resourceType")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        match resource_type {
            "Patient" => {
                let patient = parse_fhir_patient(resource)?;
                patients.insert(patient.id.clone(), patient);
            }
            "Condition" => {
                let (patient_ref, condition) = parse_fhir_condition(resource)?;
                if let Some(patient) = patients.get_mut(&patient_ref) {
                    patient.diagnoses.push(condition);
                }
            }
            "MedicationRequest" => {
                let (patient_ref, medication) = parse_fhir_medication_request(resource)?;
                if let Some(patient) = patients.get_mut(&patient_ref) {
                    patient.medications.push(medication);
                }
            }
            "Observation" => {
                let (patient_ref, observation) = parse_fhir_observation(resource)?;
                if let Some(patient) = patients.get_mut(&patient_ref) {
                    match observation.category.as_str() {
                        "vital-signs" => patient.vitals.push(observation.into()),
                        "laboratory" => patient.labs.push(observation.into()),
                        _ => {} // Skip other observation types
                    }
                }
            }
            _ => {
                // Skip unsupported resource types (DocumentReference, etc.)
            }
        }
    }

    Ok(patients.into_values().collect())
}

/// Parse a FHIR Patient resource into demographics.
fn parse_fhir_patient(resource: &Value) -> Result<PatientData, ImportError> {
    let id = resource.get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let name = resource.get("name")
        .and_then(|v| v.as_array())
        .and_then(|names| names.first());

    let first_name = name
        .and_then(|n| n.get("given"))
        .and_then(|v| v.as_array())
        .and_then(|givens| givens.first())
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let last_name = name
        .and_then(|n| n.get("family"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let dob = resource.get("birthDate")
        .and_then(|v| v.as_str())
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());

    let gender = resource.get("gender")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(PatientData {
        id,
        demographics: Demographics {
            first_name,
            last_name,
            date_of_birth: dob,
            gender,
            race: extract_extension_value(resource, "us-core-race"),
            ethnicity: extract_extension_value(resource, "us-core-ethnicity"),
            age: dob.map(|d| calculate_age(d)),
        },
        diagnoses: vec![],
        medications: vec![],
        labs: vec![],
        vitals: vec![],
        notes: vec![],
    })
}

/// Parse a FHIR Condition resource into a diagnosis record.
fn parse_fhir_condition(resource: &Value) -> Result<(String, DiagnosisRecord), ImportError> {
    let patient_ref = extract_patient_reference(resource)?;

    let coding = resource.get("code")
        .and_then(|v| v.get("coding"))
        .and_then(|v| v.as_array())
        .unwrap_or(&vec![]);

    // Find ICD-10 coding
    let icd10 = coding.iter().find(|c| {
        c.get("system").and_then(|v| v.as_str())
            .map(|s| s.contains("icd-10") || s.contains("icd10"))
            .unwrap_or(false)
    });

    let code = icd10
        .and_then(|c| c.get("code"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let display = icd10
        .and_then(|c| c.get("display"))
        .and_then(|v| v.as_str())
        .or_else(|| resource.get("code")
            .and_then(|v| v.get("text"))
            .and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();

    let onset_date = resource.get("onsetDateTime")
        .and_then(|v| v.as_str())
        .and_then(|s| NaiveDate::parse_from_str(&s[..10], "%Y-%m-%d").ok());

    Ok((patient_ref, DiagnosisRecord {
        code,
        system: "ICD-10".to_string(),
        description: display,
        onset_date,
    }))
}

/// Parse a FHIR MedicationRequest into a medication record.
fn parse_fhir_medication_request(
    resource: &Value,
) -> Result<(String, MedicationRecord), ImportError> {
    let patient_ref = extract_patient_reference(resource)?;

    let coding = resource.get("medicationCodeableConcept")
        .and_then(|v| v.get("coding"))
        .and_then(|v| v.as_array())
        .unwrap_or(&vec![]);

    let rxnorm = coding.iter().find(|c| {
        c.get("system").and_then(|v| v.as_str())
            .map(|s| s.contains("rxnorm"))
            .unwrap_or(false)
    });

    let code = rxnorm
        .and_then(|c| c.get("code"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let display = rxnorm
        .and_then(|c| c.get("display"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let authored_on = resource.get("authoredOn")
        .and_then(|v| v.as_str())
        .and_then(|s| NaiveDate::parse_from_str(&s[..10], "%Y-%m-%d").ok());

    Ok((patient_ref, MedicationRecord {
        code,
        system: "RxNorm".to_string(),
        name: display,
        start_date: authored_on,
        end_date: None,
        last_administration_date: authored_on,
        dose: None,
    }))
}

/// Parse a FHIR Observation into a lab/vital record.
fn parse_fhir_observation(
    resource: &Value,
) -> Result<(String, ObservationRecord), ImportError> {
    let patient_ref = extract_patient_reference(resource)?;

    let category = resource.get("category")
        .and_then(|v| v.as_array())
        .and_then(|cats| cats.first())
        .and_then(|c| c.get("coding"))
        .and_then(|v| v.as_array())
        .and_then(|codings| codings.first())
        .and_then(|c| c.get("code"))
        .and_then(|v| v.as_str())
        .unwrap_or("laboratory")
        .to_string();

    let code_coding = resource.get("code")
        .and_then(|v| v.get("coding"))
        .and_then(|v| v.as_array())
        .and_then(|codings| codings.first());

    let code = code_coding
        .and_then(|c| c.get("code"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let display = code_coding
        .and_then(|c| c.get("display"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let (value, unit) = if let Some(vq) = resource.get("valueQuantity") {
        let v = vq.get("value").and_then(|v| v.as_f64());
        let u = vq.get("unit").and_then(|v| v.as_str()).unwrap_or("").to_string();
        (v, u)
    } else {
        (None, String::new())
    };

    let effective_date = resource.get("effectiveDateTime")
        .and_then(|v| v.as_str())
        .and_then(|s| NaiveDate::parse_from_str(&s[..10.min(s.len())], "%Y-%m-%d").ok());

    Ok((patient_ref, ObservationRecord {
        code,
        system: "LOINC".to_string(),
        name: display,
        category,
        value,
        unit,
        date: effective_date,
    }))
}

/// Extract patient reference from a resource's subject field.
fn extract_patient_reference(resource: &Value) -> Result<String, ImportError> {
    resource.get("subject")
        .and_then(|v| v.get("reference"))
        .and_then(|v| v.as_str())
        .map(|r| r.replace("Patient/", ""))
        .ok_or_else(|| ImportError::ParseError("Missing subject reference".to_string()))
}
```

---

## C-CDA XML Import

C-CDA (Consolidated Clinical Document Architecture) documents are parsed by
templateId to extract structured clinical data.

```rust
use quick_xml::Reader;
use quick_xml::events::Event;

/// Known C-CDA section template IDs.
const PROBLEM_LIST_TEMPLATE: &str = "2.16.840.1.113883.10.20.22.2.5.1";
const MEDICATIONS_TEMPLATE: &str = "2.16.840.1.113883.10.20.22.2.1.1";
const RESULTS_TEMPLATE: &str = "2.16.840.1.113883.10.20.22.2.3.1";
const VITAL_SIGNS_TEMPLATE: &str = "2.16.840.1.113883.10.20.22.2.4.1";

/// Parse a C-CDA XML document into patient data.
pub fn parse_ccda(xml: &str) -> Result<PatientData, ImportError> {
    // Verify this is a ClinicalDocument
    if !xml.contains("ClinicalDocument") {
        return Err(ImportError::ParseError(
            "Not a CDA document: missing ClinicalDocument element".to_string()
        ));
    }

    let doc = roxmltree::Document::parse(xml)
        .map_err(|e| ImportError::ParseError(format!("XML parse error: {}", e)))?;

    let root = doc.root_element();

    // Extract patient demographics from recordTarget
    let demographics = parse_ccda_demographics(&root)?;

    // Extract sections by templateId
    let diagnoses = parse_ccda_section(&root, PROBLEM_LIST_TEMPLATE, parse_problem_entry)?;
    let medications = parse_ccda_section(&root, MEDICATIONS_TEMPLATE, parse_medication_entry)?;
    let labs = parse_ccda_section(&root, RESULTS_TEMPLATE, parse_result_entry)?;
    let vitals = parse_ccda_section(&root, VITAL_SIGNS_TEMPLATE, parse_vital_entry)?;

    Ok(PatientData {
        id: demographics.id.clone(),
        demographics: demographics.into(),
        diagnoses,
        medications,
        labs,
        vitals,
        notes: vec![],
    })
}

/// Find a section by templateId and parse its entries.
fn parse_ccda_section<T, F>(
    root: &roxmltree::Node,
    template_id: &str,
    entry_parser: F,
) -> Vec<T>
where
    F: Fn(&roxmltree::Node) -> Option<T>,
{
    // Find the component/section with matching templateId
    let section = find_section_by_template(root, template_id);

    match section {
        Some(section_node) => {
            section_node.children()
                .filter(|n| n.has_tag_name("entry"))
                .filter_map(|entry| entry_parser(&entry))
                .collect()
        }
        None => vec![],
    }
}

/// Find a section element that contains a templateId matching the target.
fn find_section_by_template<'a>(
    node: &'a roxmltree::Node,
    template_id: &str,
) -> Option<roxmltree::Node<'a, 'a>> {
    for child in node.descendants() {
        if child.has_tag_name("section") {
            for template in child.children().filter(|n| n.has_tag_name("templateId")) {
                if template.attribute("root") == Some(template_id) {
                    return Some(child);
                }
            }
        }
    }
    None
}

/// Parse a problem list entry into a DiagnosisRecord.
fn parse_problem_entry(entry: &roxmltree::Node) -> Option<DiagnosisRecord> {
    let act = entry.children().find(|n| n.has_tag_name("act"))?;
    let observation = act.descendants().find(|n| n.has_tag_name("observation"))?;

    let value = observation.children().find(|n| n.has_tag_name("value"))?;
    let code = value.attribute("code").unwrap_or("").to_string();
    let code_system = value.attribute("codeSystem").unwrap_or("").to_string();
    let display = value.attribute("displayName").unwrap_or("").to_string();

    let effective_time = observation.children()
        .find(|n| n.has_tag_name("effectiveTime"))
        .and_then(|et| et.children().find(|n| n.has_tag_name("low")))
        .and_then(|low| low.attribute("value"))
        .and_then(|v| parse_hl7_date(v));

    Some(DiagnosisRecord {
        code,
        system: normalize_code_system(&code_system),
        description: display,
        onset_date: effective_time,
    })
}
```

---

## Entity Extraction

For free-text fields (clinical notes, unstructured descriptions), the pipeline
uses a two-pass extraction strategy.

### Pass 1: spaCy NER via Python Sidecar

```rust
/// Call the Python sidecar for Named Entity Recognition.
/// The sidecar runs spaCy with the en_core_sci_lg model for biomedical NER.
pub async fn extract_entities_spacy(
    text: &str,
    sidecar: &PythonSidecar,
) -> Result<Vec<ExtractedEntity>, ImportError> {
    let response = sidecar.call("extract_entities", serde_json::json!({
        "text": text,
        "models": ["en_core_sci_lg"],
    })).await.map_err(|e| ImportError::ExtractionError(e.to_string()))?;

    let entities: Vec<ExtractedEntity> = serde_json::from_value(response)
        .map_err(|e| ImportError::ExtractionError(format!("Parse NER response: {}", e)))?;

    Ok(entities)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedEntity {
    pub text: String,
    pub entity_type: String, // DISEASE, DRUG, TEST, etc.
    pub start_char: usize,
    pub end_char: usize,
    pub confidence: f64,
}
```

### Pass 2: LLM for Disambiguation and Code Assignment

```rust
/// Use LLM to disambiguate extracted entities and assign standard codes.
pub async fn normalize_entities(
    entities: &[ExtractedEntity],
    llm_client: &LlmClient,
) -> Result<Vec<NormalizedEntity>, ImportError> {
    if entities.is_empty() {
        return Ok(vec![]);
    }

    let prompt = format!(
        r#"Given these extracted medical entities, assign the correct standard codes.
For diagnoses, use ICD-10-CM codes.
For medications, use RxNorm codes.
For lab tests, use LOINC codes.

Entities:
{}

Respond with JSON array:
[{{"text": "...", "entity_type": "...", "code": "...", "code_system": "...", "confidence": 0.0-1.0}}]"#,
        entities.iter().map(|e| format!("- {} ({})", e.text, e.entity_type)).collect::<Vec<_>>().join("\n")
    );

    let response = llm_client.complete(
        "You are a medical coding assistant. Assign accurate standard codes.",
        &prompt,
    ).await.map_err(|e| ImportError::ExtractionError(e.to_string()))?;

    let normalized: Vec<NormalizedEntity> = serde_json::from_str(&response)
        .map_err(|e| ImportError::ExtractionError(format!("Parse LLM response: {}", e)))?;

    Ok(normalized)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedEntity {
    pub text: String,
    pub entity_type: String,
    pub code: String,
    pub code_system: String,
    pub confidence: f64,
}
```

---

## Incremental Import

Re-importing data updates existing records rather than creating duplicates.

```rust
/// Deduplication and merge logic for incremental imports.
pub async fn upsert_patient(
    db: &Database,
    incoming: &PatientData,
    site_id: &str,
    import_id: &str,
) -> Result<UpsertResult, ImportError> {
    // Check for existing patient by site_patient_id
    let existing = db.get_patient_by_site_id(site_id, &incoming.id).await?;

    match existing {
        Some(existing_patient) => {
            // Merge: add new diagnoses, medications, labs that don't already exist
            let merged = merge_patient_data(&existing_patient, incoming);
            let changes = count_changes(&existing_patient, &merged);

            db.update_patient(&merged, import_id).await?;

            Ok(UpsertResult::Updated {
                patient_id: merged.id.clone(),
                new_diagnoses: changes.new_diagnoses,
                new_medications: changes.new_medications,
                new_labs: changes.new_labs,
            })
        }
        None => {
            db.insert_patient(incoming, site_id, import_id).await?;

            Ok(UpsertResult::Inserted {
                patient_id: incoming.id.clone(),
            })
        }
    }
}

/// Merge two patient records, preferring newer data where conflicts exist.
fn merge_patient_data(existing: &PatientData, incoming: &PatientData) -> PatientData {
    let mut merged = existing.clone();

    // Update demographics if incoming has more data
    if incoming.demographics.date_of_birth.is_some() && existing.demographics.date_of_birth.is_none() {
        merged.demographics.date_of_birth = incoming.demographics.date_of_birth;
    }

    // Add new diagnoses (deduplicate by code + onset_date)
    for diagnosis in &incoming.diagnoses {
        let exists = merged.diagnoses.iter().any(|d| {
            d.code == diagnosis.code && d.onset_date == diagnosis.onset_date
        });
        if !exists {
            merged.diagnoses.push(diagnosis.clone());
        }
    }

    // Add new medications (deduplicate by code + start_date)
    for medication in &incoming.medications {
        let exists = merged.medications.iter().any(|m| {
            m.code == medication.code && m.start_date == medication.start_date
        });
        if !exists {
            merged.medications.push(medication.clone());
        }
    }

    // Add new labs (deduplicate by code + date)
    for lab in &incoming.labs {
        let exists = merged.labs.iter().any(|l| {
            l.code == lab.code && l.date == lab.date
        });
        if !exists {
            merged.labs.push(lab.clone());
        }
    }

    merged
}

#[derive(Debug)]
pub enum UpsertResult {
    Inserted { patient_id: String },
    Updated {
        patient_id: String,
        new_diagnoses: usize,
        new_medications: usize,
        new_labs: usize,
    },
}
```

---

## Audit Logging

Every import operation is fully logged for traceability.

```rust
/// Import audit log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportLog {
    pub import_id: String,
    pub source_file: String,
    pub source_format: ImportFormat,
    pub file_hash: String,       // SHA-256 of source file
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: chrono::DateTime<chrono::Utc>,
    pub total_rows: usize,
    pub patients_inserted: usize,
    pub patients_updated: usize,
    pub patients_skipped: usize,
    pub errors: Vec<ImportErrorRecord>,
    pub column_mappings: Vec<ColumnMapping>,
    pub initiated_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportErrorRecord {
    pub row_number: usize,
    pub column: String,
    pub error: String,
    pub severity: ErrorSeverity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorSeverity {
    Warning, // Data imported with best-effort parsing
    Error,   // Row skipped due to critical error
}

/// Create and store import audit log.
pub async fn finalize_import_log(
    db: &Database,
    log: &ImportLog,
) -> Result<(), ImportError> {
    db.insert_import_log(log).await?;

    db.append_audit_log(&AuditEntry {
        timestamp: log.completed_at,
        action: "data_import_completed".to_string(),
        user_id: log.initiated_by.clone(),
        details: format!(
            "Import {} completed. File: {}, Format: {:?}. \
             Inserted: {}, Updated: {}, Skipped: {}, Errors: {}",
            log.import_id, log.source_file, log.source_format,
            log.patients_inserted, log.patients_updated,
            log.patients_skipped, log.errors.len()
        ),
        checksum: String::new(),
    }).await?;

    Ok(())
}
```

---

## Progress Events

Real-time progress updates are sent to the frontend via Tauri channels.

```rust
/// Import progress event.
#[derive(Debug, Clone, Serialize)]
pub struct ImportProgress {
    pub phase: ImportPhase,
    pub current: usize,
    pub total: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub enum ImportPhase {
    Detecting,     // Format detection
    Parsing,       // File parsing
    Mapping,       // Column mapping (waiting for user)
    Normalizing,   // Entity extraction + code normalization
    Importing,     // Upserting records
    Finalizing,    // Audit log + summary
    Complete,
}

/// The Tauri command that orchestrates the full import pipeline.
#[tauri::command]
pub async fn import_file(
    file_path: String,
    site_id: String,
    mappings: Option<Vec<ColumnMapping>>,
    progress: tauri::ipc::Channel<ImportProgress>,
    state: tauri::State<'_, AppState>,
) -> Result<ImportSummary, String> {
    let path = Path::new(&file_path);
    let db = &state.database;
    let user_id = &state.current_user_id;
    let import_id = uuid::Uuid::new_v4().to_string();

    // Phase 1: Detect format
    let _ = progress.send(ImportProgress {
        phase: ImportPhase::Detecting,
        current: 0, total: 0,
        message: "Detecting file format...".to_string(),
    });
    let format = detect_format(path).map_err(|e| e.to_string())?;

    // Phase 2: Parse
    let _ = progress.send(ImportProgress {
        phase: ImportPhase::Parsing,
        current: 0, total: 0,
        message: format!("Parsing {:?} file...", format),
    });

    let patients = match format {
        ImportFormat::Csv => {
            let data = parse_csv(path).map_err(|e| e.to_string())?;
            let mappings = mappings.ok_or("Column mappings required for CSV")?;
            transform_table_data(&data, &mappings).map_err(|e| e.to_string())?
        }
        ImportFormat::Xlsx => {
            let data = parse_xlsx(path, None).map_err(|e| e.to_string())?;
            let mappings = mappings.ok_or("Column mappings required for XLSX")?;
            transform_table_data(&data, &mappings).map_err(|e| e.to_string())?
        }
        ImportFormat::FhirJson => {
            let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
            parse_fhir_bundle(&content).map_err(|e| e.to_string())?
        }
        ImportFormat::CdaXml => {
            let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
            vec![parse_ccda(&content).map_err(|e| e.to_string())?]
        }
        _ => return Err(format!("Unsupported format: {:?}", format)),
    };

    // Phase 3: Import
    let total = patients.len();
    let mut inserted = 0;
    let mut updated = 0;
    let mut errors = Vec::new();

    for (idx, patient) in patients.iter().enumerate() {
        let _ = progress.send(ImportProgress {
            phase: ImportPhase::Importing,
            current: idx + 1,
            total,
            message: format!("Importing patient {}/{}...", idx + 1, total),
        });

        match upsert_patient(db, patient, &site_id, &import_id).await {
            Ok(UpsertResult::Inserted { .. }) => inserted += 1,
            Ok(UpsertResult::Updated { .. }) => updated += 1,
            Err(e) => errors.push(ImportErrorRecord {
                row_number: idx,
                column: String::new(),
                error: e.to_string(),
                severity: ErrorSeverity::Error,
            }),
        }
    }

    // Phase 4: Finalize
    let _ = progress.send(ImportProgress {
        phase: ImportPhase::Finalizing,
        current: total, total,
        message: "Finalizing import...".to_string(),
    });

    let file_hash = compute_file_hash(path).unwrap_or_default();

    finalize_import_log(db, &ImportLog {
        import_id: import_id.clone(),
        source_file: file_path.clone(),
        source_format: format.clone(),
        file_hash,
        started_at: chrono::Utc::now(), // Simplified; real impl tracks actual start
        completed_at: chrono::Utc::now(),
        total_rows: total,
        patients_inserted: inserted,
        patients_updated: updated,
        patients_skipped: errors.len(),
        errors: errors.clone(),
        column_mappings: mappings.unwrap_or_default(),
        initiated_by: user_id.clone(),
    }).await.map_err(|e| e.to_string())?;

    let _ = progress.send(ImportProgress {
        phase: ImportPhase::Complete,
        current: total, total,
        message: format!(
            "Import complete. {} inserted, {} updated, {} errors.",
            inserted, updated, errors.len()
        ),
    });

    Ok(ImportSummary { import_id, inserted, updated, errors: errors.len() })
}
```

---

## Error Handling

| Error Type | Handling |
|-----------|---------|
| File not readable | Return error immediately, no partial import |
| Unsupported format | Return error with detected format info |
| CSV parse error (row) | Skip row, log warning, continue |
| Missing required field (patient_id) | Skip row, log error |
| Invalid date format | Store as null, log warning |
| Invalid code format | Store raw value, log warning |
| Duplicate patient | Merge (incremental import) |
| Database write failure | Retry once, then log error and skip |
| spaCy sidecar unavailable | Skip entity extraction, log warning |
| LLM unavailable for normalization | Store raw entities without codes |

---

## Testing

### Unit Tests

- Format detection with various file extensions and content
- CSV parsing with edge cases (quoted fields, newlines in values, BOM)
- FHIR Bundle parsing with complete and partial resources
- Column auto-mapping accuracy against known header sets
- Deduplication logic for merge scenarios
- ICD-10/RxNorm/LOINC code normalization

### Integration Tests

- End-to-end CSV import with column mapping
- End-to-end FHIR Bundle import
- Incremental import (import same file twice, verify no duplicates)
- Import with entity extraction pipeline
- Audit log completeness verification

### Test Fixtures

Maintain test fixtures in `tests/fixtures/import/`:
- `sample_patients.csv` — 50 patients in wide format
- `sample_observations.csv` — 500 rows in long format
- `fhir_bundle_complete.json` — Full Bundle with all resource types
- `fhir_bundle_partial.json` — Bundle with missing optional fields
- `ccda_sample.xml` — Complete C-CDA document
- `malformed.csv` — CSV with encoding issues, missing columns
