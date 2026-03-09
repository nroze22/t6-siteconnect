# Test Case Specifications

## TalOS SiteConnect — On-Premise Patient Screening Application

| Field | Value |
|---|---|
| **Document ID** | TCS-SC-001 |
| **Version** | 1.0 |
| **Effective Date** | 2026-03-08 |
| **Classification** | GxP Regulated |
| **Parent Document** | VMP-SC-001, RTM-SC-001 |

---

### Document Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Author | __________________ | __________________ | ________ |
| Validation Lead | __________________ | __________________ | ________ |
| Quality Assurance | __________________ | __________________ | ________ |

---

### Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 0.1 | 2026-03-01 | Engineering | Initial draft |
| 1.0 | 2026-03-08 | Engineering | Released for review |

---

## Conventions

Each test case follows this structure:
- **ID**: Unique identifier (TC-{MODULE}-{NUMBER})
- **Title**: Brief descriptive title
- **Description**: What the test verifies
- **Requirement(s)**: PRD requirement(s) covered
- **Risk Level**: Critical / High / Medium / Low
- **Preconditions**: Required state before test execution
- **Test Steps**: Numbered steps with actions
- **Expected Results**: What should happen
- **Actual Results**: _(to be completed during execution)_
- **Status**: _(to be completed during execution)_ Passed / Failed / Blocked / Deferred

**Source Code References**: Where applicable, the Rust test function name is provided for automated tests.

---

## TC-SCR: Screening Engine Tests

---

### TC-SCR-001: AgeRange Rule — Pass

| Field | Value |
|---|---|
| **ID** | TC-SCR-001 |
| **Title** | AgeRange rule passes for patient within age bounds |
| **Description** | Verify that the AgeRange rule returns `passed: Some(true)` when the patient's age falls within the specified min/max range. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient data with age = 62; Rule: AgeRange { min: 18, max: 80 } |
| **Test Steps** | 1. Create a PatientData with age = Some(62). 2. Create an AgeRange rule with min = 18, max = 80. 3. Call `evaluate_rule(&rule, &patient)`. |
| **Expected Results** | `result.passed == Some(true)`. Evidence text contains "Patient age 62 is within range". Evidence source is "demographics". Confidence is 1.0. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `screening::rules::tests::test_age_range_pass` |

---

### TC-SCR-002: AgeRange Rule — Fail

| Field | Value |
|---|---|
| **ID** | TC-SCR-002 |
| **Title** | AgeRange rule fails for patient below minimum age |
| **Description** | Verify that the AgeRange rule returns `passed: Some(false)` when the patient's age is below the specified minimum. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient data with age = 62; Rule: AgeRange { min: 65, max: None } |
| **Test Steps** | 1. Create a PatientData with age = Some(62). 2. Create an AgeRange rule with min = 65, max = None. 3. Call `evaluate_rule(&rule, &patient)`. |
| **Expected Results** | `result.passed == Some(false)`. Evidence text contains "outside range". |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `screening::rules::tests::test_age_range_fail` |

---

### TC-SCR-003: AgeRange Rule — Missing Data

| Field | Value |
|---|---|
| **ID** | TC-SCR-003 |
| **Title** | AgeRange rule returns missing when no DOB available |
| **Description** | Verify that the AgeRange rule returns indeterminate result when the patient has no date of birth. |
| **Requirement(s)** | PRD-SCR-001, PRD-SCR-005 |
| **Risk Level** | Critical |
| **Preconditions** | Patient data with age = None |
| **Test Steps** | 1. Create a PatientData with age = None. 2. Create an AgeRange rule with min = 18. 3. Call `evaluate_rule(&rule, &patient)`. |
| **Expected Results** | `result.passed == None`. `result.missing_data == true`. `result.confidence == 0.0`. Evidence source is "demographics". |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `screening::rules::tests::test_missing_data` |

---

### TC-SCR-004: GenderIs Rule — Pass

| Field | Value |
|---|---|
| **ID** | TC-SCR-004 |
| **Title** | GenderIs rule passes for matching gender (case-insensitive) |
| **Description** | Verify that the GenderIs rule matches gender regardless of case. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient gender = "male"; Rule: GenderIs { gender: "Male" } |
| **Test Steps** | 1. Create PatientData with gender = Some("male"). 2. Create GenderIs rule with gender = "Male". 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(true)`. Evidence contains "Patient gender is male". |
| **Actual Results** | |
| **Status** | |
| **Automated** | Partial — covered via Or rule test |

---

### TC-SCR-005: GenderIs Rule — Fail

| Field | Value |
|---|---|
| **ID** | TC-SCR-005 |
| **Title** | GenderIs rule fails for non-matching gender |
| **Description** | Verify that the GenderIs rule returns failure when patient gender does not match. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient gender = "male"; Rule: GenderIs { gender: "female" } |
| **Test Steps** | 1. Create PatientData with gender = Some("male"). 2. Create GenderIs rule with gender = "female". 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(false)`. Evidence contains "required: female". |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — covered in `test_or_rule` (first sub-rule) |

---

### TC-SCR-006: HasDiagnosis Rule — Pass

| Field | Value |
|---|---|
| **ID** | TC-SCR-006 |
| **Title** | HasDiagnosis rule finds matching ICD-10 prefix |
| **Description** | Verify that the HasDiagnosis rule correctly identifies an active diagnosis by ICD-10 code prefix. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient has diagnosis with icd10_code = "C34.1", status = "active"; Rule: HasDiagnosis { icd10_prefix: "C34", status: "active" } |
| **Test Steps** | 1. Create PatientData with a C34.1 diagnosis. 2. Create HasDiagnosis rule with prefix "C34". 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(true)`. `result.evidence_source == Some("diagnoses")`. Evidence contains "NSCLC" and "C34.1". |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `screening::rules::tests::test_has_diagnosis` |

---

### TC-SCR-007: HasDiagnosis Rule — Fail

| Field | Value |
|---|---|
| **ID** | TC-SCR-007 |
| **Title** | HasDiagnosis rule fails when no matching diagnosis exists |
| **Description** | Verify that HasDiagnosis returns failure when the patient has diagnoses but none match the required ICD-10 prefix. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient has diagnosis C34.1; Rule: HasDiagnosis { icd10_prefix: "E11" } |
| **Test Steps** | 1. Create PatientData with C34.1 diagnosis. 2. Create HasDiagnosis rule with prefix "E11" (diabetes). 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(false)`. Evidence mentions no matching diagnosis found. |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs explicit test |

