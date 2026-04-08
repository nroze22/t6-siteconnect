use std::collections::HashMap;
use serde::Serialize;
use rusqlite::Connection;
use uuid::Uuid;
use chrono::Utc;

use super::rules::{evaluate_rule, PatientData, RuleResult, StructuredRule,
    DiagnosisRecord, MedicationRecord, LabRecord, VitalRecord};

/// Overall screening status for a patient-study pair.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub enum ScreeningStatus {
    Eligible,
    PotentiallyEligible,
    Ineligible,
    NeedsReview,
}

impl ScreeningStatus {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Eligible => "eligible",
            Self::PotentiallyEligible => "potentially_eligible",
            Self::Ineligible => "ineligible",
            Self::NeedsReview => "needs_review",
        }
    }
}

/// A single criterion evaluation result.
#[derive(Debug, Clone, Serialize)]
pub struct CriterionEvaluation {
    pub criterion_id: String,
    pub criterion_type: String,
    pub criterion_text: String,
    pub result: String, // "met", "not_met", "unknown", "needs_review"
    pub evidence: Option<String>,
    pub evidence_source: Option<String>,
    pub confidence: f64,
    pub ai_determined: bool,
}

/// Complete screening result for one patient against one study.
#[derive(Debug, Clone, Serialize)]
pub struct PatientScreeningResult {
    pub screening_id: String,
    pub patient_id: String,
    pub study_id: String,
    pub site_patient_id: String,
    pub age: Option<u32>,
    pub gender: Option<String>,
    pub primary_diagnosis: Option<String>,
    pub overall_status: String,
    pub score: f64,
    pub inclusion_met: u32,
    pub inclusion_total: u32,
    pub exclusion_triggered: u32,
    pub exclusion_total: u32,
    pub missing_data_count: u32,
    pub criteria_results: Vec<CriterionEvaluation>,
}

/// Study criterion loaded from the database.
struct StudyCriterion {
    id: String,
    criterion_type: String,
    criterion_text: String,
    structured_rule: Option<String>,
    rule_type: String,
}

pub struct ScreeningEngine;

