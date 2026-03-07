# EMR Data Formats Reference — Knowledge Reference

> Comprehensive guide to electronic medical record data formats, structures, and coding systems encountered when importing patient data into TalOS SiteConnect for clinical trial screening.

---

## 1. CSV/TSV Exports

CSV and TSV files are the most common format for bulk EMR data exports. They are simple but introduce significant parsing challenges due to inconsistency across EMR vendors and sites.

### 1.1 Common Column Naming Conventions by EMR

#### Epic

| Data Element | Common Column Names |
|-------------|-------------------|
| Medical Record Number | `MRN`, `PAT_MRN_ID`, `Patient MRN`, `EPIC_MRN` |
| Date of Birth | `DOB`, `BIRTH_DATE`, `Date of Birth`, `PAT_DOB` |
| Gender/Sex | `SEX`, `GENDER`, `Sex`, `PAT_SEX` |
| Race | `RACE`, `PATIENT_RACE`, `Race` |
| Ethnicity | `ETHNICITY`, `ETHNIC_GROUP`, `Ethnicity` |
| Diagnosis Code | `DX_CODE`, `ICD10_CODE`, `CURRENT_ICD10_LIST`, `DIAGNOSIS_CODE` |
| Diagnosis Description | `DX_NAME`, `DIAGNOSIS_DESC`, `DX_DESCRIPTION` |
| Diagnosis Date | `DX_DATE`, `CONTACT_DATE`, `DIAGNOSIS_DATE` |
| Lab Test Name | `COMPONENT_NAME`, `LAB_TEST`, `ORDER_NAME`, `PROC_NAME` |
| Lab Result | `ORD_VALUE`, `RESULT_VALUE`, `RESULT`, `COMPONENT_VALUE` |
| Lab Units | `REFERENCE_UNIT`, `RESULT_UNIT`, `UNITS` |
| Lab Date | `RESULT_DATE`, `ORDER_DATE`, `SPECIMEN_COLLECT_DATE`, `RESULT_TIME` |
| Lab Reference Range | `REF_RANGE`, `REFERENCE_RANGE`, `NORMAL_RANGE` |
| Medication Name | `MEDICATION_NAME`, `MED_NAME`, `DRUG_NAME`, `ORDER_MED_NAME` |
| Medication Status | `ORDER_STATUS`, `MED_STATUS` |
| Medication Start Date | `START_DATE`, `ORDER_START_DATE`, `MED_START_DATE` |
| Encounter Date | `CONTACT_DATE`, `ENC_DATE`, `ENCOUNTER_DATE` |
| Provider | `PROV_NAME`, `ATTENDING_PROV`, `PROVIDER` |
| Department | `DEPARTMENT_NAME`, `DEPT`, `CLINIC` |

#### Cerner (Oracle Health)

| Data Element | Common Column Names |
|-------------|-------------------|
| Medical Record Number | `MRN`, `PERSON_ID`, `FIN`, `CMRN` |
| Date of Birth | `BIRTH_DT_TM`, `DOB`, `BirthDate` |
| Gender/Sex | `SEX_CD`, `GENDER`, `Sex` |
| Diagnosis Code | `DIAGNOSIS_CD`, `ICD_CD`, `NOMENCLATURE_ID` |
| Lab Result | `RESULT_VAL`, `EVENT_RESULT`, `CLINICAL_EVENT_RESULT` |
| Lab Date | `EVENT_END_DT_TM`, `RESULT_DT_TM`, `PERFORMED_DT_TM` |
| Medication Name | `ORDER_MNEMONIC`, `CATALOG_CD`, `MED_PRODUCT` |

#### Athenahealth

| Data Element | Common Column Names |
|-------------|-------------------|
| Patient ID | `PATIENTID`, `patient_id`, `PatientID` |
| Date of Birth | `DOB`, `dob`, `DateOfBirth` |
| Diagnosis | `ICD10CODE`, `SNOMEDCODE`, `DiagnosisCode` |
| Lab Result | `ANALYTE_VALUE`, `ResultValue` |
| Medication | `MEDICATION`, `MedicationName` |

### 1.2 Date Format Variations

Date parsing is one of the most error-prone aspects of CSV import. Common formats encountered:

| Format | Example | Prevalence |
|--------|---------|-----------|
| `MM/DD/YYYY` | 03/15/2024 | Most common in US EMRs |
| `YYYY-MM-DD` | 2024-03-15 | ISO 8601, common in exports |
| `MM-DD-YYYY` | 03-15-2024 | Occasional |
| `DD/MM/YYYY` | 15/03/2024 | Rare in US, common internationally |
| `M/D/YYYY` | 3/15/2024 | No leading zeros |
| `YYYY-MM-DD HH:MM:SS` | 2024-03-15 14:30:00 | With timestamp |
| `MM/DD/YYYY HH:MM` | 03/15/2024 14:30 | With timestamp, no seconds |
| `YYYYMMDD` | 20240315 | Compact format |
| `DD-Mon-YYYY` | 15-Mar-2024 | Month abbreviation |
| `Mon DD, YYYY` | Mar 15, 2024 | Spelled out |

