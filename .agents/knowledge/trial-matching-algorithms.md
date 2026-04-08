# Trial Matching Algorithms

> Comprehensive reference for the screening engine, scoring system, data handling, and vector-based trial matching in TalOS SiteConnect.

---

## Table of Contents

1. [Rule-Based Eligibility Evaluation](#1-rule-based-eligibility-evaluation)
2. [Scoring Algorithm](#2-scoring-algorithm)
3. [Handling Missing Data](#3-handling-missing-data)
4. [Confidence Scoring](#4-confidence-scoring)
5. [K-Anonymization for Telemetry](#5-k-anonymization-for-telemetry)
6. [Vector Similarity for Trial-Patient Matching](#6-vector-similarity-for-trial-patient-matching)
7. [ClinicalTrials.gov Integration](#7-clinicaltrialsgov-integration)

---

## 1. Rule-Based Eligibility Evaluation

The rule engine is the primary, deterministic screening path. It evaluates structured patient data against parsed eligibility criteria without requiring an LLM.

### Data Type Matching

Each criterion maps to a data type, which determines the evaluation strategy:

| Data Type | Fields | Evaluation Method |
|-----------|--------|-------------------|
| Numeric | age, bmi, weight_kg, height_cm, all lab values, vitals | Direct comparison with threshold |
| Code | diagnosis_code (ICD-10), medication (RxNorm/generic name) | Set membership / lookup |
| Date | diagnosis_date, medication_start_date, procedure_date | Calendar arithmetic |
| Boolean | has_diagnosis, has_medication, is_pregnant | True/false check |
| Text | clinical notes, diagnosis_name | Keyword/NER search (falls back to LLM) |

### Operator Implementations

```rust
/// Core comparison operators for the rule engine
pub enum Operator {
    Eq,          // = (exact match)
    NotEq,       // != (not equal)
    Gt,          // > (greater than)
    Gte,         // >= (greater than or equal)
    Lt,          // < (less than)
    Lte,         // <= (less than or equal)
    In,          // value in set
    NotIn,       // value not in set
    Between,     // min <= value <= max (inclusive)
    Contains,    // substring or code-prefix match
    Exists,      // field has any non-null value
    NotExists,   // field is null or absent
}
```

**Numeric comparisons:**

```rust
fn evaluate_numeric(patient_value: f64, operator: &Operator, threshold: &Value) -> RuleResult {
    match operator {
        Operator::Eq => {
            // Use epsilon comparison for floating point
            let target = threshold.as_f64();
            if (patient_value - target).abs() < f64::EPSILON {
                RuleResult::Met
            } else {
                RuleResult::NotMet
            }
        }
        Operator::Gte => {
            let target = threshold.as_f64();
            if patient_value >= target { RuleResult::Met } else { RuleResult::NotMet }
        }
        Operator::Between => {
            let (min, max) = threshold.as_range();
            if patient_value >= min && patient_value <= max {
                RuleResult::Met
            } else {
                RuleResult::NotMet
            }
        }
        // ... other operators follow the same pattern
    }
}
```

**Code lookups (ICD-10, medication):**

```rust
fn evaluate_code(patient_codes: &[String], operator: &Operator, target_codes: &[String]) -> RuleResult {
    match operator {
        Operator::In => {
            // Check if any patient code matches any target code
            // Support prefix matching: "E11" matches "E11.65", "E11.9", etc.
            let matched = patient_codes.iter().any(|pc| {
                target_codes.iter().any(|tc| {
                    pc == tc || pc.starts_with(&format!("{}.", tc)) || tc.starts_with(&format!("{}.", pc))
                })
            });
            if matched { RuleResult::Met } else { RuleResult::NotMet }
        }
        Operator::NotIn => {
            let any_match = patient_codes.iter().any(|pc| {
                target_codes.iter().any(|tc| {
                    pc == tc || pc.starts_with(&format!("{}.", tc))
                })
            });
            if any_match { RuleResult::NotMet } else { RuleResult::Met }
        }
        Operator::Exists => {
            if patient_codes.is_empty() { RuleResult::NotMet } else { RuleResult::Met }
        }
        _ => RuleResult::Error("Unsupported operator for code type".into()),
    }
}
```

**Date calculations:**

```rust
fn evaluate_temporal(
    event_date: Option<NaiveDate>,
    reference_date: NaiveDate, // usually today or screening date
    window: &TemporalWindow,
) -> RuleResult {
    let Some(date) = event_date else {
        return RuleResult::Unknown; // missing date = unknown, not failure
    };

    let duration = match window.unit {
        TimeUnit::Days => chrono::Duration::days(window.value as i64),
        TimeUnit::Weeks => chrono::Duration::weeks(window.value as i64),
        TimeUnit::Months => {
            // Approximate months (use 30.44 days)
            chrono::Duration::days((window.value as f64 * 30.44) as i64)
        }
        TimeUnit::Years => {
            chrono::Duration::days((window.value as f64 * 365.25) as i64)
        }
    };

    match window.direction {
        Direction::Past => {
            // "within X months" = event occurred between (reference - duration) and reference
            let cutoff = reference_date - duration;
            if date >= cutoff && date <= reference_date {
                RuleResult::Met
            } else {
                RuleResult::NotMet
            }
        }
        Direction::AtLeastBefore => {
            // "at least X months prior" = event occurred before (reference - duration)
            let cutoff = reference_date - duration;
            if date <= cutoff {
                RuleResult::Met
            } else {
                RuleResult::NotMet
            }
        }
    }
}
```

### Compound Rules

Compound rules combine multiple sub-rules with logical operators:

```rust
pub enum CompoundOperator {
    And,  // All components must be met
    Or,   // At least one component must be met
    Not,  // Negation of a single component
}

fn evaluate_compound(
    components: &[Rule],
    operator: &CompoundOperator,
    patient: &PatientData,
) -> RuleResult {
    let results: Vec<RuleResult> = components
        .iter()
        .map(|rule| evaluate_rule(rule, patient))
        .collect();

    match operator {
        CompoundOperator::And => {
            // If any is NotMet -> NotMet
            // If all are Met -> Met
            // If some are Unknown and none are NotMet -> Unknown
            if results.iter().any(|r| r == &RuleResult::NotMet) {
                RuleResult::NotMet
            } else if results.iter().all(|r| r == &RuleResult::Met) {
                RuleResult::Met
            } else {
                RuleResult::Unknown
            }
        }
        CompoundOperator::Or => {
            // If any is Met -> Met
            // If all are NotMet -> NotMet
            // Otherwise -> Unknown
            if results.iter().any(|r| r == &RuleResult::Met) {
                RuleResult::Met
            } else if results.iter().all(|r| r == &RuleResult::NotMet) {
                RuleResult::NotMet
            } else {
                RuleResult::Unknown
            }
        }
        CompoundOperator::Not => {
            // Invert single result
            match &results[0] {
                RuleResult::Met => RuleResult::NotMet,
                RuleResult::NotMet => RuleResult::Met,
                RuleResult::Unknown => RuleResult::Unknown,
                other => other.clone(),
            }
        }
    }
}
```

### Exception Handling ("EXCEPT" Clauses)

Many exclusion criteria contain exceptions: "No autoimmune disease EXCEPT vitiligo, type 1 diabetes, or hypothyroidism."

```rust
fn evaluate_with_exceptions(
    patient_codes: &[String],
    excluded_category_codes: &[String], // e.g., all autoimmune ICD-10 codes
    allowed_exceptions: &[String],       // e.g., ["L80", "E10", "E03.9"]
) -> RuleResult {
    let matching_codes: Vec<&String> = patient_codes.iter()
        .filter(|pc| {
            excluded_category_codes.iter().any(|ec| {
                pc.starts_with(ec) || *pc == ec
            })
        })
        .collect();

    if matching_codes.is_empty() {
        // No autoimmune diagnoses at all -> exclusion NOT triggered -> patient is eligible
        return RuleResult::Met; // "Met" means the exclusion criterion is satisfied (not triggered)
    }

    // Check if ALL matching codes fall within exceptions
    let all_excepted = matching_codes.iter().all(|mc| {
        allowed_exceptions.iter().any(|ae| mc.starts_with(ae) || *mc == ae)
    });

    if all_excepted {
        RuleResult::Met // All autoimmune diagnoses are in the exception list
    } else {
        RuleResult::NotMet // Has autoimmune diagnosis NOT in exception list -> excluded
    }
}
```

### Washout Period Evaluation

Washout periods require checking that a medication was discontinued at least N days/weeks before screening:

```rust
fn evaluate_washout(
    medication_end_date: Option<NaiveDate>,
    medication_status: &MedicationStatus,
    screening_date: NaiveDate,
    washout_period: &TemporalWindow,
) -> RuleResult {
    match medication_status {
        MedicationStatus::Active => {
            // Currently taking the medication -> washout not met
            RuleResult::NotMet
        }
        MedicationStatus::Discontinued => {
            let Some(end_date) = medication_end_date else {
                return RuleResult::Unknown; // Discontinued but no end date
            };
            let required_gap = washout_period.to_duration();
            let actual_gap = screening_date - end_date;
            if actual_gap >= required_gap {
                RuleResult::Met // Sufficient washout period
            } else {
                RuleResult::NotMet // Washout period not met
            }
        }
        MedicationStatus::Unknown => RuleResult::Unknown,
    }
}
```

---

## 2. Scoring Algorithm

The scoring system produces a composite eligibility score (0-100) for each patient-study pair. This score is used for ranking, not for binary pass/fail decisions.

### Score Formula

```
EligibilityScore = (InclusionScore * InclusionWeight + PenaltyAdjustment) * DataCompletenessMultiplier

Where:
  InclusionScore = sum(criterion_i.met * criterion_i.weight) / sum(criterion_i.weight) * 100
  PenaltyAdjustment = -100 if any exclusion criterion is triggered (disqualifying)
                      OR -10 per "needs_review" exclusion criterion
  DataCompletenessMultiplier = evaluable_criteria / total_criteria
```

### Criterion Weighting

Not all criteria are equally important. Weights are assigned based on criterion type:

| Criterion Category | Default Weight | Rationale |
|-------------------|----------------|-----------|
| Primary diagnosis | 10 | Core disease requirement — most important |
| Biomarker/subtype | 8 | Determines treatment mechanism relevance |
| Lab value (safety) | 6 | Organ function, safety parameters |
| Age range | 5 | Demographic requirement |
| Medication (concomitant) | 5 | Drug interaction / washout |
| Comorbidity exclusion | 7 | Safety-critical exclusions |
| Performance status | 6 | Functional requirement |
| Temporal requirement | 4 | "Within X months" conditions |
| Subjective/consent | 1 | Cannot evaluate from data; included for completeness |

### Scoring Examples

**Example 1: Well-matched patient**

```
Study: T2DM trial with 8 criteria (5 inclusion, 3 exclusion)

Inclusion Criteria:
  1. Age 18-75 [weight=5]: MET (confidence=1.0)         -> 5/5
  2. T2DM diagnosis [weight=10]: MET (confidence=1.0)    -> 10/10
  3. HbA1c 7.0-10.5% [weight=6]: MET (confidence=1.0)   -> 6/6
  4. eGFR >= 60 [weight=6]: MET (confidence=1.0)         -> 6/6
  5. Not on insulin [weight=5]: MET (confidence=1.0)      -> 5/5

Exclusion Criteria:
  6. No MI in past 6 months [weight=7]: NOT TRIGGERED     -> no penalty
  7. No active cancer [weight=7]: NOT TRIGGERED            -> no penalty
  8. No pregnancy [weight=7]: NOT TRIGGERED                -> no penalty

InclusionScore = (5+10+6+6+5) / (5+10+6+6+5) * 100 = 100
PenaltyAdjustment = 0
DataCompleteness = 8/8 = 1.0

FinalScore = (100 + 0) * 1.0 = 100
```

**Example 2: Partially matched patient with missing data**

```
Inclusion Criteria:
  1. Age 18-75 [weight=5]: MET                           -> 5/5
  2. T2DM diagnosis [weight=10]: MET                     -> 10/10
  3. HbA1c 7.0-10.5% [weight=6]: MET                    -> 6/6
  4. eGFR >= 60 [weight=6]: UNKNOWN (no lab data)        -> 0/6
  5. Not on insulin [weight=5]: MET                       -> 5/5

Exclusion Criteria:
  6. No MI in past 6 months [weight=7]: NOT TRIGGERED     -> no penalty
  7. No active cancer [weight=7]: UNKNOWN (incomplete hx) -> -10 (needs review)
  8. No pregnancy [weight=7]: NOT TRIGGERED                -> no penalty

InclusionScore = (5+10+6+0+5) / (5+10+6+6+5) * 100 = 81.25
PenaltyAdjustment = -10
DataCompleteness = 6/8 = 0.75

FinalScore = (81.25 - 10) * 0.75 = 53.4
```

**Example 3: Excluded patient**

```
Inclusion Criteria:
  1. Age 18-75 [weight=5]: MET                           -> 5/5
  2. T2DM diagnosis [weight=10]: MET                     -> 10/10
  3. HbA1c 7.0-10.5% [weight=6]: NOT MET (HbA1c=11.2%)  -> 0/6
  4. eGFR >= 60 [weight=6]: MET                          -> 6/6
  5. Not on insulin [weight=5]: NOT MET (on insulin)      -> 0/5

Exclusion Criteria:
  6. No MI in past 6 months [weight=7]: TRIGGERED (MI 3 months ago) -> -100 (disqualifying)

FinalScore = 0 (disqualified by exclusion criterion)
```

### Score Interpretation Tiers

| Score Range | Tier | Label | Action |
|-------------|------|-------|--------|
| 90-100 | A | Highly Eligible | Prioritize for pre-screening contact |
| 70-89 | B | Likely Eligible | Review, likely needs 1-2 data points |
| 50-69 | C | Potentially Eligible | Significant data gaps, may be eligible |
| 25-49 | D | Unlikely Eligible | Multiple criteria unmet or unknown |
| 0-24 | F | Not Eligible | Clearly does not meet criteria |
| 0 (DQ) | DQ | Disqualified | Exclusion criterion triggered |

---

## 3. Handling Missing Data

Missing data handling is one of the most critical aspects of the screening engine. The fundamental principle: **missing data means "unknown," not "not met."**

### The Critical Distinction

```
WRONG: Patient has no eGFR on file -> eGFR criterion = NOT MET -> patient excluded
RIGHT: Patient has no eGFR on file -> eGFR criterion = UNKNOWN -> patient flagged for data collection
```

A patient without an eGFR result might have perfectly healthy kidneys. Treating missing data as "not met" would incorrectly exclude potentially eligible patients, which directly harms recruitment.

### Missing Data Categories

| Category | Description | Handling |
|----------|-------------|----------|
| Not collected | Data element was never measured/recorded | UNKNOWN — recommend collection |
| Not imported | Data exists in EMR but wasn't in the import file | UNKNOWN — recommend re-import |
| Stale | Data exists but is older than study-required window | UNKNOWN — flag as stale, recommend refresh |
| Partial | Some related data exists (e.g., creatinine but not eGFR) | Attempt derivation; otherwise UNKNOWN |
| Contradictory | Multiple records with conflicting values | NEEDS_REVIEW — flag for manual review |

### Data Staleness Windows

Lab results and clinical measurements lose relevance over time. Default staleness thresholds:

| Data Type | Default Staleness | Rationale |
|-----------|-------------------|-----------|
| Demographics (age, sex) | Never stale | Derived from DOB or immutable |
| Diagnoses | 2 years | Chronic conditions persist; acute conditions may resolve |
| Medications | 6 months | Prescriptions change frequently |
| HbA1c | 3 months | Standard monitoring interval |
| eGFR / Creatinine | 6 months | Renal function monitoring |
| CBC | 3 months | Routine lab monitoring |
| LFTs (ALT, AST) | 3 months | Hepatic function monitoring |
| Lipid panel | 12 months | Annual screening standard |
| Vitals (BP, HR) | 3 months | Routine visit measurement |
| Imaging | 12 months | Depends on indication |

### Data Completeness Score

```rust
pub struct DataCompleteness {
    pub total_criteria: usize,
    pub evaluable_criteria: usize,    // had sufficient data to evaluate
    pub missing_criteria: Vec<String>, // criterion IDs with missing data
    pub stale_criteria: Vec<String>,   // criterion IDs with stale data
    pub score: f64,                    // evaluable / total (0.0-1.0)
}

fn calculate_data_completeness(results: &[CriterionResult]) -> DataCompleteness {
    let total = results.len();
    let evaluable = results.iter()
        .filter(|r| r.result != RuleResult::Unknown)
        .count();

    let missing: Vec<String> = results.iter()
        .filter(|r| r.result == RuleResult::Unknown && r.reason == "missing_data")
        .map(|r| r.criterion_id.clone())
        .collect();

    let stale: Vec<String> = results.iter()
        .filter(|r| r.result == RuleResult::Unknown && r.reason == "stale_data")
        .map(|r| r.criterion_id.clone())
        .collect();

    DataCompleteness {
        total_criteria: total,
        evaluable_criteria: evaluable,
        missing_criteria: missing,
        stale_criteria: stale,
        score: evaluable as f64 / total as f64,
    }
}
```

### Triage Categories

Patients are categorized based on their screening results and data completeness:

| Category | Criteria | UI Display |
|----------|----------|------------|
| **Eligible** | All inclusion MET, no exclusion triggered, completeness = 100% | Green badge |
| **Likely Eligible** | All evaluable inclusion MET, no exclusion triggered, completeness >= 80% | Blue badge |
| **Potentially Eligible** | Score >= 50, no exclusion triggered, completeness < 80% | Yellow badge |
| **Needs Review** | Any criterion = NEEDS_REVIEW | Orange badge |
| **Not Eligible** | Any inclusion NOT MET or exclusion triggered | Red badge |
| **Insufficient Data** | Completeness < 40% | Gray badge |

---

## 4. Confidence Scoring

Every criterion evaluation carries a confidence score (0.0-1.0) indicating how reliable the determination is.

### Confidence by Evaluation Method

| Method | Confidence Range | Rationale |
|--------|-----------------|-----------|
| Rule-based (exact match) | 1.0 | Deterministic comparison against structured data |
| Rule-based (code prefix) | 0.95 | ICD-10 prefix matching may be slightly imprecise |
| Rule-based (derived value) | 0.90 | e.g., eGFR calculated from creatinine — formula-dependent |
| NER-extracted (diagnosis) | 0.80-0.90 | Depends on entity recognition quality |
| NER-extracted (medication) | 0.75-0.85 | Drug name normalization can be ambiguous |
| NER-extracted (lab value) | 0.70-0.80 | Numeric extraction from text is error-prone |
| LLM-evaluated (clear evidence) | 0.70-0.85 | Model reasoning with direct evidence |
| LLM-evaluated (indirect evidence) | 0.50-0.70 | Model reasoning with circumstantial evidence |
| Human-verified | 1.0 | Manual confirmation overrides all other sources |

### Aggregate Confidence

The overall screening confidence for a patient is the weighted harmonic mean of individual criterion confidences:

```
OverallConfidence = n / sum(1 / confidence_i)

Where n = number of evaluated criteria (excluding unknowns)
```

The harmonic mean is used instead of arithmetic mean because it penalizes low-confidence evaluations more heavily — a single unreliable criterion should drag down the overall confidence.

### Confidence Thresholds for Actions

| Action | Minimum Confidence | Rationale |
|--------|-------------------|-----------|
| Auto-categorize as "Eligible" | 0.90 | High bar for automated green status |
| Include in sponsor pitch counts | 0.70 | Reasonable certainty for aggregate reporting |
| Flag for human review | < 0.70 | Below threshold for automated decisions |
| Include in population analytics | 0.50 | Even uncertain data informs aggregate trends |

---

## 5. K-Anonymization for Telemetry

When opt-in telemetry is enabled, SiteConnect must ensure that no individual patient can be identified from transmitted data. K-anonymization provides this guarantee.

### Minimum Group Size

**k = 5**: No aggregate statistic is reported if it would describe fewer than 5 patients. This is the minimum threshold used by HIPAA Safe Harbor for small cell sizes.

### Generalization Techniques

Transform specific values into broader categories before transmission:

| Data Element | Raw | Generalized |
|-------------|-----|-------------|
| Age | 47 | 40-49 |
| Age | 83 | 80+ |
| Diagnosis | E11.65 | E11 (T2DM, any) |
| Diagnosis | C34.11 | C34 (Lung cancer, any) |
| Lab value | HbA1c 8.2% | HbA1c 8.0-8.5% |
| Race | "Pacific Islander" | "Other" (if n < 5) |

```rust
fn generalize_age(age: u32) -> String {
    match age {
        0..=17 => "0-17".to_string(),
        18..=29 => "18-29".to_string(),
        30..=39 => "30-39".to_string(),
        40..=49 => "40-49".to_string(),
        50..=59 => "50-59".to_string(),
        60..=69 => "60-69".to_string(),
        70..=79 => "70-79".to_string(),
        _ => "80+".to_string(),
    }
}

fn generalize_icd10(code: &str) -> String {
    // Return 3-character category code
    code.chars().take(3).collect()
}
```

### Suppression Rules

If a generalized group still has fewer than k members, suppress (omit) it entirely:

```rust
fn apply_k_anonymity(groups: &mut HashMap<String, usize>, k: usize) {
    let small_groups: Vec<String> = groups.iter()
        .filter(|(_, count)| **count < k)
        .map(|(key, _)| key.clone())
        .collect();

    let suppressed_total: usize = small_groups.iter()
        .map(|key| groups.remove(key).unwrap_or(0))
        .sum();

    if suppressed_total > 0 {
        // Add suppressed count to "Other/Suppressed" category
        *groups.entry("_suppressed".to_string()).or_insert(0) += suppressed_total;
    }
}
```

### Differential Privacy (Optional Enhancement)

For additional protection, add calibrated noise to counts:

```rust
use rand::distributions::{Distribution, Uniform};

fn add_laplace_noise(true_count: usize, epsilon: f64) -> usize {
    // Laplace mechanism: add noise proportional to sensitivity/epsilon
    // Sensitivity = 1 (adding/removing one patient changes count by at most 1)
    let scale = 1.0 / epsilon;
    let uniform = Uniform::new(0.0_f64, 1.0);
    let mut rng = rand::thread_rng();
    let u: f64 = uniform.sample(&mut rng) - 0.5;
    let noise = -scale * u.signum() * (1.0 - 2.0 * u.abs()).ln();
    (true_count as f64 + noise).round().max(0.0) as usize
}
```

Recommended epsilon values:
- Population counts: epsilon = 1.0 (moderate privacy)
- Demographic breakdowns: epsilon = 0.5 (stronger privacy)
- Rare disease counts: epsilon = 0.1 (strong privacy)

### Telemetry Payload Schema

```json
{
  "site_id": "hashed_site_identifier",
  "timestamp": "2026-03-06T12:00:00Z",
  "app_version": "1.2.0",
  "event": "screening_summary",
  "data": {
    "study_nct_id": "NCT12345678",
    "therapeutic_area": "Endocrinology",
    "total_screened": 4820,
    "eligible_count": 847,
    "pending_count": 1203,
    "demographics": {
      "age_groups": {"18-29": 120, "30-39": 340, "40-49": 890, "50-59": 1200, "60-69": 1450, "70-79": 680, "80+": 140},
      "sex": {"F": 2603, "M": 2217}
    },
    "top_exclusion_reasons": [
      {"reason": "hba1c_out_of_range", "count": 1840},
      {"reason": "active_insulin", "count": 920}
    ],
    "data_completeness_mean": 0.76,
    "k_anonymity_applied": true,
    "k_value": 5,
    "suppressed_groups": 2
  }
}
```

**Critical rule**: The telemetry payload NEVER contains: patient names, MRNs, dates of birth, specific diagnosis codes (only generalized categories), or any other HIPAA identifier.

---

## 6. Vector Similarity for Trial-Patient Matching

Vector similarity enables rapid "which trials might match this patient?" pre-screening by computing semantic similarity between patient profiles and study criteria.

### Architecture Overview

```
Patient Data → Encode → Patient Vector (384-dim)
                              ↓
                     Cosine Similarity
                              ↓
Study Criteria → Encode → Study Vector (384-dim)
```

### Embedding Model

**all-MiniLM-L6-v2** (384 dimensions)
- Size: ~80MB (ONNX format)
- Inference: ~5ms per encoding on CPU
- Quality: Strong performance on semantic textual similarity benchmarks
- Runs locally via `ort` crate (ONNX Runtime for Rust)

### Patient Profile Encoding

Convert structured patient data into a natural language description for embedding:

```rust
fn encode_patient_profile(patient: &PatientData) -> String {
    let mut parts = Vec::new();

    // Demographics
    parts.push(format!("{} year old {}", patient.age, patient.sex));

    // Diagnoses (top 5 by relevance)
    if !patient.diagnoses.is_empty() {
        let dx_str: Vec<String> = patient.diagnoses.iter()
            .take(5)
            .map(|d| d.name.clone())
            .collect();
        parts.push(format!("Diagnoses: {}", dx_str.join(", ")));
    }

    // Medications (top 5)
    if !patient.medications.is_empty() {
        let med_str: Vec<String> = patient.medications.iter()
            .filter(|m| m.status == "active")
            .take(5)
            .map(|m| m.name.clone())
            .collect();
        parts.push(format!("Medications: {}", med_str.join(", ")));
    }

    // Key labs
    if let Some(hba1c) = patient.get_latest_lab("HbA1c") {
        parts.push(format!("HbA1c: {}%", hba1c.value));
    }
    if let Some(egfr) = patient.get_latest_lab("eGFR") {
        parts.push(format!("eGFR: {}", egfr.value));
    }

    parts.join(". ")
}
```

### Study Criteria Encoding

Convert eligibility criteria into a descriptive text for embedding:

```rust
fn encode_study_criteria(study: &Study) -> String {
    let mut parts = Vec::new();

    parts.push(format!("Clinical trial: {}", study.title));
    parts.push(format!("Therapeutic area: {}", study.therapeutic_area));
    parts.push(format!("Phase: {}", study.phase));

    // Include key inclusion criteria
    for criterion in &study.inclusion_criteria {
        parts.push(format!("Requires: {}", criterion.text));
    }

    // Include key exclusion criteria
    for criterion in &study.exclusion_criteria {
        parts.push(format!("Excludes: {}", criterion.text));
    }

    parts.join(". ")
}
```

### sqlite-vec Usage

Store and query embeddings using the sqlite-vec extension:

```sql
-- Create virtual table for patient embeddings
CREATE VIRTUAL TABLE patient_embeddings USING vec0(
    patient_id TEXT PRIMARY KEY,
    embedding FLOAT[384]
);

-- Create virtual table for study embeddings
CREATE VIRTUAL TABLE study_embeddings USING vec0(
    study_nct_id TEXT PRIMARY KEY,
    embedding FLOAT[384]
);

-- Insert patient embedding
INSERT INTO patient_embeddings (patient_id, embedding)
VALUES (?, ?);

-- Find top 10 most similar studies for a patient
SELECT
    se.study_nct_id,
    distance
FROM study_embeddings se
WHERE embedding MATCH (
    SELECT embedding FROM patient_embeddings WHERE patient_id = ?
)
ORDER BY distance ASC
LIMIT 10;
```

```rust
// Rust integration with sqlite-vec
fn find_matching_studies(
    conn: &Connection,
    patient_id: &str,
    top_k: usize,
) -> Result<Vec<(String, f64)>> {
    let mut stmt = conn.prepare(
        "SELECT se.study_nct_id, distance
         FROM study_embeddings se
         WHERE embedding MATCH (
             SELECT embedding FROM patient_embeddings WHERE patient_id = ?1
         )
         ORDER BY distance ASC
         LIMIT ?2"
    )?;

    let results = stmt.query_map(params![patient_id, top_k], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?
    .collect::<Result<Vec<_>, _>>()?;

    Ok(results)
}
```

### Cosine Similarity Interpretation

| Distance | Similarity | Interpretation |
|----------|-----------|----------------|
| 0.0-0.3 | High | Strong semantic match — likely relevant trial |
| 0.3-0.5 | Moderate | Possible match — worth detailed evaluation |
| 0.5-0.7 | Low | Weak match — unlikely but not impossible |
| 0.7+ | None | No meaningful similarity |

### Workflow Integration

Vector similarity is used as a **pre-filter**, not as a final determination:

1. User imports a new study from ClinicalTrials.gov
2. Study criteria are embedded and stored
3. System computes similarity against all patient embeddings
4. Patients with distance < 0.5 are flagged as "potential matches"
5. Full rule-based + LLM screening is run only on potential matches
6. This reduces screening workload by 60-80% for large patient databases

---

## 7. ClinicalTrials.gov Integration

SiteConnect imports study information from ClinicalTrials.gov for screening against local patient data.

### API v2 Endpoints

Base URL: `https://clinicaltrials.gov/api/v2/`

**Search studies:**
```
GET /studies?query.cond={condition}&query.term={term}&filter.overallStatus=RECRUITING&pageSize=100

Response fields of interest:
- protocolSection.identificationModule.nctId
- protocolSection.identificationModule.briefTitle
- protocolSection.identificationModule.officialTitle
- protocolSection.statusModule.overallStatus
- protocolSection.designModule.phases
- protocolSection.conditionsModule.conditions
- protocolSection.armsInterventionsModule.interventions
- protocolSection.eligibilityModule.eligibilityCriteria
- protocolSection.eligibilityModule.sex
- protocolSection.eligibilityModule.minimumAge
- protocolSection.eligibilityModule.maximumAge
- protocolSection.contactsLocationsModule.locations
```

**Get study details:**
```
GET /studies/{nctId}
```

### Bulk Download Format

For initial database population, ClinicalTrials.gov provides bulk downloads:

- Format: Pipe-delimited text files or JSON
- Download URL: `https://clinicaltrials.gov/AllAPIJSON.zip`
- Size: ~2-3 GB compressed
- Update frequency: Daily
- Contains: All registered studies (400,000+)

### Parsing Eligibility Criteria Text

ClinicalTrials.gov stores eligibility criteria as a single text block. Parsing requires splitting into individual criteria:

```rust
fn parse_eligibility_text(text: &str) -> (Vec<String>, Vec<String>) {
    let mut inclusion_criteria = Vec::new();
    let mut exclusion_criteria = Vec::new();
    let mut current_section = None; // None, Some("inclusion"), Some("exclusion")

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }

        let lower = trimmed.to_lowercase();

        // Detect section headers
        if lower.contains("inclusion criteria") || lower.starts_with("inclusion") {
            current_section = Some("inclusion");
            continue;
        }
        if lower.contains("exclusion criteria") || lower.starts_with("exclusion") {
            current_section = Some("exclusion");
            continue;
        }

        // Skip non-criterion lines
        if trimmed.len() < 5 { continue; }

        // Strip bullet/numbering prefixes
        let criterion = trimmed
            .trim_start_matches(|c: char| c.is_numeric() || c == '.' || c == ')' || c == '-' || c == '*')
            .trim();

        if criterion.is_empty() { continue; }

        match current_section {
            Some("inclusion") => inclusion_criteria.push(criterion.to_string()),
            Some("exclusion") => exclusion_criteria.push(criterion.to_string()),
            _ => {
                // Before any section header — assume inclusion (common format)
                inclusion_criteria.push(criterion.to_string());
            }
        }
    }

    (inclusion_criteria, exclusion_criteria)
}
```

### Key Fields Mapping

| ClinicalTrials.gov Field | SiteConnect Field | Notes |
|--------------------------|-------------------|-------|
| nctId | study.nct_id | Primary identifier |
| briefTitle | study.title | Display title |
| officialTitle | study.official_title | Full protocol title |
| overallStatus | study.status | Filter for RECRUITING only |
| phases | study.phase | "Phase 1", "Phase 2", etc. |
| conditions | study.conditions | Array of condition names |
| interventions | study.interventions | Drug names, procedures |
| eligibilityCriteria | study.raw_criteria_text | Parsed into individual criteria |
| sex | study.sex_requirement | "ALL", "FEMALE", "MALE" |
| minimumAge | study.min_age | Parsed to integer years |
| maximumAge | study.max_age | Parsed to integer years |
| locations | study.locations | For site relevance filtering |

### Sync Strategy

**Initial load:**
1. User searches for studies by condition/therapeutic area
2. SiteConnect fetches matching studies via API v2
3. Studies are stored in local SQLite database
4. Eligibility criteria are parsed into individual criteria
5. Each criterion is sent through the parsing prompt (Section 2 of clinical-llm-prompts.md) to generate structured rules
6. Study embeddings are generated and stored for vector similarity

**Incremental updates:**
1. On manual refresh (user-initiated, since app is offline-first)
2. Fetch studies by NCT IDs already in local database
3. Compare `lastUpdatePostDate` to detect changes
4. Re-parse criteria if eligibility text changed
5. Update embeddings if criteria changed

**Offline handling:**
- All study data is stored locally after initial import
- Screening works entirely offline against local data
- Network is only needed for importing new studies or refreshing existing ones
- User is clearly informed of study data freshness (last sync date)

### Age Parsing

ClinicalTrials.gov expresses ages in various formats:

```rust
fn parse_age(age_str: &str) -> Option<u32> {
    let lower = age_str.to_lowercase().trim().to_string();

    // "18 Years" -> 18
    if let Some(caps) = regex::Regex::new(r"(\d+)\s*years?").unwrap().captures(&lower) {
        return caps[1].parse().ok();
    }

    // "6 Months" -> 0 (for age comparison purposes)
    if let Some(caps) = regex::Regex::new(r"(\d+)\s*months?").unwrap().captures(&lower) {
        let months: u32 = caps[1].parse().ok()?;
        return Some(months / 12);
    }

    // "N/A" or empty -> None (no age restriction)
    if lower == "n/a" || lower.is_empty() {
        return None;
    }

    None
}
```
