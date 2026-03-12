//! HL7v2 message parser for importing patient data from HL7v2 pipe-delimited files.
//!
//! Supports batch files containing multiple messages. Extracts demographics (PID),
//! diagnoses (DG1), lab results and vitals (OBX), medications (RXA/RXE), and
//! allergies (AL1). Multiple messages for the same patient are merged.

use std::collections::HashMap;
use std::path::Path;

use crate::import::{
    AllergyRecord, DiagnosisRecord, ImportError, LabResultRecord, MedicationRecord,
    PatientRecord, VitalRecord,
};

/// Known vital-sign LOINC codes — OBX observations with these codes are routed
/// to `VitalRecord` instead of `LabResultRecord`.
const VITAL_LOINC_MAP: &[(&str, &str)] = &[
    ("8480-6", "bp_systolic"),
    ("8462-4", "bp_diastolic"),
    ("8867-4", "heart_rate"),
    ("29463-7", "weight"),
    ("8302-2", "height"),
    ("39156-5", "bmi"),
    ("8310-5", "temperature"),
    ("9279-1", "respiratory_rate"),
    ("2708-6", "spo2"),
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Parse an HL7v2 file (single or batch) into a vector of `PatientRecord`.
///
/// Messages sharing the same patient identifier (PID-3) are merged: demographics
/// come from the first occurrence and clinical data (diagnoses, labs, meds, etc.)
/// are concatenated with deduplication by code/name.
pub fn parse_hl7_file(path: &Path) -> Result<Vec<PatientRecord>, ImportError> {
    let content = std::fs::read_to_string(path).map_err(|e| {
        ImportError::IoError(e)
    })?;

    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    let messages = split_messages(&content);

    if messages.is_empty() {
        return Err(ImportError::Hl7Error(
            "No HL7v2 messages found (file must contain MSH segments)".into(),
        ));
    }

    // patient_id -> PatientRecord
    let mut patients: HashMap<String, PatientRecord> = HashMap::new();
    // Preserve insertion order
    let mut patient_order: Vec<String> = Vec::new();

    for (msg_idx, msg_text) in messages.iter().enumerate() {
        let seps = match extract_separators(msg_text) {
            Some(s) => s,
            None => {
                tracing::warn!(message_index = msg_idx, "Skipping message with invalid MSH");
                continue;
            }
        };

        let segments = parse_segments(msg_text, &seps);

        // We need at least a PID to create a patient
        let pid_seg = segments.iter().find(|s| s.segment_type == "PID");
        let pid_seg = match pid_seg {
            Some(s) => s,
            None => {
                tracing::warn!(message_index = msg_idx, "Skipping message without PID segment");
                continue;
            }
        };

        let (patient_id, demographics) = parse_pid(pid_seg, &seps);

        if patient_id.trim().is_empty() {
            tracing::warn!(message_index = msg_idx, "Skipping message with empty patient ID");
            continue;
        }

        // Parse clinical data from this message
        let mut diagnoses = Vec::new();
        let mut labs = Vec::new();
        let mut vitals = Vec::new();
        let mut medications = Vec::new();
        let mut allergies = Vec::new();

        for seg in &segments {
            match seg.segment_type.as_str() {
                "DG1" => {
                    if let Some(dx) = parse_dg1(seg, &seps) {
                        diagnoses.push(dx);
                    }
                }
                "OBX" => {
                    match parse_obx(seg, &seps) {
                        Some(ObxResult::Lab(lab)) => labs.push(lab),
                        Some(ObxResult::Vital(vital)) => vitals.push(vital),
                        None => {}
                    }
                }
                "RXA" => {
                    if let Some(med) = parse_rxa(seg, &seps) {
                        medications.push(med);
                    }
                }
                "RXE" => {
                    if let Some(med) = parse_rxe(seg, &seps) {
                        medications.push(med);
                    }
                }
                "AL1" => {
                    if let Some(al) = parse_al1(seg, &seps) {
                        allergies.push(al);
                    }
                }
                _ => {} // MSH, EVN, PV1, NK1, etc. — ignored for now
            }
        }

        // Merge into existing patient or insert new
        if let Some(existing) = patients.get_mut(&patient_id) {
            merge_clinical_data(existing, diagnoses, labs, vitals, medications, allergies);
        } else {
            let record = PatientRecord {
                site_patient_id: patient_id.clone(),
                date_of_birth: demographics.date_of_birth,
                gender: demographics.gender,
                race: demographics.race,
                ethnicity: demographics.ethnicity,
                insurance_type: None,
                diagnoses,
                medications,
                lab_results: labs,
                vitals,
                procedures: Vec::new(),
                allergies,
            };
            patient_order.push(patient_id.clone());
            patients.insert(patient_id, record);
        }
    }

    // Return in insertion order
    let result: Vec<PatientRecord> = patient_order
        .into_iter()
        .filter_map(|id| patients.remove(&id))
        .collect();

    Ok(result)
}

/// Generate a preview of an HL7v2 file for the import UI.
///
/// Returns `(headers, sample_rows, total_patient_count)` using fixed column
/// headers matching the demographic preview format.
pub fn generate_hl7_preview(
    path: &Path,
) -> Result<(Vec<String>, Vec<Vec<String>>, usize), ImportError> {
    let patients = parse_hl7_file(path)?;

    let headers = vec![
        "Patient ID".to_string(),
        "Date of Birth".to_string(),
        "Gender".to_string(),
        "Race".to_string(),
        "Ethnicity".to_string(),
        "Diagnoses".to_string(),
        "Medications".to_string(),
        "Lab Results".to_string(),
        "Allergies".to_string(),
    ];

    let total = patients.len();

    let sample_rows: Vec<Vec<String>> = patients
        .iter()
        .take(10)
        .map(|p| {
            vec![
                p.site_patient_id.clone(),
                p.date_of_birth.clone().unwrap_or_default(),
                p.gender.clone().unwrap_or_default(),
                p.race.clone().unwrap_or_default(),
                p.ethnicity.clone().unwrap_or_default(),
                format!("{} diagnoses", p.diagnoses.len()),
                format!("{} medications", p.medications.len()),
                format!("{} results", p.lab_results.len() + p.vitals.len()),
                format!("{} allergies", p.allergies.len()),
            ]
        })
        .collect();

    Ok((headers, sample_rows, total))
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/// Separator characters extracted from MSH-1 and MSH-2.
struct Separators {
    field: char,      // MSH-1, always '|'
    component: char,  // First char of MSH-2, typically '^'
    repetition: char, // Second char of MSH-2, typically '~'
    _escape: char,    // Third char of MSH-2, typically '\'
    _subcomponent: char, // Fourth char of MSH-2, typically '&'
}

/// Parsed demographics extracted from PID.
struct Demographics {
    date_of_birth: Option<String>,
    gender: Option<String>,
    race: Option<String>,
    ethnicity: Option<String>,
}

/// A parsed segment: type + fields (each field is a raw string).
struct Segment {
    segment_type: String,
    fields: Vec<String>,
}

/// OBX may produce either a lab result or a vital sign.
enum ObxResult {
    Lab(LabResultRecord),
    Vital(VitalRecord),
}

// ---------------------------------------------------------------------------
// Message splitting
// ---------------------------------------------------------------------------

/// Split file content into individual HL7v2 messages by MSH boundaries.
/// Handles `\r\n`, `\n`, and `\r` line endings.
fn split_messages(content: &str) -> Vec<String> {
    // Normalize line endings to \n
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");

    let mut messages: Vec<String> = Vec::new();
    let mut current: Vec<&str> = Vec::new();

    for line in normalized.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with("MSH") {
            // Start of a new message — flush the previous one
            if !current.is_empty() {
                messages.push(current.join("\n"));
                current.clear();
            }
        }
        // Skip BHS/FHS batch header/trailer segments
        if trimmed.starts_with("BHS") || trimmed.starts_with("BTS")
            || trimmed.starts_with("FHS") || trimmed.starts_with("FTS")
        {
            continue;
        }
        current.push(trimmed);
    }

    if !current.is_empty() {
        messages.push(current.join("\n"));
    }

    messages
}

// ---------------------------------------------------------------------------
// Separator extraction
// ---------------------------------------------------------------------------

/// Extract separators from the MSH line.
fn extract_separators(message: &str) -> Option<Separators> {
    let first_line = message.lines().next()?;
    let trimmed = first_line.trim();

    if !trimmed.starts_with("MSH") || trimmed.len() < 8 {
        return None;
    }

    let chars: Vec<char> = trimmed.chars().collect();
    let field = chars[3]; // character right after "MSH"
    let component = chars[4];
    let repetition = chars[5];
    let escape = chars[6];
    let subcomponent = chars[7];

    Some(Separators {
        field,
        component,
        repetition,
        _escape: escape,
        _subcomponent: subcomponent,
    })
}

// ---------------------------------------------------------------------------
// Segment parsing
// ---------------------------------------------------------------------------

/// Parse all segments from a single HL7v2 message.
fn parse_segments(message: &str, seps: &Separators) -> Vec<Segment> {
    let field_sep = seps.field.to_string();
    let mut segments = Vec::new();

    for line in message.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.len() < 3 {
            continue;
        }

        let seg_type = &trimmed[..3];

        // Special handling for MSH: field 1 IS the separator, field 2 is encoding chars.
        // We insert the separator as field[0] so that field indices align with the spec
        // (MSH-1 = fields[0], MSH-2 = fields[1], MSH-3 = fields[2], etc.).
        if seg_type == "MSH" {
            let mut fields = Vec::new();
            fields.push(seps.field.to_string()); // MSH-1
            // Everything after "MSH|" split by field separator
            if trimmed.len() > 4 {
                let rest = &trimmed[4..];
                for f in rest.split(seps.field) {
                    fields.push(f.to_string());
                }
            }
            segments.push(Segment {
                segment_type: "MSH".to_string(),
                fields,
            });
        } else {
            // Normal segment: first field is the segment type itself, remaining split by |
            let parts: Vec<String> = trimmed.split(&*field_sep).map(|s| s.to_string()).collect();
            // parts[0] = segment type, parts[1..] = fields 1..N
            // We store fields[0] = parts[1], fields[1] = parts[2], etc.
            // (segment_type is stored separately)
            segments.push(Segment {
                segment_type: seg_type.to_string(),
                fields: parts.into_iter().skip(1).collect(),
            });
        }
    }

    segments
}