**Parsing strategy:**
1. Attempt ISO 8601 first (`YYYY-MM-DD`)
2. Check for unambiguous formats (year-first, day > 12)
3. Default to `MM/DD/YYYY` for US EMR data
4. Allow user confirmation of date format during import configuration
5. Store all dates internally as ISO 8601 (`YYYY-MM-DD`)

### 1.3 Common Delimiter and Encoding Issues

| Issue | Description | Mitigation |
|-------|------------|-----------|
| Embedded commas | Lab results like "1,500" in CSV | Use proper CSV parsing (RFC 4180 compliant) with quoted fields |
| Embedded newlines | Free-text notes containing line breaks | Quote-aware line splitting |
| BOM (Byte Order Mark) | UTF-8 BOM (`\xEF\xBB\xBF`) at file start | Strip BOM before parsing |
| Encoding mismatch | Windows-1252 vs UTF-8, especially for special characters (degree symbol, micro sign) | Detect encoding (chardet) or default to UTF-8 with fallback |
| Tab-separated but .csv extension | File uses tabs but named .csv | Auto-detect delimiter by analyzing first few lines |
| Mixed delimiters | Headers use comma, data uses semicolon | Validate delimiter consistency |
| Trailing delimiters | Extra comma at end of each line | Handle gracefully during column counting |
| Empty rows | Blank lines interspersed in data | Skip empty rows |
| Multiple header rows | EMR exports with title rows before column headers | Allow user to specify header row number |

### 1.4 Multi-Value Fields

EMR exports sometimes pack multiple values into a single cell:

| Pattern | Example | Parsing Approach |
|---------|---------|-----------------|
| Semicolon-separated | `E11.9; I10; J45.20` | Split on `;` and trim |
| Comma-separated (in quoted field) | `"E11.9, I10, J45.20"` | Split on `,` within quoted field |
| Pipe-separated | `E11.9|I10|J45.20` | Split on `|` |
| Newline-separated | Multi-line cell | Split on `\n` |
| Numbered list | `1. E11.9 2. I10 3. J45.20` | Regex extraction |

---

## 2. Excel (.xlsx) Exports

### 2.1 Multi-Sheet Patterns

EMR exports frequently use multiple sheets within a single workbook:

| Sheet Pattern | Contents | Common Sheet Names |
|--------------|----------|-------------------|
| Demographics | Patient demographics, identifiers | `Demographics`, `Patients`, `Patient List`, `Demographics Report` |
| Diagnoses | Active and historical diagnoses | `Diagnoses`, `Problem List`, `Dx`, `Conditions`, `ICD Codes` |
| Labs | Laboratory results | `Labs`, `Lab Results`, `Results`, `Laboratory`, `Lab Values` |
| Medications | Current and historical medications | `Medications`, `Meds`, `Med List`, `Prescriptions`, `Orders` |
| Vitals | Vital sign measurements | `Vitals`, `Vital Signs`, `VS` |
| Procedures | Procedure history | `Procedures`, `CPT`, `Surgical History` |
| Encounters | Visit history | `Encounters`, `Visits`, `Appointments` |

**Linking records across sheets:** Sheets are linked by a common patient identifier (MRN, Patient ID). Always identify the join key before processing.

### 2.2 Common Excel-Specific Issues

| Issue | Description | Mitigation |
|-------|------------|-----------|
| Merged cells | Headers or category labels spanning multiple columns | Unmerge and forward-fill during import |
| Date as serial number | Excel stores dates as numbers (e.g., 45366 = 2024-03-15) | Use date parsing library that handles Excel serial dates |
| Leading zeros stripped | MRNs like "0012345" become 12345 | Treat MRN columns as text, not numeric |
| Scientific notation | Large numbers like MRNs displayed as 1.23E+07 | Force text interpretation for identifier columns |
| Hidden columns/rows | Data present but not visible in UI | Read all cells regardless of visibility |
| Data validation dropdowns | Cells with restricted value lists | Read the actual cell value, ignore validation rules |
| Formatted numbers | "1,500.00" stored as formatted text vs actual number | Parse with locale-aware number handling |
| Multiple tables per sheet | Two separate tables on one sheet with blank rows between | Detect table boundaries |
| Password-protected sheets | Sheets locked by EMR export | Prompt user to provide password or re-export without protection |

### 2.3 Header Row Detection

Not all Excel files have headers in row 1:

