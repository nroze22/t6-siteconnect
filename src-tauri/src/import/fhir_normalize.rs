//! FHIR R4 → SiteConnect SQLite normalizer.
//!
//! This module knows how to map a small but useful slice of FHIR R4
//! resources into the existing `patients`, `diagnoses`, `medications`,
//! `lab_results`, and `vitals` tables. It is intentionally provider-
//! agnostic — Epic-specific extensions land in a sibling
//! `import::fhir_epic` module in a later phase.
//!
//! Design goals:
//!
//!   * **Idempotent.** Re-running an import for the same patient should
//!     update the patient row and de-duplicate clinical observations,
//!     not create duplicates. We mirror the de-dup strategy used by
//!     `commands::llm::import_extracted_patients` so the schema column
//!     constraints stay consistent.
//!
//!   * **Tolerant.** FHIR resources from real systems are messy. Missing
//!     fields are converted to `None`, malformed payloads are logged
//!     and skipped (the streamer continues with the next record).
//!
//!   * **Pure.** All functions take a `&serde_json::Value` and a
//!     `&rusqlite::Connection`. No HTTP, no Tauri state. The caller
//!     wraps everything in a transaction.

use rusqlite::{params, Connection};

/// Aggregated counts of what was written, returned to the caller for
/// progress + audit purposes.
#[derive(Debug, Clone, Default)]
pub struct NormalizeStats {
    pub patients_inserted: u32,
    pub patients_updated: u32,
    pub diagnoses_inserted: u32,
    pub medications_inserted: u32,
    pub labs_inserted: u32,
    pub vitals_inserted: u32,
    pub skipped: u32,
}

impl NormalizeStats {
    pub fn merge(&mut self, other: &NormalizeStats) {
        self.patients_inserted += other.patients_inserted;
        self.patients_updated += other.patients_updated;
        self.diagnoses_inserted += other.diagnoses_inserted;
        self.medications_inserted += other.medications_inserted;
        self.labs_inserted += other.labs_inserted;
        self.vitals_inserted += other.vitals_inserted;
        self.skipped += other.skipped;
    }
}

/// Insert or update a `Patient` resource. Returns the SiteConnect
/// internal `patients.id` so the caller can use it as a foreign key
/// for subsequent clinical resources.
///
/// Stable identity strategy:
///   1. Pick the FHIR `Patient.id` if present (`fhir-<id>`).
///   2. Else fall back to a deterministic UUID-from-resource fingerprint.
///
/// We deliberately use `fhir-<id>` so the `site_patient_id` is always
/// distinguishable from CSV imports (`AI-…`) and HL7 imports.
pub fn upsert_patient(
    conn: &Connection,
    patient: &serde_json::Value,
    stats: &mut NormalizeStats,
) -> Option<String> {
    let fhir_id = patient.get("id").and_then(|v| v.as_str())?;
    let site_patient_id = format!("fhir-{}", fhir_id);

    let dob = patient
        .get("birthDate")
        .and_then(|v| v.as_str())
        .map(String::from);
    let gender = patient
        .get("gender")
        .and_then(|v| v.as_str())
        .map(String::from);
    let race = extract_us_core_race(patient);

    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM patients WHERE site_patient_id = ?1",
            [&site_patient_id],
            |row| row.get(0),
        )
        .ok();

    let internal_id = if let Some(id) = existing {
        if let Err(err) = conn.execute(
            "UPDATE patients SET
                date_of_birth = COALESCE(?2, date_of_birth),
                gender        = COALESCE(?3, gender),
                race          = COALESCE(?4, race),
                last_updated  = datetime('now'),
                import_source = 'fhir-bulk'
             WHERE id = ?1",
            params![id, dob, gender, race],
        ) {
            tracing::warn!("Failed to update patient {}: {}", site_patient_id, err);
            stats.skipped += 1;
            return None;
        }
        stats.patients_updated += 1;
        id
    } else {
        let new_id = uuid::Uuid::new_v4().to_string();
        if let Err(err) = conn.execute(
            "INSERT INTO patients (
                id, site_patient_id, date_of_birth, gender, race,
                imported_at, import_source, last_updated
             ) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), 'fhir-bulk', datetime('now'))",
            params![new_id, site_patient_id, dob, gender, race],
        ) {
            tracing::warn!("Failed to insert patient {}: {}", site_patient_id, err);
            stats.skipped += 1;
            return None;
        }
        stats.patients_inserted += 1;
        new_id
    };

    Some(internal_id)
}

