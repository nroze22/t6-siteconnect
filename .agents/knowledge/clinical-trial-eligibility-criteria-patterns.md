# Clinical Trial Eligibility Criteria Patterns -- Knowledge Reference

> Comprehensive guide to parsing, structuring, and evaluating clinical trial eligibility criteria for automated patient screening.

---

## 1. Common Inclusion Criteria Categories

### 1.1 Demographics

| Criterion | Typical Phrasing | Structured Rule |
|-----------|-----------------|-----------------|
| Age minimum | "Age >= 18 years at time of consent" | `{"field": "age", "operator": ">=", "value": 18, "unit": "years"}` |
| Age range | "Between 18 and 75 years of age, inclusive" | `{"field": "age", "operator": "between", "value": [18, 75], "inclusive": true}` |
| Gender/Sex | "Male or female" / "Female participants only" | `{"field": "sex", "operator": "in", "value": ["M", "F"]}` |
| Race/Ethnicity | Rarely a criterion; sometimes for PK studies | `{"field": "race", "operator": "eq", "value": "..."}` |

**Age calculation notes:**
- Age should be calculated as of the screening date or consent date (per protocol specification)
- Use date of birth from demographics, not a stored "age" field that may be stale
- Some protocols specify age in months (pediatric) or gestational age (neonatal)

### 1.2 Diagnosis (ICD-10 Patterns)

| Condition | Typical Phrasing | ICD-10 Codes | Rule |
|-----------|-----------------|--------------|------|
| Non-small cell lung cancer | "Histologically or cytologically confirmed NSCLC" | C34.0, C34.1, C34.2, C34.3, C34.8, C34.9 | `{"field": "diagnosis.icd10", "operator": "in", "value": ["C34.*"]}` |
| Type 2 diabetes | "Diagnosed with T2DM" | E11.* | `{"field": "diagnosis.icd10", "operator": "startsWith", "value": "E11"}` |
| Heart failure | "NYHA Class II-III heart failure" | I50.* | `{"field": "diagnosis.icd10", "operator": "startsWith", "value": "I50"}` |
| Major depressive disorder | "Current MDD diagnosis" | F32.*, F33.* | `{"field": "diagnosis.icd10", "operator": "in", "value": ["F32.*", "F33.*"]}` |
| Rheumatoid arthritis | "Active RA per ACR criteria" | M05.*, M06.* | `{"field": "diagnosis.icd10", "operator": "in", "value": ["M05.*", "M06.*"]}` |
| Breast cancer | "HER2+ breast cancer" | C50.* | `{"field": "diagnosis.icd10", "operator": "startsWith", "value": "C50"}` |
| Chronic kidney disease | "CKD Stage 3-4" | N18.3, N18.4 | `{"field": "diagnosis.icd10", "operator": "in", "value": ["N18.3", "N18.4"]}` |
| Atrial fibrillation | "Non-valvular AF" | I48.0, I48.1, I48.2, I48.91 | `{"field": "diagnosis.icd10", "operator": "in", "value": ["I48.0", "I48.1", "I48.2", "I48.91"]}` |

**Diagnosis matching considerations:**
- Use hierarchical matching (C34.* matches all lung cancer subcodes)
- Check both active and historical diagnoses depending on criterion
- Some criteria require histological confirmation -- this cannot be determined from ICD-10 codes alone and should be flagged for manual review

### 1.3 Lab Values

| Lab Test | LOINC Code | Common Thresholds | Normal Range |
|----------|-----------|-------------------|--------------|
| eGFR | 33914-3, 62238-1 | >= 30, >= 60, >= 90 mL/min/1.73m2 | >= 90 |
| Hemoglobin | 718-7 | >= 9.0, >= 10.0 g/dL | M: 13.5-17.5, F: 12.0-16.0 |
| Platelet count | 777-3 | >= 75,000, >= 100,000 /uL | 150,000-400,000 |
| ANC (absolute neutrophil count) | 751-8 | >= 1,000, >= 1,500 /uL | 1,500-8,000 |
| ALT/SGPT | 1742-6 | <= 3x ULN, <= 5x ULN | 7-56 U/L |
| AST/SGOT | 1920-8 | <= 3x ULN, <= 5x ULN | 10-40 U/L |
| Total bilirubin | 1975-2 | <= 1.5x ULN | 0.1-1.2 mg/dL |
| Creatinine | 2160-0 | <= 1.5x ULN | M: 0.74-1.35, F: 0.59-1.04 mg/dL |
| HbA1c | 4548-4 | >= 7.0%, <= 10.0% (diabetes trials) | < 5.7% |
| INR | 6301-6 | <= 1.5 | 0.8-1.2 |
| TSH | 3016-3 | Within normal limits | 0.4-4.0 mIU/L |
| LDL cholesterol | 13457-7 | >= 70, >= 100 mg/dL (statin trials) | < 100 mg/dL |
| Serum albumin | 1751-7 | >= 2.5, >= 3.0 g/dL | 3.5-5.5 g/dL |
| WBC | 6690-2 | >= 3,000 /uL | 4,500-11,000 |
| Potassium | 2823-3 | Within normal limits | 3.5-5.0 mEq/L |
| Sodium | 2951-2 | Within normal limits | 136-145 mEq/L |