impl ScreeningEngine {
    /// Screen a single patient against a study's criteria.
    /// Returns a complete screening result with per-criterion evaluations.
    pub fn screen_patient(
        conn: &Connection,
        patient_id: &str,
        study_id: &str,
    ) -> Result<PatientScreeningResult, String> {
        // Load patient data
        let patient = Self::load_patient_data(conn, patient_id)
            .map_err(|e| format!("Failed to load patient data: {}", e))?;

        // Extract enrichment fields before patient is consumed by screening
        let patient_age = patient.age;
        let patient_gender = patient.gender.clone();
        let primary_diagnosis = patient.diagnoses.first().map(|d| d.description.clone());

        // Load site_patient_id from patients table
        let site_patient_id: String = conn.query_row(
            "SELECT site_patient_id FROM patients WHERE id = ?1",
            [patient_id],
            |row| row.get(0),
        ).map_err(|e| format!("Failed to load site_patient_id: {}", e))?;

        // Load study criteria
        let criteria = Self::load_study_criteria(conn, study_id)
            .map_err(|e| format!("Failed to load study criteria: {}", e))?;

        let mut evaluations = Vec::new();
        let mut inclusion_met = 0u32;
        let mut inclusion_total = 0u32;
        let mut exclusion_triggered = 0u32;
        let mut exclusion_total = 0u32;
        let mut missing_data_count = 0u32;

        for criterion in &criteria {
            let is_inclusion = criterion.criterion_type == "inclusion";
            if is_inclusion {
                inclusion_total += 1;
            } else {
                exclusion_total += 1;
            }

            // Try structured rule evaluation first
            let evaluation = if criterion.rule_type == "structured" {
                if let Some(rule_json) = &criterion.structured_rule {
                    match serde_json::from_str::<StructuredRule>(rule_json) {
                        Ok(rule) => {
                            let rule_result = evaluate_rule(&rule, &patient);
                            Self::rule_result_to_evaluation(
                                &criterion.id,
                                &criterion.criterion_type,
                                &criterion.criterion_text,
                                &rule_result,
                                is_inclusion,
                            )
                        }
                        Err(_) => {
                            // Invalid rule JSON — mark for LLM review
                            CriterionEvaluation {
                                criterion_id: criterion.id.clone(),
                                criterion_type: criterion.criterion_type.clone(),
                                criterion_text: criterion.criterion_text.clone(),
                                result: "needs_review".to_string(),
                                evidence: Some("Structured rule could not be parsed".to_string()),
                                evidence_source: None,
                                confidence: 0.0,
                                ai_determined: false,
                            }
                        }
                    }
                } else {
                    // No rule defined — needs LLM or manual review
                    CriterionEvaluation {
                        criterion_id: criterion.id.clone(),
                        criterion_type: criterion.criterion_type.clone(),
                        criterion_text: criterion.criterion_text.clone(),
                        result: "needs_review".to_string(),
                        evidence: Some("No structured rule defined".to_string()),
                        evidence_source: None,
                        confidence: 0.0,
                        ai_determined: false,
                    }
                }
            } else {
                // rule_type == "llm_required" — placeholder for Tier 2
                CriterionEvaluation {
                    criterion_id: criterion.id.clone(),
                    criterion_type: criterion.criterion_type.clone(),
                    criterion_text: criterion.criterion_text.clone(),
                    result: "needs_review".to_string(),
                    evidence: Some("Requires LLM evaluation (not yet available)".to_string()),
                    evidence_source: None,
                    confidence: 0.0,
                    ai_determined: false,
                }
            };

            // Update counters
            match evaluation.result.as_str() {
                "met" if is_inclusion => inclusion_met += 1,
                "met" if !is_inclusion => exclusion_triggered += 1,
                "unknown" | "needs_review" => missing_data_count += 1,
                _ => {}
            }

            evaluations.push(evaluation);
        }

        // Compute overall status and score
        let (status, score) = Self::compute_status(
            inclusion_met,
            inclusion_total,
            exclusion_triggered,
            missing_data_count,
        );

        Ok(PatientScreeningResult {
            screening_id: Uuid::new_v4().to_string(),
            patient_id: patient_id.to_string(),
            study_id: study_id.to_string(),
            site_patient_id,
            age: patient_age,
            gender: patient_gender,
            primary_diagnosis,
            overall_status: status.as_str().to_string(),
            score,
            inclusion_met,
            inclusion_total,
            exclusion_triggered,
            exclusion_total,
            missing_data_count,
            criteria_results: evaluations,
        })
    }

    /// Screen all patients against a study.
    pub fn screen_all_patients(
        conn: &Connection,
        study_id: &str,
    ) -> Result<Vec<PatientScreeningResult>, String> {
        let patient_ids = Self::get_all_patient_ids(conn)
            .map_err(|e| format!("Failed to load patient IDs: {}", e))?;

        let mut results = Vec::with_capacity(patient_ids.len());
        for pid in &patient_ids {
            match Self::screen_patient(conn, pid, study_id) {
                Ok(result) => results.push(result),
                Err(e) => {
                    tracing::warn!("Screening failed for patient {}: {}", pid, e);
                }
            }
        }

        // Sort by score descending
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        Ok(results)
    }