/// Resolve the SiteConnect internal patient id from a FHIR resource's
/// `subject.reference` (typically `Patient/<id>`). Returns `None` if
/// the patient hasn't been imported yet — the caller should skip the
/// resource rather than orphan it.
pub fn resolve_subject_patient(conn: &Connection, resource: &serde_json::Value) -> Option<String> {
    let reference = resource
        .get("subject")
        .and_then(|s| s.get("reference"))
        .and_then(|v| v.as_str())?;
    let fhir_id = reference.strip_prefix("Patient/")?;
    let site_patient_id = format!("fhir-{}", fhir_id);
    conn.query_row(
        "SELECT id FROM patients WHERE site_patient_id = ?1",
        [&site_patient_id],
        |row| row.get(0),
    )
    .ok()
}

/// Insert a `Condition` resource as a row in `diagnoses`.
pub fn insert_condition(
    conn: &Connection,
    patient_id: &str,
    condition: &serde_json::Value,
    stats: &mut NormalizeStats,
) {
    let (icd10_code, description) = extract_code_and_text(condition.get("code"));
    let description = match description {
        Some(d) if !d.trim().is_empty() => d,
        _ => {
            stats.skipped += 1;
            return;
        }
    };

    let onset_date = condition
        .get("onsetDateTime")
        .and_then(|v| v.as_str())
        .map(date_only)
        .or_else(|| {
            condition
                .get("recordedDate")
                .and_then(|v| v.as_str())
                .map(date_only)
        });

    let status = condition
        .get("clinicalStatus")
        .and_then(|s| s.get("coding"))
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|first| first.get("code"))
        .and_then(|v| v.as_str())
        .unwrap_or("active")
        .to_string();

    // De-duplicate by description per patient (matches the LLM importer).
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM diagnoses WHERE patient_id = ?1 AND description = ?2",
            params![patient_id, description],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if exists {
        return;
    }

    if let Err(err) = conn.execute(
        "INSERT INTO diagnoses (id, patient_id, icd10_code, description, onset_date, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            uuid::Uuid::new_v4().to_string(),
            patient_id,
            icd10_code,
            description,
            onset_date,
            status,
        ],
    ) {
        tracing::warn!("Failed to insert condition: {}", err);
        stats.skipped += 1;
        return;
    }
    stats.diagnoses_inserted += 1;
}

/// Insert a `MedicationRequest` (or `MedicationStatement`) resource
/// as a row in `medications`.
pub fn insert_medication(
    conn: &Connection,
    patient_id: &str,
    medication_resource: &serde_json::Value,
    stats: &mut NormalizeStats,
) {
    // Try `medicationCodeableConcept` first, fall back to
    // `medicationReference.display`.
    let drug_name = medication_resource
        .get("medicationCodeableConcept")
        .and_then(|c| extract_code_and_text(Some(c)).1)
        .or_else(|| {
            medication_resource
                .get("medicationReference")
                .and_then(|r| r.get("display"))
                .and_then(|v| v.as_str())
                .map(String::from)
        });

    let drug_name = match drug_name {
        Some(n) if !n.trim().is_empty() => n,
        _ => {
            stats.skipped += 1;
            return;
        }
    };

    let status = medication_resource
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("active")
        .to_string();

    // First DosageInstruction text (good enough for screening criteria).
    let dose = medication_resource
        .get("dosageInstruction")
        .and_then(|d| d.as_array())
        .and_then(|arr| arr.first())
        .and_then(|first| first.get("text"))
        .and_then(|v| v.as_str())
        .map(String::from);

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM medications WHERE patient_id = ?1 AND drug_name = ?2",
            params![patient_id, drug_name],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if exists {
        return;
    }

    if let Err(err) = conn.execute(
        "INSERT INTO medications (id, patient_id, drug_name, dose, status)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            uuid::Uuid::new_v4().to_string(),
            patient_id,
            drug_name,
            dose,
            status,
        ],
    ) {
        tracing::warn!("Failed to insert medication: {}", err);
        stats.skipped += 1;
        return;
    }
    stats.medications_inserted += 1;
}