/// Get a field by 1-based HL7 field index from a non-MSH segment.
/// For non-MSH segments, field 1 = fields[0].
fn get_field(seg: &Segment, field_index: usize) -> &str {
    if field_index == 0 {
        return "";
    }
    seg.fields.get(field_index - 1).map(|s| s.as_str()).unwrap_or("")
}

/// Split a field value into components using the component separator.
fn get_components<'a>(field_value: &'a str, seps: &Separators) -> Vec<&'a str> {
    field_value.split(seps.component).collect()
}

/// Split a field into repetitions using the repetition separator.
fn get_repetitions<'a>(field_value: &'a str, seps: &Separators) -> Vec<&'a str> {
    field_value.split(seps.repetition).collect()
}

// ---------------------------------------------------------------------------
// PID — Patient Identification
// ---------------------------------------------------------------------------

/// Parse PID segment, returning (patient_id, Demographics).
fn parse_pid(seg: &Segment, seps: &Separators) -> (String, Demographics) {
    // PID-3: Patient identifier list (repeatable)
    let pid3 = get_field(seg, 3);
    let patient_id = extract_patient_id(pid3, seps);

    // PID-5: Patient name (family^given^middle^suffix^prefix)
    let _name = get_field(seg, 5);
    // Name is not stored in PatientRecord, but we could use it for display.

    // PID-7: Date of birth (YYYYMMDD)
    let dob_raw = get_field(seg, 7);
    let date_of_birth = parse_hl7_date(dob_raw);

    // PID-8: Sex
    let sex_raw = get_field(seg, 8);
    let gender = match sex_raw.trim().to_uppercase().as_str() {
        "M" => Some("Male".to_string()),
        "F" => Some("Female".to_string()),
        "O" => Some("Other".to_string()),
        "U" => Some("Unknown".to_string()),
        s if !s.is_empty() => Some(s.to_string()),
        _ => None,
    };

    // PID-10: Race
    let race_raw = get_field(seg, 10);
    let race = if race_raw.is_empty() {
        None
    } else {
        let comps = get_components(race_raw, seps);
        // Prefer the display text (component 2) over code (component 1)
        let display = comps.get(1).copied().unwrap_or("").trim();
        if !display.is_empty() {
            Some(display.to_string())
        } else {
            let code = comps.first().copied().unwrap_or("").trim();
            if !code.is_empty() { Some(code.to_string()) } else { None }
        }
    };

    // PID-22: Ethnic group
    let eth_raw = get_field(seg, 22);
    let ethnicity = if eth_raw.is_empty() {
        None
    } else {
        let comps = get_components(eth_raw, seps);
        let display = comps.get(1).copied().unwrap_or("").trim();
        if !display.is_empty() {
            Some(display.to_string())
        } else {
            let code = comps.first().copied().unwrap_or("").trim();
            if !code.is_empty() { Some(code.to_string()) } else { None }
        }
    };

    let demographics = Demographics {
        date_of_birth,
        gender,
        race,
        ethnicity,
    };

    (patient_id, demographics)
}

