# Clinical LLM Prompt Templates

> Prompt engineering reference for all LLM-powered features in TalOS SiteConnect.
> These templates target the Gemma 4 model family (E2B, E4B, 26B-A4B), running locally via llama.cpp sidecar.
> Previously targeted BioMistral-7B and Gemma-3-1B; updated April 2026 for Gemma 4 with native JSON output and function calling.

---

## Table of Contents

1. [Eligibility Criterion Evaluation](#1-eligibility-criterion-evaluation)
2. [Criteria Parsing (NL to Structured Rules)](#2-criteria-parsing-nl-to-structured-rules)
3. [Medical Entity Extraction](#3-medical-entity-extraction)
4. [Population Insight Generation](#4-population-insight-generation)
5. [Column Auto-Mapping](#5-column-auto-mapping)
6. [Sponsor Pitch Content](#6-sponsor-pitch-content)
7. [General Guidelines](#7-general-guidelines)

---

## 1. Eligibility Criterion Evaluation

Evaluate a single inclusion/exclusion criterion against a patient's clinical data. This is the core screening function and the most latency-sensitive prompt in the application.

### System Prompt

```
You are a clinical trial eligibility evaluator. Your task is to determine whether a patient meets a specific inclusion or exclusion criterion based on available clinical data.

Rules:
1. Base your assessment ONLY on the provided patient data. Do not infer or assume data that is not present.
2. If the patient data does not contain enough information to evaluate the criterion, return "unknown" — never guess.
3. Provide your reasoning step-by-step before reaching a conclusion.
4. Cite specific data points from the patient record as evidence.
5. List any data elements that would be needed to make a definitive determination.
6. Return your answer as valid JSON matching the specified schema.
7. Confidence should reflect data quality and directness of evidence:
   - 1.0 = exact data match, no ambiguity
   - 0.8-0.9 = strong evidence, minor interpretation needed
   - 0.6-0.7 = indirect evidence, reasonable inference
   - 0.5 = borderline, significant uncertainty
   - Below 0.5 = return "unknown" instead
```

### User Prompt Template

```
Evaluate the following eligibility criterion against the patient data.

CRITERION:
{criterion_text}

CRITERION TYPE: {criterion_type}  // "inclusion" or "exclusion"

PATIENT DATA:
- Demographics: {demographics}
- Active Diagnoses: {diagnoses}
- Current Medications: {medications}
- Recent Lab Results: {lab_results}
- Clinical Notes (excerpts): {clinical_notes}

Respond with JSON only, no additional text.
```

### Few-Shot Examples

**Example 1: Numeric lab criterion — MET**

```
CRITERION:
"HbA1c >= 7.0% and <= 10.5% at screening"

CRITERION TYPE: inclusion

PATIENT DATA:
- Demographics: Age 58, Female, BMI 31.2
- Active Diagnoses: Type 2 Diabetes Mellitus (E11.65), Hypertension (I10)
- Current Medications: Metformin 1000mg BID, Lisinopril 10mg daily
- Recent Lab Results: HbA1c 8.2% (2025-11-15), Fasting Glucose 156 mg/dL (2025-11-15)
- Clinical Notes (excerpts): "Patient reports good medication adherence. Blood sugar logs show fasting readings 140-180 range."

RESPONSE:
{
  "result": "met",
  "confidence": 1.0,
  "evidence": "HbA1c value of 8.2% recorded on 2025-11-15 falls within the required range of 7.0%-10.5%.",
  "reasoning": "The criterion requires HbA1c between 7.0% and 10.5% inclusive. The patient's most recent HbA1c is 8.2%, which satisfies both the lower bound (8.2 >= 7.0) and upper bound (8.2 <= 10.5).",
  "missing_data": []
}
```

**Example 2: Diagnosis exclusion — NOT MET (exclusion not triggered)**

```
CRITERION:
"History of myocardial infarction within the past 6 months"

CRITERION TYPE: exclusion

PATIENT DATA:
- Demographics: Age 65, Male, BMI 28.5
- Active Diagnoses: Type 2 Diabetes Mellitus (E11.9), Hyperlipidemia (E78.5)
- Current Medications: Atorvastatin 40mg daily, Metformin 500mg BID
- Recent Lab Results: LDL 110 mg/dL (2025-10-01), Total Cholesterol 195 mg/dL (2025-10-01)
- Clinical Notes (excerpts): "Routine follow-up. No chest pain or cardiac symptoms. Last cardiology consult 2024-06-15 — normal stress test."

RESPONSE:
{
  "result": "not_met",
  "confidence": 0.85,
  "evidence": "No diagnosis of myocardial infarction found in active diagnoses. Clinical notes reference a normal stress test from 2024-06-15 with no cardiac symptoms.",
  "reasoning": "The exclusion criterion looks for MI within the past 6 months. The patient's diagnosis list does not include any MI-related ICD codes (I21.x, I22.x). Clinical notes from the most recent visit describe no chest pain or cardiac symptoms, and a prior cardiology consult showed a normal stress test. While absence of evidence is not definitive proof of absence, the available data strongly suggests no recent MI. Confidence is 0.85 rather than 1.0 because we cannot be certain the patient has not had an MI diagnosed elsewhere.",
  "missing_data": ["complete cardiac history", "hospital admission records"]
}
```

**Example 3: Insufficient data — UNKNOWN**

```
CRITERION:
"Estimated GFR >= 60 mL/min/1.73m2"

CRITERION TYPE: inclusion

PATIENT DATA:
- Demographics: Age 72, Female, BMI 24.1
- Active Diagnoses: Osteoarthritis (M17.11), Hypertension (I10)
- Current Medications: Amlodipine 5mg daily, Acetaminophen 500mg PRN
- Recent Lab Results: CBC within normal limits (2025-09-20)
- Clinical Notes (excerpts): "Knee pain managed conservatively. Blood pressure well controlled."

RESPONSE:
{
  "result": "unknown",
  "confidence": 0.0,
  "evidence": "No renal function tests (serum creatinine, BUN, or eGFR) found in the available patient data.",
  "reasoning": "The criterion requires an eGFR value of at least 60 mL/min/1.73m2. The patient's lab results only include a CBC. No serum creatinine or direct eGFR measurement is available to evaluate this criterion. While the patient's age (72) places her in a demographic where reduced eGFR is common, it would be inappropriate to infer a value without laboratory data.",
  "missing_data": ["serum creatinine", "eGFR", "BUN"]
}
```

### Output JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["result", "confidence", "evidence", "reasoning", "missing_data"],
  "properties": {
    "result": {
      "type": "string",
      "enum": ["met", "not_met", "unknown", "needs_review"]
    },
    "confidence": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0
    },
    "evidence": {
      "type": "string",
      "description": "Specific data points from the patient record supporting the conclusion"
    },
    "reasoning": {
      "type": "string",
      "description": "Step-by-step reasoning process"
    },
    "missing_data": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Data elements needed for a definitive determination"
    }
  },
  "additionalProperties": false
}
```

### Parameter Recommendations

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Temperature | 0.1 | Near-deterministic; clinical accuracy is paramount |
| Top-p | 0.9 | Slight diversity to avoid degenerate outputs |
| Top-k | 40 | Standard for factual tasks |
| Max tokens | 512 | Reasoning can be verbose; allow space |
| Repeat penalty | 1.1 | Prevent repetitive reasoning loops |
| Stop tokens | `["\n\n\n"]` | Prevent runaway generation after JSON |

---

## 2. Criteria Parsing (NL to Structured Rules)

Parse a natural language eligibility criterion into a machine-executable rule structure. Used during study setup when importing criteria from ClinicalTrials.gov.

### System Prompt

```
You are a clinical trial protocol analyst. Your task is to parse natural language eligibility criteria into structured, machine-executable rules.

Rules:
1. Identify the clinical data field(s) referenced in the criterion.
2. Determine the comparison operator(s) needed.
3. Extract threshold values with units.
4. For compound criteria (multiple conditions joined by AND/OR), break into components.
5. For temporal criteria ("within X months"), specify the time window.
6. If the criterion is too complex or subjective for rule-based evaluation, set rule_type to "llm_required".
7. Use standardized field names from the provided field vocabulary.
8. Return valid JSON matching the specified schema.

FIELD VOCABULARY:
- age, sex, bmi, weight_kg, height_cm
- diagnosis (use ICD-10 codes when identifiable)
- medication (use generic drug names)
- lab.hba1c, lab.egfr, lab.creatinine, lab.alt, lab.ast, lab.ldl, lab.hdl, lab.total_cholesterol, lab.fasting_glucose, lab.hemoglobin, lab.platelets, lab.wbc, lab.inr
- vitals.systolic_bp, vitals.diastolic_bp, vitals.heart_rate
- history (past medical history — free text search)
- procedure (past procedures)
```

### User Prompt Template

```
Parse the following eligibility criterion into a structured rule.

CRITERION:
{criterion_text}

Respond with JSON only, no additional text.
```

### Few-Shot Examples

**Example 1: Simple numeric range**

```
CRITERION:
"Age 18 to 75 years, inclusive"

RESPONSE:
{
  "field": "age",
  "operator": "between",
  "value": [18, 75],
  "unit": "years",
  "rule_type": "structured",
  "components": [],
  "temporal_window": null,
  "notes": null
}
```

**Example 2: Compound criterion with exclusion exception**

```
CRITERION:
"No active autoimmune disease requiring systemic treatment in the past 2 years, EXCEPT vitiligo, type 1 diabetes, or hypothyroidism only requiring hormone replacement"

RESPONSE:
{
  "field": "diagnosis",
  "operator": "not_exists",
  "value": null,
  "unit": null,
  "rule_type": "compound",
  "components": [
    {
      "field": "diagnosis",
      "operator": "not_in_category",
      "value": "autoimmune_disease",
      "except": ["L80", "E10", "E03.9"],
      "temporal_window": {
        "direction": "past",
        "value": 2,
        "unit": "years"
      }
    },
    {
      "field": "medication",
      "operator": "not_in_category",
      "value": "systemic_immunosuppressants",
      "temporal_window": {
        "direction": "past",
        "value": 2,
        "unit": "years"
      }
    }
  ],
  "temporal_window": {
    "direction": "past",
    "value": 2,
    "unit": "years"
  },
  "notes": "Exceptions allowed: vitiligo (L80), type 1 diabetes (E10), hypothyroidism on HRT only (E03.9). Complex criterion — LLM verification recommended for edge cases."
}
```

**Example 3: Subjective / LLM-required criterion**

```
CRITERION:
"Willing and able to comply with scheduled visits, treatment plan, laboratory tests, and other study procedures"

RESPONSE:
{
  "field": null,
  "operator": null,
  "value": null,
  "unit": null,
  "rule_type": "llm_required",
  "components": [],
  "temporal_window": null,
  "notes": "Subjective criterion requiring clinical judgment. Cannot be evaluated from structured patient data alone. Typically assessed during informed consent process."
}
```

### Output JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["field", "operator", "value", "rule_type", "components"],
  "properties": {
    "field": {
      "type": ["string", "null"],
      "description": "Standardized field name from vocabulary"
    },
    "operator": {
      "type": ["string", "null"],
      "enum": ["=", "!=", ">", ">=", "<", "<=", "in", "not_in", "between", "contains", "exists", "not_exists", "not_in_category", null]
    },
    "value": {
      "description": "Threshold value, array for ranges/lists, null if not applicable"
    },
    "unit": {
      "type": ["string", "null"]
    },
    "rule_type": {
      "type": "string",
      "enum": ["structured", "compound", "temporal", "llm_required"]
    },
    "components": {
      "type": "array",
      "description": "Sub-rules for compound criteria"
    },
    "temporal_window": {
      "type": ["object", "null"],
      "properties": {
        "direction": { "type": "string", "enum": ["past", "future", "within"] },
        "value": { "type": "number" },
        "unit": { "type": "string", "enum": ["days", "weeks", "months", "years"] }
      }
    },
    "notes": {
      "type": ["string", "null"]
    }
  },
  "additionalProperties": false
}
```

### Parameter Recommendations

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Temperature | 0.05 | Highly deterministic; structural parsing requires consistency |
| Top-p | 0.85 | Tight distribution for predictable output |
| Top-k | 30 | Restrict token selection for structured output |
| Max tokens | 768 | Compound criteria can produce large JSON |
| Repeat penalty | 1.0 | No penalty needed; output is structured |
| Stop tokens | `["\n\n\n"]` | Prevent runaway generation |

---

## 3. Medical Entity Extraction

Extract structured clinical entities (diagnoses, medications, labs, procedures, vitals) from free-text clinical notes. Used during patient data import when structured fields are insufficient.

### System Prompt

```
You are a clinical NLP system specializing in medical entity extraction. Your task is to extract structured clinical data from free-text clinical notes.

Rules:
1. Extract ALL mentioned clinical entities, even if mentioned in passing.
2. Assign ICD-10 codes to diagnoses when clearly identifiable. Use "UNMAPPED" if the condition is mentioned but you cannot determine the exact code.
3. Use generic drug names for medications. Include dose and frequency when stated.
4. For lab results, include value and unit. Mark as "qualitative" if only described (e.g., "elevated LFTs").
5. Distinguish between ACTIVE conditions and HISTORICAL conditions.
6. Do NOT infer conditions that are not explicitly mentioned.
7. Return valid JSON matching the specified schema.
```

### User Prompt Template

```
Extract all clinical entities from the following note.

CLINICAL NOTE:
{clinical_note_text}

Respond with JSON only, no additional text.
```

### Few-Shot Examples

**Example 1: Primary care visit note**

```
CLINICAL NOTE:
"58 yo female with PMH of T2DM, HTN, and obesity presents for routine follow-up. A1c improved to 7.8% from 8.5% three months ago. Currently on metformin 1000mg BID and lisinopril 20mg daily. BP today 132/82. BMI 33.4. Discussed adding GLP-1 agonist. Patient had cholecystectomy in 2019. Denied chest pain, SOB. Lipid panel: LDL 128, HDL 42, TG 198. Ordered comprehensive metabolic panel."

RESPONSE:
{
  "diagnoses": [
    {"name": "Type 2 Diabetes Mellitus", "icd10": "E11.65", "status": "active"},
    {"name": "Hypertension", "icd10": "I10", "status": "active"},
    {"name": "Obesity", "icd10": "E66.9", "status": "active"}
  ],
  "medications": [
    {"name": "metformin", "dose": "1000mg", "frequency": "BID", "status": "active"},
    {"name": "lisinopril", "dose": "20mg", "frequency": "daily", "status": "active"}
  ],
  "lab_results": [
    {"name": "HbA1c", "value": 7.8, "unit": "%", "date": null},
    {"name": "HbA1c", "value": 8.5, "unit": "%", "date": null, "note": "three months prior"},
    {"name": "LDL", "value": 128, "unit": "mg/dL", "date": null},
    {"name": "HDL", "value": 42, "unit": "mg/dL", "date": null},
    {"name": "Triglycerides", "value": 198, "unit": "mg/dL", "date": null}
  ],
  "procedures": [
    {"name": "Cholecystectomy", "date": "2019", "status": "historical"}
  ],
  "vital_signs": [
    {"name": "Blood Pressure", "systolic": 132, "diastolic": 82, "unit": "mmHg"},
    {"name": "BMI", "value": 33.4, "unit": "kg/m2"}
  ]
}
```

**Example 2: Oncology consult note**

```
CLINICAL NOTE:
"72M referred for evaluation of newly diagnosed stage IIIA NSCLC, adenocarcinoma subtype. PET/CT shows 4.2cm RUL mass with ipsilateral mediastinal lymphadenopathy. PD-L1 TPS 65%. EGFR/ALK negative. No brain mets on MRI. ECOG PS 1. Former smoker, quit 2010, 40 pack-year history. Comorbidities include COPD on tiotropium and controlled afib on apixaban 5mg BID. Cr 1.1, eGFR 68. Recommending concurrent chemoradiation with carboplatin/paclitaxel followed by durvalumab consolidation."

RESPONSE:
{
  "diagnoses": [
    {"name": "Non-small cell lung cancer, stage IIIA, adenocarcinoma", "icd10": "C34.11", "status": "active"},
    {"name": "COPD", "icd10": "J44.1", "status": "active"},
    {"name": "Atrial fibrillation", "icd10": "I48.91", "status": "active"}
  ],
  "medications": [
    {"name": "tiotropium", "dose": null, "frequency": null, "status": "active"},
    {"name": "apixaban", "dose": "5mg", "frequency": "BID", "status": "active"}
  ],
  "lab_results": [
    {"name": "PD-L1 TPS", "value": 65, "unit": "%", "date": null},
    {"name": "EGFR mutation", "value": "negative", "unit": null, "date": null, "qualitative": true},
    {"name": "ALK rearrangement", "value": "negative", "unit": null, "date": null, "qualitative": true},
    {"name": "Creatinine", "value": 1.1, "unit": "mg/dL", "date": null},
    {"name": "eGFR", "value": 68, "unit": "mL/min/1.73m2", "date": null}
  ],
  "procedures": [
    {"name": "PET/CT", "date": null, "status": "completed"},
    {"name": "Brain MRI", "date": null, "status": "completed", "finding": "no metastases"}
  ],
  "vital_signs": [
    {"name": "ECOG Performance Status", "value": 1, "unit": null}
  ]
}
```

**Example 3: Brief nursing note**

```
CLINICAL NOTE:
"Pt resting comfortably. VS stable. T 98.6 HR 72 BP 118/74 RR 16 SpO2 97% RA. IV abx continued — vancomycin 1g q12h. Wound vac in place, output minimal. Pain 3/10, managed with scheduled tylenol. Awaiting ID consult for MRSA bacteremia. Blood cx from yesterday still pending."

RESPONSE:
{
  "diagnoses": [
    {"name": "MRSA bacteremia", "icd10": "A41.02", "status": "active"}
  ],
  "medications": [
    {"name": "vancomycin", "dose": "1g", "frequency": "q12h", "status": "active", "route": "IV"},
    {"name": "acetaminophen", "dose": null, "frequency": "scheduled", "status": "active"}
  ],
  "lab_results": [
    {"name": "Blood culture", "value": "pending", "unit": null, "date": null, "qualitative": true}
  ],
  "procedures": [
    {"name": "Wound VAC therapy", "date": null, "status": "active"}
  ],
  "vital_signs": [
    {"name": "Temperature", "value": 98.6, "unit": "F"},
    {"name": "Heart Rate", "value": 72, "unit": "bpm"},
    {"name": "Blood Pressure", "systolic": 118, "diastolic": 74, "unit": "mmHg"},
    {"name": "Respiratory Rate", "value": 16, "unit": "breaths/min"},
    {"name": "SpO2", "value": 97, "unit": "%", "note": "on room air"},
    {"name": "Pain Score", "value": 3, "unit": "/10"}
  ]
}
```

### Output JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["diagnoses", "medications", "lab_results", "procedures", "vital_signs"],
  "properties": {
    "diagnoses": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "icd10", "status"],
        "properties": {
          "name": { "type": "string" },
          "icd10": { "type": "string" },
          "status": { "type": "string", "enum": ["active", "historical", "resolved"] }
        }
      }
    },
    "medications": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "status"],
        "properties": {
          "name": { "type": "string" },
          "dose": { "type": ["string", "null"] },
          "frequency": { "type": ["string", "null"] },
          "route": { "type": ["string", "null"] },
          "status": { "type": "string", "enum": ["active", "discontinued", "historical"] }
        }
      }
    },
    "lab_results": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": { "type": "string" },
          "value": {},
          "unit": { "type": ["string", "null"] },
          "date": { "type": ["string", "null"] },
          "qualitative": { "type": "boolean" },
          "note": { "type": ["string", "null"] }
        }
      }
    },
    "procedures": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": { "type": "string" },
          "date": { "type": ["string", "null"] },
          "status": { "type": "string" },
          "finding": { "type": ["string", "null"] }
        }
      }
    },
    "vital_signs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": { "type": "string" },
          "value": { "type": ["number", "null"] },
          "systolic": { "type": ["number", "null"] },
          "diastolic": { "type": ["number", "null"] },
          "unit": { "type": ["string", "null"] },
          "note": { "type": ["string", "null"] }
        }
      }
    }
  },
  "additionalProperties": false
}
```

### Parameter Recommendations

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Temperature | 0.15 | Low for accuracy; slight flexibility for ambiguous abbreviations |
| Top-p | 0.9 | Allow handling of varied medical terminology |
| Top-k | 50 | Medical vocabulary is broad |
| Max tokens | 1024 | Clinical notes can yield many entities |
| Repeat penalty | 1.0 | Repeated entity names are valid (multiple labs) |
| Stop tokens | `["\n\n\n"]` | Prevent runaway generation |

---

## 4. Population Insight Generation

Generate natural language insights about a patient population's characteristics, suitability for trials, and research opportunities. Used for the analytics dashboard and sponsor pitch features.

### System Prompt

```
You are a clinical research analyst specializing in patient population analysis for clinical trial feasibility. Your task is to generate clear, actionable insights from aggregate patient statistics.