**Lab value matching considerations:**
- "ULN" (Upper Limit of Normal) varies by lab; use the lab's reference range if available, otherwise use standard reference ranges
- Check the most recent lab value within a protocol-specified timeframe (usually within 28 days of screening)
- Units matter: mg/dL vs mmol/L for glucose, g/dL vs g/L for hemoglobin
- Some criteria specify "within X days of enrollment" -- apply temporal filtering

**Structured rule for ULN-relative criteria:**

```json
{
  "field": "lab.alt",
  "loinc": "1742-6",
  "operator": "<=",
  "value": {
    "type": "relative_to_uln",
    "multiplier": 3.0
  },
  "uln_default": 56,
  "unit": "U/L",
  "lookback_days": 28
}
```

### 1.4 Medications (Current and Prior Therapy)

| Category | Typical Phrasing | Matching Strategy |
|----------|-----------------|-------------------|
| Current therapy | "Currently receiving metformin" | Active medication list, RxNorm ingredient match |
| Prior therapy lines | "Must have received >= 1 prior line of platinum-based therapy" | Medication history, drug class match |
| Specific drug class | "On stable dose of ACE inhibitor for >= 4 weeks" | RxNorm drug class + duration |
| Combination therapy | "Currently on dual antiplatelet therapy" | Two concurrent antiplatelet agents |
| Dose requirement | "On >= 40 mg atorvastatin or equivalent statin" | Dose + drug equivalence tables |

**RxNorm Drug Class Examples:**

| Drug Class | RxNorm Ingredient Concepts | Common Members |
|-----------|---------------------------|----------------|
| Platinum agents | Cisplatin, Carboplatin, Oxaliplatin | RxCUI: 2555, 40048, 32592 |
| PD-1/PD-L1 inhibitors | Pembrolizumab, Nivolumab, Atezolizumab | RxCUI: 1547220, 1597876, 1792776 |
| ACE inhibitors | Lisinopril, Enalapril, Ramipril | Drug class: C09AA |
| Metformin | Metformin | RxCUI: 6809 |
| Statins | Atorvastatin, Rosuvastatin, Simvastatin | Drug class: C10AA |
| SSRIs | Sertraline, Fluoxetine, Escitalopram | Drug class: N06AB |
| Anticoagulants | Warfarin, Apixaban, Rivaroxaban | Drug class: B01A |

### 1.5 Vital Signs

| Vital Sign | LOINC | Common Thresholds |
|-----------|-------|-------------------|
| Systolic BP | 8480-6 | <= 140, <= 160 mmHg |
| Diastolic BP | 8462-4 | <= 90, <= 100 mmHg |
| Heart rate | 8867-4 | 50-100 bpm |
| BMI | 39156-5 | 18.5-40 kg/m2 |
| Weight | 29463-7 | >= 40 kg, >= 50 kg |
| Temperature | 8310-5 | <= 38.0 C (afebrile) |
| SpO2 | 2708-6 | >= 92%, >= 95% |

### 1.6 Organ Function Panels

Protocols frequently define organ function requirements as a panel:

```json
{
  "name": "Adequate hepatic function",
  "type": "panel",
  "operator": "and",
  "criteria": [
    {"field": "lab.alt", "operator": "<=", "value": {"type": "relative_to_uln", "multiplier": 3.0}},
    {"field": "lab.ast", "operator": "<=", "value": {"type": "relative_to_uln", "multiplier": 3.0}},
    {"field": "lab.total_bilirubin", "operator": "<=", "value": {"type": "relative_to_uln", "multiplier": 1.5}}
  ]
}
```