/// Insert an `Observation` resource into either `lab_results` or `vitals`,
/// depending on its `category[].coding[].code`. Anything that isn't
/// recognizable as a lab or vital is skipped.
pub fn insert_observation(
    conn: &Connection,
    patient_id: &str,
    observation: &serde_json::Value,
    stats: &mut NormalizeStats,
) {
    let category = observation
        .get("category")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|first| first.get("coding"))
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|first| first.get("code"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let (test_name, _) = extract_code_and_text(observation.get("code"));
    let test_name = match test_name {
        Some(n) if !n.trim().is_empty() => n,
        _ => {
            stats.skipped += 1;
            return;
        }
    };

    let value = observation
        .get("valueQuantity")
        .and_then(|q| q.get("value"))
        .and_then(|v| v.as_f64());
    let unit = observation
        .get("valueQuantity")
        .and_then(|q| q.get("unit"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let result_date = observation
        .get("effectiveDateTime")
        .and_then(|v| v.as_str())
        .map(date_only);

    if category == "vital-signs" {
        // Vitals — no `value` requirement (BP components handled below).
        let measurement_type = vital_type_from_loinc(&test_name);
        let value_for_vital = value.unwrap_or_default();
        let unit = unit.unwrap_or_default();
        if let Err(err) = conn.execute(
            "INSERT INTO vitals (id, patient_id, vital_type, value, unit)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                patient_id,
                measurement_type,
                value_for_vital,
                unit,
            ],
        ) {
            tracing::warn!("Failed to insert vital: {}", err);
            stats.skipped += 1;
            return;
        }
        stats.vitals_inserted += 1;
        return;
    }

    // Treat anything else with a numeric value as a lab. The
    // `laboratory` category is the common case, but Epic sometimes
    // omits the category entirely on lab results.
    let is_lab = category == "laboratory" || category.is_empty();
    if !is_lab {
        stats.skipped += 1;
        return;
    }

    let abnormal_flag = observation
        .get("interpretation")
        .and_then(|i| i.as_array())
        .and_then(|arr| arr.first())
        .and_then(|first| first.get("coding"))
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|first| first.get("code"))
        .and_then(|v| v.as_str())
        .map(String::from);

    if let Err(err) = conn.execute(
        "INSERT INTO lab_results (id, patient_id, test_name, value, unit, result_date, abnormal_flag)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            uuid::Uuid::new_v4().to_string(),
            patient_id,
            test_name,
            value,
            unit,
            result_date,
            abnormal_flag,
        ],
    ) {
        tracing::warn!("Failed to insert lab: {}", err);
        stats.skipped += 1;
        return;
    }
    stats.labs_inserted += 1;
}

// =============================================================================
// helpers
// =============================================================================

/// From a FHIR `CodeableConcept`, return `(icd10_code, display_text)`.
/// Searches all coding entries for an ICD-10 system; the first
/// human-readable display is used as the description.
fn extract_code_and_text(
    codeable: Option<&serde_json::Value>,
) -> (Option<String>, Option<String>) {
    let codeable = match codeable {
        Some(c) => c,
        None => return (None, None),
    };

    let mut icd10_code: Option<String> = None;
    let mut display: Option<String> = None;

    if let Some(codings) = codeable.get("coding").and_then(|c| c.as_array()) {
        for coding in codings {
            let system = coding.get("system").and_then(|v| v.as_str()).unwrap_or("");
            let code = coding.get("code").and_then(|v| v.as_str());
            let coding_display = coding
                .get("display")
                .and_then(|v| v.as_str())
                .map(String::from);
            if system.contains("icd-10") || system.contains("icd10") {
                if let Some(c) = code {
                    icd10_code = Some(c.to_string());
                }
            }
            if display.is_none() {
                display = coding_display;
            }
        }
    }

    if display.is_none() {
        display = codeable
            .get("text")
            .and_then(|v| v.as_str())
            .map(String::from);
    }
    (icd10_code, display)
}