```
Row 1: "Patient Report - Generated 03/15/2024"    ← Title row
Row 2: "Site: General Hospital"                     ← Metadata row
Row 3: ""                                           ← Empty row
Row 4: "MRN | DOB | Sex | Diagnoses | ..."        ← Actual headers
Row 5: "001234 | 1965-03-22 | M | E11.9 | ..."    ← First data row
```

**Detection strategy:**
1. Scan first 10 rows for the row with the most non-empty cells
2. Check if cell values look like headers (text, no numbers, common column names)
3. Allow user override to specify header row number
4. Skip rows above the header as metadata

---

## 3. HL7 FHIR R4 JSON

FHIR (Fast Healthcare Interoperability Resources) R4 is the modern standard for healthcare data exchange. Many EMRs now support FHIR-based bulk data export.

### 3.1 Patient Resource (Demographics)

```json
{
  "resourceType": "Patient",
  "id": "example-patient-123",
  "identifier": [
    {
      "use": "usual",
      "type": {
        "coding": [
          {
            "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
            "code": "MR"
          }
        ]
      },
      "system": "http://hospital.example.org/mrn",
      "value": "MRN-001234"
    }
  ],
  "name": [
    {
      "use": "official",
      "family": "Smith",
      "given": ["John", "Michael"]
    }
  ],
  "gender": "male",
  "birthDate": "1965-03-22",
  "address": [
    {
      "use": "home",
      "line": ["123 Main St"],
      "city": "Springfield",
      "state": "IL",
      "postalCode": "62701"
    }
  ],
  "extension": [
    {
      "url": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
      "extension": [
        {
          "url": "ombCategory",
          "valueCoding": {
            "system": "urn:oid:2.16.840.1.113883.6.238",
            "code": "2106-3",
            "display": "White"
          }
        }
      ]
    },
    {
      "url": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity",
      "extension": [
        {
          "url": "ombCategory",
          "valueCoding": {
            "system": "urn:oid:2.16.840.1.113883.6.238",
            "code": "2186-5",
            "display": "Not Hispanic or Latino"
          }
        }
      ]
    }
  ]
}
```

**Key fields for screening:**
- `birthDate` — Calculate age
- `gender` — Sex matching (note: FHIR uses "male", "female", "other", "unknown")
- `identifier` — MRN for cross-referencing
- Race/ethnicity are in US Core extensions

### 3.2 Condition Resource (Diagnoses)

```json
{
  "resourceType": "Condition",
  "id": "condition-456",
  "clinicalStatus": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
        "code": "active"
      }
    ]
  },
  "verificationStatus": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
        "code": "confirmed"
      }
    ]
  },
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/condition-category",
          "code": "encounter-diagnosis"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://hl7.org/fhir/sid/icd-10-cm",
        "code": "E11.9",
        "display": "Type 2 diabetes mellitus without complications"
      },
      {
        "system": "http://snomed.info/sct",
        "code": "44054006",
        "display": "Type 2 diabetes mellitus"
      }
    ]
  },
  "subject": {
    "reference": "Patient/example-patient-123"
  },
  "onsetDateTime": "2018-06-15",
  "recordedDate": "2018-06-15"
}
```

**Key fields for screening:**
- `code.coding` — Look for ICD-10-CM codes (system: `http://hl7.org/fhir/sid/icd-10-cm`) or SNOMED CT codes
- `clinicalStatus` — Filter for "active", "recurrence", "relapse" (vs "resolved", "inactive")
- `verificationStatus` — Prefer "confirmed" over "provisional" or "unconfirmed"
- `onsetDateTime` — When the condition started (for duration criteria)
- `subject.reference` — Links to Patient resource

### 3.3 Observation Resource (Labs and Vitals)

```json
{
  "resourceType": "Observation",
  "id": "obs-789",
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "laboratory"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "718-7",
        "display": "Hemoglobin [Mass/volume] in Blood"
      }
    ]
  },
  "subject": {
    "reference": "Patient/example-patient-123"
  },
  "effectiveDateTime": "2024-03-01T10:30:00Z",
  "valueQuantity": {
    "value": 14.2,
    "unit": "g/dL",
    "system": "http://unitsofmeasure.org",
    "code": "g/dL"
  },
  "referenceRange": [
    {
      "low": {
        "value": 13.5,
        "unit": "g/dL"
      },
      "high": {
        "value": 17.5,
        "unit": "g/dL"
      },
      "type": {
        "coding": [
          {
            "system": "http://terminology.hl7.org/CodeSystem/referencerange-meaning",
            "code": "normal"
          }
        ]
      }
    }
  ]
}
```

**Key fields for screening:**
- `code.coding` with `system: "http://loinc.org"` — LOINC code for the lab test
- `valueQuantity.value` and `valueQuantity.unit` — The result
- `effectiveDateTime` — When the measurement was taken (for recency filtering)
- `status` — Use "final" or "amended" results, not "preliminary" or "cancelled"
- `referenceRange` — Lab-specific normal ranges (for ULN/LLN calculations)
- `category` — "laboratory" vs "vital-signs" vs "social-history"