---

### TC-SCR-008: NoDiagnosis Rule — Pass

| Field | Value |
|---|---|
| **ID** | TC-SCR-008 |
| **Title** | NoDiagnosis rule passes when excluded diagnosis is absent |
| **Description** | Verify that NoDiagnosis returns pass when the patient does not have the specified diagnosis. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient has diagnosis C34.1 only; Rule: NoDiagnosis { icd10_prefix: "M06" } |
| **Test Steps** | 1. Create PatientData with only C34.1 diagnosis. 2. Create NoDiagnosis rule for M06 (autoimmune). 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(true)`. Evidence confirms no M06 diagnosis found. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `screening::rules::tests::test_no_diagnosis_pass` |

---

### TC-SCR-009: HasMedication Rule — Pass

| Field | Value |
|---|---|
| **ID** | TC-SCR-009 |
| **Title** | HasMedication rule finds active medication by substring |
| **Description** | Verify that HasMedication matches a medication by case-insensitive substring of drug name. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient on Pembrolizumab (active); Rule: HasMedication { drug_name_contains: "pembrolizumab" } |
| **Test Steps** | 1. Create PatientData with Pembrolizumab medication. 2. Create HasMedication rule with "pembrolizumab". 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(true)`. Evidence contains "Pembrolizumab (active)". |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs explicit test |

---

### TC-SCR-010: HasMedication Rule — Fail

| Field | Value |
|---|---|
| **ID** | TC-SCR-010 |
| **Title** | HasMedication rule fails when medication not found |
| **Description** | Verify that HasMedication returns failure when the patient does not have the specified medication. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient on Pembrolizumab only; Rule: HasMedication { drug_name_contains: "nivolumab" } |
| **Test Steps** | 1. Create PatientData with Pembrolizumab. 2. Create HasMedication rule for "nivolumab". 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(false)`. Evidence mentions no matching medication. |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs explicit test |

---

### TC-SCR-011: NoMedication Rule — Pass

| Field | Value |
|---|---|
| **ID** | TC-SCR-011 |
| **Title** | NoMedication rule passes when excluded medication is absent |
| **Description** | Verify that NoMedication returns pass when the patient is not on the specified medication. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient on Pembrolizumab; Rule: NoMedication { drug_name_contains: "warfarin" } |
| **Test Steps** | 1. Create PatientData with Pembrolizumab. 2. Create NoMedication rule for "warfarin". 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(true)`. |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs explicit test |

---

### TC-SCR-012: LabValueRange Rule — Pass

| Field | Value |
|---|---|
| **ID** | TC-SCR-012 |
| **Title** | LabValueRange rule passes when lab value within range |
| **Description** | Verify that LabValueRange correctly evaluates a lab result against min/max thresholds. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient has ANC = 4200 /uL; Rule: LabValueRange { test_name: "ANC", min: 1500, max: None } |
| **Test Steps** | 1. Create PatientData with ANC = 4200. 2. Create LabValueRange rule with min = 1500. 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(true)`. Evidence contains "ANC: 4200" and "within range". |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `screening::rules::tests::test_lab_value_range` |

---

### TC-SCR-013: LabValueRange Rule — Fail

| Field | Value |
|---|---|
| **ID** | TC-SCR-013 |
| **Title** | LabValueRange rule fails when lab value outside range |
| **Description** | Verify that LabValueRange returns failure when lab value is below minimum or above maximum. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient has ANC = 4200; Rule: LabValueRange { test_name: "ANC", min: 5000, max: None } |
| **Test Steps** | 1. Create PatientData with ANC = 4200. 2. Create LabValueRange rule with min = 5000. 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(false)`. Evidence contains "outside range". |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs explicit test |

---

### TC-SCR-014: VitalRange Rule — Pass

| Field | Value |
|---|---|
| **ID** | TC-SCR-014 |
| **Title** | VitalRange rule passes for vital within range |
| **Description** | Verify that VitalRange correctly evaluates a vital sign measurement. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | Critical |
| **Preconditions** | Patient bp_systolic = 128 mmHg; Rule: VitalRange { measurement_type: "bp_systolic", min: None, max: 160 } |
| **Test Steps** | 1. Create PatientData with bp_systolic = 128. 2. Create VitalRange rule with max = 160. 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(true)`. Evidence contains "bp_systolic: 128". |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs explicit test |

---

### TC-SCR-015: And Combinator — All Pass

| Field | Value |
|---|---|
| **ID** | TC-SCR-015 |
| **Title** | And combinator passes when all sub-rules pass |
| **Description** | Verify that the And combinator returns pass only when every sub-rule passes. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | High |
| **Preconditions** | Patient: age 62, diagnosis C34.1; Rule: And { AgeRange(18+), HasDiagnosis(C34) } |
| **Test Steps** | 1. Create PatientData (age=62, C34.1 diagnosis). 2. Create And rule with AgeRange and HasDiagnosis. 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(true)`. Combined evidence from both sub-rules. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `screening::rules::tests::test_and_rule` |

---

### TC-SCR-016: And Combinator — One Fails