    /// Screen all patients against multiple studies efficiently.
    /// Loads all patient data once, then evaluates against each study's criteria.
    pub fn screen_patients_multi(
        conn: &Connection,
        study_ids: &[String],
        patient_ids_filter: Option<&[String]>,
    ) -> Result<Vec<PatientScreeningResult>, String> {
        // Load all patient IDs
        let all_patient_ids = Self::get_all_patient_ids(conn)
            .map_err(|e| format!("Failed to load patient IDs: {}", e))?;

        let patient_ids: Vec<&String> = if let Some(filter) = patient_ids_filter {
            all_patient_ids.iter().filter(|id| filter.contains(id)).collect()
        } else {
            all_patient_ids.iter().collect()
        };

        // Load all patient data once into a HashMap
        let mut patient_data_map: HashMap<String, (PatientData, String)> = HashMap::with_capacity(patient_ids.len());
        for pid in &patient_ids {
            match Self::load_patient_data(conn, pid) {
                Ok(pd) => {
                    let site_patient_id: String = conn.query_row(
                        "SELECT site_patient_id FROM patients WHERE id = ?1",
                        [pid.as_str()],
                        |row| row.get(0),
                    ).unwrap_or_else(|_| pid.to_string());
                    patient_data_map.insert(pid.to_string(), (pd, site_patient_id));
                }
                Err(e) => {
                    tracing::warn!("Failed to load patient {}: {}", pid, e);
                }
            }
        }

        // Load all study criteria once
        let mut study_criteria_map: HashMap<String, Vec<StudyCriterion>> = HashMap::with_capacity(study_ids.len());
        for study_id in study_ids {
            match Self::load_study_criteria(conn, study_id) {
                Ok(criteria) => { study_criteria_map.insert(study_id.clone(), criteria); }
                Err(e) => {
                    tracing::warn!("Failed to load criteria for study {}: {}", study_id, e);
                }
            }
        }

        // Evaluate every patient × study combination
        let mut results = Vec::with_capacity(patient_data_map.len() * study_ids.len());
        for study_id in study_ids {
            let criteria = match study_criteria_map.get(study_id) {
                Some(c) => c,
                None => continue,
            };

            for (patient_id, (patient, site_patient_id)) in &patient_data_map {
                let result = Self::evaluate_patient_against_criteria(
                    patient_id,
                    site_patient_id,
                    patient,
                    study_id,
                    criteria,
                );
                results.push(result);
            }
        }

        // Sort by score descending
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        Ok(results)
    }

    /// Evaluate a pre-loaded patient against a study's criteria without additional DB access.
    fn evaluate_patient_against_criteria(
        patient_id: &str,
        site_patient_id: &str,
        patient: &PatientData,
        study_id: &str,
        criteria: &[StudyCriterion],
    ) -> PatientScreeningResult {
        let patient_age = patient.age;
        let patient_gender = patient.gender.clone();
        let primary_diagnosis = patient.diagnoses.first().map(|d| d.description.clone());

        let mut evaluations = Vec::new();
        let mut inclusion_met = 0u32;
        let mut inclusion_total = 0u32;
        let mut exclusion_triggered = 0u32;
        let mut exclusion_total = 0u32;
        let mut missing_data_count = 0u32;

        for criterion in criteria {
            let is_inclusion = criterion.criterion_type == "inclusion";
            if is_inclusion {
                inclusion_total += 1;
            } else {
                exclusion_total += 1;
            }

            let evaluation = if criterion.rule_type == "structured" {
                if let Some(rule_json) = &criterion.structured_rule {
                    match serde_json::from_str::<StructuredRule>(rule_json) {
                        Ok(rule) => {
                            let rule_result = evaluate_rule(&rule, patient);
                            Self::rule_result_to_evaluation(
                                &criterion.id,
                                &criterion.criterion_type,
                                &criterion.criterion_text,
                                &rule_result,
                                is_inclusion,
                            )
                        }
                        Err(_) => CriterionEvaluation {
                            criterion_id: criterion.id.clone(),
                            criterion_type: criterion.criterion_type.clone(),
                            criterion_text: criterion.criterion_text.clone(),
                            result: "needs_review".to_string(),
                            evidence: Some("Structured rule could not be parsed".to_string()),
                            evidence_source: None,
                            confidence: 0.0,
                            ai_determined: false,
                        },
                    }
                } else {
                    CriterionEvaluation {
                        criterion_id: criterion.id.clone(),
                        criterion_type: criterion.criterion_type.clone(),
                        criterion_text: criterion.criterion_text.clone(),
                        result: "needs_review".to_string(),
                        evidence: Some("No structured rule defined".to_string()),
                        evidence_source: None,
                        confidence: 0.0,
                        ai_determined: false,
                    }
                }
            } else {
                CriterionEvaluation {
                    criterion_id: criterion.id.clone(),
                    criterion_type: criterion.criterion_type.clone(),
                    criterion_text: criterion.criterion_text.clone(),
                    result: "needs_review".to_string(),
                    evidence: Some("Requires LLM evaluation (not yet available)".to_string()),
                    evidence_source: None,
                    confidence: 0.0,
                    ai_determined: false,
                }
            };

            match evaluation.result.as_str() {
                "met" if is_inclusion => inclusion_met += 1,
                "met" if !is_inclusion => exclusion_triggered += 1,
                "unknown" | "needs_review" => missing_data_count += 1,
                _ => {}
            }

            evaluations.push(evaluation);
        }

        let (status, score) = Self::compute_status(
            inclusion_met,
            inclusion_total,
            exclusion_triggered,
            missing_data_count,
        );

        PatientScreeningResult {
            screening_id: Uuid::new_v4().to_string(),
            patient_id: patient_id.to_string(),
            study_id: study_id.to_string(),
            site_patient_id: site_patient_id.to_string(),
            age: patient_age,
            gender: patient_gender,
            primary_diagnosis,
            overall_status: status.as_str().to_string(),
            score,
            inclusion_met,
            inclusion_total,
            exclusion_triggered,
            exclusion_total,
            missing_data_count,
            criteria_results: evaluations,
        }
    }