**Vital signs use the same Observation resource with category "vital-signs":**

```json
{
  "resourceType": "Observation",
  "category": [{"coding": [{"code": "vital-signs"}]}],
  "code": {
    "coding": [
      {"system": "http://loinc.org", "code": "8480-6", "display": "Systolic blood pressure"}
    ]
  },
  "valueQuantity": {"value": 128, "unit": "mmHg"}
}
```

### 3.4 MedicationRequest / MedicationStatement

```json
{
  "resourceType": "MedicationRequest",
  "id": "medrx-101",
  "status": "active",
  "intent": "order",
  "medicationCodeableConcept": {
    "coding": [
      {
        "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
        "code": "6809",
        "display": "metformin"
      }
    ]
  },
  "subject": {
    "reference": "Patient/example-patient-123"
  },
  "authoredOn": "2023-01-15",
  "dosageInstruction": [
    {
      "text": "500mg twice daily",
      "timing": {
        "repeat": {
          "frequency": 2,
          "period": 1,
          "periodUnit": "d"
        }
      },
      "doseAndRate": [
        {
          "doseQuantity": {
            "value": 500,
            "unit": "mg",
            "system": "http://unitsofmeasure.org",
            "code": "mg"
          }
        }
      ]
    }
  ]
}
```

**Key fields for screening:**
- `medicationCodeableConcept.coding` — RxNorm code for the drug
- `status` — "active", "completed", "stopped", "cancelled"
- `authoredOn` — Prescription date (for washout calculations)
- `dosageInstruction` — Dose details (for dose-specific criteria)
- Alternative: `medicationReference` pointing to a separate Medication resource

### 3.5 Procedure Resource

```json
{
  "resourceType": "Procedure",
  "id": "proc-201",
  "status": "completed",
  "code": {
    "coding": [
      {
        "system": "http://www.ama-assn.org/go/cpt",
        "code": "99213",
        "display": "Office visit, established patient"
      },
      {
        "system": "http://snomed.info/sct",
        "code": "387713003",
        "display": "Surgical procedure"
      }
    ]
  },
  "subject": {
    "reference": "Patient/example-patient-123"
  },
  "performedDateTime": "2024-01-10"
}
```

### 3.6 AllergyIntolerance Resource

```json
{
  "resourceType": "AllergyIntolerance",
  "clinicalStatus": {
    "coding": [{"code": "active"}]
  },
  "code": {
    "coding": [
      {
        "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
        "code": "723",
        "display": "Amoxicillin"
      }
    ]
  },
  "patient": {
    "reference": "Patient/example-patient-123"
  },
  "reaction": [
    {
      "manifestation": [
        {
          "coding": [
            {
              "system": "http://snomed.info/sct",
              "code": "271807003",
              "display": "Skin rash"
            }
          ]
        }
      ],
      "severity": "moderate"
    }
  ]
}
```

### 3.7 Bundle Structure

FHIR bulk exports typically wrap resources in a Bundle:

```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "total": 150,
  "entry": [
    {
      "fullUrl": "http://example.org/fhir/Patient/123",
      "resource": {
        "resourceType": "Patient",
        "id": "123"
      }
    },
    {
      "fullUrl": "http://example.org/fhir/Condition/456",
      "resource": {
        "resourceType": "Condition",
        "id": "456"
      }
    }
  ]
}
```

**NDJSON (Newline-Delimited JSON):** FHIR Bulk Data Access (flat FHIR) exports use NDJSON format — one JSON resource per line, no wrapping Bundle:

```
{"resourceType":"Patient","id":"1","birthDate":"1965-03-22","gender":"male"}
{"resourceType":"Patient","id":"2","birthDate":"1978-11-08","gender":"female"}
```

---

## 4. C-CDA / CCD XML

Consolidated Clinical Document Architecture (C-CDA) is the primary standard for clinical document exchange in the US, mandated by ONC for Meaningful Use / Promoting Interoperability.

### 4.1 Document Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3"
                  xmlns:sdtc="urn:hl7-org:sdtc"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">

  <!-- Header: Document metadata, patient, author, custodian -->
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>  <!-- US Realm Header -->
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>  <!-- CCD -->

  <id root="2.16.840.1.113883.19.5.99999.1" extension="TT988"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" displayName="Summarization of Episode Note"/>
  <title>Continuity of Care Document</title>
  <effectiveTime value="20240315"/>

  <recordTarget>
    <patientRole>
      <id extension="MRN-001234" root="2.16.840.1.113883.19.5.99999.2"/>
      <patient>
        <name>
          <given>John</given>
          <family>Smith</family>
        </name>
        <administrativeGenderCode code="M" codeSystem="2.16.840.1.113883.5.1"/>
        <birthTime value="19650322"/>
        <raceCode code="2106-3" codeSystem="2.16.840.1.113883.6.238" displayName="White"/>
        <ethnicGroupCode code="2186-5" codeSystem="2.16.840.1.113883.6.238" displayName="Not Hispanic or Latino"/>
      </patient>
    </patientRole>
  </recordTarget>

  <!-- Body: Clinical sections -->
  <component>
    <structuredBody>
      <!-- Sections go here -->
    </structuredBody>
  </component>