```json
{
  "name": "Adequate renal function",
  "type": "panel",
  "operator": "and",
  "criteria": [
    {"field": "lab.egfr", "operator": ">=", "value": 60, "unit": "mL/min/1.73m2"}
  ]
}
```

```json
{
  "name": "Adequate hematologic function",
  "type": "panel",
  "operator": "and",
  "criteria": [
    {"field": "lab.anc", "operator": ">=", "value": 1500, "unit": "/uL"},
    {"field": "lab.platelets", "operator": ">=", "value": 100000, "unit": "/uL"},
    {"field": "lab.hemoglobin", "operator": ">=", "value": 9.0, "unit": "g/dL"}
  ]
}
```

### 1.7 Performance Status

| Scale | Values | Typical Requirement |
|-------|--------|-------------------|
| ECOG | 0-5 | ECOG 0-1 (most oncology trials) or 0-2 |
| Karnofsky | 0-100 | KPS >= 70 or >= 60 |
| NYHA | I-IV | Class I-II or I-III (heart failure trials) |

```json
{
  "field": "performance_status.ecog",
  "operator": "<=",
  "value": 1,
  "note": "ECOG 0-1 required"
}
```

### 1.8 Washout Periods

| Prior Therapy | Common Washout | Rule Structure |
|--------------|---------------|----------------|
| Chemotherapy | 3-4 weeks (21-28 days) | `{"field": "medication.chemo.last_dose", "operator": "daysBefore", "value": 28}` |
| Radiotherapy | 2-4 weeks | `{"field": "procedure.radiation.last_date", "operator": "daysBefore", "value": 14}` |
| Major surgery | 4 weeks | `{"field": "procedure.major_surgery.last_date", "operator": "daysBefore", "value": 28}` |
| Immunotherapy | 4-6 weeks | `{"field": "medication.immunotherapy.last_dose", "operator": "daysBefore", "value": 42}` |
| Investigational agent | 4 weeks or 5 half-lives | `{"field": "medication.investigational.last_dose", "operator": "daysBefore", "value": 28}` |
| CYP3A4 inhibitors | 1-2 weeks | `{"field": "medication.cyp3a4_inhibitor.last_dose", "operator": "daysBefore", "value": 14}` |
| Live vaccines | 4 weeks | `{"field": "immunization.live_vaccine.last_date", "operator": "daysBefore", "value": 28}` |

---

## 2. Common Exclusion Criteria Categories

### 2.1 Concurrent Conditions

| Condition Category | Examples | ICD-10 Families |
|-------------------|----------|-----------------|
| Active infections | HIV, HBV, HCV, TB, active infection requiring IV antibiotics | B20, B18.0-B18.1, B18.2, A15-A19 |
| Autoimmune disease | SLE, RA (if not the condition under study), MS, IBD | M32.*, M05-M06.*, G35, K50-K51 |
| Cardiac conditions | Uncontrolled arrhythmia, MI within 6 months, unstable angina, CHF NYHA III-IV | I49.*, I21.*, I20.0, I50.* |
| CNS metastases | Brain metastases (with or without exceptions for treated/stable) | C79.31 |
| Prior malignancy | Second primary cancer within 5 years (exceptions for cured non-melanoma skin, CIS) | C00-C96 (excluding C44 basal/squamous) |
| Psychiatric conditions | Active suicidal ideation, uncontrolled psychiatric illness | F32.*, F33.*, R45.851 |
| Organ transplant | History of solid organ or bone marrow transplant | Z94.* |
| Uncontrolled diabetes | HbA1c > 9% or > 10% | E11.65 |

### 2.2 Concomitant Medications

| Medication Category | Reason for Exclusion | RxNorm Drug Classes |
|-------------------|---------------------|-------------------|
| Strong CYP3A4 inhibitors | Drug-drug interaction | Ketoconazole, Itraconazole, Clarithromycin, Ritonavir |
| Strong CYP3A4 inducers | Drug-drug interaction | Rifampin, Phenytoin, Carbamazepine, St. John's Wort |
| Anticoagulants | Bleeding risk | Warfarin, Heparin, Enoxaparin, DOACs |
| Systemic corticosteroids | Immunosuppression (> 10mg prednisone equivalent) | Prednisone, Dexamethasone, Methylprednisolone |
| Other immunosuppressants | Immunosuppression | Cyclosporine, Tacrolimus, Mycophenolate |
| Other investigational agents | Confounding | Any unapproved drug |