/// Extract the best patient identifier from PID-3, preferring MRN.
fn extract_patient_id(pid3: &str, seps: &Separators) -> String {
    let reps = get_repetitions(pid3, seps);

    // First pass: look for an ID with type "MR" (Medical Record Number)
    for rep in &reps {
        let comps = get_components(rep, seps);
        // Component 5 (0-indexed: 4) = identifier type code
        if let Some(id_type) = comps.get(4) {
            if id_type.trim().eq_ignore_ascii_case("MR") {
                let id = comps.first().copied().unwrap_or("").trim();
                if !id.is_empty() {
                    return id.to_string();
                }
            }
        }
    }

    // Fallback: use the first non-empty ID
    for rep in &reps {
        let comps = get_components(rep, seps);
        let id = comps.first().copied().unwrap_or("").trim();
        if !id.is_empty() {
            return id.to_string();
        }
    }

    String::new()
}

// ---------------------------------------------------------------------------
// DG1 — Diagnosis
// ---------------------------------------------------------------------------

fn parse_dg1(seg: &Segment, seps: &Separators) -> Option<DiagnosisRecord> {
    // DG1-3: Diagnosis code (code^display^coding_system)
    let dg1_3 = get_field(seg, 3);
    let comps = get_components(dg1_3, seps);

    let code = comps.first().copied().unwrap_or("").trim();
    let display = comps.get(1).copied().unwrap_or("").trim();
    let coding_system = comps.get(2).copied().unwrap_or("").trim().to_uppercase();

    // Determine ICD-10 code
    let icd10_code = if coding_system.contains("ICD") {
        if !code.is_empty() { Some(code.to_string()) } else { None }
    } else if !code.is_empty() {
        Some(code.to_string())
    } else {
        None
    };

    // DG1-4: Diagnosis description (free text fallback)
    let dg1_4 = get_field(seg, 4).trim();

    let description = if !display.is_empty() {
        display.to_string()
    } else if !dg1_4.is_empty() {
        dg1_4.to_string()
    } else if !code.is_empty() {
        code.to_string()
    } else {
        return None;
    };

    // DG1-5: Diagnosis date
    let dg1_5 = get_field(seg, 5);
    let onset_date = parse_hl7_date(dg1_5);

    // DG1-6: Diagnosis type (A=admitting, W=working, F=final)
    let dg1_6 = get_field(seg, 6).trim();
    let status = match dg1_6.to_uppercase().as_str() {
        "A" => Some("admitting".to_string()),
        "W" => Some("working".to_string()),
        "F" => Some("final".to_string()),
        s if !s.is_empty() => Some(s.to_lowercase()),
        _ => Some("active".to_string()),
    };

    Some(DiagnosisRecord {
        icd10_code,
        description,
        onset_date,
        status,
    })
}