    fn rule_result_to_evaluation(
        criterion_id: &str,
        criterion_type: &str,
        criterion_text: &str,
        rule_result: &RuleResult,
        is_inclusion: bool,
    ) -> CriterionEvaluation {
        // For inclusion criteria: rule passes → "met" (good), rule fails → "not_met" (bad)
        // For exclusion criteria: rule passes → "not_met" (good, exclusion NOT triggered),
        //                         rule fails → "met" (bad, exclusion IS triggered)
        let result = match (rule_result.passed, is_inclusion) {
            (Some(true), true) => "met".to_string(),
            (Some(false), true) => "not_met".to_string(),
            (Some(true), false) => "not_met".to_string(),   // exclusion rule passed = not triggered
            (Some(false), false) => "met".to_string(),       // exclusion rule failed = triggered
            (None, _) => "unknown".to_string(),
        };

        CriterionEvaluation {
            criterion_id: criterion_id.to_string(),
            criterion_type: criterion_type.to_string(),
            criterion_text: criterion_text.to_string(),
            result,
            evidence: rule_result.evidence.clone(),
            evidence_source: rule_result.evidence_source.clone(),
            confidence: rule_result.confidence,
            ai_determined: false,
        }
    }

    fn compute_status(
        inclusion_met: u32,
        inclusion_total: u32,
        exclusion_triggered: u32,
        missing_data_count: u32,
    ) -> (ScreeningStatus, f64) {
        // If any exclusion is triggered, patient is ineligible
        if exclusion_triggered > 0 {
            let score = if inclusion_total > 0 {
                (inclusion_met as f64 / inclusion_total as f64) * 30.0
            } else {
                0.0
            };
            return (ScreeningStatus::Ineligible, score);
        }

        // Compute base score from inclusion criteria
        let inclusion_ratio = if inclusion_total > 0 {
            inclusion_met as f64 / inclusion_total as f64
        } else {
            1.0
        };

        // Penalize for missing data
        let total_criteria = inclusion_total + missing_data_count;
        let missing_penalty = if total_criteria > 0 {
            missing_data_count as f64 / total_criteria as f64
        } else {
            0.0
        };

        let score = (inclusion_ratio * 100.0 * (1.0 - missing_penalty * 0.3)).round();
        let score = score.clamp(0.0, 100.0);

        let status = if inclusion_met == inclusion_total && missing_data_count == 0 {
            ScreeningStatus::Eligible
        } else if inclusion_ratio >= 0.7 && missing_data_count <= 2 {
            ScreeningStatus::PotentiallyEligible
        } else if missing_data_count > 3 {
            ScreeningStatus::NeedsReview
        } else {
            ScreeningStatus::Ineligible
        };

        (status, score)
    }