### 2.3 Pregnancy and Reproductive

```json
{
  "name": "Pregnancy exclusion",
  "type": "compound",
  "operator": "or",
  "criteria": [
    {"field": "condition.pregnancy", "operator": "eq", "value": true},
    {"field": "condition.nursing", "operator": "eq", "value": true}
  ],
  "applies_to": {"sex": "F"},
  "note": "Women of childbearing potential must have negative pregnancy test"
}
```

### 2.4 Organ Dysfunction Thresholds

These are typically the inverse of the organ function inclusion panels:

- AST/ALT > 5x ULN (severe hepatic impairment)
- eGFR < 15 mL/min (end-stage renal disease)
- Ejection fraction < 40% (cardiac dysfunction)
- FEV1 < 50% predicted (severe pulmonary impairment)

---

## 3. Parsing Natural Language Criteria into Structured Rules

### 3.1 Simple Numeric Comparisons

**Input:** "Age >= 18 years"

```json
{
  "id": "inc-001",
  "type": "inclusion",
  "text": "Age >= 18 years",
  "rule": {
    "field": "demographics.age",
    "operator": ">=",
    "value": 18,
    "unit": "years"
  },
  "automatable": true,
  "confidence": 1.0
}
```

### 3.2 Diagnosis Matching

**Input:** "Histologically confirmed non-small cell lung cancer (NSCLC)"

```json
{
  "id": "inc-002",
  "type": "inclusion",
  "text": "Histologically confirmed non-small cell lung cancer (NSCLC)",
  "rule": {
    "operator": "and",
    "criteria": [
      {
        "field": "diagnosis.icd10",
        "operator": "in",
        "value": ["C34.0", "C34.1", "C34.2", "C34.3", "C34.8", "C34.9"],
        "description": "Lung cancer diagnosis"
      },
      {
        "field": "manual_review",
        "operator": "flag",
        "reason": "Histological confirmation cannot be determined from structured data alone",
        "description": "Histologically confirmed"
      }
    ]
  },
  "automatable": "partial",
  "confidence": 0.7,
  "manual_review_reason": "Histological confirmation requires pathology report review"
}
```

### 3.3 Lab Range with ULN Reference

**Input:** "eGFR >= 60 mL/min/1.73m2 (by CKD-EPI formula)"

```json
{
  "id": "inc-003",
  "type": "inclusion",
  "text": "eGFR >= 60 mL/min/1.73m2 (by CKD-EPI formula)",
  "rule": {
    "field": "lab.egfr",
    "loinc": "62238-1",
    "operator": ">=",
    "value": 60,
    "unit": "mL/min/1.73m2",
    "lookback_days": 28,
    "use_most_recent": true
  },
  "automatable": true,
  "confidence": 0.95
}
```

### 3.4 Compound Prior Therapy Rule

**Input:** "Must have received at least 1 prior line of platinum-based chemotherapy for advanced/metastatic disease"

```json
{
  "id": "inc-004",
  "type": "inclusion",
  "text": "Must have received at least 1 prior line of platinum-based chemotherapy for advanced/metastatic disease",
  "rule": {
    "operator": "and",
    "criteria": [
      {
        "field": "medication_history",
        "operator": "drug_class_count",
        "drug_class": "platinum_agents",
        "rxnorm_ingredients": [2555, 40048, 32592],
        "min_count": 1,
        "description": "At least 1 prior platinum-based regimen"
      },
      {
        "field": "diagnosis.stage",
        "operator": "in",
        "value": ["III", "IIIA", "IIIB", "IV", "IVA", "IVB"],
        "description": "Advanced or metastatic disease"
      }
    ]
  },
  "automatable": "partial",
  "confidence": 0.6,
  "manual_review_reason": "Line of therapy determination may require chart review; staging may not be coded"
}
```

### 3.5 Temporal/Washout Rule

**Input:** "No chemotherapy within 4 weeks of first dose of study drug"

```json
{
  "id": "exc-001",
  "type": "exclusion",
  "text": "No chemotherapy within 4 weeks of first dose of study drug",
  "rule": {
    "field": "medication_history.chemotherapy.last_administration_date",
    "operator": "days_before_reference",
    "reference_date": "screening_date",
    "min_days": 28,
    "drug_class": "antineoplastic_agents",
    "description": "No chemotherapy within 28 days of screening"
  },
  "automatable": "partial",
  "confidence": 0.7,
  "manual_review_reason": "Medication administration dates may be incomplete in EMR; reference date is screening, not first dose"
}
```