// ---------------------------------------------------------------------------
// OBX — Observation/Result
// ---------------------------------------------------------------------------

fn parse_obx(seg: &Segment, seps: &Separators) -> Option<ObxResult> {
    // OBX-2: Value type (NM, ST, CE, etc.)
    let _value_type = get_field(seg, 2).trim();

    // OBX-3: Observation identifier (code^display^coding_system)
    let obx3 = get_field(seg, 3);
    let obx3_comps = get_components(obx3, seps);
    let obs_code = obx3_comps.first().copied().unwrap_or("").trim();
    let obs_display = obx3_comps.get(1).copied().unwrap_or("").trim();
    let obs_system = obx3_comps.get(2).copied().unwrap_or("").trim().to_uppercase();

    let test_name = if !obs_display.is_empty() {
        obs_display.to_string()
    } else if !obs_code.is_empty() {
        obs_code.to_string()
    } else {
        return None;
    };

    let loinc_code = if obs_system.contains("LN") || obs_system.contains("LOINC") {
        if !obs_code.is_empty() { Some(obs_code.to_string()) } else { None }
    } else {
        None
    };

    // OBX-5: Observation value
    let value_raw = get_field(seg, 5).trim();
    let value: Option<f64> = value_raw.parse().ok();

    // OBX-6: Units (code^display)
    let obx6 = get_field(seg, 6);
    let unit_comps = get_components(obx6, seps);
    let unit = unit_comps.first().copied().unwrap_or("").trim();
    let unit = if !unit.is_empty() { Some(unit.to_string()) } else { None };

    // OBX-7: Reference range
    let ref_range_raw = get_field(seg, 7).trim();
    let reference_range = if !ref_range_raw.is_empty() {
        Some(ref_range_raw.to_string())
    } else {
        None
    };

    // OBX-8: Abnormal flag
    let abnormal_raw = get_field(seg, 8).trim();
    let abnormal_flag = match abnormal_raw.to_uppercase().as_str() {
        "N" => Some("normal".to_string()),
        "H" => Some("high".to_string()),
        "L" => Some("low".to_string()),
        "HH" => Some("critical_high".to_string()),
        "LL" => Some("critical_low".to_string()),
        "A" => Some("abnormal".to_string()),
        s if !s.is_empty() => Some(s.to_lowercase()),
        _ => None,
    };

    // OBX-14: Observation date/time
    let obx14 = get_field(seg, 14);
    let obs_date = parse_hl7_date(obx14);

    // Check if this is a known vital sign
    if let Some(loinc) = &loinc_code {
        if let Some(vital_type) = vital_loinc_to_type(loinc) {
            return Some(ObxResult::Vital(VitalRecord {
                vital_type: vital_type.to_string(),
                value,
                unit,
                measurement_date: obs_date,
            }));
        }
    }

    // Default: treat as lab result
    Some(ObxResult::Lab(LabResultRecord {
        loinc_code,
        test_name,
        value,
        unit,
        reference_range,
        result_date: obs_date,
        abnormal_flag,
    }))
}

