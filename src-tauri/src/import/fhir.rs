//! FHIR R4 JSON Bundle parser for patient data import.
//!
//! Supports:
//! - FHIR R4 Bundle (JSON object with `resourceType: "Bundle"`, entries in `entry[].resource`)
//! - NDJSON (one resource per line)
//! - Single standalone resources
//!
//! Extracts Patient demographics and associated clinical data (Condition, Observation,
//! MedicationRequest, Procedure, AllergyIntolerance) into `PatientRecord` structs.

use std::collections::HashMap;
use std::path::Path;

use serde_json::Value;

use super::{
    AllergyRecord, DiagnosisRecord, ImportError, LabResultRecord, MedicationRecord,
    PatientRecord, ProcedureRecord, VitalRecord, normalize_date,
};

/// Main entry point: parse a FHIR R4 file into patient records.
///
/// Handles three input shapes:
/// 1. A FHIR Bundle JSON (`resourceType: "Bundle"`)
/// 2. NDJSON (one JSON resource per line)
/// 3. A single standalone FHIR resource
pub fn parse_fhir_bundle(path: &Path) -> Result<Vec<PatientRecord>, ImportError> {
    let content = std::fs::read_to_string(path)?;
    let content = content.trim();

    if content.is_empty() {
        return Err(ImportError::FhirError("File is empty".to_string()));
    }

    let resources = extract_resources(content)?;

    if resources.is_empty() {
        return Err(ImportError::FhirError(
            "No FHIR resources found in file".to_string(),
        ));
    }

    build_patient_records(&resources)
}

