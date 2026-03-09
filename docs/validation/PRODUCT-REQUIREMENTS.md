# Product Requirements Document (PRD)

## TalOS SiteConnect — On-Premise Patient Screening Application

| Field | Value |
|---|---|
| **Document ID** | PRD-SC-001 |
| **Version** | 1.0 |
| **Effective Date** | 2026-03-08 |
| **Classification** | GxP Regulated |
| **Parent Document** | VMP-SC-001 |

---

### Document Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Author | __________________ | __________________ | ________ |
| Product Owner | __________________ | __________________ | ________ |
| Quality Assurance | __________________ | __________________ | ________ |
| Regulatory Affairs | __________________ | __________________ | ________ |

---

### Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 0.1 | 2026-03-01 | Engineering | Initial draft |
| 1.0 | 2026-03-08 | Engineering | Released for review |

---

## Table of Contents

1. [Screening Engine](#1-screening-engine)
2. [Import Pipeline](#2-import-pipeline)
3. [Audit Trail](#3-audit-trail)
4. [Security and Database Encryption](#4-security-and-database-encryption)
5. [Database Operations](#5-database-operations)
6. [Patient Management](#6-patient-management)
7. [Trial Discovery](#7-trial-discovery)
8. [Analytics](#8-analytics)
9. [Enrollment Pipeline](#9-enrollment-pipeline)
10. [Review Queue](#10-review-queue)
11. [Cohort Builder](#11-cohort-builder)
12. [Site Performance](#12-site-performance)
13. [LLM Integration](#13-llm-integration)
14. [Export](#14-export)
15. [Settings](#15-settings)
16. [User Interface](#16-user-interface)
17. [Non-Functional Requirements](#17-non-functional-requirements)
18. [Platform Requirements](#18-platform-requirements)

---

## 1. Screening Engine

### PRD-SCR-001: Tier 1 Rule-Based Screening

The system SHALL evaluate patient eligibility against study criteria using deterministic, rule-based logic implemented in Rust. The screening engine SHALL support the following 9 structured rule types:

| Rule Type | Description | Data Source |
|---|---|---|
| `AgeRange` | Check patient age (computed from DOB) against min/max bounds | `patients.date_of_birth` |
| `GenderIs` | Check patient gender matches required value (case-insensitive) | `patients.gender` |
| `HasDiagnosis` | Check for active diagnosis by ICD-10 code prefix | `diagnoses.icd10_code`, `diagnoses.status` |
| `NoDiagnosis` | Verify absence of a diagnosis by ICD-10 code prefix | `diagnoses.icd10_code`, `diagnoses.status` |
| `HasMedication` | Check for active medication by drug name (case-insensitive substring) | `medications.drug_name`, `medications.status` |
| `NoMedication` | Verify patient is NOT on a medication | `medications.drug_name`, `medications.status` |
| `LabValueRange` | Check most recent lab value against min/max thresholds | `lab_results.test_name`, `lab_results.value` |
| `VitalRange` | Check most recent vital sign against min/max thresholds | `vitals.measurement_type`, `vitals.value` |
| `And` / `Or` | Logical combinators for compound criteria | Recursive sub-rules |

**Source**: `src-tauri/src/screening/rules.rs`

### PRD-SCR-002: Screening Result Classification

The screening engine SHALL classify each patient-study pair into one of four statuses:

| Status | Criteria |
|---|---|
| `eligible` | All inclusion criteria met AND no exclusion criteria triggered AND no missing data |
| `potentially_eligible` | 70%+ inclusion criteria met AND 2 or fewer missing data points |
| `ineligible` | Any exclusion criteria triggered OR insufficient inclusion criteria |
| `needs_review` | More than 3 missing data points |

**Source**: `src-tauri/src/screening/engine.rs::compute_status()`

### PRD-SCR-003: Eligibility Score Calculation

The system SHALL compute a numeric eligibility score (0-100) based on:
- Inclusion criteria ratio (met / total) as base score
- Missing data penalty (30% weight per missing ratio)
- Automatic score of 30 or below when exclusion criteria are triggered

### PRD-SCR-004: Evidence Trail

Each criterion evaluation SHALL include:
- Evidence text describing the data match or mismatch
- Evidence source identifying the data domain (demographics, diagnoses, medications, labs, vitals)
- Confidence score (0.0-1.0)
- Flag indicating whether the determination was AI-assisted

### PRD-SCR-005: Missing Data Handling

When required patient data is unavailable for a criterion evaluation, the system SHALL:
- Return `passed: None` (indeterminate)
- Set `missing_data: true`
- Provide evidence text indicating which data type is missing
- Set confidence to 0.0

### PRD-SCR-006: Exclusion Criteria Logic

For exclusion criteria, the system SHALL invert the rule result interpretation:
- Rule passes (condition absent) = exclusion "not_met" (favorable)
- Rule fails (condition present) = exclusion "met" (unfavorable, triggers ineligibility)

### PRD-SCR-007: Batch Screening

The system SHALL support screening all patients in the database against a specified study, with results sorted by eligibility score in descending order.

### PRD-SCR-008: Criterion Parsing

Structured rules SHALL be stored as JSON in the `study_criteria.structured_rule` column and deserialized using Serde with tagged enum serialization (`#[serde(tag = "type")]`).

---

## 2. Import Pipeline

### PRD-IMP-001: CSV File Import

The system SHALL import patient data from CSV files with automatic delimiter detection and header parsing.

### PRD-IMP-002: Smart Column Auto-Mapping

The system SHALL automatically map CSV column headers to database fields using a fuzzy matching algorithm that:
- Normalizes headers (lowercase, strip non-alphanumeric, collapse whitespace)
- Matches against 25+ known field aliases covering Epic, Cerner, Athena, and generic CSV formats
- Computes a similarity score (0.0-1.0) for each candidate mapping
- Requires a minimum confidence threshold of 0.5 for auto-mapping
- Prevents duplicate target field assignments (higher confidence wins)

**Supported target fields**: `site_patient_id`, `date_of_birth`, `gender`, `race`, `ethnicity`, `insurance_type`, `diagnosis_description`, `icd10_code`, `diagnosis_onset_date`, `diagnosis_status`, `drug_name`, `rxnorm_code`, `dose`, `frequency`, `medication_start_date`, `medication_end_date`, `medication_status`, `test_name`, `loinc_code`, `lab_value`, `lab_unit`, `reference_range`, `result_date`, `abnormal_flag`

### PRD-IMP-003: Import Preview

Before executing an import, the system SHALL provide a preview showing:
- Detected file format and encoding
- Column headers and suggested mappings with confidence scores
- First 10 rows of data
- Validation warnings

### PRD-IMP-004: Data Persistence

On import execution, the system SHALL:
- Insert new patients (unique by `site_patient_id`)
- Update existing patients with COALESCE logic (new non-null values override nulls)
- Deduplicate diagnoses by patient + description
- Deduplicate medications by patient + drug name
- Always insert lab results (time-series data, no dedup)
- Skip rows with empty patient IDs
- Track counts: imported, updated, skipped, errors

### PRD-IMP-005: Import Audit

Each import execution SHALL create an audit log entry and an import_log record containing:
- File name, format, and timestamp
- Records imported, updated, skipped
- Column mapping used

### PRD-IMP-006: File Format Detection

The system SHALL detect file format by extension and provide format metadata before import begins.

### PRD-IMP-007: Error Reporting

Import errors SHALL be reported per-row with row number and error description, without aborting the entire import.

---

## 3. Audit Trail

### PRD-AUD-001: Immutable Audit Log

The system SHALL maintain an immutable audit log where every data mutation creates a new entry. Entries SHALL NOT be updateable or deletable.

### PRD-AUD-002: HMAC Chain Integrity

Each audit entry SHALL include a SHA-256 checksum computed over:
- The previous entry's checksum (or a 64-character zero string for the genesis entry)
- The current entry's timestamp
- The action type
- The details text

This creates a tamper-evident chain where modification of any entry invalidates all subsequent checksums.

### PRD-AUD-003: Chain Verification

The system SHALL provide a verification function that reads the entire audit chain in chronological order and validates each entry's checksum against its computed value. Any mismatch SHALL be reported as an integrity violation with the specific entry number and timestamp.

### PRD-AUD-004: Audit Actions

The following actions SHALL be recorded:

| Action | Trigger |
|---|---|
| `database_initialized` | First-time database creation |
| `database_unlocked` | Successful passphrase authentication |
| `patient_imported` | Individual patient record created |
| `patient_updated` | Patient record modified |
| `data_imported` | Batch import completed |
| `screening_executed` | Screening run completed |
| `criterion_overridden` | Human override of screening result |
| `patient_reviewed` | Review queue action (accept/reject/defer) |
| `study_seeded` | Demo study data loaded |

### PRD-AUD-005: Audit Entry Fields

Each audit entry SHALL contain:
- Unique ID (UUID v4)
- ISO 8601 timestamp (UTC)
- Action type
- Free-text details
- SHA-256 checksum

---

## 4. Security and Database Encryption

### PRD-SEC-001: AES-256 Encryption

All patient data SHALL be stored in a SQLCipher-encrypted database using AES-256-CBC encryption with a 4096-byte cipher page size.

### PRD-SEC-002: PBKDF2 Key Derivation

The database encryption key SHALL be derived from the user's passphrase using PBKDF2 with 256,000 iterations.

### PRD-SEC-003: Passphrase Verification

On unlock, the system SHALL verify the passphrase by attempting to read `cipher_version` from the database. An incorrect passphrase SHALL result in an `InvalidPassphrase` error.

### PRD-SEC-004: Passphrase Zeroing

The passphrase SHALL be zeroed from memory (using the `zeroize` crate) when no longer needed to prevent memory disclosure attacks.

### PRD-SEC-005: No PHI Transmission

The application SHALL NOT transmit PHI over any network. All data processing occurs locally. The only network communication permitted is to the local LLM sidecar on `127.0.0.1`.

### PRD-SEC-006: WAL Journaling

The database SHALL use Write-Ahead Logging (WAL) mode for crash resilience and improved read performance.

---

## 5. Database Operations

### PRD-DB-001: Schema Migration

The system SHALL automatically create all required tables and indexes on database initialization using `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements.

### PRD-DB-002: 13-Table Schema

The database SHALL contain the tables defined in Section 2.4 of the VMP: `patients`, `diagnoses`, `medications`, `lab_results`, `vitals`, `clinical_notes`, `studies`, `study_criteria`, `screening_results`, `screening_criteria_results`, `import_log`, `audit_log`.

### PRD-DB-003: Connection Pooling

The system SHALL use r2d2 connection pooling for concurrent database access, managed as Tauri application state via `DbState`.

### PRD-DB-004: Referential Integrity

Foreign key relationships SHALL be defined between:
- `diagnoses.patient_id` -> `patients.id`
- `medications.patient_id` -> `patients.id`
- `lab_results.patient_id` -> `patients.id`
- `vitals.patient_id` -> `patients.id`
- `clinical_notes.patient_id` -> `patients.id`
- `study_criteria.study_id` -> `studies.id`
- `screening_results.patient_id` -> `patients.id`
- `screening_results.study_id` -> `studies.id`
- `screening_criteria_results.screening_result_id` -> `screening_results.id`

### PRD-DB-005: Performance Indexes

The database SHALL maintain 13 indexes on frequently queried columns as defined in the schema migration.

---

## 6. Patient Management

### PRD-PAT-001: Patient Record Structure

Each patient record SHALL contain: ID, site patient ID (MRN), date of birth, gender, race, ethnicity, insurance type, import timestamp, import source, and last updated timestamp.

### PRD-PAT-002: Associated Clinical Data

Each patient SHALL support multiple associated records for: diagnoses (ICD-10 coded), medications (RxNorm coded), lab results (LOINC coded), vital signs, and clinical notes.

### PRD-PAT-003: Age Computation

Patient age SHALL be computed from `date_of_birth` using the `chrono` library's `years_since` function relative to the current UTC date.

---

## 7. Trial Discovery

### PRD-TRL-001: Curated Trial List

The system SHALL display a curated list of clinical trials (not a general ClinicalTrials.gov browser) with study details including: NCT number, title, sponsor, phase, status, therapeutic area, indication, and study type.

### PRD-TRL-002: Financial Intelligence

Each study MAY include financial metadata: estimated per-patient value (integer cents), estimated site startup cost, currency, payment model, and financial details JSON.

### PRD-TRL-003: Study Detail Modal

The system SHALL provide a modal view for detailed study information including all criteria and screening statistics.

---

## 8. Analytics

### PRD-ANL-001: Patient Analytics

The system SHALL provide analytics on the patient population including demographic distributions, diagnosis prevalence, and lab result summaries.

### PRD-ANL-002: Study Analytics

The system SHALL provide per-study analytics including screening yield, eligibility distribution, and criteria failure analysis.

### PRD-ANL-003: Summary Metrics

The system SHALL compute and display summary statistics: total patients, total studies, total screenings, and overall screening rates.

### PRD-ANL-004: Data Provider Integration

Analytics data SHALL be sourced through the unified data provider layer (`src/lib/data-provider.ts`) which bridges Tauri DB queries in desktop mode and demo data in web development mode.

---

## 9. Enrollment Pipeline

### PRD-PIP-001: Visual Pipeline

The system SHALL provide a visual enrollment pipeline showing patients progressing through stages: identified, pre-screened, contacted, consented, enrolled.

### PRD-PIP-002: Pipeline Data Source

Pipeline data SHALL be sourced through the data provider layer, supporting both real database queries and demo data.

---

## 10. Review Queue

### PRD-RVW-001: Three-Panel Review UI

The system SHALL provide a three-panel screening review interface with:
- **Left panel**: Ranked patient list with keyboard navigation, search, and filter controls
- **Center panel**: Criteria detail view with evidence, confidence indicators, and override capability
- **Right panel**: Source data panel with automatic evidence highlighting

### PRD-RVW-002: Review Actions

For each patient-study screening result, the reviewer SHALL be able to:
- **Accept**: Confirm the patient as eligible
- **Reject**: Mark the patient as ineligible
- **Defer**: Flag for later review

### PRD-RVW-003: Override Capability

The reviewer SHALL be able to override individual criterion results with:
- New result value (met/not_met)
- Justification text (required)
- The override SHALL be recorded in the audit trail

### PRD-RVW-004: Keyboard Navigation

The review queue SHALL support keyboard navigation for efficient clinical review workflow.

---

## 11. Cohort Builder

### PRD-COH-001: Dynamic Cohort Construction

The system SHALL allow users to define patient cohorts using filter criteria across demographics, diagnoses, medications, and lab results.

### PRD-COH-002: Cohort Persistence

Defined cohorts SHALL be saved to the database for reuse.

---

## 12. Site Performance

### PRD-SPF-001: Performance Metrics

The system SHALL display site-level performance metrics including screening rates, enrollment conversion rates, and time-to-enrollment.

### PRD-SPF-002: Data Provider Integration

Site performance data SHALL be sourced through the data provider layer.

---

## 13. LLM Integration

### PRD-LLM-001: Sidecar Architecture

The LLM SHALL run as a local sidecar process (llama.cpp server) communicating via HTTP on `127.0.0.1:8384`. No patient data SHALL be transmitted to external servers.

### PRD-LLM-002: Model Management

The system SHALL support:
- Setting a GGUF model file path (with .gguf extension validation)
- Status tracking: `not_configured`, `model_downloading`, `model_ready`, `starting`, `running`, `error`, `stopped`
- Model metadata display: name, path, file size

### PRD-LLM-003: Server Lifecycle

The system SHALL provide commands to:
- Start the llama.cpp server with configured parameters (4096 context, GPU layers, 4 threads)
- Stop the server (kill + wait)
- Check server health via HTTP GET to `/health`

### PRD-LLM-004: Criterion Evaluation

The LLM SHALL evaluate clinical trial eligibility criteria against patient context using:
- Structured prompts with clear instructions for "met", "not_met", or "unknown" outcomes
- Grammar-constrained JSON output for reliable parsing
- Conservative default: return "unknown" when uncertain
- Confidence scoring (0.9+ for structured matches, 0.5-0.8 for inferred)
- Evidence extraction from patient records

### PRD-LLM-005: Graceful Degradation

If the LLM server is not running or returns unparseable output, the system SHALL:
- Mark the criterion as "needs_review" (not fail silently)
- Return confidence 0.0
- Include a description of the failure in the reasoning field

### PRD-LLM-006: Binary Discovery

The system SHALL search for the llama-server binary in the following order:
1. Bundled in app resources
2. App data directory
3. System PATH
4. Common install locations (`/usr/local/bin`, `/opt/homebrew/bin`, Windows Program Files)

---

## 14. Export

### PRD-EXP-001: Screening Results Export

The system SHALL support exporting screening results for external analysis.

### PRD-EXP-002: Data Formats

Export SHALL support at minimum CSV format with appropriate column headers.

---

## 15. Settings

### PRD-SET-001: LLM Configuration Panel

The settings page SHALL provide a panel for configuring the LLM model path, starting/stopping the server, and monitoring server health.

### PRD-SET-002: File Watcher Configuration

The settings page SHALL allow configuration of a file system watcher for automatic import of new data files.

---

## 16. User Interface

### PRD-UI-001: Setup Screen

On first launch (no database exists), the system SHALL present a setup screen requiring the user to create a passphrase for database encryption.

### PRD-UI-002: Unlock Screen

On subsequent launches, the system SHALL present an unlock screen requiring the user's passphrase before granting access to any data.

### PRD-UI-003: Navigation

The application SHALL provide sidebar navigation with access to all major modules: Screening, Trials, Pipeline, Analytics, Cohort Builder, Review Queue, Import, Site Performance, and Settings.

### PRD-UI-004: Command Palette

The system SHALL provide a command palette (keyboard shortcut accessible) for quick navigation and actions.

### PRD-UI-005: Onboarding Modal

The system SHALL provide a 5-step onboarding modal for new users introducing key features and workflows.

### PRD-UI-006: Status Bar

The application SHALL display a status bar showing database status, LLM status, and other system indicators.

### PRD-UI-007: Resizable Panels

The three-panel review interface SHALL use resizable panels (react-resizable-panels) allowing users to adjust layout to their preference.

### PRD-UI-008: Toast Notifications

The system SHALL provide non-blocking toast notifications for user feedback on operations (import success, screening complete, errors).

### PRD-UI-009: Empty States

All list/table views SHALL display informative empty states when no data is available, guiding the user on how to populate data.

### PRD-UI-010: Page Transitions

The application SHALL use smooth page transitions for navigation between modules.

---

## 17. Non-Functional Requirements

### 17.1 Performance

| ID | Requirement | Target |
|---|---|---|
| PRD-PFM-001 | Application startup to unlock screen | < 2 seconds |
| PRD-PFM-002 | Database unlock with correct passphrase | < 1 second |
| PRD-PFM-003 | Screen 1 patient against 16 criteria | < 100ms |
| PRD-PFM-004 | Screen 1,000 patients against 16 criteria | < 10 seconds |
| PRD-PFM-005 | Import 10,000-row CSV file | < 30 seconds |
| PRD-PFM-006 | Audit chain verification (10,000 entries) | < 5 seconds |
| PRD-PFM-007 | Column auto-mapping (50 columns) | < 100ms |
| PRD-PFM-008 | UI responsiveness during screening | No freeze > 500ms |
| PRD-PFM-009 | LLM criterion evaluation (single) | < 30 seconds |
| PRD-PFM-010 | Database query for patient list | < 200ms |

### 17.2 Security

| ID | Requirement |
|---|---|
| PRD-SEC-007 | Database SHALL be inaccessible without correct passphrase |
| PRD-SEC-008 | Application SHALL NOT store passphrase to disk |
| PRD-SEC-009 | Audit trail SHALL detect any post-hoc modification |
| PRD-SEC-010 | LLM communication SHALL be restricted to localhost |

### 17.3 Reliability

| ID | Requirement |
|---|---|
| PRD-REL-001 | Application SHALL recover gracefully from database connection loss |
| PRD-REL-002 | Import SHALL not abort on individual row errors |
| PRD-REL-003 | LLM failure SHALL not prevent Tier 1 screening |
| PRD-REL-004 | WAL journaling SHALL prevent data corruption on unexpected shutdown |

### 17.4 Usability

| ID | Requirement |
|---|---|
| PRD-USB-001 | Screening results SHALL be sortable and filterable |
| PRD-USB-002 | Import column mapping SHALL be editable before execution |
| PRD-USB-003 | Keyboard shortcuts SHALL be documented and discoverable |
| PRD-USB-004 | Help documentation SHALL be accessible from within the application |

---

## 18. Platform Requirements

### PRD-PLT-001: macOS Support

The application SHALL run on macOS 12 (Monterey) or later on both Intel and Apple Silicon architectures.

### PRD-PLT-002: Windows Support

The application SHALL run on Windows 10 (version 1903+) and Windows 11 on x64 architecture.

### PRD-PLT-003: Minimum Hardware

| Component | Minimum | Recommended (with LLM) |
|---|---|---|
| RAM | 4 GB | 16 GB |
| Storage | 500 MB (app) + data | 10 GB (app + model) |
| CPU | 2 cores | 8 cores |
| GPU | N/A | Metal (macOS) or CUDA-compatible |

### PRD-PLT-004: No Internet Required

The application SHALL function with no internet connectivity. No features SHALL require network access except the optional LLM sidecar on localhost.

---

*End of Document*