Rules:
1. All insights must be based on the provided statistics — never fabricate numbers.
2. Frame insights in terms of clinical trial feasibility and recruitment potential.
3. Identify both strengths and gaps in the population.
4. Suggest actionable steps for improving recruitment or data completeness.
5. Use professional, sponsor-appropriate language.
6. All patient counts and percentages must reference provided data exactly.
7. NEVER include any individually identifiable information.
8. Return valid JSON matching the specified schema.
```

### User Prompt Template

```
Generate population insights from the following aggregate statistics.

STUDY CONTEXT:
- Study Title: {study_title}
- Therapeutic Area: {therapeutic_area}
- Phase: {phase}

POPULATION STATISTICS:
- Total Patients in Database: {total_patients}
- Matching Patients (met all evaluable criteria): {matching_count}
- Potentially Eligible (pending additional data): {pending_count}
- Excluded: {excluded_count}

DEMOGRAPHICS:
{demographics_summary}

DISEASE PREVALENCE:
{disease_prevalence}

LAB DISTRIBUTIONS:
{lab_distributions}

COMMON EXCLUSION REASONS:
{exclusion_reasons}

DATA COMPLETENESS:
{data_completeness}

Respond with JSON only, no additional text.
```

### Few-Shot Examples

**Example 1: Diabetes study with strong population**

```
STUDY CONTEXT:
- Study Title: "Phase III Study of Novel GLP-1/GIP Dual Agonist in T2DM"
- Therapeutic Area: Endocrinology / Diabetes
- Phase: Phase III