/// Generate a preview of a FHIR file for the import UI.
///
/// Returns (headers, sample_rows, total_patient_count) where headers are fixed
/// column names and sample_rows show the first 10 patients with counts for
/// clinical data categories.
pub fn generate_fhir_preview(
    path: &Path,
) -> Result<(Vec<String>, Vec<Vec<String>>, usize), ImportError> {
    let patients = parse_fhir_bundle(path)?;
    let total = patients.len();

    let headers = vec![
        "Patient ID".to_string(),
        "DOB".to_string(),
        "Gender".to_string(),
        "Race".to_string(),
        "Diagnoses".to_string(),
        "Medications".to_string(),
        "Labs".to_string(),
        "Vitals".to_string(),
        "Allergies".to_string(),
    ];

    let sample_rows: Vec<Vec<String>> = patients
        .iter()
        .take(10)
        .map(|p| {
            vec![
                p.site_patient_id.clone(),
                p.date_of_birth.clone().unwrap_or_default(),
                p.gender.clone().unwrap_or_default(),
                p.race.clone().unwrap_or_default(),
                p.diagnoses.len().to_string(),
                p.medications.len().to_string(),
                p.lab_results.len().to_string(),
                p.vitals.len().to_string(),
                p.allergies.len().to_string(),
            ]
        })
        .collect();

    Ok((headers, sample_rows, total))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Extract a flat list of FHIR resource `Value`s from the file content.
fn extract_resources(content: &str) -> Result<Vec<Value>, ImportError> {
    // Try parsing as a single JSON value first (Bundle or standalone resource).
    if let Ok(val) = serde_json::from_str::<Value>(content) {
        if val.get("resourceType").is_some() {
            if val["resourceType"].as_str() == Some("Bundle") {
                // FHIR Bundle — pull resources from entry[].resource
                return Ok(extract_bundle_entries(&val));
            }
            // Single standalone resource
            return Ok(vec![val]);
        }
        return Err(ImportError::FhirError(
            "JSON object missing 'resourceType' field — not a valid FHIR resource".to_string(),
        ));
    }

    // Not valid single JSON — try NDJSON (one resource per line).
    let mut resources = Vec::new();
    for (line_no, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(line) {
            Ok(val) if val.get("resourceType").is_some() => {
                if val["resourceType"].as_str() == Some("Bundle") {
                    resources.extend(extract_bundle_entries(&val));
                } else {
                    resources.push(val);
                }
            }
            Ok(_) => {
                tracing::warn!(line = line_no + 1, "Skipping NDJSON line without resourceType");
            }
            Err(e) => {
                tracing::warn!(
                    line = line_no + 1,
                    error = %e,
                    "Skipping unparseable NDJSON line"
                );
            }
        }
    }

    if resources.is_empty() {
        return Err(ImportError::FhirError(
            "No valid FHIR resources found in NDJSON file".to_string(),
        ));
    }
    Ok(resources)
}

/// Pull `entry[].resource` values from a FHIR Bundle.
fn extract_bundle_entries(bundle: &Value) -> Vec<Value> {
    bundle["entry"]
        .as_array()
        .map(|entries| {
            entries
                .iter()
                .filter_map(|e| e.get("resource").cloned())
                .collect()
        })
        .unwrap_or_default()
}

/// Two-pass algorithm: collect Patient resources, then attach clinical data.
fn build_patient_records(resources: &[Value]) -> Result<Vec<PatientRecord>, ImportError> {
    // Pass 1: index Patient resources by their site_patient_id (which may differ
    // from the FHIR resource id when an MR identifier is present).
    let mut patient_map: HashMap<String, PatientRecord> = HashMap::new();
    let mut patient_order: Vec<String> = Vec::new();
    // Map from FHIR resource id → site_patient_id so subject references resolve.
    let mut fhir_id_to_key: HashMap<String, String> = HashMap::new();

    for res in resources {
        if res["resourceType"].as_str() == Some("Patient") {
            let record = parse_patient_resource(res);
            let key = record.site_patient_id.clone();
            // Also record the FHIR resource id for reference resolution
            if let Some(fhir_id) = res["id"].as_str() {
                fhir_id_to_key.insert(fhir_id.to_string(), key.clone());
            }
            if !patient_map.contains_key(&key) {
                patient_order.push(key.clone());
            }
            patient_map.insert(key, record);
        }
    }

    // If there are no Patient resources but there are clinical resources, create
    // a placeholder patient from subject references.
    if patient_map.is_empty() {
        for res in resources {
            if let Some(patient_ref) = extract_patient_ref(res) {
                if !patient_map.contains_key(&patient_ref) {
                    patient_order.push(patient_ref.clone());
                    patient_map.insert(
                        patient_ref.clone(),
                        PatientRecord {
                            site_patient_id: patient_ref,
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
                        },
                    );
                }
            }
        }
    }

    if patient_map.is_empty() {
        return Err(ImportError::FhirError(
            "No Patient resources or subject references found".to_string(),
        ));
    }

    // Pass 2: attach clinical data to the appropriate patient.
    for res in resources {
        let rt = res["resourceType"].as_str().unwrap_or("");
        let patient_ref = match extract_patient_ref(res) {
            Some(r) => r,
            None => continue,
        };

        // Resolve: the subject reference uses the FHIR id, which may differ from
        // the site_patient_id key in patient_map.
        let resolved_key = fhir_id_to_key
            .get(&patient_ref)
            .cloned()
            .unwrap_or_else(|| patient_ref.clone());

        let patient = match patient_map.get_mut(&resolved_key) {
            Some(p) => p,
            None => continue,
        };

        match rt {
            "Condition" => {
                if let Some(dx) = parse_condition(res) {
                    patient.diagnoses.push(dx);
                }
            }
            "Observation" => {
                parse_observation(res, patient);
            }
            "MedicationRequest" => {
                if let Some(med) = parse_medication_request(res) {
                    patient.medications.push(med);
                }
            }
            "Procedure" => {
                if let Some(proc) = parse_procedure(res) {
                    patient.procedures.push(proc);
                }
            }
            "AllergyIntolerance" => {
                if let Some(allergy) = parse_allergy_intolerance(res) {
                    patient.allergies.push(allergy);
                }
            }
            _ => {
                // Unsupported resource type — skip silently.
            }
        }
    }

    // Return patients in stable insertion order.
    Ok(patient_order
        .into_iter()
        .filter_map(|id| patient_map.remove(&id))
        .collect())
}

// ---------------------------------------------------------------------------
// Resource parsers
// ---------------------------------------------------------------------------

/// Parse a FHIR Patient resource into a `PatientRecord`.
fn parse_patient_resource(res: &Value) -> PatientRecord {
    let site_patient_id = extract_patient_id(res);
    let date_of_birth = res["birthDate"]
        .as_str()
        .and_then(|d| normalize_date(d));
    let gender = res["gender"].as_str().map(|g| g.to_string());
    let race = extract_us_core_extension(res, "race");
    let ethnicity = extract_us_core_extension(res, "ethnicity");

    PatientRecord {
        site_patient_id,
        date_of_birth,
        gender,
        race,
        ethnicity,
        insurance_type: None,
        diagnoses: Vec::new(),
        medications: Vec::new(),
        lab_results: Vec::new(),
        vitals: Vec::new(),
        procedures: Vec::new(),
        allergies: Vec::new(),
    }
}

/// Extract a usable patient ID from identifiers or the resource id.
///
/// Prefers identifier with type code "MR" (Medical Record Number), falls back
/// to the first identifier value, then to the resource `id` field.
fn extract_patient_id(res: &Value) -> String {
    if let Some(identifiers) = res["identifier"].as_array() {
        // Prefer MR type
        for ident in identifiers {
            let type_code = ident["type"]["coding"]
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|c| c["code"].as_str());
            if type_code == Some("MR") {
                if let Some(val) = ident["value"].as_str() {
                    return val.to_string();
                }
            }
        }
        // Fall back to first identifier with a value
        for ident in identifiers {
            if let Some(val) = ident["value"].as_str() {
                return val.to_string();
            }
        }
    }
    // Last resort: resource id
    res["id"]
        .as_str()
        .unwrap_or("unknown")
        .to_string()
}

