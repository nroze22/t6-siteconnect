use serde::{Deserialize, Serialize};

/// A structured rule that can be evaluated deterministically against patient data.
/// Stored as JSON in `study_criteria.structured_rule`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StructuredRule {
    /// Check patient age (computed from DOB)
    AgeRange {
        min: Option<u32>,
        max: Option<u32>,
    },
    /// Check patient gender
    GenderIs {
        gender: String,
    },
    /// Check for a diagnosis by ICD-10 code prefix (e.g., "C34" matches "C34.1", "C34.9")
    HasDiagnosis {
        icd10_prefix: String,
        #[serde(default = "default_active")]
        status: String,
    },
    /// Check that a diagnosis is NOT present
    NoDiagnosis {
        icd10_prefix: String,
    },
    /// Check for an active medication by drug name (case-insensitive substring match)
    HasMedication {
        drug_name_contains: String,
    },
    /// Check that patient is NOT on a medication
    NoMedication {
        drug_name_contains: String,
    },
    /// Check a lab value against a threshold
    LabValueRange {
        test_name: String,
        #[serde(default)]
        loinc_code: Option<String>,
        min: Option<f64>,
        max: Option<f64>,
        /// How many days back to look for results (default: 90)
        #[serde(default = "default_lookback")]
        lookback_days: u32,
    },
    /// Check a vital sign against a threshold
    VitalRange {
        measurement_type: String,
        min: Option<f64>,
        max: Option<f64>,
    },
    /// Logical AND — all sub-rules must pass
    And {
        rules: Vec<StructuredRule>,
    },
    /// Logical OR — at least one sub-rule must pass
    Or {
        rules: Vec<StructuredRule>,
    },
}

fn default_active() -> String {
    "active".to_string()
}

fn default_lookback() -> u32 {
    90
}

/// Result of evaluating a single rule.
#[derive(Debug, Clone, Serialize)]
pub struct RuleResult {
    pub passed: Option<bool>,
    pub evidence: Option<String>,
    pub evidence_source: Option<String>,
    pub confidence: f64,
    pub missing_data: bool,
}

impl RuleResult {
    pub fn pass(evidence: &str, source: &str) -> Self {
        Self {
            passed: Some(true),
            evidence: Some(evidence.to_string()),
            evidence_source: Some(source.to_string()),
            confidence: 1.0,
            missing_data: false,
        }
    }

    pub fn fail(evidence: &str, source: &str) -> Self {
        Self {
            passed: Some(false),
            evidence: Some(evidence.to_string()),
            evidence_source: Some(source.to_string()),
            confidence: 1.0,
            missing_data: false,
        }
    }

    pub fn missing(source: &str) -> Self {
        Self {
            passed: None,
            evidence: Some(format!("No {} data available", source)),
            evidence_source: Some(source.to_string()),
            confidence: 0.0,
            missing_data: true,
        }
    }
}

/// Patient data snapshot used for rule evaluation.
/// Loaded from SQLite before screening.
#[derive(Debug, Clone)]
pub struct PatientData {
    pub patient_id: String,
    pub age: Option<u32>,
    pub gender: Option<String>,
    pub diagnoses: Vec<DiagnosisRecord>,
    pub medications: Vec<MedicationRecord>,
    pub labs: Vec<LabRecord>,
    pub vitals: Vec<VitalRecord>,
}