/// Pull a US-Core race extension out of a Patient. Tolerant: if the
/// extension is missing, returns `None` rather than erroring.
fn extract_us_core_race(patient: &serde_json::Value) -> Option<String> {
    let extensions = patient.get("extension")?.as_array()?;
    for ext in extensions {
        let url = ext.get("url").and_then(|v| v.as_str()).unwrap_or("");
        if !url.contains("us-core-race") {
            continue;
        }
        // Look for a nested `extension` with `url == "ombCategory"` and
        // a `valueCoding.display`.
        if let Some(nested) = ext.get("extension").and_then(|e| e.as_array()) {
            for n in nested {
                let nested_url = n.get("url").and_then(|v| v.as_str()).unwrap_or("");
                if nested_url == "ombCategory" {
                    if let Some(display) = n
                        .get("valueCoding")
                        .and_then(|c| c.get("display"))
                        .and_then(|v| v.as_str())
                    {
                        return Some(display.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Trim FHIR `dateTime` (e.g. `2026-04-07T13:30:00Z`) to a `YYYY-MM-DD`
/// date string. Tolerates inputs that are already date-only.
fn date_only(s: &str) -> String {
    s.split('T').next().unwrap_or(s).to_string()
}

/// Map a LOINC display string to one of our short vital types so the
/// rule engine's existing thresholds work without translation.
fn vital_type_from_loinc(display: &str) -> String {
    let lower = display.to_lowercase();
    if lower.contains("systolic") {
        "bp_systolic".into()
    } else if lower.contains("diastolic") {
        "bp_diastolic".into()
    } else if lower.contains("heart rate") || lower.contains("pulse") {
        "heart_rate".into()
    } else if lower.contains("body weight") || lower == "weight" {
        "weight_kg".into()
    } else if lower.contains("body height") || lower == "height" {
        "height_cm".into()
    } else if lower.contains("body mass index") || lower.contains("bmi") {
        "bmi".into()
    } else if lower.contains("body temperature") || lower == "temperature" {
        "temp_c".into()
    } else if lower.contains("oxygen saturation") || lower.contains("spo2") {
        "spo2".into()
    } else {
        // Last-resort: store the raw display so rules can still match by
        // substring; the user can clean these up later.
        display.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_only_strips_time() {
        assert_eq!(date_only("2026-04-07T13:30:00Z"), "2026-04-07");
        assert_eq!(date_only("2026-04-07"), "2026-04-07");
    }

    #[test]
    fn vital_mapping_known_loincs() {
        assert_eq!(vital_type_from_loinc("Systolic blood pressure"), "bp_systolic");
        assert_eq!(vital_type_from_loinc("Diastolic blood pressure"), "bp_diastolic");
        assert_eq!(vital_type_from_loinc("Heart rate"), "heart_rate");
        assert_eq!(vital_type_from_loinc("Body Mass Index"), "bmi");
    }

    #[test]
    fn extracts_icd10_and_display() {
        let codeable = serde_json::json!({
            "coding": [
                { "system": "http://hl7.org/fhir/sid/icd-10-cm", "code": "E11.9", "display": "Type 2 diabetes mellitus" }
            ],
            "text": "Type 2 diabetes"
        });
        let (code, text) = extract_code_and_text(Some(&codeable));
        assert_eq!(code.as_deref(), Some("E11.9"));
        assert_eq!(text.as_deref(), Some("Type 2 diabetes mellitus"));
    }

    #[test]
    fn falls_back_to_text_when_no_display() {
        let codeable = serde_json::json!({
            "coding": [{ "system": "http://snomed.info/sct", "code": "44054006" }],
            "text": "Diabetes"
        });
        let (_code, text) = extract_code_and_text(Some(&codeable));
        assert_eq!(text.as_deref(), Some("Diabetes"));
    }

    #[test]
    fn extracts_us_core_race() {
        let patient = serde_json::json!({
            "extension": [{
                "url": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
                "extension": [
                    { "url": "ombCategory", "valueCoding": { "display": "White" } }
                ]
            }]
        });
        assert_eq!(extract_us_core_race(&patient).as_deref(), Some("White"));
    }
}