/// Map a LOINC code to a vital-sign type name, if it matches a known vital.
fn vital_loinc_to_type(code: &str) -> Option<&'static str> {
    VITAL_LOINC_MAP
        .iter()
        .find(|(loinc, _)| *loinc == code)
        .map(|(_, vtype)| *vtype)
}

// ---------------------------------------------------------------------------
// RXA — Pharmacy Administration
// ---------------------------------------------------------------------------

fn parse_rxa(seg: &Segment, seps: &Separators) -> Option<MedicationRecord> {
    // RXA-3: Date/time start of administration
    let rxa3 = get_field(seg, 3);
    let start_date = parse_hl7_date(rxa3);

    // RXA-5: Administered code (code^display^coding_system)
    let rxa5 = get_field(seg, 5);
    let comps = get_components(rxa5, seps);
    let code = comps.first().copied().unwrap_or("").trim();
    let display = comps.get(1).copied().unwrap_or("").trim();

    let drug_name = if !display.is_empty() {
        display.to_string()
    } else if !code.is_empty() {
        code.to_string()
    } else {
        return None;
    };

    // RXA-6: Administered amount
    let amount = get_field(seg, 6).trim();

    // RXA-7: Administered units
    let units = get_field(seg, 7).trim();
    let unit_comps = get_components(units, seps);
    let unit_display = unit_comps.first().copied().unwrap_or("").trim();

    let dose = if !amount.is_empty() {
        if !unit_display.is_empty() {
            Some(format!("{} {}", amount, unit_display))
        } else {
            Some(amount.to_string())
        }
    } else {
        None
    };

    Some(MedicationRecord {
        rxnorm_code: None,
        drug_name,
        dose,
        frequency: None,
        start_date,
        end_date: None,
        status: Some("active".to_string()),
    })
}

// ---------------------------------------------------------------------------
// RXE — Pharmacy Encoded Order
// ---------------------------------------------------------------------------

fn parse_rxe(seg: &Segment, seps: &Separators) -> Option<MedicationRecord> {
    // RXE-2: Give code (code^display^coding_system)
    let rxe2 = get_field(seg, 2);
    let comps = get_components(rxe2, seps);
    let code = comps.first().copied().unwrap_or("").trim();
    let display = comps.get(1).copied().unwrap_or("").trim();

    let drug_name = if !display.is_empty() {
        display.to_string()
    } else if !code.is_empty() {
        code.to_string()
    } else {
        return None;
    };

    // RXE-3: Give amount minimum
    let amount = get_field(seg, 3).trim();

    // RXE-5: Give units
    let units = get_field(seg, 5).trim();
    let unit_comps = get_components(units, seps);
    let unit_display = unit_comps.first().copied().unwrap_or("").trim();

    let dose = if !amount.is_empty() {
        if !unit_display.is_empty() {
            Some(format!("{} {}", amount, unit_display))
        } else {
            Some(amount.to_string())
        }
    } else {
        None
    };

    Some(MedicationRecord {
        rxnorm_code: None,
        drug_name,
        dose,
        frequency: None,
        start_date: None,
        end_date: None,
        status: Some("active".to_string()),
    })
}

// ---------------------------------------------------------------------------
// AL1 — Allergy
// ---------------------------------------------------------------------------