POPULATION STATISTICS:
- Total Patients in Database: 12,450
- Matching Patients: 847
- Potentially Eligible: 1,203
- Excluded: 10,400

DEMOGRAPHICS:
- Age: mean 56.3 (SD 11.2), range 22-89
- Sex: 54% Female, 46% Male
- Race: 62% White, 18% Black, 12% Hispanic, 5% Asian, 3% Other
- BMI: mean 32.1 (SD 5.8)

DISEASE PREVALENCE:
- T2DM: 4,820 (38.7%)
- Hypertension: 5,110 (41.0%)
- Hyperlipidemia: 3,960 (31.8%)
- CKD Stage 1-2: 890 (7.1%)
- CKD Stage 3+: 420 (3.4%)

LAB DISTRIBUTIONS:
- HbA1c (n=3,890): mean 7.9%, median 7.6%, range 5.1-14.2%
- eGFR (n=2,100): mean 78.3, median 82, range 15-120
- Fasting glucose (n=3,200): mean 148 mg/dL

COMMON EXCLUSION REASONS:
1. HbA1c out of range (>10.5% or <7.0%): 1,840 patients
2. eGFR < 60: 380 patients
3. Active insulin use: 920 patients
4. History of pancreatitis: 85 patients
5. Age out of range: 210 patients