### 3.6 Exclusion with Exceptions

**Input:** "No autoimmune disease requiring systemic treatment in the past 2 years EXCEPT vitiligo, resolved childhood asthma, or type 1 diabetes mellitus well-controlled on insulin"

```json
{
  "id": "exc-002",
  "type": "exclusion",
  "text": "No autoimmune disease requiring systemic treatment in the past 2 years EXCEPT vitiligo, resolved childhood asthma, or type 1 diabetes mellitus well-controlled on insulin",
  "rule": {
    "operator": "and",
    "criteria": [
      {
        "field": "diagnosis.autoimmune",
        "operator": "has_active_within_years",
        "value": 2,
        "icd10_families": ["M05.*", "M06.*", "M32.*", "M35.*", "G35", "K50.*", "K51.*", "E05.*", "L40.*", "L10.*"],
        "description": "Active autoimmune disease within 2 years"
      }
    ],
    "exceptions": [
      {"condition": "Vitiligo", "icd10": ["L80"]},
      {"condition": "Resolved childhood asthma", "icd10": ["J45.*"], "qualifier": "resolved_childhood"},
      {"condition": "T1DM on insulin", "icd10": ["E10.*"], "qualifier": "well_controlled"}
    ]
  },
  "automatable": "partial",
  "confidence": 0.5,
  "manual_review_reason": "Systemic treatment determination, exception qualifiers, and 'well-controlled' assessment require clinical judgment"
}
```

---

## 4. Therapeutic Area-Specific Patterns

### 4.1 Oncology

**Common inclusion:**
- Histologically/cytologically confirmed diagnosis
- Measurable disease per RECIST 1.1
- ECOG performance status 0-1
- Adequate organ function (hematologic, hepatic, renal)
- Prior therapy requirements (number of lines, specific agents)
- Specific biomarker status (PD-L1 TPS >= 50%, EGFR mutation-positive, ALK rearrangement)

**Common exclusion:**
- Active CNS metastases (unless treated and stable)
- Prior treatment with specific drug classes
- Active autoimmune disease
- Prior organ transplant
- Active infection requiring systemic therapy
- History of interstitial lung disease

**Key ICD-10 families:**
- C00-C96: Malignant neoplasms
- C77-C79: Secondary neoplasms (metastases)
- D00-D09: In situ neoplasms
- Z85.*: Personal history of malignant neoplasm

### 4.2 Cardiology

**Common inclusion:**
- Documented heart failure (HFrEF: EF <= 40%, HFpEF: EF >= 50%)
- NYHA Class II-III
- Stable on guideline-directed medical therapy
- Elevated NT-proBNP (> 300 pg/mL) or BNP (> 100 pg/mL)
- Documented atrial fibrillation on ECG/Holter

**Common exclusion:**
- Acute coronary syndrome within 30-90 days
- Planned cardiac surgery or PCI
- Severe valvular disease
- Hypertrophic or restrictive cardiomyopathy
- Uncontrolled hypertension (SBP > 180 or DBP > 110)

**Key ICD-10 families:**
- I20-I25: Ischemic heart disease
- I42.*: Cardiomyopathy
- I48.*: Atrial fibrillation/flutter
- I50.*: Heart failure

### 4.3 Neurology