/// Extract US Core race or ethnicity extension text.
fn extract_us_core_extension(res: &Value, kind: &str) -> Option<String> {
    let url_fragment = match kind {
        "race" => "us-core-race",
        "ethnicity" => "us-core-ethnicity",
        _ => return None,
    };

    res["extension"]
        .as_array()?
        .iter()
        .find(|ext| {
            ext["url"]
                .as_str()
                .map(|u| u.contains(url_fragment))
                .unwrap_or(false)
        })
        .and_then(|ext| {
            // Look for the text sub-extension first
            ext["extension"]
                .as_array()
                .and_then(|sub_exts| {
                    sub_exts
                        .iter()
                        .find(|se| se["url"].as_str() == Some("text"))
                        .and_then(|se| se["valueString"].as_str().map(|s| s.to_string()))
                })
                .or_else(|| {
                    // Fall back to ombCategory display
                    ext["extension"]
                        .as_array()
                        .and_then(|sub_exts| {
                            sub_exts
                                .iter()
                                .find(|se| se["url"].as_str() == Some("ombCategory"))
                                .and_then(|se| {
                                    se["valueCoding"]["display"]
                                        .as_str()
                                        .map(|s| s.to_string())
                                })
                        })
                })
        })
}

/// Extract the patient reference string from `subject.reference`,
/// `patient.reference`, or similar paths, returning just the ID portion.
fn extract_patient_ref(res: &Value) -> Option<String> {
    let reference = res["subject"]["reference"]
        .as_str()
        .or_else(|| res["patient"]["reference"].as_str())?;

    // "Patient/abc123" → "abc123"
    Some(
        reference
            .strip_prefix("Patient/")
            .unwrap_or(reference)
            .to_string(),
    )
}

/// Parse a FHIR Condition resource into a `DiagnosisRecord`.
fn parse_condition(res: &Value) -> Option<DiagnosisRecord> {
    let codings = res["code"]["coding"].as_array();

    // Try to find ICD-10 code
    let icd10_code = codings.and_then(|arr| {
        arr.iter()
            .find(|c| {
                c["system"]
                    .as_str()
                    .map(|s| s.contains("icd-10") || s.contains("icd10"))
                    .unwrap_or(false)
            })
            .and_then(|c| c["code"].as_str().map(|s| s.to_string()))
    });

    // Description: prefer code.text, then display from first coding
    let description = res["code"]["text"]
        .as_str()
        .map(|s| s.to_string())
        .or_else(|| {
            codings
                .and_then(|arr| arr.first())
                .and_then(|c| c["display"].as_str().map(|s| s.to_string()))
        })
        .unwrap_or_else(|| {
            icd10_code
                .clone()
                .unwrap_or_else(|| "Unknown condition".to_string())
        });

    let onset_date = res["onsetDateTime"]
        .as_str()
        .and_then(|d| normalize_date(d));

    let status = res["clinicalStatus"]["coding"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|c| c["code"].as_str().map(|s| s.to_string()));

    Some(DiagnosisRecord {
        icd10_code,
        description,
        onset_date,
        status,
    })
}

/// Known LOINC codes for vital signs, mapped to internal vital_type names.
const VITAL_LOINC_MAP: &[(&str, &str)] = &[
    ("8480-6", "bp_systolic"),
    ("8462-4", "bp_diastolic"),
    ("8867-4", "pulse"),
    ("29463-7", "weight"),
    ("8302-2", "height"),
    ("39156-5", "bmi"),
    ("8310-5", "temperature"),
    ("9279-1", "respiratory_rate"),
    ("2708-6", "spo2"),
];