</ClinicalDocument>
```

### 4.2 Key Sections

#### Problems Section (Diagnoses)

```xml
<component>
  <section>
    <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
    <code code="11450-4" codeSystem="2.16.840.1.113883.6.1" displayName="Problem List"/>
    <title>Problems</title>
    <entry typeCode="DRIV">
      <act classCode="ACT" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
        <statusCode code="active"/>
        <effectiveTime>
          <low value="20180615"/>
        </effectiveTime>
        <entryRelationship typeCode="SUBJ">
          <observation classCode="OBS" moodCode="EVN">
            <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
            <code code="55607006" codeSystem="2.16.840.1.113883.6.96" displayName="Problem"/>
            <statusCode code="completed"/>
            <value xsi:type="CD"
                   code="E11.9"
                   codeSystem="2.16.840.1.113883.6.90"
                   displayName="Type 2 diabetes mellitus without complications"/>
          </observation>
        </entryRelationship>
      </act>
    </entry>
  </section>
</component>
```

#### Medications Section

```xml
<component>
  <section>
    <templateId root="2.16.840.1.113883.10.20.22.2.1.1" extension="2014-06-09"/>
    <code code="10160-0" codeSystem="2.16.840.1.113883.6.1" displayName="Medications"/>
    <title>Medications</title>
    <entry typeCode="DRIV">
      <substanceAdministration classCode="SBADM" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
        <statusCode code="active"/>
        <effectiveTime xsi:type="IVL_TS">
          <low value="20230115"/>
        </effectiveTime>
        <doseQuantity value="500" unit="mg"/>
        <consumable>
          <manufacturedProduct>
            <templateId root="2.16.840.1.113883.10.20.22.4.23" extension="2014-06-09"/>
            <manufacturedMaterial>
              <code code="6809"
                    codeSystem="2.16.840.1.113883.6.88"
                    displayName="Metformin">
                <translation code="860974"
                             codeSystem="2.16.840.1.113883.6.88"
                             displayName="Metformin Hydrochloride 500 MG Oral Tablet"/>
              </code>
            </manufacturedMaterial>
          </manufacturedProduct>
        </consumable>
      </substanceAdministration>
    </entry>
  </section>
</component>
```

#### Results Section (Lab Results)

```xml
<component>
  <section>
    <templateId root="2.16.840.1.113883.10.20.22.2.3.1" extension="2015-08-01"/>
    <code code="30954-2" codeSystem="2.16.840.1.113883.6.1" displayName="Results"/>
    <title>Results</title>
    <entry typeCode="DRIV">
      <organizer classCode="BATTERY" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.1" extension="2015-08-01"/>
        <statusCode code="completed"/>
        <component>
          <observation classCode="OBS" moodCode="EVN">
            <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/>
            <code code="718-7" codeSystem="2.16.840.1.113883.6.1" displayName="Hemoglobin"/>
            <statusCode code="completed"/>
            <effectiveTime value="20240301"/>
            <value xsi:type="PQ" value="14.2" unit="g/dL"/>
            <referenceRange>
              <observationRange>
                <value xsi:type="IVL_PQ">
                  <low value="13.5" unit="g/dL"/>
                  <high value="17.5" unit="g/dL"/>
                </value>
              </observationRange>
            </referenceRange>
          </observation>
        </component>
      </organizer>
    </entry>
  </section>
</component>
```

#### Vital Signs Section

```xml
<component>
  <section>
    <templateId root="2.16.840.1.113883.10.20.22.2.4.1" extension="2015-08-01"/>
    <code code="8716-3" codeSystem="2.16.840.1.113883.6.1" displayName="Vital Signs"/>
    <title>Vital Signs</title>
    <!-- Similar organizer/observation structure as Results -->
  </section>