    pub fn load_patient_data(conn: &Connection, patient_id: &str) -> Result<PatientData, rusqlite::Error> {
        // Load basic patient info
        let (age, gender): (Option<u32>, Option<String>) = conn.query_row(
            "SELECT date_of_birth, gender FROM patients WHERE id = ?1",
            [patient_id],
            |row| {
                let dob: Option<String> = row.get(0)?;
                let gender: Option<String> = row.get(1)?;
                // Compute age from DOB
                let age = dob.and_then(|d| {
                    let birth = chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok()?;
                    let today = Utc::now().date_naive();
                    let age = today.years_since(birth)?;
                    Some(age)
                });
                Ok((age, gender))
            },
        )?;

        // Load diagnoses
        let mut stmt = conn.prepare(
            "SELECT icd10_code, description, status FROM diagnoses WHERE patient_id = ?1"
        )?;
        let diagnoses = stmt.query_map([patient_id], |row| {
            Ok(DiagnosisRecord {
                icd10_code: row.get(0)?,
                description: row.get(1)?,
                status: row.get(2)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        // Load medications
        let mut stmt = conn.prepare(
            "SELECT drug_name, status FROM medications WHERE patient_id = ?1"
        )?;
        let medications = stmt.query_map([patient_id], |row| {
            Ok(MedicationRecord {
                drug_name: row.get(0)?,
                status: row.get(1)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        // Load labs
        let mut stmt = conn.prepare(
            "SELECT test_name, loinc_code, value, unit, reference_range, result_date FROM lab_results WHERE patient_id = ?1"
        )?;
        let labs = stmt.query_map([patient_id], |row| {
            Ok(LabRecord {
                test_name: row.get(0)?,
                loinc_code: row.get(1)?,
                value: row.get(2)?,
                unit: row.get(3)?,
                reference_range: row.get(4)?,
                result_date: row.get(5)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        // Load vitals
        let mut stmt = conn.prepare(
            "SELECT vital_type, value, unit, measurement_date FROM vitals WHERE patient_id = ?1"
        )?;
        let vitals = stmt.query_map([patient_id], |row| {
            Ok(VitalRecord {
                measurement_type: row.get(0)?,
                value: row.get(1)?,
                unit: row.get(2)?,
                measurement_date: row.get(3)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(PatientData {
            patient_id: patient_id.to_string(),
            age,
            gender,
            diagnoses,
            medications,
            labs,
            vitals,
        })
    }

    fn load_study_criteria(conn: &Connection, study_id: &str) -> Result<Vec<StudyCriterion>, rusqlite::Error> {
        let mut stmt = conn.prepare(
            "SELECT id, type, criterion_text, structured_rule, rule_type FROM study_criteria WHERE study_id = ?1 ORDER BY type, criterion_number"
        )?;
        let criteria = stmt.query_map([study_id], |row| {
            Ok(StudyCriterion {
                id: row.get(0)?,
                criterion_type: row.get(1)?,
                criterion_text: row.get(2)?,
                structured_rule: row.get(3)?,
                rule_type: row.get(4)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(criteria)
    }

    fn get_all_patient_ids(conn: &Connection) -> Result<Vec<String>, rusqlite::Error> {
        let mut stmt = conn.prepare("SELECT id FROM patients")?;
        let ids = stmt.query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(ids)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        // Run migrations
        crate::db::init_test_db(&conn);

        // Insert a test patient
        conn.execute(
            "INSERT INTO patients (id, site_patient_id, date_of_birth, gender, imported_at, last_updated)
             VALUES ('p001', 'MRN-001', '1964-03-15', 'male', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();

        // Insert diagnoses
        conn.execute(
            "INSERT INTO diagnoses (id, patient_id, icd10_code, description, status, source, confidence)
             VALUES ('dx001', 'p001', 'C34.1', 'NSCLC, right upper lobe', 'active', 'structured', 1.0)",
            [],
        ).unwrap();

        // Insert labs
        conn.execute(
            "INSERT INTO lab_results (id, patient_id, test_name, loinc_code, value, unit, result_date, source)
             VALUES ('lab001', 'p001', 'ANC', '26499-4', 4200.0, '/uL', '2026-02-15', 'structured')",
            [],
        ).unwrap();

        // Insert a study with criteria
        conn.execute(
            "INSERT INTO studies (id, title, sponsor, phase, status, therapeutic_area, indication)
             VALUES ('s001', 'Test Study', 'Test Sponsor', 'Phase 3', 'recruiting', 'Oncology', 'NSCLC')",
            [],
        ).unwrap();

        // Inclusion: Age >= 18
        conn.execute(
            "INSERT INTO study_criteria (id, study_id, type, criterion_number, criterion_text, structured_rule, rule_type)
             VALUES ('sc001', 's001', 'inclusion', 1, 'Age >= 18 years',
                     '{\"type\":\"AgeRange\",\"min\":18,\"max\":null}', 'structured')",
            [],
        ).unwrap();

        // Inclusion: Has NSCLC diagnosis
        conn.execute(
            "INSERT INTO study_criteria (id, study_id, type, criterion_number, criterion_text, structured_rule, rule_type)
             VALUES ('sc002', 's001', 'inclusion', 2, 'Confirmed NSCLC diagnosis',
                     '{\"type\":\"HasDiagnosis\",\"icd10_prefix\":\"C34\",\"status\":\"active\"}', 'structured')",
            [],
        ).unwrap();

        // Inclusion: ANC >= 1500
        conn.execute(
            "INSERT INTO study_criteria (id, study_id, type, criterion_number, criterion_text, structured_rule, rule_type)
             VALUES ('sc003', 's001', 'inclusion', 3, 'ANC >= 1500/uL',
                     '{\"type\":\"LabValueRange\",\"test_name\":\"ANC\",\"min\":1500.0,\"max\":null}', 'structured')",
            [],
        ).unwrap();

        // Exclusion: No autoimmune disease
        conn.execute(
            "INSERT INTO study_criteria (id, study_id, type, criterion_number, criterion_text, structured_rule, rule_type)
             VALUES ('sc004', 's001', 'exclusion', 1, 'No active autoimmune disease',
                     '{\"type\":\"NoDiagnosis\",\"icd10_prefix\":\"M06\"}', 'structured')",
            [],
        ).unwrap();

        // LLM-required criterion
        conn.execute(
            "INSERT INTO study_criteria (id, study_id, type, criterion_number, criterion_text, structured_rule, rule_type)
             VALUES ('sc005', 's001', 'inclusion', 4, 'ECOG Performance Status 0-1', NULL, 'llm_required')",
            [],
        ).unwrap();

        conn
    }

    #[test]
    fn test_screen_patient() {
        let conn = setup_test_db();
        let result = ScreeningEngine::screen_patient(&conn, "p001", "s001").unwrap();

        assert_eq!(result.patient_id, "p001");
        assert_eq!(result.study_id, "s001");
        assert_eq!(result.inclusion_total, 4); // 3 structured + 1 LLM
        assert_eq!(result.exclusion_total, 1);
        assert_eq!(result.inclusion_met, 3); // Age, NSCLC, ANC all pass
        assert_eq!(result.exclusion_triggered, 0); // No autoimmune
        assert!(result.missing_data_count >= 1); // ECOG needs LLM
        assert!(result.score > 0.0);
        assert_eq!(result.criteria_results.len(), 5);
    }

    #[test]
    fn test_screen_all_patients() {
        let conn = setup_test_db();
        let results = ScreeningEngine::screen_all_patients(&conn, "s001").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].patient_id, "p001");
    }

    #[test]
    fn test_screen_patients_multi() {
        let conn = setup_test_db();

        // Add a second study
        conn.execute(
            "INSERT INTO studies (id, title, sponsor, phase, status, therapeutic_area, indication)
             VALUES ('s002', 'Test Study 2', 'Sponsor B', 'Phase 2', 'recruiting', 'Cardiology', 'CHF')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO study_criteria (id, study_id, type, criterion_number, criterion_text, structured_rule, rule_type)
             VALUES ('sc010', 's002', 'inclusion', 1, 'Age >= 21 years',
                     '{\"type\":\"AgeRange\",\"min\":21,\"max\":null}', 'structured')",
            [],
        ).unwrap();

        let study_ids = vec!["s001".to_string(), "s002".to_string()];
        let results = ScreeningEngine::screen_patients_multi(&conn, &study_ids, None).unwrap();

        // Should have results for patient p001 against both studies
        assert_eq!(results.len(), 2);
        let study_ids_in_results: Vec<&str> = results.iter().map(|r| r.study_id.as_str()).collect();
        assert!(study_ids_in_results.contains(&"s001"));
        assert!(study_ids_in_results.contains(&"s002"));

        // Both should have patient p001
        for r in &results {
            assert_eq!(r.patient_id, "p001");
        }
    }

    #[test]
    fn test_screen_patients_multi_with_filter() {
        let conn = setup_test_db();

        // Add a second patient
        conn.execute(
            "INSERT INTO patients (id, site_patient_id, date_of_birth, gender, imported_at, last_updated)
             VALUES ('p002', 'MRN-002', '1990-06-20', 'female', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();

        let study_ids = vec!["s001".to_string()];
        let filter = vec!["p001".to_string()];
        let results = ScreeningEngine::screen_patients_multi(&conn, &study_ids, Some(&filter)).unwrap();

        // Should only have results for p001, not p002
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].patient_id, "p001");
    }

    #[test]
    fn test_screen_patients_multi_empty_studies() {
        let conn = setup_test_db();
        let study_ids: Vec<String> = vec![];
        let results = ScreeningEngine::screen_patients_multi(&conn, &study_ids, None).unwrap();
        assert_eq!(results.len(), 0, "Empty study list should return no results");
    }

    #[test]
    fn test_screen_patients_multi_nonexistent_study() {
        let conn = setup_test_db();
        let study_ids = vec!["nonexistent-study".to_string()];
        let results = ScreeningEngine::screen_patients_multi(&conn, &study_ids, None).unwrap();
        // Should still succeed but with no criteria to evaluate
        assert_eq!(results.len(), 1, "Should still create a result per patient");
        assert_eq!(results[0].inclusion_total, 0);
        assert_eq!(results[0].exclusion_total, 0);
    }

    #[test]
    fn test_screen_patients_multi_scores_consistent() {
        let conn = setup_test_db();

        // Screen single patient against single study using both methods
        let single_result = ScreeningEngine::screen_patient(&conn, "p001", "s001").unwrap();
        let multi_results = ScreeningEngine::screen_patients_multi(&conn, &["s001".to_string()], None).unwrap();

        let multi_result = multi_results.iter().find(|r| r.patient_id == "p001" && r.study_id == "s001").unwrap();

        // Scores should be identical between single and multi methods
        assert_eq!(single_result.score, multi_result.score, "Scores should match");
        assert_eq!(single_result.overall_status, multi_result.overall_status, "Status should match");
        assert_eq!(single_result.inclusion_met, multi_result.inclusion_met, "Inclusion met should match");
        assert_eq!(single_result.inclusion_total, multi_result.inclusion_total, "Inclusion total should match");
        assert_eq!(single_result.exclusion_triggered, multi_result.exclusion_triggered, "Exclusion triggered should match");
        assert_eq!(single_result.missing_data_count, multi_result.missing_data_count, "Missing data should match");
    }

    #[test]
    fn test_screen_patient_ineligible_exclusion() {
        let conn = setup_test_db();

        // Add autoimmune diagnosis that triggers exclusion
        conn.execute(
            "INSERT INTO diagnoses (id, patient_id, icd10_code, description, status, source, confidence)
             VALUES ('dx-ai', 'p001', 'M06.0', 'Rheumatoid arthritis', 'active', 'structured', 1.0)",
            [],
        ).unwrap();

        let result = ScreeningEngine::screen_patient(&conn, "p001", "s001").unwrap();
        assert_eq!(result.overall_status, "ineligible", "Should be ineligible with exclusion triggered");
        assert_eq!(result.exclusion_triggered, 1);
        assert!(result.score <= 30.0, "Score should be capped at 30 with exclusion");
    }

    #[test]
    fn test_compute_status_eligible() {
        let (status, score) = ScreeningEngine::compute_status(5, 5, 0, 0);
        assert_eq!(status, ScreeningStatus::Eligible);
        assert_eq!(score, 100.0);
    }

    #[test]
    fn test_compute_status_potentially_eligible() {
        let (status, _score) = ScreeningEngine::compute_status(4, 5, 0, 1);
        assert_eq!(status, ScreeningStatus::PotentiallyEligible);
    }

    #[test]
    fn test_compute_status_needs_review() {
        let (status, _score) = ScreeningEngine::compute_status(1, 5, 0, 4);
        assert_eq!(status, ScreeningStatus::NeedsReview);
    }

    #[test]
    fn test_compute_status_ineligible_exclusion() {
        let (status, score) = ScreeningEngine::compute_status(5, 5, 1, 0);
        assert_eq!(status, ScreeningStatus::Ineligible);
        assert!(score <= 30.0);
    }
}