DATA COMPLETENESS:
- HbA1c available: 80.7% of T2DM patients
- eGFR available: 43.6% of T2DM patients
- Full labs available: 38.2% of T2DM patients

RESPONSE:
{
  "insights": [
    "The site database contains 4,820 patients with T2DM (38.7% prevalence), providing a strong recruitment foundation for this Phase III study.",
    "847 patients currently meet all evaluable eligibility criteria, with an additional 1,203 potentially eligible pending data completion — primarily missing eGFR values.",
    "The mean HbA1c of 7.9% among diabetic patients aligns well with the study's 7.0-10.5% inclusion window, suggesting the population skews toward the target range.",
    "eGFR data completeness is a significant gap at only 43.6% of T2DM patients. Addressing this could move a substantial portion of the 1,203 pending patients into confirmed eligible status.",
    "The most common exclusion reason is HbA1c out of range (1,840 patients), split between too-low values (likely well-controlled patients) and too-high values (likely requiring insulin intensification).",
    "Racial diversity in the matching population (18% Black, 12% Hispanic) supports FDA diversity action plan requirements for Phase III submissions."
  ],
  "recommendations": [
    "Prioritize obtaining eGFR results for the 1,203 potentially eligible patients — a targeted lab order could significantly increase confirmed eligible counts.",
    "Consider scheduling pre-screening visits for the top 200 highest-confidence pending patients to accelerate enrollment readiness.",
    "Flag the 920 insulin-using patients for future studies that allow background insulin therapy.",
    "Implement quarterly HbA1c refresh for the T2DM cohort to capture patients who drift into the eligible range over time."
  ],
  "research_opportunities": [
    "The 420 patients with CKD Stage 3+ and concurrent T2DM represent an opportunity for renal-outcome diabetes studies (e.g., SGLT2i trials with renal endpoints).",
    "High hypertension comorbidity (41%) suggests potential for cardiovascular outcome add-on studies.",
    "The broad age range (22-89) with strong representation of patients 65+ supports geriatric subgroup analyses."
  ]
}
```

**Example 2: Oncology study with limited population**

```
STUDY CONTEXT:
- Study Title: "Phase II Basket Trial of CDK4/6 Inhibitor in HR+/HER2- mBC"
- Therapeutic Area: Oncology
- Phase: Phase II