</component>
```

### 4.3 Key OIDs (Object Identifiers)

| OID | System |
|-----|--------|
| 2.16.840.1.113883.6.1 | LOINC |
| 2.16.840.1.113883.6.88 | RxNorm |
| 2.16.840.1.113883.6.90 | ICD-10-CM |
| 2.16.840.1.113883.6.96 | SNOMED CT |
| 2.16.840.1.113883.6.12 | CPT-4 |
| 2.16.840.1.113883.6.238 | CDC Race & Ethnicity |
| 2.16.840.1.113883.5.1 | Administrative Gender |
| 2.16.840.1.113883.6.103 | ICD-9-CM |

### 4.4 C-CDA Parsing Strategy

1. **Parse XML** with namespace awareness (`urn:hl7-org:v3`)
2. **Identify sections** by `templateId` root values
3. **Extract entries** within each section
4. **Map coded values** using codeSystem OIDs to identify the coding system
5. **Handle translations** — a single concept may have codes in multiple systems (ICD-10 + SNOMED)
6. **Check status codes** — filter for "active" problems, "completed" results

---

## 5. HL7 v2 Messages

HL7 v2 is the legacy standard still widely used for real-time EMR interfaces. While less common for bulk export, sites may provide HL7 v2 message files.

### 5.1 Message Structure

```
MSH|^~\&|EPICADT|DH|LABADT|DH|20240315103000||ADT^A04|MSG00001|P|2.5.1|||
EVN|A04|20240315103000|||
PID|1||MRN001234^^^DH^MR||Smith^John^Michael||19650322|M|||123 Main St^^Springfield^IL^62701||555-1234||||
PV1|1|O|CLINIC01^^^^^|||||DOC001^Jones^Robert^^^Dr.|||||||||||
DG1|1|I10|E11.9|Type 2 diabetes||A|
DG1|2|I10|I10|Essential hypertension||A|
```

### 5.2 Key Segments

#### PID — Patient Identification

| Field | Position | Name | Example |
|-------|----------|------|---------|
| PID-3 | PID.3 | Patient Identifier List | `MRN001234^^^DH^MR` |
| PID-5 | PID.5 | Patient Name | `Smith^John^Michael` |
| PID-7 | PID.7 | Date of Birth | `19650322` |
| PID-8 | PID.8 | Sex | `M` (M, F, O, U, A, N) |
| PID-10 | PID.10 | Race | `2106-3^White^CDCREC` |
| PID-11 | PID.11 | Patient Address | `123 Main St^^Springfield^IL^62701` |
| PID-22 | PID.22 | Ethnic Group | `2186-5^Not Hispanic^CDCREC` |

#### DG1 — Diagnosis

| Field | Position | Name | Example |
|-------|----------|------|---------|
| DG1-2 | DG1.2 | Diagnosis Coding Method | `I10` (ICD-10) |
| DG1-3 | DG1.3 | Diagnosis Code | `E11.9` |
| DG1-4 | DG1.4 | Diagnosis Description | `Type 2 diabetes mellitus` |
| DG1-5 | DG1.5 | Diagnosis DateTime | `20240315` |
| DG1-6 | DG1.6 | Diagnosis Type | `A` (Admitting), `F` (Final) |

#### OBX — Observation/Result (in ORU messages)

```
OBX|1|NM|718-7^Hemoglobin^LN||14.2|g/dL|13.5-17.5|N|||F|||20240301103000|
```

| Field | Position | Name | Example |
|-------|----------|------|---------|
| OBX-2 | OBX.2 | Value Type | `NM` (numeric), `ST` (string), `CE` (coded) |
| OBX-3 | OBX.3 | Observation Identifier | `718-7^Hemoglobin^LN` (LOINC) |
| OBX-5 | OBX.5 | Observation Value | `14.2` |
| OBX-6 | OBX.6 | Units | `g/dL` |
| OBX-7 | OBX.7 | Reference Range | `13.5-17.5` |
| OBX-8 | OBX.8 | Abnormal Flags | `N` (normal), `H` (high), `L` (low), `A` (abnormal) |
| OBX-11 | OBX.11 | Observation Result Status | `F` (final), `P` (preliminary) |
| OBX-14 | OBX.14 | DateTime of Observation | `20240301103000` |

#### RXE — Pharmacy/Treatment Encoded Order

```
RXE|1^BID||500|mg|||||||||6809^Metformin^RXNORM|
```

| Field | Position | Name |
|-------|----------|------|
| RXE-1 | RXE.1 | Quantity/Timing |
| RXE-3 | RXE.3 | Give Amount - Minimum |
| RXE-4 | RXE.4 | Give Units |
| RXE-31 | RXE.31 | Pharmacy Order Type |

### 5.3 HL7 v2 Parsing Rules

- **Field separator:** `|` (defined in MSH-1)
- **Component separator:** `^` (defined in MSH-2, first character)
- **Repetition separator:** `~` (defined in MSH-2, second character)
- **Escape character:** `\` (defined in MSH-2, third character)
- **Sub-component separator:** `&` (defined in MSH-2, fourth character)
- **Segment terminator:** `\r` (carriage return)

**Date/time format:** `YYYYMMDD[HHMMSS[.SSSS]][+/-ZZZZ]`

---

## 6. Medical Coding Systems — Detailed Reference

### 6.1 ICD-10-CM Structure

```
Format: [Letter][Digit][Digit].[Digit][Digit][Digit][Digit]
         Category    Etiology/Site/Manifestation/Cause
         (3 chars)   (up to 4 additional characters)

