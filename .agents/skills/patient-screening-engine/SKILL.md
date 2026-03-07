# Skill: Patient Screening Engine

> **Purpose**: Implement the two-tier patient screening engine that evaluates study
> eligibility criteria against patient data. Tier 1 uses deterministic rule evaluation
> in Rust for speed and auditability. Tier 2 uses LLM-assisted reasoning for complex,
> subjective, or multi-factor criteria that cannot be reduced to simple rules.

---

## Table of Contents

1. [Overview](#overview)
2. [Tier 1: Rule-Based Screening](#tier-1-rule-based-screening)
3. [Tier 2: LLM-Assisted Screening](#tier-2-llm-assisted-screening)
4. [Scoring Algorithm](#scoring-algorithm)
5. [Data Flow](#data-flow)
6. [Audit Requirements](#audit-requirements)
7. [Error Handling](#error-handling)
8. [Performance Considerations](#performance-considerations)
9. [Testing](#testing)

---

## Overview

Patient screening determines whether a patient at a clinical trial site meets the
inclusion/exclusion criteria for a study. The screening engine is the core intelligence
of SiteConnect, enabling sites to rapidly identify eligible patients from their
existing EHR data.

### Design Principles

1. **Determinism first**: Every criterion that CAN be evaluated deterministically
   MUST be evaluated deterministically (Tier 1). LLM is a fallback, not a default.
2. **Auditability**: Every evaluation result includes the evidence trail — what data
   was examined, what rule was applied, and how the conclusion was reached.
3. **Graceful degradation**: Missing data produces `Unknown`, not false negatives.
   LLM unavailability produces `NeedsReview`, not failures.
4. **Speed**: Tier 1 screening of 10,000 patients against 30 criteria must complete
   in under 5 seconds on commodity hardware.
5. **Transparency**: Confidence scores, evidence citations, and reasoning chains
   are always available for human review.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Screening Orchestrator                │
│                                                         │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────┐  │
│  │  Criterion   │    │   Patient    │    │  Progress  │  │
│  │   Parser     │───▶│   Matcher    │───▶│  Emitter   │  │
│  └─────────────┘    └──────────────┘    └────────────┘  │
│         │                  │                    │        │
│         ▼                  ▼                    ▼        │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────┐  │
│  │  Tier 1:     │    │  Tier 2:     │    │  Results   │  │
│  │  Rule Engine │    │  LLM Engine  │    │  Store     │  │
│  └─────────────┘    └──────────────┘    └────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Tier 1: Rule-Based Screening

Tier 1 is a deterministic rule evaluation engine implemented in Rust. It operates on
structured patient data and produces results with 100% confidence — the answer is
always definitively met, not met, or unknown (due to missing data).

### Core Types

```rust
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Operators supported by the rule engine.
/// Each operator defines a comparison between a patient data field and a rule value.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RuleOperator {
    /// Exact equality: field == value
    Eq,
    /// Inequality: field != value
    Neq,
    /// Greater than: field > value (numeric/date)
    Gt,
    /// Greater than or equal: field >= value (numeric/date)
    Gte,
    /// Less than: field < value (numeric/date)
    Lt,
    /// Less than or equal: field <= value (numeric/date)
    Lte,
    /// Set membership: field IN [value1, value2, ...]
    In,
    /// Set exclusion: field NOT IN [value1, value2, ...]
    NotIn,
    /// Range: value_low <= field <= value_high
    Between,
    /// Substring or code-system containment
    Contains,
    /// Field exists and is non-null
    Exists,
    /// Field does not exist or is null
    NotExists,
    /// Temporal: field date is within N days of reference date
    WithinDays,
    /// Temporal: field date is within N months of reference date
    WithinMonths,
}

/// The result of evaluating a single criterion against a patient.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RuleResult {
    /// The criterion is satisfied by the patient data
    Met,
    /// The criterion is NOT satisfied by the patient data
    NotMet,
    /// Insufficient data to determine — missing fields
    Unknown,
    /// Requires human review (ambiguous data, edge cases)
    NeedsReview,
}

/// Values that rules can compare against.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RuleValue {
    /// Numeric value (stored as f64 for flexibility)
    Numeric(f64),
    /// String value (exact or pattern)
    Text(String),
    /// Boolean value
    Bool(bool),
    /// Date value
    Date(NaiveDate),
    /// Code value with system (e.g., ICD-10, RxNorm, LOINC)
    Code { system: String, code: String },
    /// Range of two numeric values (for Between operator)
    NumericRange(f64, f64),
    /// Range of two date values (for Between operator)
    DateRange(NaiveDate, NaiveDate),
    /// Set of string/code values (for In/NotIn operators)
    Set(Vec<String>),
    /// Duration in days (for WithinDays)
    Days(i64),
    /// Duration in months (for WithinMonths)
    Months(i32),
}

/// A single criterion rule: one field, one operator, one value.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CriterionRule {
    /// Unique identifier for this rule
    pub id: String,
    /// Human-readable description of what this rule checks
    pub description: String,
    /// The patient data field path (dot-notation): e.g., "demographics.age",
    /// "diagnoses.icd10", "labs.hba1c.latest_value"
    pub field: String,
    /// The comparison operator
    pub operator: RuleOperator,
    /// The value to compare against
    pub value: RuleValue,
    /// Exception conditions: if ANY exception matches, the rule result
    /// is overridden to Met even if the primary rule says NotMet.
    /// Example: "No history of cancer EXCEPT non-melanoma skin cancer"
    pub exceptions: Vec<CriterionRule>,
    /// Whether this is an inclusion criterion (true) or exclusion (false)
    pub is_inclusion: bool,
    /// The original protocol text this rule was derived from
    pub source_text: String,
}

/// The full evaluation result with evidence chain.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvaluationResult {
    /// The rule that was evaluated
    pub rule_id: String,
    /// The outcome
    pub result: RuleResult,
    /// Confidence score: always 1.0 for Tier 1 deterministic rules
    pub confidence: f64,
    /// Human-readable evidence: what data was found and how it compared
    pub evidence: String,
    /// Source of the evidence: field path + actual value found
    pub source: String,
    /// Whether this result was determined by AI (false for Tier 1)
    pub ai_determined: bool,
    /// If exceptions were evaluated, their results
    pub exception_results: Vec<EvaluationResult>,
    /// The tier that produced this result
    pub tier: ScreeningTier,
    /// Timestamp of evaluation
    pub evaluated_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ScreeningTier {
    RuleBased,
    LlmAssisted,
    HumanOverride,
}

/// Logical connective for compound rules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogicOp {
    And,
    Or,
    Not,
}

/// A compound rule that combines multiple criterion rules with logic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompoundRule {
    pub id: String,
    pub description: String,
    pub logic: LogicOp,
    pub rules: Vec<CompoundRuleItem>,
    pub source_text: String,
    pub is_inclusion: bool,
}

/// An item in a compound rule — either a leaf rule or a nested compound.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CompoundRuleItem {
    Leaf(CriterionRule),
    Compound(CompoundRule),
}
```

### Supported Data Types and Operators

| Data Type | Supported Operators | Example |
|-----------|-------------------|---------|
| Numeric | Eq, Neq, Gt, Gte, Lt, Lte, Between, Exists, NotExists | Age >= 18 |
| Code (ICD-10) | Eq, Neq, In, NotIn, Contains, Exists, NotExists | Diagnosis IN [E11.x] |
| Code (RxNorm) | Eq, Neq, In, NotIn, Contains, Exists, NotExists | Medication IN [metformin codes] |
| Code (LOINC) | Eq, Neq, In, NotIn, Exists, NotExists | Lab test exists for HbA1c |
| Date | Eq, Neq, Gt, Gte, Lt, Lte, Between, WithinDays, WithinMonths | Diagnosis within 6 months |
| Boolean | Eq, Neq, Exists, NotExists | is_pregnant == false |
| String | Eq, Neq, Contains, In, NotIn, Exists, NotExists | gender == "female" |

### Code System Matching

ICD-10 codes support hierarchical matching. A rule for "E11" matches "E11.0",
"E11.1", "E11.65", etc. This is critical for clinical screening.

```rust
/// Check if a patient's ICD-10 code matches a rule code, supporting
/// hierarchical prefix matching.
///
/// Examples:
///   matches_icd10("E11.65", "E11")    -> true  (prefix match)
///   matches_icd10("E11.65", "E11.65") -> true  (exact match)
///   matches_icd10("E11.65", "E12")    -> false (different category)
///   matches_icd10("E11.65", "E11.6")  -> true  (partial prefix)
fn matches_icd10(patient_code: &str, rule_code: &str) -> bool {
    let normalized_patient = patient_code.replace('.', "").to_uppercase();
    let normalized_rule = rule_code.replace('.', "").to_uppercase();
    normalized_patient.starts_with(&normalized_rule)
}

/// Match RxNorm codes — exact match only (no hierarchy).
fn matches_rxnorm(patient_code: &str, rule_code: &str) -> bool {
    patient_code == rule_code
}

/// Match LOINC codes — exact match only.
fn matches_loinc(patient_code: &str, rule_code: &str) -> bool {
    patient_code == rule_code
}

/// Generic code matcher that dispatches based on code system.
fn matches_code(patient_code: &str, rule_code: &str, system: &str) -> bool {
    match system {
        "ICD-10" | "ICD10" | "icd10" | "http://hl7.org/fhir/sid/icd-10-cm" => {
            matches_icd10(patient_code, rule_code)
        }
        "RxNorm" | "rxnorm" | "http://www.nlm.nih.gov/research/umls/rxnorm" => {
            matches_rxnorm(patient_code, rule_code)
        }
        "LOINC" | "loinc" | "http://loinc.org" => {
            matches_loinc(patient_code, rule_code)
        }
        _ => patient_code == rule_code,
    }
}
```

### Rule Evaluation Engine

```rust
use crate::data::PatientData;

/// Evaluate a single criterion rule against a patient's data.
///
/// This is the core evaluation function. It:
/// 1. Extracts the relevant field from patient data
/// 2. Applies the operator comparison
/// 3. Checks exceptions (if the rule is NotMet but an exception matches, override to Met)
/// 4. Returns a fully evidenced result
pub fn evaluate_rule(rule: &CriterionRule, patient: &PatientData) -> EvaluationResult {
    let now = Utc::now();

    // Step 1: Extract the field value from patient data
    let field_value = patient.get_field(&rule.field);

    // Step 2: Handle missing data
    if field_value.is_none() {
        // For Exists/NotExists operators, missing data IS the answer
        if rule.operator == RuleOperator::NotExists {
            return EvaluationResult {
                rule_id: rule.id.clone(),
                result: RuleResult::Met,
                confidence: 1.0,
                evidence: format!("Field '{}' does not exist in patient data", rule.field),
                source: format!("field:{} value:null", rule.field),
                ai_determined: false,
                exception_results: vec![],
                tier: ScreeningTier::RuleBased,
                evaluated_at: now,
            };
        }
        if rule.operator == RuleOperator::Exists {
            return EvaluationResult {
                rule_id: rule.id.clone(),
                result: RuleResult::NotMet,
                confidence: 1.0,
                evidence: format!("Field '{}' does not exist in patient data", rule.field),
                source: format!("field:{} value:null", rule.field),
                ai_determined: false,
                exception_results: vec![],
                tier: ScreeningTier::RuleBased,
                evaluated_at: now,
            };
        }
        // For all other operators, missing data means Unknown
        return EvaluationResult {
            rule_id: rule.id.clone(),
            result: RuleResult::Unknown,
            confidence: 1.0,
            evidence: format!(
                "Cannot evaluate '{}': field '{}' is missing from patient data",
                rule.description, rule.field
            ),
            source: format!("field:{} value:missing", rule.field),
            ai_determined: false,
            exception_results: vec![],
            tier: ScreeningTier::RuleBased,
            evaluated_at: now,
        };
    }

    let field_value = field_value.unwrap();

    // Step 3: Apply the operator
    let (met, evidence) = apply_operator(&rule.operator, &field_value, &rule.value, &rule.field);

    let mut result = if met { RuleResult::Met } else { RuleResult::NotMet };

    // Step 4: Check exceptions if the primary rule is NotMet
    let mut exception_results = vec![];
    if result == RuleResult::NotMet && !rule.exceptions.is_empty() {
        for exception in &rule.exceptions {
            let exc_result = evaluate_rule(exception, patient);
            if exc_result.result == RuleResult::Met {
                // Exception matched — override NotMet to Met
                result = RuleResult::Met;
            }
            exception_results.push(exc_result);
        }
    }

    EvaluationResult {
        rule_id: rule.id.clone(),
        result,
        confidence: 1.0, // Tier 1 is always deterministic
        evidence,
        source: format!("field:{} value:{}", rule.field, field_value),
        ai_determined: false,
        exception_results,
        tier: ScreeningTier::RuleBased,
        evaluated_at: now,
    }
}

/// Apply an operator to compare a field value against a rule value.
/// Returns (is_met, evidence_string).
fn apply_operator(
    operator: &RuleOperator,
    field_value: &FieldValue,
    rule_value: &RuleValue,
    field_name: &str,
) -> (bool, String) {
    match (operator, field_value, rule_value) {
        // --- Numeric comparisons ---
        (RuleOperator::Eq, FieldValue::Numeric(fv), RuleValue::Numeric(rv)) => {
            let met = (fv - rv).abs() < f64::EPSILON;
            (met, format!("{} = {} (actual: {})", field_name, rv, fv))
        }
        (RuleOperator::Neq, FieldValue::Numeric(fv), RuleValue::Numeric(rv)) => {
            let met = (fv - rv).abs() >= f64::EPSILON;
            (met, format!("{} != {} (actual: {})", field_name, rv, fv))
        }
        (RuleOperator::Gt, FieldValue::Numeric(fv), RuleValue::Numeric(rv)) => {
            let met = fv > rv;
            (met, format!("{} > {} (actual: {})", field_name, rv, fv))
        }
        (RuleOperator::Gte, FieldValue::Numeric(fv), RuleValue::Numeric(rv)) => {
            let met = fv >= rv;
            (met, format!("{} >= {} (actual: {})", field_name, rv, fv))
        }
        (RuleOperator::Lt, FieldValue::Numeric(fv), RuleValue::Numeric(rv)) => {
            let met = fv < rv;
            (met, format!("{} < {} (actual: {})", field_name, rv, fv))
        }
        (RuleOperator::Lte, FieldValue::Numeric(fv), RuleValue::Numeric(rv)) => {
            let met = fv <= rv;
            (met, format!("{} <= {} (actual: {})", field_name, rv, fv))
        }
        (RuleOperator::Between, FieldValue::Numeric(fv), RuleValue::NumericRange(lo, hi)) => {
            let met = fv >= lo && fv <= hi;
            (met, format!("{} between [{}, {}] (actual: {})", field_name, lo, hi, fv))
        }

        // --- Date comparisons ---
        (RuleOperator::Gt, FieldValue::Date(fv), RuleValue::Date(rv)) => {
            let met = fv > rv;
            (met, format!("{} > {} (actual: {})", field_name, rv, fv))
        }
        (RuleOperator::Gte, FieldValue::Date(fv), RuleValue::Date(rv)) => {
            let met = fv >= rv;
            (met, format!("{} >= {} (actual: {})", field_name, rv, fv))
        }
        (RuleOperator::Lt, FieldValue::Date(fv), RuleValue::Date(rv)) => {
            let met = fv < rv;
            (met, format!("{} < {} (actual: {})", field_name, rv, fv))
        }
        (RuleOperator::Between, FieldValue::Date(fv), RuleValue::DateRange(lo, hi)) => {
            let met = fv >= lo && fv <= hi;
            (met, format!("{} between [{}, {}] (actual: {})", field_name, lo, hi, fv))
        }

        // --- Temporal operators ---
        (RuleOperator::WithinDays, FieldValue::Date(fv), RuleValue::Days(days)) => {
            let reference = Utc::now().date_naive();
            let diff = (reference - *fv).num_days().abs();
            let met = diff <= *days;
            (
                met,
                format!(
                    "{} within {} days of reference (actual: {} days, date: {})",
                    field_name, days, diff, fv
                ),
            )
        }
        (RuleOperator::WithinMonths, FieldValue::Date(fv), RuleValue::Months(months)) => {
            let reference = Utc::now().date_naive();
            let diff_days = (reference - *fv).num_days().abs();
            let approx_months = diff_days as f64 / 30.44; // average days per month
            let met = approx_months <= *months as f64;
            (
                met,
                format!(
                    "{} within {} months of reference (actual: {:.1} months, date: {})",
                    field_name, months, approx_months, fv
                ),
            )
        }

        // --- Code matching ---
        (RuleOperator::Eq, FieldValue::Code { system, code }, RuleValue::Code { system: rs, code: rc }) => {
            let met = matches_code(code, rc, rs);
            (met, format!("{} = {}|{} (actual: {}|{})", field_name, rs, rc, system, code))
        }
        (RuleOperator::In, FieldValue::CodeList(codes), RuleValue::Set(rule_codes)) => {
            let matched: Vec<_> = codes
                .iter()
                .filter(|c| rule_codes.iter().any(|rc| matches_code(&c.code, rc, &c.system)))
                .collect();
            let met = !matched.is_empty();
            (
                met,
                format!(
                    "{} IN [{}] (matched: {:?})",
                    field_name,
                    rule_codes.join(", "),
                    matched.iter().map(|c| &c.code).collect::<Vec<_>>()
                ),
            )
        }
        (RuleOperator::NotIn, FieldValue::CodeList(codes), RuleValue::Set(rule_codes)) => {
            let matched: Vec<_> = codes
                .iter()
                .filter(|c| rule_codes.iter().any(|rc| matches_code(&c.code, rc, &c.system)))
                .collect();
            let met = matched.is_empty();
            (
                met,
                format!(
                    "{} NOT IN [{}] (matched: {:?})",
                    field_name,
                    rule_codes.join(", "),
                    matched.iter().map(|c| &c.code).collect::<Vec<_>>()
                ),
            )
        }

        // --- String comparisons ---
        (RuleOperator::Eq, FieldValue::Text(fv), RuleValue::Text(rv)) => {
            let met = fv.to_lowercase() == rv.to_lowercase();
            (met, format!("{} = '{}' (actual: '{}')", field_name, rv, fv))
        }
        (RuleOperator::Contains, FieldValue::Text(fv), RuleValue::Text(rv)) => {
            let met = fv.to_lowercase().contains(&rv.to_lowercase());
            (met, format!("{} contains '{}' (actual: '{}')", field_name, rv, fv))
        }

        // --- Boolean ---
        (RuleOperator::Eq, FieldValue::Bool(fv), RuleValue::Bool(rv)) => {
            let met = fv == rv;
            (met, format!("{} = {} (actual: {})", field_name, rv, fv))
        }

        // --- Exists / NotExists ---
        (RuleOperator::Exists, _, _) => {
            (true, format!("{} exists (value present)", field_name))
        }
        (RuleOperator::NotExists, _, _) => {
            // If we got here, field_value is Some, so NotExists is false
            (false, format!("{} exists but expected not_exists", field_name))
        }

        // --- Fallback: type mismatch ---
        _ => {
            (false, format!(
                "Type mismatch for {}: operator {:?} cannot be applied to field type {:?} with rule value {:?}",
                field_name, operator, field_value, rule_value
            ))
        }
    }
}
```

### Compound Rule Evaluation

Compound rules combine multiple criterion rules with AND, OR, or NOT logic.
Nesting is supported to arbitrary depth.

```rust
/// Evaluate a compound rule against patient data.
///
/// Logic semantics:
/// - AND: all sub-rules must be Met. If any is NotMet, result is NotMet.
///        If none are NotMet but some are Unknown, result is Unknown.
/// - OR:  at least one sub-rule must be Met. If any is Met, result is Met.
///        If all are NotMet, result is NotMet. If none Met but some Unknown, Unknown.
/// - NOT: inverts a single sub-rule. Met -> NotMet, NotMet -> Met, Unknown stays Unknown.
pub fn evaluate_compound(
    compound: &CompoundRule,
    patient: &PatientData,
) -> EvaluationResult {
    let now = Utc::now();
    let sub_results: Vec<EvaluationResult> = compound
        .rules
        .iter()
        .map(|item| match item {
            CompoundRuleItem::Leaf(rule) => evaluate_rule(rule, patient),
            CompoundRuleItem::Compound(sub) => evaluate_compound(sub, patient),
        })
        .collect();

    let result = match compound.logic {
        LogicOp::And => {
            if sub_results.iter().any(|r| r.result == RuleResult::NotMet) {
                RuleResult::NotMet
            } else if sub_results.iter().any(|r| r.result == RuleResult::Unknown) {
                RuleResult::Unknown
            } else if sub_results.iter().any(|r| r.result == RuleResult::NeedsReview) {
                RuleResult::NeedsReview
            } else {
                RuleResult::Met
            }
        }
        LogicOp::Or => {
            if sub_results.iter().any(|r| r.result == RuleResult::Met) {
                RuleResult::Met
            } else if sub_results.iter().any(|r| r.result == RuleResult::Unknown) {
                RuleResult::Unknown
            } else if sub_results.iter().any(|r| r.result == RuleResult::NeedsReview) {
                RuleResult::NeedsReview
            } else {
                RuleResult::NotMet
            }
        }
        LogicOp::Not => {
            // NOT applies to the first (and only) sub-rule
            let first = &sub_results[0];
            match first.result {
                RuleResult::Met => RuleResult::NotMet,
                RuleResult::NotMet => RuleResult::Met,
                RuleResult::Unknown => RuleResult::Unknown,
                RuleResult::NeedsReview => RuleResult::NeedsReview,
            }
        }
    };

    // Build evidence from sub-results
    let evidence = sub_results
        .iter()
        .map(|r| format!("[{}] {:?}: {}", r.rule_id, r.result, r.evidence))
        .collect::<Vec<_>>()
        .join("; ");

    EvaluationResult {
        rule_id: compound.id.clone(),
        result,
        confidence: 1.0,
        evidence: format!("{:?}({})", compound.logic, evidence),
        source: "compound_rule".to_string(),
        ai_determined: false,
        exception_results: vec![],
        tier: ScreeningTier::RuleBased,
        evaluated_at: now,
    }
}
```

### Temporal Rules

Temporal rules handle washout periods, recency requirements, and enrollment-relative
date calculations.

```rust
/// Washout period rule: patient must NOT have taken a medication within
/// N days/months prior to the screening date.
///
/// Example: "No use of systemic corticosteroids within 30 days of screening"
pub fn evaluate_washout(
    medication_codes: &[String],
    patient: &PatientData,
    washout_days: i64,
    screening_date: NaiveDate,
) -> EvaluationResult {
    let now = Utc::now();

    let recent_meds: Vec<_> = patient
        .medications
        .iter()
        .filter(|med| {
            medication_codes.iter().any(|code| matches_code(&med.code, code, &med.system))
        })
        .filter(|med| {
            if let Some(last_date) = med.last_administration_date {
                let days_since = (screening_date - last_date).num_days();
                days_since < washout_days && days_since >= 0
            } else {
                // If we don't know when they last took it, flag as unknown
                true
            }
        })
        .collect();

    let has_unknown_dates = recent_meds.iter().any(|m| m.last_administration_date.is_none());

    let result = if recent_meds.is_empty() {
        RuleResult::Met // No matching medications in washout period
    } else if has_unknown_dates {
        RuleResult::Unknown // Medication found but date unknown
    } else {
        RuleResult::NotMet // Medication taken within washout period
    };

    let evidence = if recent_meds.is_empty() {
        format!(
            "No matching medications found within {} days of {}",
            washout_days, screening_date
        )
    } else {
        format!(
            "Found {} medications within washout period: {}",
            recent_meds.len(),
            recent_meds
                .iter()
                .map(|m| format!("{} ({})", m.code, m.last_administration_date
                    .map(|d| d.to_string())
                    .unwrap_or("unknown date".to_string())))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };

    EvaluationResult {
        rule_id: format!("washout_{}", medication_codes.join("_")),
        result,
        confidence: 1.0,
        evidence,
        source: "medications".to_string(),
        ai_determined: false,
        exception_results: vec![],
        tier: ScreeningTier::RuleBased,
        evaluated_at: now,
    }
}

/// Recency rule: a condition/lab must have been recorded within N months
/// of the reference date (usually screening date or enrollment date).
///
/// Example: "HbA1c >= 7.0% within 3 months of enrollment"
pub fn evaluate_recency(
    rule: &CriterionRule,
    patient: &PatientData,
    recency_months: i32,
    reference_date: NaiveDate,
) -> EvaluationResult {
    let now = Utc::now();

    // First, find values that are recent enough
    let cutoff_days = (recency_months as f64 * 30.44) as i64;
    let cutoff_date = reference_date - chrono::Duration::days(cutoff_days);

    let recent_values: Vec<_> = patient
        .get_dated_values(&rule.field)
        .into_iter()
        .filter(|(date, _)| *date >= cutoff_date)
        .collect();

    if recent_values.is_empty() {
        return EvaluationResult {
            rule_id: rule.id.clone(),
            result: RuleResult::Unknown,
            confidence: 1.0,
            evidence: format!(
                "No values for '{}' found within {} months of {}",
                rule.field, recency_months, reference_date
            ),
            source: format!("field:{} cutoff:{}", rule.field, cutoff_date),
            ai_determined: false,
            exception_results: vec![],
            tier: ScreeningTier::RuleBased,
            evaluated_at: now,
        };
    }

    // Use the most recent value for evaluation
    let (latest_date, latest_value) = recent_values
        .into_iter()
        .max_by_key(|(date, _)| *date)
        .unwrap();

    // Create a synthetic patient with just the latest value and evaluate normally
    let mut synthetic = patient.clone();
    synthetic.set_field(&rule.field, latest_value.clone());
    let mut result = evaluate_rule(rule, &synthetic);
    result.evidence = format!(
        "{} (value from {}, within {} months of {})",
        result.evidence, latest_date, recency_months, reference_date
    );
    result
}
```

### Exception Rules

Exception rules handle "EXCEPT" clauses common in clinical trial criteria.

```rust
/// Example criterion with exception:
///
/// Protocol text: "No history of malignancy within 5 years,
///                 EXCEPT adequately treated non-melanoma skin cancer
///                 or carcinoma in situ of the cervix"
///
/// This translates to:
/// - Primary rule: diagnoses.icd10 NOT IN [C00-C96] within 5 years -> NotMet
/// - Exception 1: diagnoses.icd10 IN [C44.x] (non-melanoma skin cancer) -> override to Met
/// - Exception 2: diagnoses.icd10 IN [D06.x] (cervical carcinoma in situ) -> override to Met

fn build_malignancy_exclusion() -> CriterionRule {
    CriterionRule {
        id: "excl_malignancy".to_string(),
        description: "No history of malignancy within 5 years".to_string(),
        field: "diagnoses.icd10".to_string(),
        operator: RuleOperator::NotIn,
        value: RuleValue::Set(
            // C00-C96 malignancy codes (simplified — real implementation
            // would enumerate or use prefix matching)
            vec!["C".to_string()]
        ),
        exceptions: vec![
            CriterionRule {
                id: "exc_nmsc".to_string(),
                description: "Non-melanoma skin cancer (allowed)".to_string(),
                field: "diagnoses.icd10".to_string(),
                operator: RuleOperator::In,
                value: RuleValue::Set(vec!["C44".to_string()]),
                exceptions: vec![],
                is_inclusion: true,
                source_text: "EXCEPT adequately treated non-melanoma skin cancer".to_string(),
            },
            CriterionRule {
                id: "exc_cervical_cis".to_string(),
                description: "Cervical carcinoma in situ (allowed)".to_string(),
                field: "diagnoses.icd10".to_string(),
                operator: RuleOperator::In,
                value: RuleValue::Set(vec!["D06".to_string()]),
                exceptions: vec![],
                is_inclusion: true,
                source_text: "EXCEPT carcinoma in situ of the cervix".to_string(),
            },
        ],
        is_inclusion: false, // This is an exclusion criterion
        source_text: "No history of malignancy within 5 years, EXCEPT adequately treated non-melanoma skin cancer or carcinoma in situ of the cervix".to_string(),
    }
}
```

---

## Tier 2: LLM-Assisted Screening

Tier 2 handles criteria that cannot be reduced to deterministic rules. These involve
subjective assessments, multi-factor clinical reasoning, or analysis of free-text
clinical notes.

### When to Use Tier 2

| Use LLM | Example |
|---------|---------|
| Subjective assessment | "Subjects must be willing and able to comply with study procedures" |
| Multi-factor reasoning | "Clinically significant ECG abnormality in the judgment of the investigator" |
| Clinical note analysis | "No history of substance abuse" (requires parsing progress notes) |
| Complex temporal logic | "Stable dose of antidepressant for at least 3 months with no plans to change" |
| Ambiguous terminology | "Adequate organ function" (requires interpreting multiple lab values together) |

### LLM Request Construction

```rust
use serde::{Deserialize, Serialize};

/// A request to the LLM for criterion evaluation.
#[derive(Debug, Clone, Serialize)]
pub struct LlmScreeningRequest {
    /// The criterion text from the protocol
    pub criterion_text: String,
    /// Whether this is inclusion or exclusion
    pub is_inclusion: bool,
    /// Relevant patient data (pre-filtered to minimize token usage)
    pub patient_context: PatientContext,
    /// System instructions for the LLM
    pub system_prompt: String,
    /// Output schema for structured response
    pub output_schema: String,
}

/// Pre-filtered patient data relevant to the criterion.
/// We do NOT send the entire patient record — only data that could
/// be relevant to this specific criterion.
#[derive(Debug, Clone, Serialize)]
pub struct PatientContext {
    pub demographics: Option<Demographics>,
    pub relevant_diagnoses: Vec<DiagnosisRecord>,
    pub relevant_medications: Vec<MedicationRecord>,
    pub relevant_labs: Vec<LabRecord>,
    pub relevant_vitals: Vec<VitalRecord>,
    pub relevant_notes: Vec<NoteExcerpt>,
}

/// The expected output from the LLM.
#[derive(Debug, Clone, Deserialize)]
pub struct LlmScreeningResponse {
    /// The determination: met, not_met, unknown, needs_review
    pub result: String,
    /// Confidence score: 0.5 to 0.9
    pub confidence: f64,
    /// Evidence supporting the determination
    pub evidence: String,
    /// Step-by-step reasoning chain
    pub reasoning: String,
    /// Data fields that were missing or insufficient
    pub missing_data: Vec<String>,
}
```

### Prompt Construction

```rust
/// Build the system prompt for LLM-assisted screening.
fn build_screening_system_prompt() -> String {
    r#"You are a clinical trial screening assistant. Your job is to evaluate
whether a patient meets a specific study criterion based on the available data.

RULES:
1. Evaluate ONLY the criterion provided. Do not assess overall eligibility.
2. Base your determination ONLY on the data provided. Do not infer or assume.
3. If data is insufficient, set result to "unknown" and list missing_data.
4. If data is ambiguous or conflicting, set result to "needs_review".
5. For exclusion criteria, "met" means the patient HAS the excluding condition
   (i.e., they would be excluded).
6. Confidence scale:
   - 0.9: Strong, unambiguous evidence directly supports the determination
   - 0.8: Good evidence with minor ambiguity
   - 0.7: Reasonable evidence but some uncertainty
   - 0.6: Weak evidence, significant uncertainty
   - 0.5: Near-guessing, barely any supporting evidence
7. Never assign confidence > 0.9. Only deterministic rules get 1.0.
8. Provide specific evidence citations from the patient data.
9. Your reasoning must be step-by-step, referencing specific data points.

OUTPUT FORMAT (JSON only, no markdown):
{
  "result": "met" | "not_met" | "unknown" | "needs_review",
  "confidence": 0.5 to 0.9,
  "evidence": "Specific data points that support the determination",
  "reasoning": "Step-by-step reasoning chain",
  "missing_data": ["field1", "field2"]
}"#.to_string()
}

/// Build the user prompt for a specific criterion + patient.
fn build_screening_user_prompt(
    criterion_text: &str,
    is_inclusion: bool,
    patient_context: &PatientContext,
) -> String {
    let criterion_type = if is_inclusion { "INCLUSION" } else { "EXCLUSION" };

    format!(
        r#"Evaluate this {criterion_type} criterion:

CRITERION: "{criterion_text}"

PATIENT DATA:
{patient_data}

Determine if the patient meets this criterion. Remember:
- For INCLUSION criteria: "met" means the patient SATISFIES the requirement
- For EXCLUSION criteria: "met" means the patient HAS the excluding condition

Respond with JSON only."#,
        criterion_type = criterion_type,
        criterion_text = criterion_text,
        patient_data = serde_json::to_string_pretty(patient_context).unwrap_or_default(),
    )
}
```

### Confidence Calibration

Tier 2 confidence scores are calibrated based on evidence quality:

| Confidence | Meaning | Example |
|-----------|---------|---------|
| 0.9 | Strong, direct evidence | Lab value clearly meets numeric threshold in notes |
| 0.8 | Good evidence, minor ambiguity | Diagnosis mentioned in notes but no ICD code |
| 0.7 | Reasonable but uncertain | Medication mentioned but dose/timing unclear |
| 0.6 | Weak evidence | Vague reference in old progress note |
| 0.5 | Minimal evidence | Inference from indirect data only |

### LLM Response Processing

```rust
/// Process the LLM response and convert to EvaluationResult.
fn process_llm_response(
    raw_response: &str,
    rule_id: &str,
    criterion_text: &str,
) -> Result<EvaluationResult, ScreeningError> {
    let now = Utc::now();

    // Parse the JSON response
    let response: LlmScreeningResponse = serde_json::from_str(raw_response)
        .map_err(|e| ScreeningError::LlmParseError(format!(
            "Failed to parse LLM response for {}: {}. Raw: {}",
            rule_id, e, raw_response
        )))?;

    // Validate confidence bounds
    let confidence = response.confidence.clamp(0.5, 0.9);

    // Convert string result to RuleResult
    let result = match response.result.to_lowercase().as_str() {
        "met" => RuleResult::Met,
        "not_met" => RuleResult::NotMet,
        "unknown" => RuleResult::Unknown,
        "needs_review" => RuleResult::NeedsReview,
        other => {
            log::warn!(
                "LLM returned unexpected result '{}' for {}, treating as NeedsReview",
                other, rule_id
            );
            RuleResult::NeedsReview
        }
    };

    Ok(EvaluationResult {
        rule_id: rule_id.to_string(),
        result,
        confidence,
        evidence: response.evidence,
        source: format!("llm_analysis: {}", response.reasoning),
        ai_determined: true,
        exception_results: vec![],
        tier: ScreeningTier::LlmAssisted,
        evaluated_at: now,
    })
}

/// Fallback when LLM is unavailable or times out.
fn llm_fallback(rule_id: &str, reason: &str) -> EvaluationResult {
    EvaluationResult {
        rule_id: rule_id.to_string(),
        result: RuleResult::NeedsReview,
        confidence: 0.0,
        evidence: format!("LLM unavailable: {}. Requires manual review.", reason),
        source: "llm_fallback".to_string(),
        ai_determined: false,
        exception_results: vec![],
        tier: ScreeningTier::LlmAssisted,
        evaluated_at: Utc::now(),
    }
}
```

### Context Window Management

To minimize token usage and cost, we pre-filter patient data before sending to the LLM.

```rust
/// Extract only the patient data relevant to a given criterion.
///
/// Strategy:
/// 1. Parse the criterion text for medical concepts (codes, terms)
/// 2. Filter patient data to only records matching those concepts
/// 3. Include demographics always (frequently referenced)
/// 4. Cap clinical notes to most recent 5 relevant excerpts
fn build_patient_context(
    criterion_text: &str,
    patient: &PatientData,
    concept_extractor: &ConceptExtractor,
) -> PatientContext {
    let concepts = concept_extractor.extract(criterion_text);

    PatientContext {
        demographics: Some(patient.demographics.clone()),
        relevant_diagnoses: patient.diagnoses.iter()
            .filter(|d| concepts.matches_diagnosis(d))
            .cloned()
            .collect(),
        relevant_medications: patient.medications.iter()
            .filter(|m| concepts.matches_medication(m))
            .cloned()
            .collect(),
        relevant_labs: patient.labs.iter()
            .filter(|l| concepts.matches_lab(l))
            .cloned()
            .collect(),
        relevant_vitals: patient.vitals.iter()
            .filter(|v| concepts.matches_vital(v))
            .cloned()
            .collect(),
        relevant_notes: patient.notes.iter()
            .filter(|n| concepts.matches_note(n))
            .take(5) // Cap at 5 most relevant excerpts
            .cloned()
            .collect(),
    }
}
```

---

## Scoring Algorithm

The scoring algorithm produces a composite eligibility score from 0 to 100 for each
patient-study pair.

### Formula

```
score = (met_weight * inclusion_met_ratio + exclusion_bonus) * 100 - missing_penalty

where:
  inclusion_met_ratio = inclusion_met_count / total_inclusion_count
  exclusion_bonus     = exclusion_clear_count / total_exclusion_count * exclusion_weight
  met_weight          = 0.6  (inclusion criteria weight)
  exclusion_weight    = 0.4  (exclusion criteria weight)
  missing_penalty     = unknown_count * penalty_per_unknown

  penalty_per_unknown = 100 / total_criteria_count * 0.5
    (each unknown criterion reduces score by half its potential contribution)
```

### Worked Example

Study has 8 inclusion criteria and 5 exclusion criteria (13 total).

Patient results:
- Inclusion: 6 Met, 1 NotMet, 1 Unknown
- Exclusion: 4 Clear (NotMet = good), 1 NeedsReview

```
inclusion_met_ratio = 6 / 8 = 0.75
exclusion_clear_ratio = 4 / 5 = 0.80
exclusion_bonus = 0.80 * 0.4 = 0.32
missing_penalty = 1 * (100 / 13 * 0.5) = 3.85
needs_review_penalty = 1 * (100 / 13 * 0.25) = 1.92

raw_score = (0.6 * 0.75 + 0.32) * 100 = 77.0
final_score = 77.0 - 3.85 - 1.92 = 71.23
```

### Score Implementation

```rust
/// Compute the composite screening score for a patient against a study.
pub fn compute_screening_score(
    results: &[EvaluationResult],
    criteria: &[CriterionRule],
) -> ScreeningScore {
    let inclusion_criteria: Vec<_> = criteria.iter().filter(|c| c.is_inclusion).collect();
    let exclusion_criteria: Vec<_> = criteria.iter().filter(|c| !c.is_inclusion).collect();

    let total_inclusion = inclusion_criteria.len() as f64;
    let total_exclusion = exclusion_criteria.len() as f64;
    let total_criteria = (total_inclusion + total_exclusion).max(1.0);

    // Count inclusion results
    let inclusion_met = count_results(&results, &inclusion_criteria, RuleResult::Met);
    let inclusion_not_met = count_results(&results, &inclusion_criteria, RuleResult::NotMet);

    // Count exclusion results (NotMet is GOOD for exclusion criteria)
    let exclusion_clear = count_results(&results, &exclusion_criteria, RuleResult::NotMet);
    let exclusion_triggered = count_results(&results, &exclusion_criteria, RuleResult::Met);

    // Count unknowns and needs_review across all criteria
    let unknown_count = results.iter().filter(|r| r.result == RuleResult::Unknown).count() as f64;
    let needs_review_count = results.iter().filter(|r| r.result == RuleResult::NeedsReview).count() as f64;

    // Compute score
    let inclusion_ratio = if total_inclusion > 0.0 { inclusion_met as f64 / total_inclusion } else { 1.0 };
    let exclusion_ratio = if total_exclusion > 0.0 { exclusion_clear as f64 / total_exclusion } else { 1.0 };

    let met_weight = 0.6;
    let exclusion_weight = 0.4;
    let penalty_per_unknown = 100.0 / total_criteria * 0.5;
    let penalty_per_review = 100.0 / total_criteria * 0.25;

    let raw_score = (met_weight * inclusion_ratio + exclusion_weight * exclusion_ratio) * 100.0;
    let missing_penalty = unknown_count * penalty_per_unknown;
    let review_penalty = needs_review_count * penalty_per_review;
    let final_score = (raw_score - missing_penalty - review_penalty).clamp(0.0, 100.0);

    // Determine status
    let status = if exclusion_triggered > 0 {
        ScreeningStatus::Excluded
    } else if inclusion_not_met > 0 {
        ScreeningStatus::NotEligible
    } else if final_score >= 80.0 && unknown_count == 0.0 && needs_review_count == 0.0 {
        ScreeningStatus::Eligible
    } else if final_score >= 50.0 {
        ScreeningStatus::PotentiallyEligible
    } else {
        ScreeningStatus::NotEligible
    };

    ScreeningScore {
        score: final_score,
        status,
        inclusion_met: inclusion_met as u32,
        inclusion_not_met: inclusion_not_met as u32,
        inclusion_total: total_inclusion as u32,
        exclusion_clear: exclusion_clear as u32,
        exclusion_triggered: exclusion_triggered as u32,
        exclusion_total: total_exclusion as u32,
        unknown_count: unknown_count as u32,
        needs_review_count: needs_review_count as u32,
    }
}

/// Count how many results of a given type exist for a set of criteria.
fn count_results(
    results: &[EvaluationResult],
    criteria: &[&CriterionRule],
    target: RuleResult,
) -> usize {
    criteria.iter().filter(|c| {
        results.iter().any(|r| r.rule_id == c.id && r.result == target)
    }).count()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreeningScore {
    pub score: f64,
    pub status: ScreeningStatus,
    pub inclusion_met: u32,
    pub inclusion_not_met: u32,
    pub inclusion_total: u32,
    pub exclusion_clear: u32,
    pub exclusion_triggered: u32,
    pub exclusion_total: u32,
    pub unknown_count: u32,
    pub needs_review_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ScreeningStatus {
    /// Score >= 80, no unknowns, no reviews needed, no exclusions triggered
    Eligible,
    /// Score >= 50 but has unknowns or reviews pending
    PotentiallyEligible,
    /// Score < 50 or inclusion criterion definitively not met
    NotEligible,
    /// One or more exclusion criteria triggered
    Excluded,
}
```

### Status Assignment Thresholds

| Status | Conditions |
|--------|-----------|
| Eligible | Score >= 80 AND no unknowns AND no needs_review AND no exclusions triggered |
| PotentiallyEligible | Score >= 50 AND no exclusions triggered (may have unknowns/reviews) |
| NotEligible | Score < 50 OR any inclusion criterion definitively NotMet |
| Excluded | Any exclusion criterion definitively Met (patient has excluding condition) |

---

## Data Flow

The complete screening pipeline, step by step.

### Step 1: Parse Study Criteria into Structured Rules

```rust
/// Parse protocol criteria text into structured rules.
/// This is typically done once when a study is imported.
///
/// Criteria arrive as structured JSON from the ClinicalTrials.gov API
/// or as parsed protocol text. Each criterion becomes either:
/// - A CriterionRule (Tier 1 — deterministic)
/// - A Tier2Criterion (LLM-assisted)
/// - A CompoundRule (multiple sub-rules)
pub struct ParsedCriteria {
    pub tier1_rules: Vec<CriterionRule>,
    pub tier2_criteria: Vec<Tier2Criterion>,
    pub compound_rules: Vec<CompoundRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tier2Criterion {
    pub id: String,
    pub text: String,
    pub is_inclusion: bool,
    pub reason: String, // Why this can't be a Tier 1 rule
}

pub fn parse_study_criteria(
    criteria_text: &[StudyCriterion],
) -> ParsedCriteria {
    let mut tier1_rules = Vec::new();
    let mut tier2_criteria = Vec::new();
    let mut compound_rules = Vec::new();

    for criterion in criteria_text {
        match classify_criterion(criterion) {
            CriterionClass::Simple(rule) => tier1_rules.push(rule),
            CriterionClass::Compound(compound) => compound_rules.push(compound),
            CriterionClass::Complex(reason) => {
                tier2_criteria.push(Tier2Criterion {
                    id: criterion.id.clone(),
                    text: criterion.text.clone(),
                    is_inclusion: criterion.is_inclusion,
                    reason,
                });
            }
        }
    }

    ParsedCriteria { tier1_rules, tier2_criteria, compound_rules }
}
```

### Step 2: Load Patient Data

```rust
/// Load patient data from the local SQLCipher database.
/// Patient data is pre-normalized during import.
pub async fn load_patient_data(
    db: &Database,
    patient_id: &str,
) -> Result<PatientData, ScreeningError> {
    let patient = db.get_patient(patient_id).await
        .map_err(|e| ScreeningError::DataLoadError(format!(
            "Failed to load patient {}: {}", patient_id, e
        )))?;

    Ok(patient)
}

/// Load all patients for batch screening.
pub async fn load_all_patients(
    db: &Database,
    site_id: &str,
) -> Result<Vec<PatientData>, ScreeningError> {
    db.get_patients_by_site(site_id).await
        .map_err(|e| ScreeningError::DataLoadError(format!(
            "Failed to load patients for site {}: {}", site_id, e
        )))
}
```

### Step 3: Run Tier 1 Rules (Batch)

```rust
/// Run all Tier 1 rules against all patients in batch.
/// This is the fast path — no network calls, pure computation.
pub fn run_tier1_batch(
    rules: &[CriterionRule],
    compound_rules: &[CompoundRule],
    patients: &[PatientData],
    progress_tx: &tauri::ipc::Channel<ScreeningProgress>,
) -> Vec<PatientScreeningResult> {
    let total = patients.len();

    patients.iter().enumerate().map(|(idx, patient)| {
        // Evaluate simple rules
        let simple_results: Vec<EvaluationResult> = rules
            .iter()
            .map(|rule| evaluate_rule(rule, patient))
            .collect();

        // Evaluate compound rules
        let compound_results: Vec<EvaluationResult> = compound_rules
            .iter()
            .map(|compound| evaluate_compound(compound, patient))
            .collect();

        // Emit progress
        let _ = progress_tx.send(ScreeningProgress {
            phase: ScreeningPhase::Tier1,
            current: idx + 1,
            total,
            patient_id: patient.id.clone(),
            message: format!("Tier 1: {}/{} patients", idx + 1, total),
        });

        let mut all_results = simple_results;
        all_results.extend(compound_results);

        PatientScreeningResult {
            patient_id: patient.id.clone(),
            tier1_results: all_results,
            tier2_results: vec![], // Filled in Step 4
            score: None,           // Filled in Step 5
        }
    }).collect()
}
```

### Step 4: Collect Tier 2 Criteria and Run LLM Calls

```rust
/// Run Tier 2 (LLM-assisted) screening for criteria that couldn't be
/// evaluated by Tier 1.
///
/// LLM calls are batched per patient to minimize API calls.
/// Concurrency is limited to avoid rate limiting.
pub async fn run_tier2_batch(
    tier2_criteria: &[Tier2Criterion],
    patients: &[PatientData],
    results: &mut Vec<PatientScreeningResult>,
    llm_client: &LlmClient,
    concept_extractor: &ConceptExtractor,
    progress_tx: &tauri::ipc::Channel<ScreeningProgress>,
) -> Result<(), ScreeningError> {
    if tier2_criteria.is_empty() {
        return Ok(());
    }

    let total = patients.len();
    let semaphore = tokio::sync::Semaphore::new(5); // Max 5 concurrent LLM calls

    for (idx, patient) in patients.iter().enumerate() {
        let patient_result = results
            .iter_mut()
            .find(|r| r.patient_id == patient.id)
            .ok_or_else(|| ScreeningError::InternalError(
                "Patient result not found".to_string()
            ))?;

        for criterion in tier2_criteria {
            let _permit = semaphore.acquire().await
                .map_err(|_| ScreeningError::InternalError("Semaphore error".to_string()))?;

            let context = build_patient_context(
                &criterion.text,
                patient,
                concept_extractor,
            );

            let system_prompt = build_screening_system_prompt();
            let user_prompt = build_screening_user_prompt(
                &criterion.text,
                criterion.is_inclusion,
                &context,
            );

            let llm_result = match tokio::time::timeout(
                std::time::Duration::from_secs(30),
                llm_client.complete(&system_prompt, &user_prompt),
            ).await {
                Ok(Ok(response)) => {
                    process_llm_response(&response, &criterion.id, &criterion.text)?
                }
                Ok(Err(e)) => {
                    log::warn!("LLM error for criterion {}: {}", criterion.id, e);
                    llm_fallback(&criterion.id, &e.to_string())
                }
                Err(_) => {
                    log::warn!("LLM timeout for criterion {}", criterion.id);
                    llm_fallback(&criterion.id, "Request timed out after 30s")
                }
            };

            patient_result.tier2_results.push(llm_result);
        }

        // Emit progress
        let _ = progress_tx.send(ScreeningProgress {
            phase: ScreeningPhase::Tier2,
            current: idx + 1,
            total,
            patient_id: patient.id.clone(),
            message: format!("Tier 2: {}/{} patients", idx + 1, total),
        });
    }

    Ok(())
}
```

### Step 5: Compute Score

```rust
/// Compute final scores for all patients.
pub fn compute_all_scores(
    results: &mut Vec<PatientScreeningResult>,
    criteria: &[CriterionRule],
    compound_rules: &[CompoundRule],
    tier2_criteria: &[Tier2Criterion],
) {
    // Build a unified criteria list for scoring
    let mut all_criteria: Vec<CriterionRule> = criteria.to_vec();

    // Add compound rules as synthetic criteria
    for compound in compound_rules {
        all_criteria.push(CriterionRule {
            id: compound.id.clone(),
            description: compound.description.clone(),
            field: String::new(),
            operator: RuleOperator::Exists, // placeholder
            value: RuleValue::Bool(true),    // placeholder
            exceptions: vec![],
            is_inclusion: compound.is_inclusion,
            source_text: compound.source_text.clone(),
        });
    }

    // Add Tier 2 criteria as synthetic criteria
    for t2 in tier2_criteria {
        all_criteria.push(CriterionRule {
            id: t2.id.clone(),
            description: t2.text.clone(),
            field: String::new(),
            operator: RuleOperator::Exists,
            value: RuleValue::Bool(true),
            exceptions: vec![],
            is_inclusion: t2.is_inclusion,
            source_text: t2.text.clone(),
        });
    }

    for patient_result in results.iter_mut() {
        let mut all_results = patient_result.tier1_results.clone();
        all_results.extend(patient_result.tier2_results.clone());

        patient_result.score = Some(compute_screening_score(&all_results, &all_criteria));
    }
}
```

### Step 6: Store Results

```rust
/// Persist screening results to the local database.
/// Results are stored with full audit trail.
pub async fn store_screening_results(
    db: &Database,
    study_id: &str,
    run_id: &str,
    results: &[PatientScreeningResult],
    user_id: &str,
) -> Result<(), ScreeningError> {
    let now = Utc::now();

    // Store the screening run metadata
    db.insert_screening_run(&ScreeningRun {
        id: run_id.to_string(),
        study_id: study_id.to_string(),
        started_at: now,
        completed_at: now,
        patient_count: results.len() as u32,
        initiated_by: user_id.to_string(),
    }).await?;

    // Store individual results
    for result in results {
        db.insert_screening_result(&ScreeningResultRecord {
            run_id: run_id.to_string(),
            patient_id: result.patient_id.clone(),
            score: result.score.as_ref().map(|s| s.score).unwrap_or(0.0),
            status: result.score.as_ref().map(|s| s.status.clone())
                .unwrap_or(ScreeningStatus::NotEligible),
            criteria_results: serde_json::to_string(
                &[&result.tier1_results[..], &result.tier2_results[..]].concat()
            ).unwrap_or_default(),
            evaluated_at: now,
        }).await?;
    }

    // Create audit log entry
    db.append_audit_log(&AuditEntry {
        timestamp: now,
        action: "screening_run_completed".to_string(),
        user_id: user_id.to_string(),
        details: format!(
            "Screening run {} completed for study {}. {} patients screened.",
            run_id, study_id, results.len()
        ),
        checksum: String::new(), // Computed by append_audit_log
    }).await?;

    Ok(())
}
```

### Step 7: Emit Progress Events

```rust
/// Progress event sent to the frontend via Tauri channels.
#[derive(Debug, Clone, Serialize)]
pub struct ScreeningProgress {
    pub phase: ScreeningPhase,
    pub current: usize,
    pub total: usize,
    pub patient_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub enum ScreeningPhase {
    Tier1,
    Tier2,
    Scoring,
    Storing,
    Complete,
}

/// The Tauri command that orchestrates the full screening pipeline.
#[tauri::command]
pub async fn run_screening(
    study_id: String,
    site_id: String,
    progress: tauri::ipc::Channel<ScreeningProgress>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<PatientScreeningResult>, String> {
    let db = &state.database;
    let llm_client = &state.llm_client;
    let concept_extractor = &state.concept_extractor;
    let user_id = &state.current_user_id;

    // Step 1: Load study criteria
    let study = db.get_study(&study_id).await.map_err(|e| e.to_string())?;
    let parsed = parse_study_criteria(&study.criteria);

    // Step 2: Load patients
    let patients = load_all_patients(db, &site_id).await.map_err(|e| e.to_string())?;

    // Step 3: Tier 1
    let mut results = run_tier1_batch(
        &parsed.tier1_rules,
        &parsed.compound_rules,
        &patients,
        &progress,
    );

    // Step 4: Tier 2
    run_tier2_batch(
        &parsed.tier2_criteria,
        &patients,
        &mut results,
        llm_client,
        concept_extractor,
        &progress,
    ).await.map_err(|e| e.to_string())?;

    // Step 5: Scoring
    let _ = progress.send(ScreeningProgress {
        phase: ScreeningPhase::Scoring,
        current: 0,
        total: results.len(),
        patient_id: String::new(),
        message: "Computing scores...".to_string(),
    });
    compute_all_scores(
        &mut results,
        &parsed.tier1_rules,
        &parsed.compound_rules,
        &parsed.tier2_criteria,
    );

    // Step 6: Store
    let run_id = uuid::Uuid::new_v4().to_string();
    let _ = progress.send(ScreeningProgress {
        phase: ScreeningPhase::Storing,
        current: 0,
        total: results.len(),
        patient_id: String::new(),
        message: "Saving results...".to_string(),
    });
    store_screening_results(db, &study_id, &run_id, &results, user_id)
        .await
        .map_err(|e| e.to_string())?;

    // Step 7: Complete
    let _ = progress.send(ScreeningProgress {
        phase: ScreeningPhase::Complete,
        current: results.len(),
        total: results.len(),
        patient_id: String::new(),
        message: format!("Screening complete. {} patients evaluated.", results.len()),
    });

    Ok(results)
}
```

---

## Audit Requirements

Every screening result must be fully auditable. This is critical for regulatory
compliance and clinical defensibility.

### Required Fields on Every Result

| Field | Description | Source |
|-------|-------------|--------|
| `ai_determined` | Whether AI/LLM made this determination | Boolean |
| `confidence` | Confidence score (1.0 for Tier 1, 0.5-0.9 for Tier 2) | Float |
| `evidence` | Specific data points that support the determination | String |
| `evidence_source` | Where the evidence came from (field path, note ID, etc.) | String |
| `tier` | Which screening tier produced this result | Enum |
| `evaluated_at` | Timestamp of evaluation | DateTime |
| `rule_id` | Which criterion was evaluated | String |

### Human Override Tracking

When a clinician overrides an AI-determined result, the system must preserve
both the original AI result and the human override.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreeningOverride {
    /// The original AI-determined result (preserved immutably)
    pub original_result: EvaluationResult,
    /// The human-assigned result
    pub override_result: RuleResult,
    /// Who made the override
    pub overridden_by: String,
    /// When the override was made
    pub overridden_at: chrono::DateTime<Utc>,
    /// Justification for the override (required)
    pub justification: String,
}

/// Apply a human override to a screening result.
/// The original result is preserved; a new result is created.
pub async fn apply_screening_override(
    db: &Database,
    run_id: &str,
    patient_id: &str,
    rule_id: &str,
    new_result: RuleResult,
    justification: &str,
    user_id: &str,
) -> Result<ScreeningOverride, ScreeningError> {
    // Load the original result
    let original = db.get_screening_result(run_id, patient_id, rule_id).await?;

    let override_record = ScreeningOverride {
        original_result: original,
        override_result: new_result,
        overridden_by: user_id.to_string(),
        overridden_at: Utc::now(),
        justification: justification.to_string(),
    };

    // Store override (original result is preserved within the override record)
    db.insert_screening_override(&override_record).await?;

    // Audit log
    db.append_audit_log(&AuditEntry {
        timestamp: Utc::now(),
        action: "screening_override".to_string(),
        user_id: user_id.to_string(),
        details: format!(
            "Override for patient {} criterion {}: {:?} -> {:?}. Justification: {}",
            patient_id, rule_id,
            override_record.original_result.result,
            override_record.override_result,
            justification
        ),
        checksum: String::new(),
    }).await?;

    Ok(override_record)
}
```

### Screening Run Logging

Every screening run is logged with metadata for reproducibility.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreeningRun {
    pub id: String,
    pub study_id: String,
    pub started_at: chrono::DateTime<Utc>,
    pub completed_at: chrono::DateTime<Utc>,
    pub patient_count: u32,
    pub initiated_by: String,
}
```

---

## Error Handling

### LLM Timeout

```rust
/// LLM calls have a 30-second timeout. On timeout:
/// 1. Log the timeout with criterion ID and patient ID
/// 2. Mark the result as NeedsReview with confidence 0.0
/// 3. Continue processing remaining criteria
/// 4. Do NOT retry automatically (user can trigger re-screening)
const LLM_TIMEOUT_SECS: u64 = 30;
```

### LLM Crash / Unavailability

```rust
/// If the LLM service is completely unavailable:
/// 1. All Tier 2 criteria are marked NeedsReview
/// 2. Tier 1 results are still valid and returned
/// 3. Score is computed with penalties for all NeedsReview items
/// 4. User is notified that partial screening was completed
```

### Missing Data Patterns

```rust
/// Missing data handling strategy:
///
/// 1. Field entirely absent: RuleResult::Unknown
/// 2. Field present but empty/null: RuleResult::Unknown
/// 3. Field present but stale (older than recency requirement): RuleResult::Unknown
/// 4. Multiple values, some missing dates: Use available values, note partial data
/// 5. Code present but unrecognized system: RuleResult::NeedsReview
///
/// Unknown results are NEVER converted to Met or NotMet automatically.
/// Only a human override can change an Unknown to a definitive result.
```

---

## Performance Considerations

### Tier 1 Performance Targets

| Metric | Target |
|--------|--------|
| Single patient, 30 criteria | < 1ms |
| 1,000 patients, 30 criteria | < 500ms |
| 10,000 patients, 30 criteria | < 5s |
| Memory per patient | < 50KB |

### Tier 2 Performance Targets

| Metric | Target |
|--------|--------|
| Single LLM call | < 30s (timeout) |
| Concurrent LLM calls | Max 5 |
| Context window per call | < 4,000 tokens |
| Total Tier 2 per patient | < 5 criteria typical |

### Optimization Strategies

1. **Batch Tier 1 first**: All Tier 1 rules run in a single pass per patient.
   This catches the majority of definitive results without any network I/O.

2. **Skip Tier 2 for excluded patients**: If Tier 1 already determined a patient
   is Excluded (an exclusion criterion is Met), skip Tier 2 entirely.

3. **Parallelize across patients**: Tier 1 evaluation is embarrassingly parallel.
   Use Rayon for CPU-bound parallelism.

4. **Cache LLM responses**: For identical criterion + patient data pairs, cache
   the LLM response (keyed by content hash, not by patient ID).

5. **Pre-filter patient data**: Only send relevant data to the LLM to minimize
   token usage and response time.

---

## Testing

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_numeric_gte_met() {
        let rule = CriterionRule {
            id: "age_check".to_string(),
            description: "Age >= 18".to_string(),
            field: "demographics.age".to_string(),
            operator: RuleOperator::Gte,
            value: RuleValue::Numeric(18.0),
            exceptions: vec![],
            is_inclusion: true,
            source_text: "Age >= 18 years".to_string(),
        };
        let patient = make_patient_with_age(25.0);
        let result = evaluate_rule(&rule, &patient);
        assert_eq!(result.result, RuleResult::Met);
        assert_eq!(result.confidence, 1.0);
        assert!(!result.ai_determined);
    }

    #[test]
    fn test_missing_data_returns_unknown() {
        let rule = CriterionRule {
            id: "hba1c_check".to_string(),
            description: "HbA1c >= 7.0%".to_string(),
            field: "labs.hba1c.latest_value".to_string(),
            operator: RuleOperator::Gte,
            value: RuleValue::Numeric(7.0),
            exceptions: vec![],
            is_inclusion: true,
            source_text: "HbA1c >= 7.0%".to_string(),
        };
        let patient = make_patient_without_labs();
        let result = evaluate_rule(&rule, &patient);
        assert_eq!(result.result, RuleResult::Unknown);
    }

    #[test]
    fn test_exception_overrides_not_met() {
        let rule = build_malignancy_exclusion();
        let patient = make_patient_with_diagnosis("C44.1"); // Non-melanoma skin cancer
        let result = evaluate_rule(&rule, &patient);
        // The primary rule would say NotMet (has cancer), but the exception
        // for C44 overrides it to Met (this cancer is allowed)
        assert_eq!(result.result, RuleResult::Met);
    }

    #[test]
    fn test_icd10_hierarchical_matching() {
        assert!(matches_icd10("E11.65", "E11"));
        assert!(matches_icd10("E11.65", "E11.6"));
        assert!(matches_icd10("E11.65", "E11.65"));
        assert!(!matches_icd10("E11.65", "E12"));
        assert!(!matches_icd10("E11.65", "E11.7"));
    }

    #[test]
    fn test_compound_and_all_met() {
        let compound = CompoundRule {
            id: "compound_1".to_string(),
            description: "Age >= 18 AND Age <= 65".to_string(),
            logic: LogicOp::And,
            rules: vec![
                CompoundRuleItem::Leaf(make_age_rule(RuleOperator::Gte, 18.0)),
                CompoundRuleItem::Leaf(make_age_rule(RuleOperator::Lte, 65.0)),
            ],
            source_text: "Age 18-65".to_string(),
            is_inclusion: true,
        };
        let patient = make_patient_with_age(30.0);
        let result = evaluate_compound(&compound, &patient);
        assert_eq!(result.result, RuleResult::Met);
    }

    #[test]
    fn test_scoring_basic() {
        // 3 inclusion (2 met, 1 unknown), 2 exclusion (2 clear)
        let criteria = vec![
            make_criterion("inc1", true),
            make_criterion("inc2", true),
            make_criterion("inc3", true),
            make_criterion("exc1", false),
            make_criterion("exc2", false),
        ];
        let results = vec![
            make_eval_result("inc1", RuleResult::Met),
            make_eval_result("inc2", RuleResult::Met),
            make_eval_result("inc3", RuleResult::Unknown),
            make_eval_result("exc1", RuleResult::NotMet),
            make_eval_result("exc2", RuleResult::NotMet),
        ];
        let score = compute_screening_score(&results, &criteria);
        assert!(score.score > 50.0);
        assert_eq!(score.status, ScreeningStatus::PotentiallyEligible);
        assert_eq!(score.unknown_count, 1);
    }
}
```

### Integration Tests

- Test full pipeline with mock patient database
- Test LLM fallback behavior with intentional timeout
- Test scoring consistency across repeated runs
- Test override persistence and audit trail

### Property-Based Tests

- Score is always in [0, 100]
- Tier 1 confidence is always exactly 1.0
- Tier 2 confidence is always in [0.5, 0.9]
- Unknown never converts to Met/NotMet without human override
- Adding a Met inclusion criterion never decreases score
- Adding a Met exclusion criterion always results in Excluded status