fn parse_al1(seg: &Segment, seps: &Separators) -> Option<AllergyRecord> {
    // AL1-2: Allergy type (DA, FA, EA, LA)
    let al1_2 = get_field(seg, 2).trim().to_uppercase();
    let allergy_type = match al1_2.as_str() {
        "DA" => Some("drug".to_string()),
        "FA" => Some("food".to_string()),
        "EA" => Some("environmental".to_string()),
        "LA" => Some("pollen".to_string()),
        s if !s.is_empty() => Some(s.to_lowercase()),
        _ => None,
    };

    // AL1-3: Allergen code (code^display)
    let al1_3 = get_field(seg, 3);
    let comps = get_components(al1_3, seps);
    let code = comps.first().copied().unwrap_or("").trim();
    let display = comps.get(1).copied().unwrap_or("").trim();

    let allergen = if !display.is_empty() {
        display.to_string()
    } else if !code.is_empty() {
        code.to_string()
    } else {
        return None;
    };

    // AL1-4: Severity (SV, MO, MI, U)
    let al1_4 = get_field(seg, 4).trim().to_uppercase();
    let severity = match al1_4.as_str() {
        "SV" => Some("severe".to_string()),
        "MO" => Some("moderate".to_string()),
        "MI" => Some("mild".to_string()),
        "U" => Some("unknown".to_string()),
        s if !s.is_empty() => Some(s.to_lowercase()),
        _ => None,
    };

    // AL1-5: Allergy reaction description
    let al1_5 = get_field(seg, 5).trim();
    let reaction = if !al1_5.is_empty() {
        Some(al1_5.to_string())
    } else {
        None
    };

    Some(AllergyRecord {
        allergen,
        reaction,
        severity,
        allergy_type,
        onset_date: None,
        status: Some("active".to_string()),
    })
}

// ---------------------------------------------------------------------------
// Date helper
// ---------------------------------------------------------------------------