Example: E11.65
  E      = Endocrine, nutritional and metabolic diseases (Chapter 4)
  E11    = Type 2 diabetes mellitus
  E11.6  = Type 2 diabetes mellitus with other specified complications
  E11.65 = Type 2 diabetes mellitus with hyperglycemia
```

**Chapter Prefixes:**

| Chapter | Range | Category |
|---------|-------|----------|
| 1 | A00-B99 | Infectious/parasitic diseases |
| 2 | C00-D49 | Neoplasms |
| 3 | D50-D89 | Blood/immune disorders |
| 4 | E00-E89 | Endocrine/nutritional/metabolic |
| 5 | F01-F99 | Mental/behavioral disorders |
| 6 | G00-G99 | Nervous system diseases |
| 7 | H00-H59 | Eye diseases |
| 8 | H60-H95 | Ear diseases |
| 9 | I00-I99 | Circulatory system |
| 10 | J00-J99 | Respiratory system |
| 11 | K00-K95 | Digestive system |
| 12 | L00-L99 | Skin diseases |
| 13 | M00-M99 | Musculoskeletal |
| 14 | N00-N99 | Genitourinary |
| 15 | O00-O9A | Pregnancy/childbirth |
| 16 | P00-P96 | Perinatal conditions |
| 17 | Q00-Q99 | Congenital malformations |
| 18 | R00-R99 | Signs/symptoms |
| 19 | S00-T88 | Injury/poisoning |
| 20 | V00-Y99 | External causes |
| 21 | Z00-Z99 | Factors influencing health status |

### 6.2 RxNorm Concept Types

| Term Type (TTY) | Description | Use in Screening |
|----------------|-------------|-----------------|
| IN | Ingredient | Best for class-level drug matching |
| MIN | Multiple Ingredients | Combination drugs |
| PIN | Precise Ingredient | Salt forms |
| BN | Brand Name | Brand matching (less preferred) |
| SCD | Semantic Clinical Drug | Ingredient + Strength + Dose Form |
| SBD | Semantic Branded Drug | Brand + Strength + Dose Form |
| SCDC | Semantic Clinical Drug Component | Ingredient + Strength |
| SBDC | Semantic Branded Drug Component | Brand + Strength |
| SCDF | Semantic Clinical Drug Form | Ingredient + Dose Form |
| SBDF | Semantic Branded Drug Form | Brand + Dose Form |
| SCDG | Semantic Clinical Drug Group | Ingredient + Dose Form Group |
| SBDG | Semantic Branded Drug Group | Brand + Dose Form Group |
| GPCK | Generic Pack | Multiple drugs in a pack |
| BPCK | Branded Pack | Branded multi-drug pack |

**Drug class matching hierarchy:**
1. Match on IN (ingredient) — broadest, most reliable
2. Fall back to BN (brand name) for brand-specific criteria
3. Use ATC classification for drug class matching (e.g., all statins)
4. NDF-RT (now MED-RT) provides pharmacologic class relationships

### 6.3 LOINC Structure

```
Format: [Number]-[Check digit]
Example: 718-7 (Hemoglobin)

LOINC Axes:
1. Component (Analyte): What is measured (e.g., Hemoglobin)
2. Property: Type of measurement (Mass concentration, Enzymatic activity)
3. Time: Point in time vs over time
4. System: Specimen type (Blood, Serum, Urine)
5. Scale: Quantitative, Ordinal, Nominal, Narrative
6. Method: How measured (optional)
```

**Common Panel Codes:**

| Panel | LOINC | Components |
|-------|-------|-----------|
| CBC | 57021-8 | WBC, RBC, Hemoglobin, Hematocrit, Platelets, MCV, MCH, MCHC |
| BMP | 51990-0 | Glucose, BUN, Creatinine, Sodium, Potassium, Chloride, CO2, Calcium |
| CMP | 24323-8 | BMP + ALT, AST, ALP, Total Bilirubin, Albumin, Total Protein |
| Lipid Panel | 57698-3 | Total Cholesterol, LDL, HDL, Triglycerides |
| Hepatic Function | 24325-3 | ALT, AST, ALP, Total Bilirubin, Direct Bilirubin, Albumin |
| Coagulation | 55230-8 | PT, INR, aPTT |
| Thyroid Panel | 34896-6 | TSH, Free T4, Free T3 |
| Urinalysis | 24356-8 | pH, Specific Gravity, Protein, Glucose, Blood, Leukocyte Esterase |
| HbA1c | 4548-4 | Single test |

### 6.4 SNOMED CT Hierarchy

SNOMED CT uses a polyhierarchical structure with "is-a" relationships:

```
SNOMED CT Concept Model:
  Clinical Finding (404684003)
    ├── Disease (64572001)
    │     ├── Neoplastic disease (55342001)
    │     │     └── Malignant neoplasm (363346000)
    │     │           └── Primary malignant neoplasm of lung (93880001)
    │     ├── Metabolic disease (75934005)
    │     │     └── Diabetes mellitus (73211009)
    │     │           └── Type 2 diabetes (44054006)
    │     └── Cardiovascular disease (49601007)
    │           └── Heart failure (84114007)
    └── Finding (404684003)