POPULATION STATISTICS:
- Total Patients in Database: 8,200
- Matching Patients: 23
- Potentially Eligible: 41
- Excluded: 8,136

DEMOGRAPHICS:
- Age: mean 61.7 (SD 9.8), range 34-82
- Sex: 97% Female, 3% Male (of matching patients)

DISEASE PREVALENCE:
- Breast cancer (any): 312 (3.8%)
- HR+/HER2- subtype: 189 (2.3%)
- Metastatic breast cancer: 67 (0.8%)
- HR+/HER2- metastatic: 48 (0.6%)

COMMON EXCLUSION REASONS:
1. Prior CDK4/6 inhibitor use: 31 patients
2. Brain metastases: 8 patients
3. ECOG PS > 1: 6 patients
4. Inadequate organ function: 4 patients

DATA COMPLETENESS:
- Biomarker status available: 72.1% of breast cancer patients
- ECOG documented: 58.2% of oncology patients
- Recent imaging: 41.0% of metastatic patients

RESPONSE:
{
  "insights": [
    "The eligible patient pool is narrow: 23 confirmed eligible from 8,200 total patients, reflecting the specific biomarker requirements of this HR+/HER2- metastatic breast cancer trial.",
    "48 patients have the target diagnosis (HR+/HER2- mBC), but 52% are excluded — most commonly due to prior CDK4/6 inhibitor exposure (31 patients), reflecting current standard-of-care treatment patterns.",
    "41 patients are potentially eligible pending data completion, nearly doubling the confirmed pool if data gaps are resolved.",
    "The high rate of prior CDK4/6 inhibitor use (64.6% of HR+/HER2- mBC patients) is consistent with national prescribing trends and represents the primary recruitment challenge."
  ],
  "recommendations": [
    "Obtain ECOG performance status documentation for the 41 potentially eligible patients as a priority — this is the most common missing data element.",
    "Coordinate with referring oncologists to identify newly diagnosed metastatic patients who have not yet started CDK4/6 inhibitor therapy.",
    "Consider expanding the referral network to increase the metastatic breast cancer pool, given the narrow funnel.",
    "Ensure imaging is current (within 28 days of screening) for the 23 confirmed eligible patients to avoid screening failures."
  ],
  "research_opportunities": [
    "The 31 patients with prior CDK4/6 inhibitor exposure represent a potential cohort for post-progression studies or novel combination trials.",
    "The site's breast cancer population (312 patients) could support adjuvant or neoadjuvant trials with broader eligibility criteria."
  ]
}
```

### Output JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["insights", "recommendations", "research_opportunities"],
  "properties": {
    "insights": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Key observations about the population, grounded in provided data"
    },
    "recommendations": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Actionable next steps for improving recruitment or data quality"
    },
    "research_opportunities": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Adjacent trial opportunities identified from population characteristics"
    }
  },
  "additionalProperties": false
}
```

### Parameter Recommendations

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Temperature | 0.4 | Moderate creativity for natural language generation |
| Top-p | 0.92 | Allow diverse phrasing while maintaining accuracy |
| Top-k | 50 | Standard for generative text |
| Max tokens | 1024 | Insights can be detailed |
| Repeat penalty | 1.15 | Avoid repetitive insight phrasing |
| Stop tokens | `["\n\n\n"]` | Prevent runaway generation |

---

## 5. Column Auto-Mapping

Suggest mappings from user-provided CSV/Excel column headers to the SiteConnect internal schema. Used during patient data import to reduce manual configuration.

### System Prompt

```
You are a clinical data mapping assistant. Your task is to map column headers from imported patient data files to the SiteConnect internal schema fields.

INTERNAL SCHEMA FIELDS:
- patient_id: Unique patient identifier (MRN, chart number, etc.)
- first_name: Patient first/given name
- last_name: Patient last/family/surname
- date_of_birth: Patient date of birth
- age: Patient age in years
- sex: Patient biological sex (M/F)
- race: Patient race
- ethnicity: Patient ethnicity (Hispanic/Latino or not)
- weight_kg: Weight in kilograms
- height_cm: Height in centimeters
- bmi: Body mass index
- diagnosis_code: ICD-10 diagnosis code
- diagnosis_name: Diagnosis description
- diagnosis_date: Date of diagnosis
- medication_name: Medication name
- medication_dose: Medication dose
- medication_frequency: Medication dosing frequency
- medication_start_date: Medication start date
- lab_name: Laboratory test name
- lab_value: Laboratory result value
- lab_unit: Laboratory result unit
- lab_date: Laboratory result date
- lab_reference_range: Normal reference range
- procedure_name: Procedure name
- procedure_date: Procedure date
- visit_date: Date of clinical visit
- provider_name: Healthcare provider name
- notes: Clinical notes / free text

Rules:
1. Match based on column header name AND sample values when available.
2. Assign confidence scores based on match quality:
   - 1.0: Exact or near-exact match (e.g., "PatientID" -> patient_id)
   - 0.8-0.9: Strong semantic match (e.g., "DOB" -> date_of_birth)
   - 0.6-0.7: Probable match requiring confirmation (e.g., "Code" -> diagnosis_code)
   - Below 0.5: Do not suggest; mark as "unmapped"
3. Consider sample values to disambiguate (e.g., "Code" with values like "E11.9" -> diagnosis_code vs "Code" with values like "12345" -> patient_id)
4. Some columns may not map to any internal field — mark these as "unmapped".
5. Return valid JSON matching the specified schema.
```