#[derive(Debug, Clone)]
pub struct DiagnosisRecord {
    pub icd10_code: Option<String>,
    pub description: String,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct MedicationRecord {
    pub drug_name: String,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct LabRecord {
    pub test_name: String,
    pub loinc_code: Option<String>,
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub reference_range: Option<String>,
    pub result_date: Option<String>,
}

#[derive(Debug, Clone)]
pub struct VitalRecord {
    pub measurement_type: String,
    pub value: f64,
    pub unit: String,
    pub measurement_date: Option<String>,
}

/// Evaluate a structured rule against patient data.
pub fn evaluate_rule(rule: &StructuredRule, patient: &PatientData) -> RuleResult {
    match rule {
        StructuredRule::AgeRange { min, max } => {
            match patient.age {
                Some(age) => {
                    let min_ok = min.map_or(true, |m| age >= m);
                    let max_ok = max.map_or(true, |m| age <= m);
                    if min_ok && max_ok {
                        RuleResult::pass(
                            &format!("Patient age {} is within range [{}, {}]",
                                age,
                                min.map_or("any".to_string(), |v| v.to_string()),
                                max.map_or("any".to_string(), |v| v.to_string()),
                            ),
                            "demographics",
                        )
                    } else {
                        RuleResult::fail(
                            &format!("Patient age {} is outside range [{}, {}]",
                                age,
                                min.map_or("any".to_string(), |v| v.to_string()),
                                max.map_or("any".to_string(), |v| v.to_string()),
                            ),
                            "demographics",
                        )
                    }
                }
                None => RuleResult::missing("demographics"),
            }
        }

        StructuredRule::GenderIs { gender } => {
            match &patient.gender {
                Some(g) if g.eq_ignore_ascii_case(gender) => {
                    RuleResult::pass(
                        &format!("Patient gender is {}", g),
                        "demographics",
                    )
                }
                Some(g) => {
                    RuleResult::fail(
                        &format!("Patient gender is {} (required: {})", g, gender),
                        "demographics",
                    )
                }
                None => RuleResult::missing("demographics"),
            }
        }

        StructuredRule::HasDiagnosis { icd10_prefix, status } => {
            let matching: Vec<&DiagnosisRecord> = patient.diagnoses.iter()
                .filter(|dx| {
                    let code_match = dx.icd10_code.as_ref()
                        .map_or(false, |c| c.starts_with(icd10_prefix));
                    let status_match = dx.status.eq_ignore_ascii_case(status);
                    code_match && status_match
                })
                .collect();

            if !matching.is_empty() {
                let dx = &matching[0];
                RuleResult::pass(
                    &format!("Found {} diagnosis: {} ({})",
                        status,
                        dx.description,
                        dx.icd10_code.as_deref().unwrap_or("unknown"),
                    ),
                    "diagnoses",
                )
            } else {
                // Check if there are any diagnoses at all
                if patient.diagnoses.is_empty() {
                    RuleResult::missing("diagnoses")
                } else {
                    RuleResult::fail(
                        &format!("No {} diagnosis with ICD-10 prefix {} found", status, icd10_prefix),
                        "diagnoses",
                    )
                }
            }
        }

        StructuredRule::NoDiagnosis { icd10_prefix } => {
            let found = patient.diagnoses.iter().any(|dx| {
                dx.icd10_code.as_ref()
                    .map_or(false, |c| c.starts_with(icd10_prefix))
                    && dx.status.eq_ignore_ascii_case("active")
            });

            if found {
                let dx = patient.diagnoses.iter()
                    .find(|dx| dx.icd10_code.as_ref().map_or(false, |c| c.starts_with(icd10_prefix)))
                    .unwrap();
                RuleResult::fail(
                    &format!("Found excluded diagnosis: {} ({})",
                        dx.description,
                        dx.icd10_code.as_deref().unwrap_or("unknown"),
                    ),
                    "diagnoses",
                )
            } else {
                RuleResult::pass(
                    &format!("No diagnosis with ICD-10 prefix {} found", icd10_prefix),
                    "diagnoses",
                )
            }
        }

        StructuredRule::HasMedication { drug_name_contains } => {
            let needle = drug_name_contains.to_lowercase();
            let matching = patient.medications.iter()
                .find(|med| {
                    med.drug_name.to_lowercase().contains(&needle)
                        && med.status.eq_ignore_ascii_case("active")
                });

            match matching {
                Some(med) => RuleResult::pass(
                    &format!("Patient is on {} (active)", med.drug_name),
                    "medications",
                ),
                None if patient.medications.is_empty() => {
                    RuleResult::missing("medications")
                }
                None => RuleResult::fail(
                    &format!("No active medication containing '{}' found", drug_name_contains),
                    "medications",
                ),
            }
        }

        StructuredRule::NoMedication { drug_name_contains } => {
            let needle = drug_name_contains.to_lowercase();
            let found = patient.medications.iter().find(|med| {
                med.drug_name.to_lowercase().contains(&needle)
                    && med.status.eq_ignore_ascii_case("active")
            });

            match found {
                Some(med) => RuleResult::fail(
                    &format!("Patient is currently on excluded medication: {}", med.drug_name),
                    "medications",
                ),
                None => RuleResult::pass(
                    &format!("No active medication containing '{}' found", drug_name_contains),
                    "medications",
                ),
            }
        }

        StructuredRule::LabValueRange { test_name, loinc_code, min, max, .. } => {
            // Find most recent matching lab
            let test_lower = test_name.to_lowercase();
            let matching = patient.labs.iter()
                .filter(|lab| {
                    let name_match = lab.test_name.to_lowercase().contains(&test_lower);
                    let loinc_match = loinc_code.as_ref().map_or(true, |lc| {
                        lab.loinc_code.as_ref().map_or(false, |c| c == lc)
                    });
                    name_match || loinc_match
                })
                .max_by_key(|lab| lab.result_date.clone());

            match matching {
                Some(lab) => match lab.value {
                    Some(val) => {
                        let min_ok = min.map_or(true, |m| val >= m);
                        let max_ok = max.map_or(true, |m| val <= m);
                        let unit_str = lab.unit.as_deref().unwrap_or("");
                        if min_ok && max_ok {
                            RuleResult::pass(
                                &format!("{}: {} {} (range: [{}, {}])",
                                    lab.test_name, val, unit_str,
                                    min.map_or("any".to_string(), |v| v.to_string()),
                                    max.map_or("any".to_string(), |v| v.to_string()),
                                ),
                                "labs",
                            )
                        } else {
                            RuleResult::fail(
                                &format!("{}: {} {} is outside range [{}, {}]",
                                    lab.test_name, val, unit_str,
                                    min.map_or("any".to_string(), |v| v.to_string()),
                                    max.map_or("any".to_string(), |v| v.to_string()),
                                ),
                                "labs",
                            )
                        }
                    }
                    None => RuleResult::missing("labs"),
                },
                None => RuleResult::missing("labs"),
            }
        }

        StructuredRule::VitalRange { measurement_type, min, max } => {
            let matching = patient.vitals.iter()
                .filter(|v| v.measurement_type.eq_ignore_ascii_case(measurement_type))
                .max_by_key(|v| v.measurement_date.clone());

            match matching {
                Some(vital) => {
                    let min_ok = min.map_or(true, |m| vital.value >= m);
                    let max_ok = max.map_or(true, |m| vital.value <= m);
                    if min_ok && max_ok {
                        RuleResult::pass(
                            &format!("{}: {} {} (range: [{}, {}])",
                                measurement_type, vital.value, vital.unit,
                                min.map_or("any".to_string(), |v| v.to_string()),
                                max.map_or("any".to_string(), |v| v.to_string()),
                            ),
                            "vitals",
                        )
                    } else {
                        RuleResult::fail(
                            &format!("{}: {} {} is outside range [{}, {}]",
                                measurement_type, vital.value, vital.unit,
                                min.map_or("any".to_string(), |v| v.to_string()),
                                max.map_or("any".to_string(), |v| v.to_string()),
                            ),
                            "vitals",
                        )
                    }
                }
                None => RuleResult::missing("vitals"),
            }
        }

        StructuredRule::And { rules } => {
            let mut all_pass = true;
            let mut any_missing = false;
            let mut evidences = Vec::new();
            let mut source = None;

            for sub_rule in rules {
                let result = evaluate_rule(sub_rule, patient);
                if let Some(ev) = &result.evidence {
                    evidences.push(ev.clone());
                }
                if source.is_none() {
                    source = result.evidence_source.clone();
                }
                match result.passed {
                    Some(false) => {
                        all_pass = false;
                        break;
                    }
                    None => any_missing = true,
                    _ => {}
                }
            }

            let combined_evidence = evidences.join("; ");
            let src = source.unwrap_or_else(|| "multiple".to_string());

            if !all_pass {
                RuleResult::fail(&combined_evidence, &src)
            } else if any_missing {
                RuleResult::missing(&src)
            } else {
                RuleResult::pass(&combined_evidence, &src)
            }
        }

        StructuredRule::Or { rules } => {
            let mut any_pass = false;
            let mut all_missing = true;
            let mut evidences = Vec::new();
            let mut source = None;

            for sub_rule in rules {
                let result = evaluate_rule(sub_rule, patient);
                if let Some(ev) = &result.evidence {
                    evidences.push(ev.clone());
                }
                if source.is_none() {
                    source = result.evidence_source.clone();
                }
                match result.passed {
                    Some(true) => {
                        any_pass = true;
                        break;
                    }
                    Some(false) => all_missing = false,
                    None => {}
                }
            }

            let combined_evidence = evidences.join("; ");
            let src = source.unwrap_or_else(|| "multiple".to_string());

            if any_pass {
                RuleResult::pass(&combined_evidence, &src)
            } else if all_missing {
                RuleResult::missing(&src)
            } else {
                RuleResult::fail(&combined_evidence, &src)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_patient() -> PatientData {
        PatientData {
            patient_id: "p001".to_string(),
            age: Some(62),
            gender: Some("male".to_string()),
            diagnoses: vec![
                DiagnosisRecord {
                    icd10_code: Some("C34.1".to_string()),
                    description: "NSCLC, right upper lobe".to_string(),
                    status: "active".to_string(),
                },
            ],
            medications: vec![
                MedicationRecord {
                    drug_name: "Pembrolizumab".to_string(),
                    status: "active".to_string(),
                },
            ],
            labs: vec![
                LabRecord {
                    test_name: "ANC".to_string(),
                    loinc_code: Some("26499-4".to_string()),
                    value: Some(4200.0),
                    unit: Some("/uL".to_string()),
                    reference_range: Some("1500-8000".to_string()),
                    result_date: Some("2026-02-15".to_string()),
                },
            ],
            vitals: vec![
                VitalRecord {
                    measurement_type: "bp_systolic".to_string(),
                    value: 128.0,
                    unit: "mmHg".to_string(),
                    measurement_date: Some("2026-02-20".to_string()),
                },
            ],
        }
    }

    #[test]
    fn test_age_range_pass() {
        let patient = sample_patient();
        let rule = StructuredRule::AgeRange { min: Some(18), max: Some(80) };
        let result = evaluate_rule(&rule, &patient);
        assert_eq!(result.passed, Some(true));
    }

    #[test]
    fn test_age_range_fail() {
        let patient = sample_patient();
        let rule = StructuredRule::AgeRange { min: Some(65), max: None };
        let result = evaluate_rule(&rule, &patient);
        assert_eq!(result.passed, Some(false));
    }

    #[test]
    fn test_has_diagnosis() {
        let patient = sample_patient();
        let rule = StructuredRule::HasDiagnosis {
            icd10_prefix: "C34".to_string(),
            status: "active".to_string(),
        };
        let result = evaluate_rule(&rule, &patient);
        assert_eq!(result.passed, Some(true));
        assert_eq!(result.evidence_source.as_deref(), Some("diagnoses"));
    }

    #[test]
    fn test_no_diagnosis_pass() {
        let patient = sample_patient();
        let rule = StructuredRule::NoDiagnosis {
            icd10_prefix: "M06".to_string(), // No autoimmune diagnosis
        };
        let result = evaluate_rule(&rule, &patient);
        assert_eq!(result.passed, Some(true));
    }

    #[test]
    fn test_lab_value_range() {
        let patient = sample_patient();
        let rule = StructuredRule::LabValueRange {
            test_name: "ANC".to_string(),
            loinc_code: None,
            min: Some(1500.0),
            max: None,
            lookback_days: 90,
        };
        let result = evaluate_rule(&rule, &patient);
        assert_eq!(result.passed, Some(true));
    }

    #[test]
    fn test_missing_data() {
        let patient = PatientData {
            patient_id: "p002".to_string(),
            age: None,
            gender: None,
            diagnoses: vec![],
            medications: vec![],
            labs: vec![],
            vitals: vec![],
        };
        let rule = StructuredRule::AgeRange { min: Some(18), max: None };
        let result = evaluate_rule(&rule, &patient);
        assert!(result.missing_data);
        assert_eq!(result.passed, None);
    }

    #[test]
    fn test_and_rule() {
        let patient = sample_patient();
        let rule = StructuredRule::And {
            rules: vec![
                StructuredRule::AgeRange { min: Some(18), max: None },
                StructuredRule::HasDiagnosis {
                    icd10_prefix: "C34".to_string(),
                    status: "active".to_string(),
                },
            ],
        };
        let result = evaluate_rule(&rule, &patient);
        assert_eq!(result.passed, Some(true));
    }

    #[test]
    fn test_or_rule() {
        let patient = sample_patient();
        let rule = StructuredRule::Or {
            rules: vec![
                StructuredRule::GenderIs { gender: "female".to_string() },
                StructuredRule::AgeRange { min: Some(18), max: None },
            ],
        };
        let result = evaluate_rule(&rule, &patient);
        assert_eq!(result.passed, Some(true));
    }

    #[test]
    fn test_rule_serialization() {
        let rule = StructuredRule::LabValueRange {
            test_name: "ANC".to_string(),
            loinc_code: Some("26499-4".to_string()),
            min: Some(1500.0),
            max: None,
            lookback_days: 90,
        };
        let json = serde_json::to_string(&rule).unwrap();
        let parsed: StructuredRule = serde_json::from_str(&json).unwrap();
        // Verify round-trip works
        let json2 = serde_json::to_string(&parsed).unwrap();
        assert_eq!(json, json2);
    }
}