| Field | Value |
|---|---|
| **ID** | TC-SCR-016 |
| **Title** | And combinator fails when one sub-rule fails |
| **Description** | Verify that the And combinator returns fail when any sub-rule fails (short-circuit). |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | High |
| **Preconditions** | Patient: age 62; Rule: And { AgeRange(65+), HasDiagnosis(C34) } |
| **Test Steps** | 1. Create PatientData (age=62). 2. Create And rule where AgeRange(min=65) fails. 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(false)`. Short-circuits on first failure. |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs explicit test |

---

### TC-SCR-017: Or Combinator — One Passes

| Field | Value |
|---|---|
| **ID** | TC-SCR-017 |
| **Title** | Or combinator passes when at least one sub-rule passes |
| **Description** | Verify that the Or combinator returns pass when any sub-rule passes. |
| **Requirement(s)** | PRD-SCR-001 |
| **Risk Level** | High |
| **Preconditions** | Patient: age 62, gender male; Rule: Or { GenderIs("female"), AgeRange(18+) } |
| **Test Steps** | 1. Create PatientData (age=62, male). 2. Create Or rule where GenderIs fails but AgeRange passes. 3. Call `evaluate_rule`. |
| **Expected Results** | `result.passed == Some(true)`. Short-circuits on first pass. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `screening::rules::tests::test_or_rule` |

---

### TC-SCR-018: Eligible Classification

| Field | Value |
|---|---|
| **ID** | TC-SCR-018 |
| **Title** | Patient classified as eligible when all criteria satisfied |
| **Description** | Verify that a patient meeting all inclusion criteria with no exclusions and no missing data is classified as "eligible". |
| **Requirement(s)** | PRD-SCR-002 |
| **Risk Level** | Critical |
| **Preconditions** | Database with patient meeting all criteria; study with only structured rules |
| **Test Steps** | 1. Create test DB with patient satisfying all inclusion criteria. 2. Ensure no exclusion criteria are triggered. 3. Ensure no criteria require LLM. 4. Call `ScreeningEngine::screen_patient`. |
| **Expected Results** | `overall_status == "eligible"`. `score == 100.0`. `inclusion_met == inclusion_total`. `exclusion_triggered == 0`. `missing_data_count == 0`. |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs test with all-structured criteria |

---

### TC-SCR-019: Ineligible Classification (Exclusion Triggered)

| Field | Value |
|---|---|
| **ID** | TC-SCR-019 |
| **Title** | Patient classified as ineligible when exclusion criterion triggered |
| **Description** | Verify that triggering any exclusion criterion results in "ineligible" status regardless of inclusion score. |
| **Requirement(s)** | PRD-SCR-002 |
| **Risk Level** | Critical |
| **Preconditions** | Patient with active autoimmune diagnosis (M06.x) that matches an exclusion criterion |
| **Test Steps** | 1. Create patient with M06.9 diagnosis. 2. Create study with NoDiagnosis(M06) exclusion. 3. Screen patient. |
| **Expected Results** | `overall_status == "ineligible"`. `exclusion_triggered >= 1`. Score <= 30. |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs explicit test |

---

### TC-SCR-020: Potentially Eligible Classification

| Field | Value |
|---|---|
| **ID** | TC-SCR-020 |
| **Title** | Patient classified as potentially_eligible at 70%+ inclusion |
| **Description** | Verify that patients meeting 70%+ of inclusion criteria with 2 or fewer missing data points are classified as "potentially_eligible". |
| **Requirement(s)** | PRD-SCR-002 |
| **Risk Level** | High |
| **Preconditions** | Patient meeting 3 of 4 inclusion criteria, 1 missing |
| **Test Steps** | 1. Create study with 4 inclusion criteria. 2. Create patient meeting 3 criteria, 1 unknown. 3. Screen patient. |
| **Expected Results** | `overall_status == "potentially_eligible"`. `inclusion_met / inclusion_total >= 0.7`. |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs explicit test |

---

### TC-SCR-021: Needs Review Classification

| Field | Value |
|---|---|
| **ID** | TC-SCR-021 |
| **Title** | Patient classified as needs_review with excessive missing data |
| **Description** | Verify that patients with more than 3 missing data points are classified as "needs_review". |
| **Requirement(s)** | PRD-SCR-002 |
| **Risk Level** | High |
| **Preconditions** | Patient with minimal data; study with many criteria |
| **Test Steps** | 1. Create patient with only demographics (no diagnoses, meds, labs). 2. Create study with 5+ criteria requiring clinical data. 3. Screen patient. |
| **Expected Results** | `overall_status == "needs_review"`. `missing_data_count > 3`. |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs explicit test |

---

### TC-SCR-022: Score Calculation

| Field | Value |
|---|---|
| **ID** | TC-SCR-022 |
| **Title** | Eligibility score calculated correctly |
| **Description** | Verify the score formula: `(inclusion_met / inclusion_total) * 100 * (1 - missing_penalty * 0.3)`, clamped to [0, 100]. |
| **Requirement(s)** | PRD-SCR-003 |
| **Risk Level** | High |
| **Preconditions** | Known patient with deterministic criterion outcomes |
| **Test Steps** | 1. Screen patient against known study. 2. Manually compute expected score. 3. Compare. |
| **Expected Results** | Computed score matches expected value (within rounding). |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs explicit test |

---

### TC-SCR-023: Evidence Population

| Field | Value |
|---|---|
| **ID** | TC-SCR-023 |
| **Title** | Evidence text and source populated for each criterion |
| **Description** | Verify that every criterion evaluation includes non-empty evidence and source. |
| **Requirement(s)** | PRD-SCR-004 |
| **Risk Level** | High |
| **Preconditions** | Standard test patient and study |
| **Test Steps** | 1. Screen patient. 2. Iterate all criteria_results. 3. Verify evidence and evidence_source are populated. |
| **Expected Results** | All criterion evaluations have non-None evidence and evidence_source. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `test_has_diagnosis` checks evidence_source |

---

### TC-SCR-024: Missing Data Handling

| Field | Value |
|---|---|
| **ID** | TC-SCR-024 |
| **Title** | Missing data returns indeterminate result |
| **Description** | Verify behavior when patient data is completely empty. |
| **Requirement(s)** | PRD-SCR-005 |
| **Risk Level** | High |
| **Preconditions** | Patient with all fields None/empty |
| **Test Steps** | 1. Create PatientData with age=None, gender=None, empty diagnoses/meds/labs/vitals. 2. Evaluate AgeRange rule. |
| **Expected Results** | `passed == None`. `missing_data == true`. `confidence == 0.0`. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `screening::rules::tests::test_missing_data` |

---

### TC-SCR-025: Exclusion Logic — Rule Pass Means Not Met

| Field | Value |
|---|---|
| **ID** | TC-SCR-025 |
| **Title** | Exclusion criterion: rule pass mapped to "not_met" |
| **Description** | Verify that for exclusion criteria, when the underlying rule passes (e.g., NoDiagnosis finds no diagnosis), the criterion result is "not_met" (favorable). |
| **Requirement(s)** | PRD-SCR-006 |
| **Risk Level** | Critical |
| **Preconditions** | Standard test data; exclusion criterion with NoDiagnosis rule that passes |
| **Test Steps** | 1. Screen patient p001 against study s001. 2. Find the exclusion criterion result (sc004). 3. Verify result. |
| **Expected Results** | Exclusion criterion result = "not_met". exclusion_triggered = 0. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `screening::engine::tests::test_screen_patient` verifies `exclusion_triggered == 0` |

---

### TC-SCR-026: Exclusion Logic — Rule Fail Means Met

| Field | Value |
|---|---|
| **ID** | TC-SCR-026 |
| **Title** | Exclusion criterion: rule fail mapped to "met" (triggered) |
| **Description** | Verify that for exclusion criteria, when the underlying rule fails (e.g., NoDiagnosis finds the diagnosis), the criterion result is "met" (unfavorable, exclusion triggered). |
| **Requirement(s)** | PRD-SCR-006 |
| **Risk Level** | Critical |
| **Preconditions** | Patient with M06.9 (autoimmune) diagnosis; exclusion: NoDiagnosis(M06) |
| **Test Steps** | 1. Create patient with M06.9 diagnosis. 2. Screen against study with NoDiagnosis(M06) exclusion. 3. Verify exclusion result. |
| **Expected Results** | Exclusion criterion result = "met". `exclusion_triggered >= 1`. Overall status = "ineligible". |
| **Actual Results** | |
| **Status** | |
| **Automated** | No — needs explicit test |

---

### TC-SCR-027: Batch Screening Sorted

| Field | Value |
|---|---|
| **ID** | TC-SCR-027 |
| **Title** | Batch screening returns results sorted by score descending |
| **Description** | Verify that `screen_all_patients` returns results ordered by eligibility score from highest to lowest. |
| **Requirement(s)** | PRD-SCR-007 |
| **Risk Level** | Medium |
| **Preconditions** | Multiple patients in database |
| **Test Steps** | 1. Load 3+ patients with varying eligibility. 2. Call `screen_all_patients`. 3. Verify ordering. |
| **Expected Results** | Results sorted by score descending. All patients included. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `screening::engine::tests::test_screen_all_patients` |

---

### TC-SCR-028: Rule JSON Serialization

| Field | Value |
|---|---|
| **ID** | TC-SCR-028 |
| **Title** | Structured rule JSON round-trip serialization |
| **Description** | Verify that StructuredRule serializes to JSON and deserializes back to an identical rule. |
| **Requirement(s)** | PRD-SCR-008 |
| **Risk Level** | High |
| **Preconditions** | A LabValueRange rule with all fields set |
| **Test Steps** | 1. Create LabValueRange rule. 2. Serialize to JSON. 3. Deserialize back. 4. Re-serialize. 5. Compare JSON strings. |
| **Expected Results** | JSON output is identical before and after round-trip. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `screening::rules::tests::test_rule_serialization` |

---

## TC-IMP: Import Pipeline Tests

---

### TC-IMP-001: CSV File Parsed

| Field | Value |
|---|---|
| **ID** | TC-IMP-001 |
| **Title** | CSV file parsed with header detection |
| **Description** | Verify that a well-formed CSV file is parsed correctly with headers identified. |
| **Requirement(s)** | PRD-IMP-001 |
| **Risk Level** | High |
| **Preconditions** | CSV file with standard headers and 10 rows |
| **Test Steps** | 1. Provide CSV file path to `generate_preview`. 2. Verify headers extracted. 3. Verify row count matches. |
| **Expected Results** | Headers match CSV file. Preview rows match first 10 data rows. |
| **Actual Results** | |
| **Status** | |

---

### TC-IMP-002: Malformed CSV Error

| Field | Value |
|---|---|
| **ID** | TC-IMP-002 |
| **Title** | Malformed CSV produces appropriate error |
| **Description** | Verify that a file with inconsistent column counts or invalid encoding produces a descriptive error. |
| **Requirement(s)** | PRD-IMP-001 |
| **Risk Level** | High |
| **Preconditions** | CSV file with mismatched column counts |
| **Test Steps** | 1. Provide malformed CSV to import pipeline. 2. Capture error. |
| **Expected Results** | Error with code "CSV_PARSE_ERROR" returned. Import does not proceed. |
| **Actual Results** | |
| **Status** | |

---

### TC-IMP-003: Header Normalization

| Field | Value |
|---|---|
| **ID** | TC-IMP-003 |
| **Title** | Column headers normalized for matching |
| **Description** | Verify the normalize function strips case, special chars, and collapses whitespace. |
| **Requirement(s)** | PRD-IMP-002 |
| **Risk Level** | High |
| **Preconditions** | None |
| **Test Steps** | 1. normalize("Patient ID") -> "patient id". 2. normalize("patient_id") -> "patient id". 3. normalize("  DOB  ") -> "dob". 4. normalize("ICD-10 Code") -> "icd 10 code". |
| **Expected Results** | All normalizations match expected output. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `import::mapping::tests::test_normalize` |

---

### TC-IMP-004: Exact Match Confidence

| Field | Value |
|---|---|
| **ID** | TC-IMP-004 |
| **Title** | Exact column name match returns confidence 1.0 |
| **Description** | Verify that an exact alias match produces maximum confidence. |
| **Requirement(s)** | PRD-IMP-002 |
| **Risk Level** | High |
| **Preconditions** | None |
| **Test Steps** | 1. Call `similarity("patient_id", "patient_id")`. 2. Verify score. |
| **Expected Results** | Score == 1.0 (within f64 epsilon). |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `import::mapping::tests::test_exact_match` |

---

### TC-IMP-005: Common Headers Auto-Mapped

| Field | Value |
|---|---|
| **ID** | TC-IMP-005 |
| **Title** | Standard EMR headers auto-mapped to target fields |
| **Description** | Verify that common headers (Patient ID, DOB, Gender, ICD-10, Diagnosis, Medication) are correctly auto-mapped. |
| **Requirement(s)** | PRD-IMP-002 |
| **Risk Level** | Critical |
| **Preconditions** | Headers: ["Patient ID", "DOB", "Gender", "ICD-10", "Diagnosis", "Medication"] |
| **Test Steps** | 1. Call `auto_map_columns` with the headers. 2. Verify each target field mapping. |
| **Expected Results** | Patient ID -> site_patient_id. DOB -> date_of_birth. Gender -> gender. ICD-10 -> icd10_code. All with confidence >= 0.5. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `import::mapping::tests::test_auto_map_common_headers` |

---

### TC-IMP-006: Epic Headers Auto-Mapped

| Field | Value |
|---|---|
| **ID** | TC-IMP-006 |
| **Title** | Epic-specific headers auto-mapped |
| **Description** | Verify that Epic EMR export headers (PAT_MRN_ID, BIRTH_DATE, SEX_C) are correctly mapped. |
| **Requirement(s)** | PRD-IMP-002 |
| **Risk Level** | High |
| **Preconditions** | Headers: ["PAT_MRN_ID", "BIRTH_DATE", "SEX_C"] |
| **Test Steps** | 1. Call `auto_map_columns` with Epic headers. 2. Verify mappings. |
| **Expected Results** | PAT_MRN_ID -> site_patient_id. BIRTH_DATE -> date_of_birth. SEX_C -> gender. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `import::mapping::tests::test_auto_map_epic_headers` |

---

### TC-IMP-007: No Duplicate Target Assignments

| Field | Value |
|---|---|
| **ID** | TC-IMP-007 |
| **Title** | Only one source column maps to each target field |
| **Description** | Verify that when multiple source columns could map to the same target, only the highest-confidence mapping is kept. |
| **Requirement(s)** | PRD-IMP-002 |
| **Risk Level** | High |
| **Preconditions** | Headers: ["Patient ID", "MRN", "Gender"] (both map to site_patient_id) |
| **Test Steps** | 1. Call `auto_map_columns`. 2. Count mappings to site_patient_id. |
| **Expected Results** | Exactly 1 mapping to site_patient_id. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `import::mapping::tests::test_no_duplicate_target_mappings` |

---

### TC-IMP-008: Confidence Threshold

| Field | Value |
|---|---|
| **ID** | TC-IMP-008 |
| **Title** | Low-confidence matches below 0.5 not auto-mapped |
| **Description** | Verify that column headers with no good alias match are not auto-mapped. |
| **Requirement(s)** | PRD-IMP-002 |
| **Risk Level** | High |
| **Preconditions** | Headers: ["XYZ_RANDOM_COLUMN", "FOOBAR"] |
| **Test Steps** | 1. Call `auto_map_columns` with unrecognizable headers. 2. Verify no mappings created. |
| **Expected Results** | `field_mappings` is empty or contains no entries for these headers. |
| **Actual Results** | |
| **Status** | |

---

### TC-IMP-009 through TC-IMP-017

_(Abbreviated for space — follow same format as above)_

| ID | Title | Risk | Automated |
|---|---|---|---|
| TC-IMP-009 | Import preview shows headers and sample rows | Medium | No |
| TC-IMP-010 | New patients inserted into database | Critical | No |
| TC-IMP-011 | Existing patients updated with COALESCE | Critical | No |
| TC-IMP-012 | Diagnoses deduplicated by patient + description | High | No |
| TC-IMP-013 | Medications deduplicated by patient + drug name | High | No |
| TC-IMP-014 | Lab results always inserted (no dedup) | High | No |
| TC-IMP-015 | Rows with empty patient ID skipped | Medium | No |
| TC-IMP-016 | Audit entry created on import | High | No |
| TC-IMP-017 | Per-row errors reported without aborting | Medium | No |

---

## TC-AUD: Audit Trail Tests

---

### TC-AUD-001: Immutable Entries

| Field | Value |
|---|---|
| **ID** | TC-AUD-001 |
| **Title** | Audit log entries cannot be updated or deleted from application layer |
| **Description** | Verify that the application does not provide any mechanism to modify or delete audit entries. |
| **Requirement(s)** | PRD-AUD-001 |
| **Risk Level** | Critical |
| **Preconditions** | Database with existing audit entries |
| **Test Steps** | 1. Write several audit entries. 2. Verify no UPDATE or DELETE commands exist in audit module. 3. Attempt to modify via direct SQL (should break chain). |
| **Expected Results** | No update/delete functions exist. Direct SQL modification detected by chain verification. |
| **Actual Results** | |
| **Status** | |

---

### TC-AUD-002: Checksum Chain Correct

| Field | Value |
|---|---|
| **ID** | TC-AUD-002 |
| **Title** | SHA-256 checksum chains from previous entry |
| **Description** | Verify that each entry's checksum is computed from the previous entry's checksum + current entry data. |
| **Requirement(s)** | PRD-AUD-002 |
| **Risk Level** | Critical |
| **Preconditions** | Empty database |
| **Test Steps** | 1. Write 4 audit entries. 2. Verify chain with `verify_audit_chain`. 3. Verify count = 4. |
| **Expected Results** | Chain verifies with count = 4. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `db::audit::tests::test_audit_chain_integrity` |

---

### TC-AUD-003: Genesis Entry Checksum

| Field | Value |
|---|---|
| **ID** | TC-AUD-003 |
| **Title** | First entry chains from 64-character zero string |
| **Description** | Verify that the genesis (first) audit entry uses the all-zeros string as its "previous checksum". |
| **Requirement(s)** | PRD-AUD-002 |
| **Risk Level** | Critical |
| **Preconditions** | Empty audit log |
| **Test Steps** | 1. Write one entry. 2. Read its checksum. 3. Manually compute SHA-256("000...000|timestamp|action|details"). 4. Compare. |
| **Expected Results** | Computed checksum matches stored checksum. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `db::audit::tests::test_write_audit_entry` |

---

### TC-AUD-004: Tampering Detection

| Field | Value |
|---|---|
| **ID** | TC-AUD-004 |
| **Title** | Chain verification detects modified entry |
| **Description** | Verify that modifying any entry's details causes `verify_audit_chain` to return an error. |
| **Requirement(s)** | PRD-AUD-003 |
| **Risk Level** | Critical |
| **Preconditions** | Database with 2+ audit entries |
| **Test Steps** | 1. Write 2 entries. 2. Directly UPDATE the second entry's details to "TAMPERED". 3. Call `verify_audit_chain`. |
| **Expected Results** | Function returns Err. Error message contains "integrity violation". |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `db::audit::tests::test_audit_chain_detects_tampering` |

---

### TC-AUD-005: Empty Chain Verification

| Field | Value |
|---|---|
| **ID** | TC-AUD-005 |
| **Title** | Empty audit chain verifies with count 0 |
| **Description** | Verify that an empty audit log passes verification and returns count = 0. |
| **Requirement(s)** | PRD-AUD-003 |
| **Risk Level** | Medium |
| **Preconditions** | Empty database with schema |
| **Test Steps** | 1. Initialize DB with no entries. 2. Call `verify_audit_chain`. |
| **Expected Results** | Returns Ok(0). |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `db::audit::tests::test_empty_audit_chain_verifies` |

---

### TC-AUD-006: Multi-Entry Chain Verification

| Field | Value |
|---|---|
| **ID** | TC-AUD-006 |
| **Title** | Chain with multiple entries verifies correctly |
| **Description** | Verify that a chain of 4 entries with different actions all verify correctly. |
| **Requirement(s)** | PRD-AUD-003 |
| **Risk Level** | Critical |
| **Preconditions** | Empty database |
| **Test Steps** | 1. Write entries: DatabaseInitialized, PatientImported, ScreeningExecuted, CriterionOverridden. 2. Verify chain. |
| **Expected Results** | Returns Ok(4). |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `db::audit::tests::test_audit_chain_integrity` |

---

### TC-AUD-007: All Actions Recorded

| Field | Value |
|---|---|
| **ID** | TC-AUD-007 |
| **Title** | All 9 audit action types serialize to correct strings |
| **Description** | Verify each AuditAction variant maps to its expected string representation. |
| **Requirement(s)** | PRD-AUD-004 |
| **Risk Level** | High |
| **Preconditions** | None |
| **Test Steps** | 1. For each AuditAction variant, call `as_str()`. 2. Verify against expected string. |
| **Expected Results** | PatientImported -> "patient_imported", etc. for all 9 variants. |
| **Actual Results** | |
| **Status** | |

---

### TC-AUD-008: Entry Field Completeness

| Field | Value |
|---|---|
| **ID** | TC-AUD-008 |
| **Title** | Audit entry contains all required fields |
| **Description** | Verify that each audit entry has id, timestamp, action, details, and checksum. |
| **Requirement(s)** | PRD-AUD-005 |
| **Risk Level** | High |
| **Preconditions** | Empty database |
| **Test Steps** | 1. Write an entry. 2. Query: SELECT id, timestamp, action, details, checksum FROM audit_log. 3. Verify no NULL fields. |
| **Expected Results** | All 5 fields are non-NULL. ID is valid UUID. Timestamp is ISO 8601. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `db::audit::tests::test_write_audit_entry` |

---

## TC-SEC: Security Tests

---

### TC-SEC-001: AES-256 Encryption Active

| Field | Value |
|---|---|
| **ID** | TC-SEC-001 |
| **Title** | Database file is encrypted with AES-256 |
| **Description** | Verify that the database file on disk is not readable as plain SQLite. |
| **Requirement(s)** | PRD-SEC-001 |
| **Risk Level** | Critical |
| **Preconditions** | Database initialized with passphrase |
| **Test Steps** | 1. Locate DB file on disk. 2. Attempt to open with standard sqlite3 CLI. 3. Verify failure. 4. Attempt to read first bytes of file. |
| **Expected Results** | sqlite3 CLI reports "file is not a database". File header does not start with "SQLite format 3". |
| **Actual Results** | |
| **Status** | |

---

### TC-SEC-002: PBKDF2 Iteration Count

| Field | Value |
|---|---|
| **ID** | TC-SEC-002 |
| **Title** | PBKDF2 configured with 256,000 iterations |
| **Description** | Verify the KDF iteration count is set correctly. |
| **Requirement(s)** | PRD-SEC-002 |
| **Risk Level** | Critical |
| **Preconditions** | Database opened with correct passphrase |
| **Test Steps** | 1. Open database. 2. Query `PRAGMA kdf_iter`. |
| **Expected Results** | Returns 256000. |
| **Actual Results** | |
| **Status** | |

---

### TC-SEC-003: Wrong Passphrase Rejected

| Field | Value |
|---|---|
| **ID** | TC-SEC-003 |
| **Title** | Incorrect passphrase returns error |
| **Description** | Verify that attempting to open the database with a wrong passphrase is rejected. |
| **Requirement(s)** | PRD-SEC-003 |
| **Risk Level** | Critical |
| **Preconditions** | Database initialized with passphrase "correct_passphrase" |
| **Test Steps** | 1. Call `init_database` with passphrase "wrong_passphrase". 2. Capture error. |
| **Expected Results** | Returns `DbError::InvalidPassphrase`. Database contents not accessible. |
| **Actual Results** | |
| **Status** | |

---

### TC-SEC-004: Passphrase Zeroed from Memory

| Field | Value |
|---|---|
| **ID** | TC-SEC-004 |
| **Title** | Passphrase zeroed after use via zeroize crate |
| **Description** | Verify that the zeroize crate is used to clear the passphrase from memory. |
| **Requirement(s)** | PRD-SEC-004 |
| **Risk Level** | Critical |
| **Preconditions** | Source code review |
| **Test Steps** | 1. Verify `zeroize` is in Cargo.toml dependencies. 2. Verify passphrase variables use `Zeroize` or `ZeroizeOnDrop`. |
| **Expected Results** | Dependency present. Passphrase variables are zeroed on scope exit. |
| **Actual Results** | |
| **Status** | |

---

### TC-SEC-005: No Outbound PHI Connections

| Field | Value |
|---|---|
| **ID** | TC-SEC-005 |
| **Title** | Application makes no outbound network connections with PHI |
| **Description** | Verify via network monitoring that the application does not transmit data to external hosts. |
| **Requirement(s)** | PRD-SEC-005 |
| **Risk Level** | Critical |
| **Preconditions** | Application running with patient data loaded |
| **Test Steps** | 1. Start network monitor (e.g., Wireshark, Little Snitch). 2. Perform all operations: import, screen, review, export. 3. Review network log. |
| **Expected Results** | Zero outbound connections to non-localhost addresses. Only 127.0.0.1 traffic (LLM sidecar, if running). |
| **Actual Results** | |
| **Status** | |

---

### TC-SEC-006: WAL Mode Enabled

| Field | Value |
|---|---|
| **ID** | TC-SEC-006 |
| **Title** | SQLite WAL journaling mode active |
| **Description** | Verify that the database uses Write-Ahead Logging for crash resilience. |
| **Requirement(s)** | PRD-SEC-006 |
| **Risk Level** | High |
| **Preconditions** | Database opened |
| **Test Steps** | 1. Query `PRAGMA journal_mode`. |
| **Expected Results** | Returns "wal". |
| **Actual Results** | |
| **Status** | |

---

### TC-SEC-007: Database Inaccessible Without Passphrase

| Field | Value |
|---|---|
| **ID** | TC-SEC-007 |
| **Title** | Database file cannot be read without passphrase |
| **Description** | Verify that the encrypted database file resists direct access attempts. |
| **Requirement(s)** | PRD-SEC-007 |
| **Risk Level** | Critical |
| **Preconditions** | Database file on disk |
| **Test Steps** | 1. Copy database file. 2. Attempt to open with SQLite CLI (no key). 3. Attempt to read with hex editor. |
| **Expected Results** | SQLite CLI fails. Hex dump shows encrypted (non-plaintext) content. |
| **Actual Results** | |
| **Status** | |

---

## TC-DB: Database Tests

---

### TC-DB-001: Schema Migration

| Field | Value |
|---|---|
| **ID** | TC-DB-001 |
| **Title** | Schema migration creates all required tables |
| **Description** | Verify that `run_migrations` creates all tables without error. |
| **Requirement(s)** | PRD-DB-001 |
| **Risk Level** | Critical |
| **Preconditions** | In-memory database |
| **Test Steps** | 1. Create in-memory connection. 2. Run `run_migrations`. 3. Count tables. |
| **Expected Results** | At least 12 tables created. No errors. |
| **Actual Results** | |
| **Status** | |
| **Automated** | Yes — `db::tests::test_init_database_in_memory` |

---

### TC-DB-002: Table Column Verification

| Field | Value |
|---|---|
| **ID** | TC-DB-002 |
| **Title** | All 13 tables have correct columns |
| **Description** | Verify column names and types for each table match schema specification. |
| **Requirement(s)** | PRD-DB-002 |
| **Risk Level** | High |
| **Preconditions** | Database initialized |
| **Test Steps** | 1. For each table, run `PRAGMA table_info(table_name)`. 2. Verify columns match specification. |
| **Expected Results** | All columns present with correct names. |
| **Actual Results** | |
| **Status** | |

---

### TC-DB-003 through TC-DB-005

| ID | Title | Risk | Automated |
|---|---|---|---|
| TC-DB-003 | r2d2 connection pool handles concurrent access | High | No |
| TC-DB-004 | Foreign key constraints enforced | Medium | No |
| TC-DB-005 | All 13 performance indexes created | Medium | No |

---

## TC-ANL: Analytics Tests

| ID | Title | Risk | Preconditions | Expected Results |
|---|---|---|---|---|
| TC-ANL-001 | Patient demographics analytics computed | Medium | Database with 100+ patients | Demographics summary returned with gender, age distributions |
| TC-ANL-002 | Per-study screening analytics | Medium | Screening results in DB | Per-study yield and eligibility distribution returned |
| TC-ANL-003 | Summary metrics accurate | Low | Data in DB | Total patients, studies, screenings match actual counts |
| TC-ANL-004 | Data provider bridges Tauri and demo | Medium | Both modes testable | Same interface returns data in both modes |

---

## TC-EXP: Export Tests

| ID | Title | Risk | Preconditions | Expected Results |
|---|---|---|---|---|
| TC-EXP-001 | Screening results export | Medium | Screening data in DB | Export file created with correct data |
| TC-EXP-002 | CSV export format | Medium | Export triggered | CSV has headers, correct column count, valid data |

---

## TC-LLM: LLM Integration Tests

---

### TC-LLM-001: Localhost-Only Communication

| Field | Value |
|---|---|
| **ID** | TC-LLM-001 |
| **Title** | LLM communication restricted to localhost |
| **Description** | Verify that all LLM HTTP requests are sent to 127.0.0.1 only. |
| **Requirement(s)** | PRD-LLM-001 |
| **Risk Level** | Critical |
| **Preconditions** | Source code review + runtime verification |
| **Test Steps** | 1. Search codebase for reqwest calls. 2. Verify all URLs use "127.0.0.1" or "localhost". 3. Monitor network during LLM evaluation. |
| **Expected Results** | All HTTP requests directed to 127.0.0.1:{port}. Zero external requests. |
| **Actual Results** | |
| **Status** | |

---

### TC-LLM-002: Valid GGUF Path Accepted

| Field | Value |
|---|---|
| **ID** | TC-LLM-002 |
| **Title** | Valid .gguf model file path accepted |
| **Description** | Verify that `set_llm_model` accepts a valid path to an existing .gguf file. |
| **Requirement(s)** | PRD-LLM-002 |
| **Risk Level** | High |
| **Preconditions** | A .gguf file exists on disk |
| **Test Steps** | 1. Call `set_llm_model` with valid .gguf path. 2. Verify status changes to ModelReady. |
| **Expected Results** | Status = ModelReady. model_path set. No error. |
| **Actual Results** | |
| **Status** | |

---

### TC-LLM-003: Non-GGUF Path Rejected

| Field | Value |
|---|---|
| **ID** | TC-LLM-003 |
| **Title** | Non-.gguf file path rejected |
| **Description** | Verify that `set_llm_model` rejects files without .gguf extension. |
| **Requirement(s)** | PRD-LLM-002 |
| **Risk Level** | High |
| **Preconditions** | A non-.gguf file exists |
| **Test Steps** | 1. Call `set_llm_model` with path to a .bin file. |
| **Expected Results** | Error: "Model must be a GGUF file". Status unchanged. |
| **Actual Results** | |
| **Status** | |

---

### TC-LLM-004 through TC-LLM-011

| ID | Title | Risk |
|---|---|---|
| TC-LLM-004 | Status transitions: NotConfigured -> ModelReady -> Starting -> Running -> Stopped | High |
| TC-LLM-005 | Server starts with correct parameters (ctx-size, threads, host) | High |
| TC-LLM-006 | Server stop kills process and waits | High |
| TC-LLM-007 | Health check returns true when server running | Medium |
| TC-LLM-008 | Criterion evaluation returns valid JSON with result, confidence, reasoning, evidence | High |
| TC-LLM-009 | Unparseable LLM output returns unknown with confidence 0.0 | Critical |
| TC-LLM-010 | When LLM offline, criteria marked as needs_review | Critical |
| TC-LLM-011 | Binary discovery checks bundled -> data dir -> PATH -> common paths in order | Medium |

---

## TC-UI: User Interface Tests

---

### TC-UI-001: Setup Screen on First Launch

| Field | Value |
|---|---|
| **ID** | TC-UI-001 |
| **Title** | Setup screen displayed when no database exists |
| **Description** | Verify that first-time launch shows the passphrase creation screen. |
| **Requirement(s)** | PRD-UI-001 |
| **Risk Level** | High |
| **Preconditions** | No database file in application data directory |
| **Test Steps** | 1. Delete any existing database file. 2. Launch application. 3. Observe initial screen. |
| **Expected Results** | SetupScreen component rendered. Passphrase input field visible. Confirm passphrase field visible. |
| **Actual Results** | |
| **Status** | |

---

### TC-UI-002: Unlock with Correct Passphrase

| Field | Value |
|---|---|
| **ID** | TC-UI-002 |
| **Title** | Successful unlock with correct passphrase |
| **Description** | Verify that entering the correct passphrase grants access to the dashboard. |
| **Requirement(s)** | PRD-UI-002 |
| **Risk Level** | Critical |
| **Preconditions** | Database exists with known passphrase |
| **Test Steps** | 1. Launch application. 2. UnlockScreen displayed. 3. Enter correct passphrase. 4. Click unlock. |
| **Expected Results** | Dashboard loads. Sidebar navigation visible. Patient data accessible. |
| **Actual Results** | |
| **Status** | |

---

### TC-UI-003: Unlock Rejected with Wrong Passphrase

| Field | Value |
|---|---|
| **ID** | TC-UI-003 |
| **Title** | Unlock fails with incorrect passphrase |
| **Description** | Verify that an incorrect passphrase shows an error and does not grant access. |
| **Requirement(s)** | PRD-UI-002 |
| **Risk Level** | Critical |
| **Preconditions** | Database exists |
| **Test Steps** | 1. Launch application. 2. Enter wrong passphrase. 3. Click unlock. |
| **Expected Results** | Error message displayed ("Invalid passphrase"). Dashboard not accessible. Unlock screen remains. |
| **Actual Results** | |
| **Status** | |

---

### TC-UI-004 through TC-UI-008

| ID | Title | Risk |
|---|---|---|
| TC-UI-004 | Sidebar navigation reaches all modules (Screening, Trials, Pipeline, Analytics, etc.) | Medium |
| TC-UI-005 | Command palette opens via keyboard shortcut and allows search | Low |
| TC-UI-006 | Onboarding modal displays 5 steps with navigation | Low |
| TC-UI-007 | Three-panel review interface with resizable panels | Medium |
| TC-UI-008 | Empty states displayed when no data is available | Low |

---

## TC-RVW: Review Queue Tests

| ID | Title | Risk | Expected Results |
|---|---|---|---|
| TC-RVW-001 | Accept action updates review_status to "accepted" | High | Patient review_status = "accepted" in DB |
| TC-RVW-002 | Reject action updates review_status to "rejected" | High | Patient review_status = "rejected" in DB |
| TC-RVW-003 | Defer action updates review_status to "deferred" | High | Patient review_status = "deferred" in DB |
| TC-RVW-004 | Override recorded in audit trail with justification | Critical | Audit entry with action = "criterion_overridden" and details containing justification |

---

## TC-PIP: Pipeline Tests

| ID | Title | Risk | Expected Results |
|---|---|---|---|
| TC-PIP-001 | Pipeline stages rendered (identified, pre-screened, contacted, consented, enrolled) | Low | All stage columns visible with correct labels |
| TC-PIP-002 | Pipeline data loaded from data provider | Low | Patient counts per stage match data source |

---

## TC-COH: Cohort Builder Tests

| ID | Title | Risk | Expected Results |
|---|---|---|---|
| TC-COH-001 | Filter by diagnosis ICD-10 returns matching patients | Medium | Only patients with matching diagnosis returned |
| TC-COH-002 | Saved cohort persists and reloads | Medium | Cohort definition stored in DB; reloading shows same filters and results |

---

## TC-SPF: Site Performance Tests

| ID | Title | Risk | Expected Results |
|---|---|---|---|
| TC-SPF-001 | Screening rate metrics calculated | Low | Metrics match manual calculation from DB data |
| TC-SPF-002 | Data provider integration works | Low | Page renders with data from correct source |

---

## TC-PFM: Performance Tests

_(Detailed specifications in IQ-OQ-PQ-PROTOCOLS.md, PQ section)_

| ID | Title | Target | Test Type |
|---|---|---|---|
| TC-PFM-001 | Application startup | < 2 seconds | PT |
| TC-PFM-002 | Database unlock | < 1 second | PT |
| TC-PFM-003 | Single patient screening | < 100ms | PT |
| TC-PFM-004 | Batch screening (1,000 patients) | < 10 seconds | PT |
| TC-PFM-005 | CSV import (10,000 rows) | < 30 seconds | PT |
| TC-PFM-006 | Audit chain verification (10,000 entries) | < 5 seconds | PT |
| TC-PFM-008 | UI responsiveness during operations | No freeze > 500ms | PT |
| TC-PFM-009 | LLM single criterion evaluation | < 30 seconds | PT |
| TC-PFM-010 | Database query response time | < 200ms | PT |

---

## Test Case Summary

| Category | Count | Automated | Manual |
|---|---|---|---|
| TC-SCR (Screening) | 28 | 15 | 13 |
| TC-IMP (Import) | 17 | 6 | 11 |
| TC-AUD (Audit) | 8 | 6 | 2 |
| TC-SEC (Security) | 7 | 0 | 7 |
| TC-DB (Database) | 5 | 1 | 4 |
| TC-ANL (Analytics) | 4 | 0 | 4 |
| TC-EXP (Export) | 2 | 0 | 2 |
| TC-LLM (LLM) | 11 | 0 | 11 |
| TC-UI (UI/UX) | 8 | 0 | 8 |
| TC-RVW (Review) | 4 | 0 | 4 |
| TC-PIP (Pipeline) | 2 | 0 | 2 |
| TC-COH (Cohort) | 2 | 0 | 2 |
| TC-SPF (Site Performance) | 2 | 0 | 2 |
| TC-PFM (Performance) | 9 | 0 | 9 |
| **TOTAL** | **109** | **28** | **81** |

---

*End of Document*