### User Prompt Template

```
Suggest column mappings for the following imported data file.

COLUMN HEADERS AND SAMPLE VALUES:
{columns_with_samples}

Respond with JSON only, no additional text.
```

### Few-Shot Examples

**Example 1: Standard EMR export**

```
COLUMN HEADERS AND SAMPLE VALUES:
| Column | Sample 1 | Sample 2 | Sample 3 |
|--------|----------|----------|----------|
| MRN | 100234 | 100567 | 100891 |
| Patient Name | Smith, John | Doe, Jane | Johnson, Robert |
| DOB | 1965-03-15 | 1978-11-22 | 1950-07-08 |
| Gender | M | F | M |
| Primary Dx | E11.65 | I10 | C34.11 |
| Dx Description | Type 2 diabetes with hyperglycemia | Essential hypertension | Malignant neoplasm of upper lobe, right bronchus |
| Last Visit | 2025-10-15 | 2025-11-02 | 2025-09-28 |
| PCP | Dr. Williams | Dr. Chen | Dr. Patel |

RESPONSE:
{
  "mappings": [
    {"column": "MRN", "mapped_to": "patient_id", "confidence": 0.95},
    {"column": "Patient Name", "mapped_to": null, "confidence": 0.0, "note": "Combined name field — requires splitting into first_name and last_name. Format appears to be 'Last, First'."},
    {"column": "DOB", "mapped_to": "date_of_birth", "confidence": 0.95},
    {"column": "Gender", "mapped_to": "sex", "confidence": 0.85},
    {"column": "Primary Dx", "mapped_to": "diagnosis_code", "confidence": 0.95},
    {"column": "Dx Description", "mapped_to": "diagnosis_name", "confidence": 0.95},
    {"column": "Last Visit", "mapped_to": "visit_date", "confidence": 0.90},
    {"column": "PCP", "mapped_to": "provider_name", "confidence": 0.85}
  ]
}
```

**Example 2: Lab results export**

```
COLUMN HEADERS AND SAMPLE VALUES:
| Column | Sample 1 | Sample 2 | Sample 3 |
|--------|----------|----------|----------|
| Chart # | A-20345 | A-20346 | A-20347 |
| Test | Hemoglobin A1c | eGFR | LDL Cholesterol |
| Result | 8.2 | 72 | 145 |
| Units | % | mL/min/1.73m2 | mg/dL |
| Ref Range | 4.0-5.6 | >60 | <100 |
| Collection Date | 11/15/2025 | 11/15/2025 | 11/10/2025 |
| Ordering Provider | Williams, MD | Williams, MD | Chen, MD |
| Abnormal Flag | H | | H |

RESPONSE:
{
  "mappings": [
    {"column": "Chart #", "mapped_to": "patient_id", "confidence": 0.85},
    {"column": "Test", "mapped_to": "lab_name", "confidence": 0.95},
    {"column": "Result", "mapped_to": "lab_value", "confidence": 0.95},
    {"column": "Units", "mapped_to": "lab_unit", "confidence": 0.95},
    {"column": "Ref Range", "mapped_to": "lab_reference_range", "confidence": 0.90},
    {"column": "Collection Date", "mapped_to": "lab_date", "confidence": 0.90},
    {"column": "Ordering Provider", "mapped_to": "provider_name", "confidence": 0.80},
    {"column": "Abnormal Flag", "mapped_to": null, "confidence": 0.0, "note": "No direct mapping in schema. Consider deriving from result vs reference range comparison."}
  ]
}
```

**Example 3: Ambiguous headers**

```
COLUMN HEADERS AND SAMPLE VALUES:
| Column | Sample 1 | Sample 2 | Sample 3 |
|--------|----------|----------|----------|
| ID | 1001 | 1002 | 1003 |
| Name | John | Jane | Robert |
| Name2 | Smith | Doe | Johnson |
| Date | 03/15/1965 | 11/22/1978 | 07/08/1950 |
| Code | E11.9 | I10 | M17.11 |
| Value | | | |
| Notes | Diabetes well controlled | BP at goal | Bilateral knee OA |

RESPONSE:
{
  "mappings": [
    {"column": "ID", "mapped_to": "patient_id", "confidence": 0.75, "note": "Numeric sequential IDs. Could be internal record ID rather than MRN."},
    {"column": "Name", "mapped_to": "first_name", "confidence": 0.70},
    {"column": "Name2", "mapped_to": "last_name", "confidence": 0.65, "note": "Assumed to be last name based on position after first name column."},
    {"column": "Date", "mapped_to": "date_of_birth", "confidence": 0.70, "note": "Date format MM/DD/YYYY. Values suggest dates of birth based on range (1950-1978). Could also be visit_date — user should confirm."},
    {"column": "Code", "mapped_to": "diagnosis_code", "confidence": 0.90, "note": "Sample values are valid ICD-10 codes."},
    {"column": "Value", "mapped_to": null, "confidence": 0.0, "note": "Column appears empty in samples. Cannot determine mapping."},
    {"column": "Notes", "mapped_to": "notes", "confidence": 0.85}
  ]
}
```

### Output JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["mappings"],
  "properties": {
    "mappings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["column", "mapped_to", "confidence"],
        "properties": {
          "column": {
            "type": "string",
            "description": "Original column header from imported file"
          },
          "mapped_to": {
            "type": ["string", "null"],
            "description": "Internal schema field name, or null if unmapped"
          },
          "confidence": {
            "type": "number",
            "minimum": 0.0,
            "maximum": 1.0
          },
          "note": {
            "type": "string",
            "description": "Additional context or warnings about the mapping"
          }
        }
      }
    }
  },
  "additionalProperties": false
}
```

### Parameter Recommendations

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Temperature | 0.1 | Deterministic; mapping should be consistent |
| Top-p | 0.85 | Tight distribution |
| Top-k | 30 | Limited vocabulary for field names |
| Max tokens | 512 | Output is compact |
| Repeat penalty | 1.0 | Repeated field names are valid |
| Stop tokens | `["\n\n\n"]` | Prevent runaway generation |

---

## 6. Sponsor Pitch Content

Generate a site capability narrative for inclusion in sponsor pitch materials. Combines eligible patient data with site capabilities to create a compelling recruitment story.

### System Prompt

```
You are a clinical research business development writer. Your task is to generate professional, data-driven site capability narratives for clinical trial sponsors.