/// Parse a FHIR Observation, routing to either lab results or vitals based on category.
fn parse_observation(res: &Value, patient: &mut PatientRecord) {
    let category = extract_observation_category(res);

    match category.as_deref() {
        Some("vital-signs") => {
            parse_vital_observation(res, patient);
        }
        Some("laboratory") => {
            if let Some(lab) = parse_lab_observation(res) {
                patient.lab_results.push(lab);
            }
        }
        _ => {
            // Try to infer from LOINC code: if it matches a known vital, treat as vital.
            let loinc = extract_loinc_code(res);
            if loinc
                .as_ref()
                .map(|code| VITAL_LOINC_MAP.iter().any(|(lc, _)| lc == code))
                .unwrap_or(false)
            {
                parse_vital_observation(res, patient);
            } else {
                // Default to lab
                if let Some(lab) = parse_lab_observation(res) {
                    patient.lab_results.push(lab);
                }
            }
        }
    }
}

/// Extract the first category code from an Observation.
fn extract_observation_category(res: &Value) -> Option<String> {
    res["category"]
        .as_array()?
        .iter()
        .filter_map(|cat| {
            cat["coding"]
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|c| c["code"].as_str().map(|s| s.to_string()))
        })
        .next()
}

/// Extract LOINC code from an Observation's code.coding.
fn extract_loinc_code(res: &Value) -> Option<String> {
    res["code"]["coding"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|c| {
                    c["system"]
                        .as_str()
                        .map(|s| s.contains("loinc"))
                        .unwrap_or(false)
                })
                .and_then(|c| c["code"].as_str().map(|s| s.to_string()))
        })
}

/// Parse a vital-signs Observation. Handles both simple valueQuantity and
/// component-based observations (e.g., blood pressure with systolic/diastolic).
fn parse_vital_observation(res: &Value, patient: &mut PatientRecord) {
    let measurement_date = extract_observation_date(res);

    // Check for component-based observation (blood pressure)
    if let Some(components) = res["component"].as_array() {
        for comp in components {
            let comp_loinc = comp["code"]["coding"]
                .as_array()
                .and_then(|arr| {
                    arr.iter()
                        .find(|c| {
                            c["system"]
                                .as_str()
                                .map(|s| s.contains("loinc"))
                                .unwrap_or(false)
                        })
                        .and_then(|c| c["code"].as_str())
                });

            if let Some(loinc_code) = comp_loinc {
                let vital_type = VITAL_LOINC_MAP
                    .iter()
                    .find(|(lc, _)| *lc == loinc_code)
                    .map(|(_, vt)| vt.to_string());

                if let Some(vt) = vital_type {
                    let value = comp["valueQuantity"]["value"].as_f64();
                    let unit = comp["valueQuantity"]["unit"]
                        .as_str()
                        .map(|s| s.to_string());

                    patient.vitals.push(VitalRecord {
                        vital_type: vt,
                        value,
                        unit,
                        measurement_date: measurement_date.clone(),
                    });
                }
            }
        }
        return;
    }

    // Simple valueQuantity vital
    let loinc = extract_loinc_code(res);
    let vital_type = loinc
        .as_ref()
        .and_then(|code| {
            VITAL_LOINC_MAP
                .iter()
                .find(|(lc, _)| lc == code)
                .map(|(_, vt)| vt.to_string())
        })
        .unwrap_or_else(|| {
            // Fall back to code display text
            res["code"]["text"]
                .as_str()
                .or_else(|| {
                    res["code"]["coding"]
                        .as_array()
                        .and_then(|arr| arr.first())
                        .and_then(|c| c["display"].as_str())
                })
                .unwrap_or("unknown_vital")
                .to_lowercase()
                .replace(' ', "_")
        });

    let value = res["valueQuantity"]["value"].as_f64();
    let unit = res["valueQuantity"]["unit"]
        .as_str()
        .map(|s| s.to_string());

    patient.vitals.push(VitalRecord {
        vital_type,
        value,
        unit,
        measurement_date,
    });
}