**Common inclusion:**
- Clinical diagnosis per established criteria (McDonald for MS, MDS for Parkinson's)
- Disease duration requirements
- Specific disease severity scores (EDSS for MS, UPDRS for Parkinson's, ADAS-Cog for Alzheimer's)
- MRI findings (lesion count, brain atrophy measures)

**Common exclusion:**
- Other neurological conditions that could confound assessment
- History of seizures (unless study-specific)
- Significant psychiatric comorbidity
- Substance abuse

**Key ICD-10 families:**
- G20.*: Parkinson's disease
- G35: Multiple sclerosis
- G30.*: Alzheimer's disease
- G40.*: Epilepsy
- G43.*: Migraine

### 4.4 Diabetes/Endocrinology

**Common inclusion:**
- Diagnosed T2DM for >= 3-6 months
- HbA1c range (e.g., 7.0-10.0%)
- On stable background therapy (metformin, etc.)
- BMI range (typically 25-45 kg/m2)
- Fasting C-peptide >= 0.8 ng/mL (to confirm endogenous insulin production)

**Common exclusion:**
- Type 1 diabetes
- History of DKA
- Severe hypoglycemia within 6 months
- eGFR < 30 (renal impairment)
- Active proliferative retinopathy

**Key ICD-10 families:**
- E11.*: Type 2 diabetes
- E10.*: Type 1 diabetes
- E13.*: Other specified diabetes

### 4.5 Rare Diseases

**Special considerations:**
- Very specific genetic mutations or biomarkers
- Extremely narrow ICD-10 codes (may use orphan codes)
- Natural history data requirements
- Family history criteria
- Minimum symptom duration
- Often no prior therapy requirements (limited options)

---

## 5. Criteria That Cannot Be Determined from Data Alone

These criteria require human judgment and should be flagged for manual review:

| Criterion Type | Examples | Why It Cannot Be Automated |
|---------------|----------|--------------------------|
| Willingness/consent | "Willing and able to comply with study procedures" | Subjective, determined at consent visit |
| Clinical judgment | "In the opinion of the investigator, suitable for study participation" | Physician discretion |
| Histological confirmation | "Histologically confirmed adenocarcinoma" | Requires pathology report review |
| Imaging findings | "Measurable disease per RECIST 1.1" | Requires radiologist interpretation |
| Clinical stability | "Clinically stable for >= 4 weeks" | Requires clinical assessment |
| Adequate contraception | "Willing to use adequate contraception" | Patient agreement, not data |
| Life expectancy | "Life expectancy > 12 weeks" | Clinical judgment |
| Accessibility | "Able to travel to study site for all visits" | Logistical, not medical |
| Cognitive capacity | "Able to understand and provide informed consent" | Clinical assessment |
| Physical exam findings | "No clinically significant abnormalities on physical exam" | Requires exam |

**SiteConnect should always mark these as `automatable: false` and include them in the manual review checklist.**

---

## 6. Confidence Scoring Guidelines

When the AI/rule engine evaluates a criterion, assign a confidence score:

| Score | Label | Meaning | Example |
|-------|-------|---------|---------|
| 1.0 | Definitive | Structured data directly matches, no ambiguity | Age >= 18 checked against DOB |
| 0.9 | High | Strong match from coded data | ICD-10 diagnosis code present |
| 0.7 | Moderate | Data available but interpretation needed | Lab value within range but near threshold |
| 0.5 | Low | Partial data, inference required | Drug class match but specific agent unclear |
| 0.3 | Very Low | Limited data, significant uncertainty | Free-text note mention, no coded data |
| 0.0 | Cannot Determine | No relevant data available | No lab results for required test |

**Scoring rules:**
- Reduce confidence by 0.1 if the data is > 90 days old
- Reduce confidence by 0.2 if using free-text extraction vs coded data
- Reduce confidence by 0.2 for drug class matching (vs exact drug match)
- Set confidence to 0.0 if no data exists for the criterion
- Flag any criterion with confidence < 0.7 for manual review

---

## 7. ICD-10-CM Code Families for Common Trial Conditions

### Oncology

| Condition | ICD-10 Range | Notes |
|-----------|-------------|-------|
| Lung cancer | C34.0-C34.9 | Includes NSCLC and SCLC |
| Breast cancer | C50.0-C50.9 | By quadrant/location |
| Colorectal cancer | C18.0-C18.9, C19, C20 | Colon, rectosigmoid, rectum |
| Prostate cancer | C61 | Single code |
| Melanoma | C43.0-C43.9 | By site |
| Pancreatic cancer | C25.0-C25.9 | By location within pancreas |
| Renal cell carcinoma | C64.1-C64.9 | Kidney, except renal pelvis |
| Bladder cancer | C67.0-C67.9 | By location within bladder |
| Hepatocellular carcinoma | C22.0 | Specific subcode |
| Non-Hodgkin lymphoma | C82-C86 | Multiple subtypes |
| Multiple myeloma | C90.0 | Specific subcode |
| AML | C92.0, C92.4, C92.5 | Acute myeloblastic subtypes |

### Cardiovascular

| Condition | ICD-10 Range |
|-----------|-------------|
| Hypertension | I10-I16 |
| Coronary artery disease | I25.* |
| Acute MI | I21.* |
| Heart failure | I50.* |
| Atrial fibrillation | I48.* |
| Deep vein thrombosis | I82.* |
| Pulmonary embolism | I26.* |
| Peripheral artery disease | I73.9 |

### Autoimmune/Inflammatory

| Condition | ICD-10 Range |
|-----------|-------------|
| Rheumatoid arthritis | M05.*, M06.* |
| Systemic lupus | M32.* |
| Psoriasis | L40.* |
| Psoriatic arthritis | L40.5*, M07.* |
| Crohn's disease | K50.* |
| Ulcerative colitis | K51.* |
| Multiple sclerosis | G35 |
| Ankylosing spondylitis | M45.* |
| Atopic dermatitis | L20.* |

### Metabolic/Endocrine

| Condition | ICD-10 Range |
|-----------|-------------|
| Type 2 diabetes | E11.* |
| Type 1 diabetes | E10.* |
| Obesity | E66.* |
| Hyperlipidemia | E78.* |
| Hypothyroidism | E03.* |
| NASH/NAFLD | K75.81, K76.0 |

---

## 8. RxNorm Concept Patterns for Drug Class Matching

### Concept Types (TTY)

| Type | Description | Use Case |
|------|------------|----------|
| IN | Ingredient | Match any formulation of a drug (e.g., "metformin") |
| SCD | Semantic Clinical Drug | Specific dose form (e.g., "metformin 500mg oral tablet") |
| SBD | Semantic Branded Drug | Branded version (e.g., "Glucophage 500mg oral tablet") |
| SCDC | Semantic Clinical Drug Component | Drug + strength without dose form |
| BN | Brand Name | Brand name only (e.g., "Glucophage") |

**Matching strategy:** Always match at the **IN** (ingredient) level for eligibility screening, then optionally refine to specific dose forms if the protocol requires dose thresholds.

### Common Drug Classes for Trial Eligibility

| Class | Key Ingredients (RxCUI) |
|-------|------------------------|
| ACE Inhibitors | Lisinopril (29046), Enalapril (3827), Ramipril (35296) |
| ARBs | Losartan (52175), Valsartan (69749), Irbesartan (83818) |
| Beta Blockers | Metoprolol (6918), Carvedilol (20352), Bisoprolol (19484) |
| Statins | Atorvastatin (83367), Rosuvastatin (301542), Simvastatin (36567) |
| SSRIs | Sertraline (36437), Fluoxetine (4493), Escitalopram (321988) |
| Metformin | Metformin (6809) |
| Insulin (all) | Insulin glargine (274783), Insulin lispro (86009), Insulin aspart (86592) |
| Anticoagulants (DOACs) | Apixaban (1364430), Rivaroxaban (1114195), Dabigatran (1037045) |
| Anticoagulants (traditional) | Warfarin (11289), Enoxaparin (67108) |
| Proton pump inhibitors | Omeprazole (7646), Pantoprazole (40790), Esomeprazole (283742) |
| Corticosteroids (systemic) | Prednisone (8640), Dexamethasone (3264), Methylprednisolone (6902) |

---

## 9. LOINC Codes for Common Lab Tests

| Lab Test | LOINC Code | Component | Units |
|----------|-----------|-----------|-------|
| Hemoglobin | 718-7 | Hemoglobin [Mass/volume] in Blood | g/dL |
| WBC | 6690-2 | Leukocytes [#/volume] in Blood | 10*3/uL |
| Platelets | 777-3 | Platelets [#/volume] in Blood | 10*3/uL |
| ANC | 751-8 | Neutrophils [#/volume] in Blood | 10*3/uL |
| ALT | 1742-6 | Alanine aminotransferase [Enzymatic activity/volume] | U/L |
| AST | 1920-8 | Aspartate aminotransferase [Enzymatic activity/volume] | U/L |
| Total Bilirubin | 1975-2 | Bilirubin.total [Mass/volume] in Serum/Plasma | mg/dL |
| Creatinine | 2160-0 | Creatinine [Mass/volume] in Serum/Plasma | mg/dL |
| eGFR (CKD-EPI) | 62238-1 | GFR/1.73 sq M.predicted [Volume Rate/Area] by CKD-EPI | mL/min/1.73m2 |
| BUN | 3094-0 | Urea nitrogen [Mass/volume] in Serum/Plasma | mg/dL |
| Glucose (fasting) | 1558-6 | Fasting glucose [Mass/volume] in Serum/Plasma | mg/dL |
| HbA1c | 4548-4 | Hemoglobin A1c/Hemoglobin.total in Blood | % |
| TSH | 3016-3 | Thyrotropin [Units/volume] in Serum/Plasma | mIU/L |
| Total Cholesterol | 2093-3 | Cholesterol [Mass/volume] in Serum/Plasma | mg/dL |
| LDL Cholesterol | 13457-7 | Cholesterol in LDL [Mass/volume] | mg/dL |
| HDL Cholesterol | 2085-9 | Cholesterol in HDL [Mass/volume] | mg/dL |
| Triglycerides | 2571-8 | Triglyceride [Mass/volume] in Serum/Plasma | mg/dL |
| Sodium | 2951-2 | Sodium [Moles/volume] in Serum/Plasma | mmol/L |
| Potassium | 2823-3 | Potassium [Moles/volume] in Serum/Plasma | mmol/L |
| Calcium | 17861-6 | Calcium [Mass/volume] in Serum/Plasma | mg/dL |
| Albumin | 1751-7 | Albumin [Mass/volume] in Serum/Plasma | g/dL |
| INR | 6301-6 | INR in Platelet poor plasma | ratio |
| PT | 5902-2 | Prothrombin time (PT) | seconds |
| aPTT | 3173-2 | aPTT in Platelet poor plasma | seconds |
| LDH | 2532-0 | Lactate dehydrogenase [Enzymatic activity/volume] | U/L |
| Alkaline Phosphatase | 6768-6 | Alkaline phosphatase [Enzymatic activity/volume] | U/L |
| Uric Acid | 3084-1 | Urate [Mass/volume] in Serum/Plasma | mg/dL |
| CRP | 1988-5 | C reactive protein [Mass/volume] in Serum/Plasma | mg/L |
| NT-proBNP | 33762-6 | Natriuretic peptide.B prohormone N-Terminal | pg/mL |
| Troponin I | 10839-9 | Troponin I.cardiac [Mass/volume] | ng/mL |
| Troponin T | 6598-7 | Troponin T.cardiac [Mass/volume] | ng/mL |
| PSA | 2857-1 | Prostate specific Ag [Mass/volume] | ng/mL |
| Pregnancy test (urine) | 2106-3 | Choriogonadotropin (pregnancy test) [Presence] in Urine | positive/negative |
| Pregnancy test (serum) | 2118-8 | Choriogonadotropin (pregnancy test) [Presence] in Serum | positive/negative |

---

## 10. Structured Rule Schema

All eligibility criteria in SiteConnect should be represented using this schema:

```typescript
interface EligibilityCriterion {
  id: string;                          // Unique identifier (e.g., "inc-001", "exc-015")
  type: "inclusion" | "exclusion";
  category: CriterionCategory;
  text: string;                        // Original protocol text
  rule: CriterionRule;
  automatable: boolean | "partial";    // Can this be fully evaluated from data?
  confidence: number;                  // 0.0 - 1.0 confidence in automated evaluation
  manual_review_reason?: string;       // Why manual review is needed
  therapeutic_area?: string;           // Oncology, Cardiology, etc.
}

type CriterionCategory =
  | "demographics"
  | "diagnosis"
  | "lab_values"
  | "medications"
  | "vital_signs"
  | "organ_function"
  | "performance_status"
  | "washout_period"
  | "prior_therapy"
  | "pregnancy"
  | "comorbidity"
  | "clinical_judgment"
  | "consent_capacity"
  | "other";

interface SimpleRule {
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "between" | "startsWith" | "contains";
  value: unknown;
  unit?: string;
  loinc?: string;
  lookback_days?: number;
  use_most_recent?: boolean;
}

interface CompoundRule {
  operator: "and" | "or" | "not";
  criteria: CriterionRule[];
  exceptions?: ExceptionRule[];
}

interface RelativeValueRule {
  field: string;
  operator: "lte" | "gte";
  value: {
    type: "relative_to_uln" | "relative_to_lln";
    multiplier: number;
  };
  uln_default?: number;
  lln_default?: number;
  unit: string;
  loinc?: string;
  lookback_days?: number;
}

interface TemporalRule {
  field: string;
  operator: "days_before_reference" | "within_years" | "no_history";
  reference_date: "screening_date" | "enrollment_date";
  min_days?: number;
  max_days?: number;
  years?: number;
}

interface ManualReviewFlag {
  field: "manual_review";
  operator: "flag";
  reason: string;
  description: string;
}

type CriterionRule = SimpleRule | CompoundRule | RelativeValueRule | TemporalRule | ManualReviewFlag;
```