Rules:
1. Use exact numbers from provided data — never round in a misleading way (e.g., "847" not "approximately 850").
2. Frame the narrative to highlight site strengths while being honest about limitations.
3. Write in a professional, confident tone appropriate for sponsor-facing materials.
4. Include enrollment timeline projections based on provided data.
5. Do NOT include any patient-identifiable information.
6. Structure content for easy inclusion in a pitch deck or capability statement.
7. All claims must be directly supported by the provided data.
8. Return valid JSON matching the specified schema.
```

### User Prompt Template

```
Generate a sponsor pitch narrative for the following study opportunity.

STUDY DETAILS:
- Title: {study_title}
- Sponsor: {sponsor_name}
- Phase: {phase}
- Therapeutic Area: {therapeutic_area}
- Target Enrollment (per site): {target_enrollment}
- Enrollment Window: {enrollment_window}

SCREENING RESULTS:
- Confirmed Eligible: {eligible_count}
- Potentially Eligible (pending data): {pending_count}
- Population Demographics: {demographics_summary}
- Top Eligibility Matches: {top_criteria_match_rates}

SITE INFORMATION:
- Site Name: {site_name}
- Principal Investigator: {pi_name}
- Active Studies: {active_study_count}
- Therapeutic Experience: {therapeutic_experience}
- Annual Patient Volume: {annual_volume}

Respond with JSON only, no additional text.
```

### Few-Shot Examples

**Example 1: Strong match — diabetes trial**

```
STUDY DETAILS:
- Title: "DURATION-Next: Phase III Study of Tirzepatide vs. Semaglutide in T2DM"
- Sponsor: Lilly
- Phase: Phase III
- Therapeutic Area: Endocrinology / Diabetes
- Target Enrollment (per site): 15 patients
- Enrollment Window: 6 months

SCREENING RESULTS:
- Confirmed Eligible: 847
- Potentially Eligible: 1,203
- Population Demographics: 54% Female, mean age 56, 38% minority, mean HbA1c 7.9%
- Top Eligibility Matches: HbA1c in range (92%), eGFR >= 60 (88%), no insulin (71%)

SITE INFORMATION:
- Site Name: Metro Clinical Research Center
- Principal Investigator: Dr. Sarah Chen
- Active Studies: 12 (3 in diabetes)
- Therapeutic Experience: 8 diabetes trials completed in past 5 years, 100% enrollment target met
- Annual Patient Volume: 12,450

RESPONSE:
{
  "executive_summary": "Metro Clinical Research Center has identified 847 confirmed eligible patients for DURATION-Next, with an additional 1,203 potentially eligible pending routine lab updates. With a target of 15 patients, our confirmed eligible pool represents a 56:1 ratio, positioning us for rapid and reliable enrollment within the 6-month window.",
  "population_overview": "Our database of 12,450 active patients includes a robust type 2 diabetes cohort. Among screened patients, 92% meet the HbA1c inclusion window (7.0-10.5%), 88% have adequate renal function (eGFR >= 60), and 71% are not on insulin therapy. The population is demographically diverse (38% minority representation, 54% female) with a mean age of 56 years and mean HbA1c of 7.9%, well-centered within the study's target range.",
  "enrollment_projection": "Based on our screening data and historical conversion rates from 8 completed diabetes studies, we project enrollment of 15 patients within 8-10 weeks of site activation. Our historical screen-to-randomization rate in diabetes trials is 73%, and the depth of our eligible pool (847 confirmed) provides substantial margin for screening failures. We anticipate initiating screening of our highest-confidence candidates within 1 week of IRB approval.",
  "site_capabilities": "Dr. Sarah Chen brings extensive Phase II-IV experience with 8 diabetes trials completed over the past 5 years, achieving 100% enrollment targets across all studies. Metro Clinical Research Center currently operates 12 active studies, including 3 in diabetes, demonstrating our capacity to manage concurrent protocols. Our dedicated endocrinology research team includes 2 sub-investigators, 3 study coordinators, and a certified diabetes educator, ensuring comprehensive patient support throughout the study."
}
```

**Example 2: Moderate match — oncology trial**

```
STUDY DETAILS:
- Title: "BEACON-2: Phase II Study of Novel ADC in HER2-low Metastatic Breast Cancer"
- Sponsor: Daiichi Sankyo
- Phase: Phase II
- Therapeutic Area: Oncology
- Target Enrollment (per site): 8 patients
- Enrollment Window: 12 months

SCREENING RESULTS:
- Confirmed Eligible: 14
- Potentially Eligible: 22
- Population Demographics: 96% Female, mean age 63, 24% Black, 15% Hispanic
- Top Eligibility Matches: HER2-low confirmed (100% of eligible), ECOG 0-1 (86%), adequate organ function (79%)

SITE INFORMATION:
- Site Name: University Oncology Network
- Principal Investigator: Dr. Michael Torres
- Active Studies: 18 (7 in breast cancer)
- Therapeutic Experience: 15 breast cancer trials completed, including 3 ADC studies
- Annual Patient Volume: 8,200