/// Parse a laboratory Observation into a `LabResultRecord`.
fn parse_lab_observation(res: &Value) -> Option<LabResultRecord> {
    let loinc_code = extract_loinc_code(res);

    let test_name = res["code"]["text"]
        .as_str()
        .map(|s| s.to_string())
        .or_else(|| {
            res["code"]["coding"]
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|c| c["display"].as_str().map(|s| s.to_string()))
        })
        .unwrap_or_else(|| {
            loinc_code
                .clone()
                .unwrap_or_else(|| "Unknown test".to_string())
        });

    let value = res["valueQuantity"]["value"].as_f64();
    let unit = res["valueQuantity"]["unit"]
        .as_str()
        .map(|s| s.to_string());

    let reference_range = res["referenceRange"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|rr| {
            let low = rr["low"]["value"].as_f64();
            let high = rr["high"]["value"].as_f64();
            let range_unit = rr["low"]["unit"]
                .as_str()
                .or_else(|| rr["high"]["unit"].as_str())
                .unwrap_or("");
            match (low, high) {
                (Some(l), Some(h)) => Some(format!("{}-{} {}", l, h, range_unit).trim().to_string()),
                (Some(l), None) => Some(format!(">={} {}", l, range_unit).trim().to_string()),
                (None, Some(h)) => Some(format!("<={} {}", h, range_unit).trim().to_string()),
                _ => rr["text"].as_str().map(|s| s.to_string()),
            }
        });

    let result_date = extract_observation_date(res);

    let abnormal_flag = res["interpretation"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|interp| {
            interp["coding"]
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|c| c["code"].as_str().map(|s| s.to_string()))
        });

    Some(LabResultRecord {
        loinc_code,
        test_name,
        value,
        unit,
        reference_range,
        result_date,
        abnormal_flag,
    })
}

/// Extract effective date from an Observation (effectiveDateTime or issued).
fn extract_observation_date(res: &Value) -> Option<String> {
    res["effectiveDateTime"]
        .as_str()
        .or_else(|| res["effectivePeriod"]["start"].as_str())
        .or_else(|| res["issued"].as_str())
        .and_then(|d| normalize_date(d))
}

/// Parse a FHIR MedicationRequest into a `MedicationRecord`.
fn parse_medication_request(res: &Value) -> Option<MedicationRecord> {
    let codings = res["medicationCodeableConcept"]["coding"].as_array();

    let drug_name = res["medicationCodeableConcept"]["text"]
        .as_str()
        .map(|s| s.to_string())
        .or_else(|| {
            codings
                .and_then(|arr| arr.first())
                .and_then(|c| c["display"].as_str().map(|s| s.to_string()))
        })
        .unwrap_or_else(|| "Unknown medication".to_string());

    let rxnorm_code = codings.and_then(|arr| {
        arr.iter()
            .find(|c| {
                c["system"]
                    .as_str()
                    .map(|s| s.contains("rxnorm"))
                    .unwrap_or(false)
            })
            .and_then(|c| c["code"].as_str().map(|s| s.to_string()))
    });

    // Extract dose and frequency from dosageInstruction
    let dosage = res["dosageInstruction"]
        .as_array()
        .and_then(|arr| arr.first());

    let dose = dosage.and_then(|d| {
        let dose_val = d["doseAndRate"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|dr| {
                let val = dr["doseQuantity"]["value"].as_f64()?;
                let unit = dr["doseQuantity"]["unit"].as_str().unwrap_or("");
                Some(format!("{} {}", val, unit).trim().to_string())
            });
        dose_val.or_else(|| d["text"].as_str().map(|s| s.to_string()))
    });

    let frequency = dosage.and_then(|d| {
        d["timing"]["code"]["text"]
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| {
                let repeat = &d["timing"]["repeat"];
                let freq = repeat["frequency"].as_u64()?;
                let period = repeat["period"].as_f64()?;
                let period_unit = repeat["periodUnit"].as_str().unwrap_or("d");
                Some(format!("{} per {} {}", freq, period, period_unit))
            })
    });

    let status = res["status"].as_str().map(|s| s.to_string());
    let start_date = res["authoredOn"]
        .as_str()
        .and_then(|d| normalize_date(d));

    Some(MedicationRecord {
        rxnorm_code,
        drug_name,
        dose,
        frequency,
        start_date,
        end_date: None,
        status,
    })
}