/// Parse an HL7v2 date/time string.
///
/// Handles "YYYYMMDD", "YYYYMMDDHHMMSS", "YYYYMMDDHHMMSS.SSSS+ZZZZ", and
/// similar formats. Returns `YYYY-MM-DD` or `None`.
fn parse_hl7_date(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.len() >= 8 {
        let year = &trimmed[0..4];
        let month = &trimmed[4..6];
        let day = &trimmed[6..8];
        // Validate that characters are digits
        if year.chars().all(|c| c.is_ascii_digit())
            && month.chars().all(|c| c.is_ascii_digit())
            && day.chars().all(|c| c.is_ascii_digit())
        {
            let y: u32 = year.parse().ok()?;
            let m: u32 = month.parse().ok()?;
            let d: u32 = day.parse().ok()?;
            if y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 {
                return Some(format!("{}-{}-{}", year, month, day));
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Patient merging
// ---------------------------------------------------------------------------

/// Merge clinical data into an existing patient, deduplicating by code/name.
fn merge_clinical_data(
    patient: &mut PatientRecord,
    diagnoses: Vec<DiagnosisRecord>,
    labs: Vec<LabResultRecord>,
    vitals: Vec<VitalRecord>,
    medications: Vec<MedicationRecord>,
    allergies: Vec<AllergyRecord>,
) {
    for dx in diagnoses {
        let already = patient.diagnoses.iter().any(|d| {
            d.description == dx.description
                && d.icd10_code == dx.icd10_code
        });
        if !already {
            patient.diagnoses.push(dx);
        }
    }

    for lab in labs {
        let already = patient.lab_results.iter().any(|l| {
            l.test_name == lab.test_name
                && l.result_date == lab.result_date
                && l.value == lab.value
        });
        if !already {
            patient.lab_results.push(lab);
        }
    }

    for v in vitals {
        let already = patient.vitals.iter().any(|existing| {
            existing.vital_type == v.vital_type
                && existing.measurement_date == v.measurement_date
                && existing.value == v.value
        });
        if !already {
            patient.vitals.push(v);
        }
    }

    for med in medications {
        let already = patient.medications.iter().any(|m| m.drug_name == med.drug_name);
        if !already {
            patient.medications.push(med);
        }
    }

    for al in allergies {
        let already = patient.allergies.iter().any(|a| a.allergen == al.allergen);
        if !already {
            patient.allergies.push(al);
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_message() -> &'static str {
        concat!(
            "MSH|^~\\&|EPIC|HOSPITAL|LAB|HOSPITAL|20240315120000||ADT^A01|MSG001|P|2.5.1\n",
            "PID|||12345^^^MRN^MR~67890^^^SSN^SS||DOE^JOHN^A||19630412|M|||123 Main St^^Anytown^ST^12345||555-1234|||S||12345678|987-65-4321\n",
            "PID|||12345^^^MRN^MR||DOE^JOHN||19630412|M||2106-3^White^CDCREC|||||||||H^Hispanic or Latino^CDCREC\n",
            "DG1|1||I10^Essential hypertension^ICD10|||F\n",
            "DG1|2||E11.9^Type 2 diabetes^ICD10|||W\n",
            "OBX|1|NM|2093-3^Total Cholesterol^LN||198|mg/dL|<200|N|||F|||20240315\n",
            "OBX|2|NM|8480-6^Systolic BP^LN||132|mmHg|90-120|H|||F|||20240315\n",
            "RXA|0|1|20240115||00000-0000-00^Metformin^NDC|500|mg\n",
            "AL1|1|DA|00000-0000-00^Penicillin^NDC|SV|Anaphylaxis\n",
        )
    }

    #[test]
    fn test_extract_separators() {
        let msg = sample_message();
        let seps = extract_separators(msg).unwrap();
        assert_eq!(seps.field, '|');
        assert_eq!(seps.component, '^');
        assert_eq!(seps.repetition, '~');
        assert_eq!(seps._escape, '\\');
        assert_eq!(seps._subcomponent, '&');
    }

    #[test]
    fn test_split_messages_single() {
        let msg = sample_message();
        let messages = split_messages(msg);
        assert_eq!(messages.len(), 1);
    }

    #[test]
    fn test_split_messages_batch() {
        let batch = format!(
            "FHS|^~\\&|SENDER\n\
             BHS|^~\\&|SENDER\n\
             {}\
             MSH|^~\\&|EPIC|HOSPITAL2|LAB|HOSPITAL2|20240316||ADT^A01|MSG002|P|2.5.1\n\
             PID|||99999^^^MRN^MR||SMITH^JANE||19800101|F\n\
             BTS|2\n\
             FTS|1\n",
            sample_message()
        );
        let messages = split_messages(&batch);
        assert_eq!(messages.len(), 2);
    }

    #[test]
    fn test_parse_pid_patient_id() {
        let msg = sample_message();
        let seps = extract_separators(msg).unwrap();
        let segments = parse_segments(msg, &seps);
        let pid = segments.iter().find(|s| s.segment_type == "PID").unwrap();
        let (id, _) = parse_pid(pid, &seps);
        assert_eq!(id, "12345");
    }

    #[test]
    fn test_parse_pid_demographics() {
        let msg = sample_message();
        let seps = extract_separators(msg).unwrap();
        let segments = parse_segments(msg, &seps);
        let pid = segments.iter().find(|s| s.segment_type == "PID").unwrap();
        let (_, demo) = parse_pid(pid, &seps);
        assert_eq!(demo.date_of_birth.as_deref(), Some("1963-04-12"));
        assert_eq!(demo.gender.as_deref(), Some("Male"));
    }

    #[test]
    fn test_parse_dg1() {
        let msg = sample_message();
        let seps = extract_separators(msg).unwrap();
        let segments = parse_segments(msg, &seps);
        let dg1_segs: Vec<_> = segments.iter().filter(|s| s.segment_type == "DG1").collect();
        assert_eq!(dg1_segs.len(), 2);

        let dx = parse_dg1(dg1_segs[0], &seps).unwrap();
        assert_eq!(dx.icd10_code.as_deref(), Some("I10"));
        assert_eq!(dx.description, "Essential hypertension");
        assert_eq!(dx.status.as_deref(), Some("final"));
    }

    #[test]
    fn test_parse_obx_lab() {
        let msg = sample_message();
        let seps = extract_separators(msg).unwrap();
        let segments = parse_segments(msg, &seps);
        let obx_segs: Vec<_> = segments.iter().filter(|s| s.segment_type == "OBX").collect();
        assert_eq!(obx_segs.len(), 2);

        // First OBX: Total Cholesterol (lab)
        match parse_obx(obx_segs[0], &seps).unwrap() {
            ObxResult::Lab(lab) => {
                assert_eq!(lab.test_name, "Total Cholesterol");
                assert_eq!(lab.loinc_code.as_deref(), Some("2093-3"));
                assert_eq!(lab.value, Some(198.0));
                assert_eq!(lab.unit.as_deref(), Some("mg/dL"));
                assert_eq!(lab.reference_range.as_deref(), Some("<200"));
                assert_eq!(lab.abnormal_flag.as_deref(), Some("normal"));
                assert_eq!(lab.result_date.as_deref(), Some("2024-03-15"));
            }
            _ => panic!("Expected lab result"),
        }
    }

    #[test]
    fn test_parse_obx_vital() {
        let msg = sample_message();
        let seps = extract_separators(msg).unwrap();
        let segments = parse_segments(msg, &seps);
        let obx_segs: Vec<_> = segments.iter().filter(|s| s.segment_type == "OBX").collect();

        // Second OBX: Systolic BP (vital)
        match parse_obx(obx_segs[1], &seps).unwrap() {
            ObxResult::Vital(vital) => {
                assert_eq!(vital.vital_type, "bp_systolic");
                assert_eq!(vital.value, Some(132.0));
                assert_eq!(vital.unit.as_deref(), Some("mmHg"));
            }
            _ => panic!("Expected vital sign"),
        }
    }

    #[test]
    fn test_parse_rxa() {
        let msg = sample_message();
        let seps = extract_separators(msg).unwrap();
        let segments = parse_segments(msg, &seps);
        let rxa = segments.iter().find(|s| s.segment_type == "RXA").unwrap();
        let med = parse_rxa(rxa, &seps).unwrap();
        assert_eq!(med.drug_name, "Metformin");
        assert_eq!(med.dose.as_deref(), Some("500 mg"));
        assert_eq!(med.start_date.as_deref(), Some("2024-01-15"));
    }

    #[test]
    fn test_parse_al1() {
        let msg = sample_message();
        let seps = extract_separators(msg).unwrap();
        let segments = parse_segments(msg, &seps);
        let al1 = segments.iter().find(|s| s.segment_type == "AL1").unwrap();
        let allergy = parse_al1(al1, &seps).unwrap();
        assert_eq!(allergy.allergen, "Penicillin");
        assert_eq!(allergy.allergy_type.as_deref(), Some("drug"));
        assert_eq!(allergy.severity.as_deref(), Some("severe"));
        assert_eq!(allergy.reaction.as_deref(), Some("Anaphylaxis"));
    }

    #[test]
    fn test_parse_hl7_date() {
        assert_eq!(parse_hl7_date("20240315"), Some("2024-03-15".into()));
        assert_eq!(parse_hl7_date("20240315120000"), Some("2024-03-15".into()));
        assert_eq!(parse_hl7_date("20240315120000.1234+0500"), Some("2024-03-15".into()));
        assert_eq!(parse_hl7_date(""), None);
        assert_eq!(parse_hl7_date("2024"), None);
        assert_eq!(parse_hl7_date("bad date"), None);
    }

    #[test]
    fn test_patient_merging() {
        // Two messages for the same patient should merge
        let batch = concat!(
            "MSH|^~\\&|EPIC|HOSP|LAB|HOSP|20240315||ADT^A01|MSG001|P|2.5.1\n",
            "PID|||12345^^^MRN^MR||DOE^JOHN||19630412|M\n",
            "DG1|1||I10^Essential hypertension^ICD10|||F\n",
            "MSH|^~\\&|EPIC|HOSP|LAB|HOSP|20240316||ADT^A01|MSG002|P|2.5.1\n",
            "PID|||12345^^^MRN^MR||DOE^JOHN||19630412|M\n",
            "DG1|1||E11.9^Type 2 diabetes^ICD10|||W\n",
            "OBX|1|NM|2093-3^Total Cholesterol^LN||198|mg/dL|<200|N|||F|||20240316\n",
        );
        let messages = split_messages(batch);
        assert_eq!(messages.len(), 2);

        // Write to temp file and parse
        let dir = std::env::temp_dir();
        let file = dir.join("test_hl7_merge.hl7");
        std::fs::write(&file, batch).unwrap();
        let patients = parse_hl7_file(&file).unwrap();
        let _ = std::fs::remove_file(&file);

        assert_eq!(patients.len(), 1);
        assert_eq!(patients[0].site_patient_id, "12345");
        assert_eq!(patients[0].diagnoses.len(), 2);
        assert_eq!(patients[0].lab_results.len(), 1);
    }

    #[test]
    fn test_rxe_parsing() {
        let msg = concat!(
            "MSH|^~\\&|EPIC|HOSP|PHARM|HOSP|20240315||RDE^O11|MSG003|P|2.5.1\n",
            "PID|||55555^^^MRN^MR||SMITH^JANE||19800101|F\n",
            "RXE||00000-0000-00^Lisinopril^NDC|10||mg\n",
        );
        let dir = std::env::temp_dir();
        let file = dir.join("test_hl7_rxe.hl7");
        std::fs::write(&file, msg).unwrap();
        let patients = parse_hl7_file(&file).unwrap();
        let _ = std::fs::remove_file(&file);

        assert_eq!(patients.len(), 1);
        assert_eq!(patients[0].medications.len(), 1);
        assert_eq!(patients[0].medications[0].drug_name, "Lisinopril");
        assert_eq!(patients[0].medications[0].dose.as_deref(), Some("10 mg"));
    }

    #[test]
    fn test_empty_file() {
        let dir = std::env::temp_dir();
        let file = dir.join("test_hl7_empty.hl7");
        std::fs::write(&file, "").unwrap();
        let patients = parse_hl7_file(&file).unwrap();
        let _ = std::fs::remove_file(&file);
        assert!(patients.is_empty());
    }
}