RESPONSE:
{
  "executive_summary": "University Oncology Network has identified 14 confirmed eligible and 22 potentially eligible patients for BEACON-2, providing a 1.75:1 confirmed-to-target ratio with meaningful upside from the pending cohort. Our extensive ADC trial experience (3 completed studies) and active breast cancer research program (7 current studies) position us as an experienced and capable site for this Phase II study.",
  "population_overview": "From our database of 8,200 patients, we identified 14 patients with confirmed HER2-low metastatic breast cancer meeting all evaluable eligibility criteria. The eligible population is 96% female with a mean age of 63, and notably diverse with 24% Black and 15% Hispanic representation — supporting the study's diversity objectives. All 14 confirmed eligible patients have documented HER2-low status (IHC 1+ or IHC 2+/ISH-), 86% have ECOG performance status 0-1, and 79% meet organ function requirements. An additional 22 patients are potentially eligible pending updated imaging and laboratory assessments.",
  "enrollment_projection": "We project meeting the 8-patient enrollment target within 6-8 months, well within the 12-month enrollment window. Our approach will prioritize the 14 confirmed eligible patients for immediate pre-screening contact, with the 22 potentially eligible patients scheduled for updated assessments in parallel. Based on our historical screen-to-enrollment rate of 58% in breast cancer trials, we anticipate screening approximately 14-16 patients to achieve 8 randomizations. Our referral network with 4 community oncology practices provides an additional pipeline of new HER2-low patients (estimated 2-3 new referrals per month).",
  "site_capabilities": "Dr. Michael Torres is a breast oncologist with 15 completed breast cancer trials, including 3 antibody-drug conjugate studies directly relevant to BEACON-2's mechanism of action. University Oncology Network operates 18 active protocols with a dedicated Phase I-II unit staffed by oncology-certified research nurses experienced in ADC-specific toxicity monitoring. Our on-site pathology lab performs HER2 IHC/ISH testing with 48-hour turnaround, and our pharmacy has established ADC handling and preparation protocols. The site has a proven track record of retaining patients through complex oncology protocols, with a 91% completion rate across recent Phase II studies."
}
```

### Output JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["executive_summary", "population_overview", "enrollment_projection", "site_capabilities"],
  "properties": {
    "executive_summary": {
      "type": "string",
      "description": "2-3 sentence high-level summary with key numbers"
    },
    "population_overview": {
      "type": "string",
      "description": "Detailed description of the eligible population and demographics"
    },
    "enrollment_projection": {
      "type": "string",
      "description": "Timeline and methodology for meeting enrollment targets"
    },
    "site_capabilities": {
      "type": "string",
      "description": "PI experience, staff, infrastructure, and relevant track record"
    }
  },
  "additionalProperties": false
}
```

### Parameter Recommendations

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Temperature | 0.5 | Moderate creativity for engaging narrative writing |
| Top-p | 0.92 | Allow diverse vocabulary and phrasing |
| Top-k | 60 | Broad vocabulary for professional writing |
| Max tokens | 1536 | Narrative content requires more space |
| Repeat penalty | 1.2 | Avoid repetitive phrasing across sections |
| Stop tokens | `["\n\n\n"]` | Prevent runaway generation |

---

## 7. General Guidelines

### Prompt Construction Best Practices

1. **Use native JSON mode**: Gemma 4 supports `response_format: { "type": "json_object" }` natively. This is more reliable than instruction-based JSON forcing. Always enable it for structured output tasks.

2. **System prompt length**: Gemma 4 has 128K-256K context windows, so system prompts are no longer a bottleneck. However, keep system prompts focused for best results — under 1000 tokens is ideal.

3. **Context window budget** (Gemma 4 E4B, 128K tokens):
   - System prompt: ~500-1000 tokens
   - Full patient record (demographics, diagnoses, meds, labs, notes): ~5000-50000 tokens
   - Criterion context + few-shot examples: ~500-2000 tokens
   - Reserved for output: ~1000-2000 tokens
   - **Key advantage:** Can fit entire patient records in a single prompt, eliminating chunking/truncation

4. **For E2B on constrained RAM** (32K effective context):
   - Prioritize data directly relevant to the criterion being evaluated
   - Diagnoses and medications (highest signal)
   - Lab results (with dates, most recent first)
   - Clinical notes (truncate to most recent, most relevant excerpts)
   - Demographics (compact, always include)

5. **JSON repair**: Gemma 4's native JSON mode produces well-formed output, but always validate. Run through a lenient JSON parser that handles edge cases:
   - Trailing commas
   - Missing closing brackets
   - Unescaped newlines in strings

### Model-Specific Notes

**Gemma 4 E4B (Optimal Tier, 16GB+)**
- Strong clinical reasoning (GPQA Diamond 58.6%)
- Native JSON schema conformance — no few-shot examples needed for structured output
- Function calling support (86.4% t2-bench) — can use tool-based evaluation pipelines
- 128K context — fits full patient records without truncation
- Best results with temperature 0.05-0.2 for structured tasks
- Quantization: Q4_K_M (~5.0 GB) recommended; Q5_K_M (~5.5 GB) for higher quality

**Gemma 4 E2B (Recommended Tier, 4-8GB)**
- Edge-optimized: only 2.3B active parameters for fast CPU inference
- Native structured JSON output still works well
- Good for criterion evaluation and entity extraction
- 128K context native, but limit to 32K on 8GB systems for RAM headroom
- Quantization: Q4_K_M (~3.1 GB) for 8GB; IQ2_M (~2.3 GB) for 4GB systems

**Gemma 4 26B-A4B (Premium Tier, 24GB+)**
- Near-frontier reasoning (GPQA 82.3%, AIME 88.3%)
- MoE architecture: 26B total params but only 3.8B active per token — fast inference
- 256K context — can process multiple patients or entire study protocols at once
- Best for complex compound criteria, multi-factor clinical reasoning
- Quantization: Q4_K_M (~16.9 GB)

### Error Handling

When the model returns invalid or unexpected output:

1. **Retry once** with a simplified prompt (remove few-shot examples to free context)
2. **Fall back** to rule-based evaluation if available for the task
3. **Return "needs_review"** with the raw model output attached for manual review
4. **Log the failure** with full prompt and response for prompt improvement

### Batch Processing

For screening operations that evaluate many patients against many criteria:

- Process one criterion at a time across all patients (not all criteria for one patient)
- This allows caching the system prompt + criterion context
- Use Gemma 4 E2B for initial pass on simple criteria, E4B/26B-A4B for complex ones
- Parallelize across CPU cores if hardware allows (llama.cpp supports this)
- Report progress via Tauri channel events for UI updates

### Prompt Versioning

All prompt templates should be versioned. When modifying a prompt:

1. Increment the version number in the template metadata
2. Run the evaluation suite against the benchmark patient set
3. Compare accuracy metrics before and after
4. Document the change and rationale
5. Store prompt versions in the application's configuration (not hardcoded)

Current template versions:

| Template | Version | Last Updated |
|----------|---------|--------------|
| Eligibility Criterion Evaluation | 1.0 | 2026-03-06 |
| Criteria Parsing | 1.0 | 2026-03-06 |
| Medical Entity Extraction | 1.0 | 2026-03-06 |
| Population Insight Generation | 1.0 | 2026-03-06 |
| Column Auto-Mapping | 1.0 | 2026-03-06 |
| Sponsor Pitch Content | 1.0 | 2026-03-06 |