```

**Useful for:** Hierarchical matching (e.g., match any descendant of "Malignant neoplasm") when ICD-10 codes are not available.

### 6.5 CPT Code Patterns

| Range | Category |
|-------|----------|
| 00100-01999 | Anesthesia |
| 10004-69990 | Surgery |
| 70010-79999 | Radiology |
| 80047-89398 | Pathology/Laboratory |
| 90281-99607 | Medicine |
| 99202-99499 | E&M (Evaluation and Management) |

---

## 7. Data Quality Challenges

### 7.1 Missing Data Patterns

| Scenario | Frequency | Impact on Screening | Mitigation |
|----------|-----------|-------------------|-----------|
| No recent labs | Common (patient not seen recently) | Cannot evaluate lab-based criteria | Flag as "insufficient data", report lookback period |
| Missing DOB | Rare | Cannot calculate age | Reject record, require correction |
| Diagnosis codes only at billing level | Common | May miss conditions not billed | Supplement with problem list data |
| No medication stop dates | Very Common | Cannot determine current vs historical meds | Assume active if no stop date and started within reasonable timeframe |
| Lab units missing | Occasional | Cannot compare to threshold | Infer from LOINC code's typical units, flag for review |
| Free-text diagnoses without codes | Common in smaller practices | Cannot match against ICD-10 criteria | Use LLM for extraction, low confidence score |
| Duplicate patients | Occasional | Over-counting eligible patients | Deduplicate on MRN, DOB + name, or patient matching algorithm |

### 7.2 Date Ambiguity Resolution

When dates are ambiguous (e.g., `01/02/2024` — January 2 or February 1?):

1. **Context clues:** If other dates in the file use unambiguous formats (e.g., `15/03/2024` is clearly DD/MM), apply the same format
2. **EMR source:** US EMRs almost always use MM/DD/YYYY
3. **Value validation:** Check if the interpretation makes sense (DOB of 01/13/2024 cannot be DD/MM since there is no 13th month)
4. **User confirmation:** When in doubt, present sample dates and ask the user to confirm the format

### 7.3 Coded vs. Free-Text Fields

| Data Type | Coded Example | Free-Text Example | Handling |
|-----------|--------------|-------------------|----------|
| Diagnosis | ICD-10: E11.9 | "diabetes type 2, poorly controlled" | Prefer coded; use LLM to extract from free text at lower confidence |
| Medication | RxNorm: 6809 | "metformin 500mg po bid" | Prefer coded; parse free text for drug name + dose |
| Lab result | LOINC: 718-7, Value: 14.2 | "Hgb 14.2" | Prefer coded; regex extraction for common lab abbreviations |
| Allergy | RxNorm: 723 | "PCN allergy — rash" | Prefer coded; keyword matching for drug names |

### 7.4 Duplicate Detection Strategies

| Strategy | Fields Used | Confidence |
|----------|------------|-----------|
| Exact MRN match | MRN | High (within same source system) |
| DOB + Last Name + First Name (first 3 chars) | Demographics | Medium-High |
| DOB + Gender + Last Name + ZIP code | Demographics | Medium |
| Probabilistic matching (Fellegi-Sunter) | Multiple weighted fields | Configurable |

**For SiteConnect:** Since data comes from a single site's EMR, MRN-based deduplication is typically sufficient. Cross-source matching (e.g., EMR + lab system) may require probabilistic approaches.

---

## 8. Import Pipeline Architecture for SiteConnect

```
File Upload → Format Detection → Schema Mapping → Validation → Normalization → Storage
     │              │                  │               │              │            │
     ▼              ▼                  ▼               ▼              ▼            ▼
  File picker   Detect CSV/      Column name      Check for      Standardize   Encrypted
  (local only)  XLSX/FHIR/       auto-mapping     required       dates, codes,  SQLite
                C-CDA/HL7v2      + user review    fields, valid  units to       database
                                                  data types     internal format
```

**Key principles:**
1. Never modify the source file
2. Store raw imported data alongside normalized data (for audit/debugging)
3. All date/time values stored as ISO 8601 internally
4. All coded values stored with both the code and the code system
5. Track data provenance (which file, which row, import timestamp)
6. Support incremental imports (add new data without replacing existing)