/// Parse a FHIR Procedure resource into a `ProcedureRecord`.
fn parse_procedure(res: &Value) -> Option<ProcedureRecord> {
    let codings = res["code"]["coding"].as_array();

    let cpt_code = codings.and_then(|arr| {
        arr.iter()
            .find(|c| {
                c["system"]
                    .as_str()
                    .map(|s| s.contains("cpt") || s.contains("hcpcs"))
                    .unwrap_or(false)
            })
            .and_then(|c| c["code"].as_str().map(|s| s.to_string()))
    });

    let description = res["code"]["text"]
        .as_str()
        .map(|s| s.to_string())
        .or_else(|| {
            codings
                .and_then(|arr| arr.first())
                .and_then(|c| c["display"].as_str().map(|s| s.to_string()))
        })
        .unwrap_or_else(|| {
            cpt_code
                .clone()
                .unwrap_or_else(|| "Unknown procedure".to_string())
        });

    let procedure_date = res["performedDateTime"]
        .as_str()
        .or_else(|| res["performedPeriod"]["start"].as_str())
        .and_then(|d| normalize_date(d));

    let status = res["status"].as_str().map(|s| s.to_string());

    Some(ProcedureRecord {
        cpt_code,
        description,
        procedure_date,
        status,
    })
}

/// Parse a FHIR AllergyIntolerance resource into an `AllergyRecord`.
fn parse_allergy_intolerance(res: &Value) -> Option<AllergyRecord> {
    let allergen = res["code"]["text"]
        .as_str()
        .map(|s| s.to_string())
        .or_else(|| {
            res["code"]["coding"]
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|c| c["display"].as_str().map(|s| s.to_string()))
        })
        .unwrap_or_else(|| "Unknown allergen".to_string());

    let reaction = res["reaction"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|r| {
            r["manifestation"]
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|m| {
                    m["coding"]
                        .as_array()
                        .and_then(|arr| arr.first())
                        .and_then(|c| c["display"].as_str().map(|s| s.to_string()))
                        .or_else(|| m["text"].as_str().map(|s| s.to_string()))
                })
        });

    let severity = res["reaction"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|r| r["severity"].as_str().map(|s| s.to_string()));

    // FHIR category maps to allergy_type: "food", "medication", "environment", "biologic"
    let allergy_type = res["category"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|c| c.as_str().map(|s| {
            match s {
                "medication" => "drug".to_string(),
                "environment" => "environmental".to_string(),
                other => other.to_string(),
            }
        }));

    let status = res["clinicalStatus"]["coding"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|c| c["code"].as_str().map(|s| s.to_string()));

    let onset_date = res["onsetDateTime"]
        .as_str()
        .and_then(|d| normalize_date(d));

    Some(AllergyRecord {
        allergen,
        reaction,
        severity,
        allergy_type,
        onset_date,
        status,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_bundle(entries: Vec<Value>) -> String {
        let bundle = serde_json::json!({
            "resourceType": "Bundle",
            "type": "collection",
            "entry": entries.into_iter().map(|r| serde_json::json!({"resource": r})).collect::<Vec<_>>()
        });
        serde_json::to_string(&bundle).unwrap()
    }

    fn sample_patient() -> Value {
        serde_json::json!({
            "resourceType": "Patient",
            "id": "pt-001",
            "identifier": [
                {
                    "type": {"coding": [{"code": "MR"}]},
                    "value": "MRN-12345"
                }
            ],
            "birthDate": "1965-04-12",
            "gender": "female",
            "extension": [
                {
                    "url": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
                    "extension": [
                        {"url": "ombCategory", "valueCoding": {"display": "White"}},
                        {"url": "text", "valueString": "White"}
                    ]
                },
                {
                    "url": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity",
                    "extension": [
                        {"url": "text", "valueString": "Not Hispanic or Latino"}
                    ]
                }
            ]
        })
    }

    fn sample_condition() -> Value {
        serde_json::json!({
            "resourceType": "Condition",
            "subject": {"reference": "Patient/pt-001"},
            "code": {
                "coding": [
                    {
                        "system": "http://hl7.org/fhir/sid/icd-10-cm",
                        "code": "E11.9",
                        "display": "Type 2 diabetes mellitus without complications"
                    }
                ],
                "text": "Type 2 diabetes"
            },
            "onsetDateTime": "2020-06-15",
            "clinicalStatus": {
                "coding": [{"code": "active"}]
            }
        })
    }

    fn sample_lab_observation() -> Value {
        serde_json::json!({
            "resourceType": "Observation",
            "subject": {"reference": "Patient/pt-001"},
            "category": [
                {"coding": [{"code": "laboratory"}]}
            ],
            "code": {
                "coding": [
                    {"system": "http://loinc.org", "code": "4548-4", "display": "Hemoglobin A1c"}
                ],
                "text": "HbA1c"
            },
            "valueQuantity": {"value": 7.2, "unit": "%"},
            "referenceRange": [
                {"low": {"value": 4.0, "unit": "%"}, "high": {"value": 5.6, "unit": "%"}}
            ],
            "effectiveDateTime": "2024-01-15T10:30:00Z",
            "interpretation": [
                {"coding": [{"code": "H"}]}
            ]
        })
    }

    fn sample_vital_observation() -> Value {
        serde_json::json!({
            "resourceType": "Observation",
            "subject": {"reference": "Patient/pt-001"},
            "category": [
                {"coding": [{"code": "vital-signs"}]}
            ],
            "code": {
                "coding": [
                    {"system": "http://loinc.org", "code": "29463-7", "display": "Body Weight"}
                ]
            },
            "valueQuantity": {"value": 82.5, "unit": "kg"},
            "effectiveDateTime": "2024-01-15"
        })
    }

    fn sample_medication_request() -> Value {
        serde_json::json!({
            "resourceType": "MedicationRequest",
            "subject": {"reference": "Patient/pt-001"},
            "medicationCodeableConcept": {
                "coding": [
                    {"system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "860975", "display": "Metformin 500 MG"}
                ],
                "text": "Metformin 500mg"
            },
            "dosageInstruction": [
                {
                    "doseAndRate": [{"doseQuantity": {"value": 500.0, "unit": "mg"}}],
                    "timing": {"code": {"text": "twice daily"}}
                }
            ],
            "status": "active",
            "authoredOn": "2020-07-01"
        })
    }

    fn sample_procedure() -> Value {
        serde_json::json!({
            "resourceType": "Procedure",
            "subject": {"reference": "Patient/pt-001"},
            "code": {
                "coding": [
                    {"system": "http://www.ama-assn.org/go/cpt", "code": "99213", "display": "Office visit, established patient"}
                ],
                "text": "Office visit"
            },
            "performedDateTime": "2024-01-15",
            "status": "completed"
        })
    }

    fn sample_allergy() -> Value {
        serde_json::json!({
            "resourceType": "AllergyIntolerance",
            "patient": {"reference": "Patient/pt-001"},
            "code": {
                "coding": [{"display": "Penicillin"}],
                "text": "Penicillin"
            },
            "category": ["medication"],
            "reaction": [
                {
                    "manifestation": [{"coding": [{"display": "Rash"}]}],
                    "severity": "moderate"
                }
            ],
            "clinicalStatus": {
                "coding": [{"code": "active"}]
            }
        })
    }

    #[test]
    fn test_parse_bundle_full() {
        let content = make_bundle(vec![
            sample_patient(),
            sample_condition(),
            sample_lab_observation(),
            sample_vital_observation(),
            sample_medication_request(),
            sample_procedure(),
            sample_allergy(),
        ]);

        let resources = extract_resources(&content).unwrap();
        let patients = build_patient_records(&resources).unwrap();

        assert_eq!(patients.len(), 1);
        let p = &patients[0];
        assert_eq!(p.site_patient_id, "MRN-12345");
        assert_eq!(p.date_of_birth.as_deref(), Some("1965-04-12"));
        assert_eq!(p.gender.as_deref(), Some("female"));
        assert_eq!(p.race.as_deref(), Some("White"));
        assert_eq!(p.ethnicity.as_deref(), Some("Not Hispanic or Latino"));

        assert_eq!(p.diagnoses.len(), 1);
        assert_eq!(p.diagnoses[0].icd10_code.as_deref(), Some("E11.9"));
        assert_eq!(p.diagnoses[0].description, "Type 2 diabetes");

        assert_eq!(p.lab_results.len(), 1);
        assert_eq!(p.lab_results[0].test_name, "HbA1c");
        assert_eq!(p.lab_results[0].value, Some(7.2));
        assert_eq!(p.lab_results[0].abnormal_flag.as_deref(), Some("H"));

        assert_eq!(p.vitals.len(), 1);
        assert_eq!(p.vitals[0].vital_type, "weight");
        assert_eq!(p.vitals[0].value, Some(82.5));

        assert_eq!(p.medications.len(), 1);
        assert_eq!(p.medications[0].drug_name, "Metformin 500mg");
        assert_eq!(p.medications[0].rxnorm_code.as_deref(), Some("860975"));

        assert_eq!(p.procedures.len(), 1);
        assert_eq!(p.procedures[0].cpt_code.as_deref(), Some("99213"));

        assert_eq!(p.allergies.len(), 1);
        assert_eq!(p.allergies[0].allergen, "Penicillin");
        assert_eq!(p.allergies[0].allergy_type.as_deref(), Some("drug"));
        assert_eq!(p.allergies[0].severity.as_deref(), Some("moderate"));
    }

    #[test]
    fn test_parse_ndjson() {
        let lines = vec![
            serde_json::to_string(&sample_patient()).unwrap(),
            serde_json::to_string(&sample_condition()).unwrap(),
        ];
        let content = lines.join("\n");

        let resources = extract_resources(&content).unwrap();
        let patients = build_patient_records(&resources).unwrap();

        assert_eq!(patients.len(), 1);
        assert_eq!(patients[0].diagnoses.len(), 1);
    }

    #[test]
    fn test_parse_standalone_patient() {
        let content = serde_json::to_string(&sample_patient()).unwrap();
        let resources = extract_resources(&content).unwrap();
        let patients = build_patient_records(&resources).unwrap();

        assert_eq!(patients.len(), 1);
        assert_eq!(patients[0].site_patient_id, "MRN-12345");
    }

    #[test]
    fn test_patient_id_fallback() {
        let patient = serde_json::json!({
            "resourceType": "Patient",
            "id": "fallback-id",
            "birthDate": "1990-01-01"
        });
        let content = serde_json::to_string(&patient).unwrap();
        let resources = extract_resources(&content).unwrap();
        let patients = build_patient_records(&resources).unwrap();

        assert_eq!(patients[0].site_patient_id, "fallback-id");
    }

    #[test]
    fn test_blood_pressure_components() {
        let bp = serde_json::json!({
            "resourceType": "Observation",
            "subject": {"reference": "Patient/pt-001"},
            "category": [{"coding": [{"code": "vital-signs"}]}],
            "code": {"coding": [{"system": "http://loinc.org", "code": "85354-9", "display": "Blood pressure"}]},
            "component": [
                {
                    "code": {"coding": [{"system": "http://loinc.org", "code": "8480-6", "display": "Systolic"}]},
                    "valueQuantity": {"value": 120.0, "unit": "mmHg"}
                },
                {
                    "code": {"coding": [{"system": "http://loinc.org", "code": "8462-4", "display": "Diastolic"}]},
                    "valueQuantity": {"value": 80.0, "unit": "mmHg"}
                }
            ],
            "effectiveDateTime": "2024-03-01"
        });

        let content = make_bundle(vec![sample_patient(), bp]);
        let resources = extract_resources(&content).unwrap();
        let patients = build_patient_records(&resources).unwrap();

        assert_eq!(patients[0].vitals.len(), 2);
        let systolic = patients[0].vitals.iter().find(|v| v.vital_type == "bp_systolic").unwrap();
        assert_eq!(systolic.value, Some(120.0));
        let diastolic = patients[0].vitals.iter().find(|v| v.vital_type == "bp_diastolic").unwrap();
        assert_eq!(diastolic.value, Some(80.0));
    }

    #[test]
    fn test_empty_file_error() {
        let tmp = std::env::temp_dir().join("empty_fhir_test.json");
        std::fs::write(&tmp, "").unwrap();
        let result = parse_fhir_bundle(&tmp);
        assert!(result.is_err());
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn test_reference_range_formatting() {
        let lab = serde_json::json!({
            "resourceType": "Observation",
            "subject": {"reference": "Patient/pt-001"},
            "category": [{"coding": [{"code": "laboratory"}]}],
            "code": {"coding": [{"system": "http://loinc.org", "code": "2345-7", "display": "Glucose"}], "text": "Glucose"},
            "valueQuantity": {"value": 105.0, "unit": "mg/dL"},
            "referenceRange": [{"low": {"value": 70.0, "unit": "mg/dL"}, "high": {"value": 100.0, "unit": "mg/dL"}}],
            "effectiveDateTime": "2024-02-10"
        });

        let content = make_bundle(vec![sample_patient(), lab]);
        let resources = extract_resources(&content).unwrap();
        let patients = build_patient_records(&resources).unwrap();

        assert_eq!(patients[0].lab_results[0].reference_range.as_deref(), Some("70-100 mg/dL"));
    }
}
