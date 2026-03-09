# IQ / OQ / PQ Protocols

## TalOS SiteConnect — On-Premise Patient Screening Application

| Field | Value |
|---|---|
| **Document ID** | QP-SC-001 |
| **Version** | 1.0 |
| **Effective Date** | 2026-03-08 |
| **Classification** | GxP Regulated |
| **Parent Document** | VMP-SC-001 |

---

### Document Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Author | __________________ | __________________ | ________ |
| Validation Lead | __________________ | __________________ | ________ |
| Quality Assurance | __________________ | __________________ | ________ |
| IT Operations | __________________ | __________________ | ________ |

---

### Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 0.1 | 2026-03-01 | Engineering | Initial draft |
| 1.0 | 2026-03-08 | Engineering | Released for review |

---

## Table of Contents

1. [Installation Qualification (IQ)](#part-1-installation-qualification-iq)
2. [Operational Qualification (OQ)](#part-2-operational-qualification-oq)
3. [Performance Qualification (PQ)](#part-3-performance-qualification-pq)

---

# Part 1: Installation Qualification (IQ)

## IQ-1: Purpose

The Installation Qualification verifies that TalOS SiteConnect and all its dependencies are installed correctly on target platforms and that the computing environment meets specified requirements.

## IQ-2: Scope

- Application binary installation on macOS (Intel and Apple Silicon)
- Application binary installation on Windows 10/11 (x64)
- SQLCipher encryption library functionality
- Database initialization and schema migration
- Optional: llama.cpp sidecar binary availability
- File system permissions

## IQ-3: Prerequisites

- Target machine meets minimum hardware requirements (see PRD-PLT-003)
- Operating system version meets requirements (macOS 12+ or Windows 10 1903+)
- No previous installation of TalOS SiteConnect on the target machine (clean install) or documented upgrade path
- Administrator/root access available for installation

## IQ-4: Test Scripts

---

### IQ-4.1: Application Binary Installation (macOS)

**Test ID**: IQ-MAC-001

**Objective**: Verify that the application installs and launches on macOS.

| Step | Action | Expected Result | Actual Result | Pass/Fail |
|---|---|---|---|---|
| 1 | Download the TalOS SiteConnect .dmg file | File downloads completely; SHA-256 checksum matches published value | | |
| 2 | Open the .dmg and drag the application to /Applications | Application copies to /Applications without error | | |
| 3 | Launch the application from /Applications | Application window appears within 5 seconds | | |
| 4 | Verify the application version in About dialog | Version matches the expected release version (0.1.x) | | |
| 5 | Verify Gatekeeper does not block execution | Application runs without "unidentified developer" warning (if signed) or user can approve it | | |

**Tested by**: __________________ **Date**: __________

---

### IQ-4.2: Application Binary Installation (Windows)

**Test ID**: IQ-WIN-001

**Objective**: Verify that the application installs and launches on Windows.

| Step | Action | Expected Result | Actual Result | Pass/Fail |
|---|---|---|---|---|
| 1 | Download the TalOS SiteConnect .msi installer | File downloads completely; SHA-256 checksum matches published value | | |
| 2 | Run the installer with default settings | Installation completes without error; application appears in Start Menu | | |
| 3 | Launch the application from Start Menu | Application window appears within 5 seconds | | |
| 4 | Verify the application version | Version matches the expected release version | | |
| 5 | Verify Windows Defender does not quarantine the application | Application runs without SmartScreen warning (if signed) or user can approve | | |

**Tested by**: __________________ **Date**: __________

---

### IQ-4.3: Database Initialization

**Test ID**: IQ-DB-001

**Objective**: Verify that the SQLCipher database initializes correctly on first launch.

| Step | Action | Expected Result | Actual Result | Pass/Fail |
|---|---|---|---|---|
| 1 | Launch the application for the first time (no existing database) | Setup screen is displayed prompting for passphrase creation | | |
| 2 | Enter a passphrase and confirm | Database file created in the application data directory | | |
| 3 | Verify database file exists at expected path | File exists at `~/Library/Application Support/com.talosix.siteconnect/` (macOS) or `%APPDATA%\com.talosix.siteconnect\` (Windows) | | |
| 4 | Verify database file is not readable as plain SQLite | Attempting to open with standard SQLite tools returns "file is not a database" error | | |
| 5 | Verify all 13 tables are created | Query `SELECT count(*) FROM sqlite_master WHERE type='table'` returns >= 12 (after successful unlock) | | |
| 6 | Verify all 13 indexes are created | Query `SELECT count(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'` returns >= 13 | | |

**Tested by**: __________________ **Date**: __________

---

### IQ-4.4: SQLCipher Configuration Verification

**Test ID**: IQ-SEC-001

**Objective**: Verify that SQLCipher encryption parameters are correctly configured.

| Step | Action | Expected Result | Actual Result | Pass/Fail |
|---|---|---|---|---|
| 1 | Open database with correct passphrase | Database opens successfully | | |
| 2 | Query `PRAGMA cipher_page_size` | Returns 4096 | | |
| 3 | Query `PRAGMA kdf_iter` | Returns 256000 | | |
| 4 | Query `PRAGMA cipher_version` | Returns a valid SQLCipher version string | | |
| 5 | Query `PRAGMA journal_mode` | Returns "wal" | | |

**Tested by**: __________________ **Date**: __________

---

### IQ-4.5: LLM Sidecar Binary (Optional)

**Test ID**: IQ-LLM-001

**Objective**: Verify that the llama-server binary is available and executable.

| Step | Action | Expected Result | Actual Result | Pass/Fail |
|---|---|---|---|---|
| 1 | Check for llama-server in bundled resources | Binary found in app resources directory OR available in PATH | | |
| 2 | Execute `llama-server --version` | Version string returned without error | | |
| 3 | Verify binary architecture matches platform | Binary runs natively (no Rosetta translation on Apple Silicon, correct x64 on Windows) | | |

**Tested by**: __________________ **Date**: __________

---

### IQ-4.6: Rust Backend Dependencies

**Test ID**: IQ-DEP-001

**Objective**: Verify that all Rust backend dependencies are correctly bundled (for development/build verification).

| Step | Action | Expected Result | Actual Result | Pass/Fail |
|---|---|---|---|---|
| 1 | Run `cargo check` in src-tauri/ | Compiles without errors | | |
| 2 | Run `cargo test` in src-tauri/ | All 23 tests pass | | |
| 3 | Verify rusqlite built with `bundled-sqlcipher` feature | Feature flag present in Cargo.toml; SQLCipher statically linked | | |
| 4 | Verify `zeroize` crate included for passphrase handling | Dependency present in Cargo.toml with `derive` feature | | |
| 5 | Verify `sha2` and `hex` crates for HMAC chain | Dependencies present and functional | | |

**Tested by**: __________________ **Date**: __________

---

### IQ-4.7: Frontend Dependencies

**Test ID**: IQ-FE-001

**Objective**: Verify that the frontend builds correctly.

| Step | Action | Expected Result | Actual Result | Pass/Fail |
|---|---|---|---|---|
| 1 | Run `npm install` in project root | All dependencies installed without errors | | |
| 2 | Run `tsc --noEmit` | TypeScript compilation completes with no errors | | |
| 3 | Run `npm run build` | Vite build succeeds; output in dist/ directory | | |
| 4 | Verify React 19 is installed | `package.json` shows react@19.x | | |

**Tested by**: __________________ **Date**: __________

---

## IQ-5: IQ Acceptance Criteria

All IQ test scripts must pass without critical or major deviations. Any deviations must be documented in the IQ Deviation Log and resolved before proceeding to OQ.

---

# Part 2: Operational Qualification (OQ)

## OQ-1: Purpose

The Operational Qualification verifies that all system features operate as specified in the Product Requirements Document (PRD-SC-001) under normal, boundary, and error conditions.

## OQ-2: Scope

All functional modules: Screening Engine, Import Pipeline, Audit Trail, Security, Database, Analytics, Export, LLM Integration, Review Queue, Pipeline, Cohort Builder, Site Performance, Settings, and User Interface.

## OQ-3: Prerequisites

- IQ completed and approved
- Test environment configured per IQ specifications
- Test data prepared (synthetic patient records, study definitions, CSV files)
- All 23 existing Rust unit tests passing

## OQ-4: Test Execution Summary

Tests are organized by module. Each test references a Test Case Specification (TCS) documented in TEST-CASE-SPECIFICATIONS.md.

---

### OQ-4.1: Screening Engine Qualification

**Objective**: Verify all 9 rule types evaluate correctly against patient data.

| Test Case ID | Test Title | Test Type | Requirement | Result | Executed By | Date |
|---|---|---|---|---|---|---|
| TC-SCR-001 | AgeRange pass: patient within bounds | UT | PRD-SCR-001 | | | |
| TC-SCR-002 | AgeRange fail: patient below minimum | UT | PRD-SCR-001 | | | |
| TC-SCR-003 | AgeRange missing: no DOB available | UT | PRD-SCR-001 | | | |
| TC-SCR-004 | GenderIs pass: matching gender | UT | PRD-SCR-001 | | | |
| TC-SCR-005 | GenderIs fail: non-matching gender | UT | PRD-SCR-001 | | | |
| TC-SCR-006 | HasDiagnosis pass: ICD-10 prefix found | UT | PRD-SCR-001 | | | |
| TC-SCR-007 | HasDiagnosis fail: no matching diagnosis | UT | PRD-SCR-001 | | | |
| TC-SCR-008 | NoDiagnosis pass: diagnosis absent | UT | PRD-SCR-001 | | | |
| TC-SCR-009 | HasMedication pass: active medication found | UT | PRD-SCR-001 | | | |
| TC-SCR-010 | HasMedication fail: medication not found | UT | PRD-SCR-001 | | | |
| TC-SCR-011 | NoMedication pass: excluded medication absent | UT | PRD-SCR-001 | | | |
| TC-SCR-012 | LabValueRange pass: value within range | UT | PRD-SCR-001 | | | |
| TC-SCR-013 | LabValueRange fail: value outside range | UT | PRD-SCR-001 | | | |
| TC-SCR-014 | VitalRange pass: vital within range | UT | PRD-SCR-001 | | | |
| TC-SCR-015 | And combinator: all sub-rules pass | UT | PRD-SCR-001 | | | |
| TC-SCR-016 | And combinator: one sub-rule fails | UT | PRD-SCR-001 | | | |
| TC-SCR-017 | Or combinator: one sub-rule passes | UT | PRD-SCR-001 | | | |
| TC-SCR-018 | Status: eligible classification | IT | PRD-SCR-002 | | | |
| TC-SCR-019 | Status: ineligible classification (exclusion) | IT | PRD-SCR-002 | | | |
| TC-SCR-020 | Status: potentially_eligible classification | IT | PRD-SCR-002 | | | |
| TC-SCR-021 | Status: needs_review classification | IT | PRD-SCR-002 | | | |
| TC-SCR-022 | Score calculation accuracy | UT | PRD-SCR-003 | | | |
| TC-SCR-023 | Evidence and source populated | UT | PRD-SCR-004 | | | |
| TC-SCR-024 | Missing data returns indeterminate | UT | PRD-SCR-005 | | | |
| TC-SCR-025 | Exclusion logic: rule pass = not_met | UT | PRD-SCR-006 | | | |
| TC-SCR-026 | Exclusion logic: rule fail = met | IT | PRD-SCR-006 | | | |
| TC-SCR-027 | Batch screening sorted by score | IT | PRD-SCR-007 | | | |
| TC-SCR-028 | Rule JSON serialization round-trip | UT | PRD-SCR-008 | | | |

---

### OQ-4.2: Import Pipeline Qualification

**Objective**: Verify CSV import with auto-mapping, persistence, and error handling.

| Test Case ID | Test Title | Test Type | Requirement | Result | Executed By | Date |
|---|---|---|---|---|---|---|
| TC-IMP-001 | CSV file parsed with headers | UT | PRD-IMP-001 | | | |
| TC-IMP-002 | Malformed CSV produces error | UT | PRD-IMP-001 | | | |
| TC-IMP-003 | Header normalization | UT | PRD-IMP-002 | | | |
| TC-IMP-004 | Exact name match confidence | UT | PRD-IMP-002 | | | |
| TC-IMP-005 | Common headers auto-mapped | UT | PRD-IMP-002 | | | |
| TC-IMP-006 | Epic headers auto-mapped | UT | PRD-IMP-002 | | | |
| TC-IMP-007 | No duplicate targets | UT | PRD-IMP-002 | | | |
| TC-IMP-008 | Confidence threshold enforced | UT | PRD-IMP-002 | | | |
| TC-IMP-009 | Import preview content | IT | PRD-IMP-003 | | | |
| TC-IMP-010 | New patients inserted | IT | PRD-IMP-004 | | | |
| TC-IMP-011 | Existing patients updated | IT | PRD-IMP-004 | | | |
| TC-IMP-012 | Diagnosis deduplication | IT | PRD-IMP-004 | | | |
| TC-IMP-013 | Medication deduplication | IT | PRD-IMP-004 | | | |
| TC-IMP-014 | Lab results always inserted | IT | PRD-IMP-004 | | | |
| TC-IMP-015 | Empty patient ID rows skipped | IT | PRD-IMP-004 | | | |
| TC-IMP-016 | Audit entry on import | IT | PRD-IMP-005 | | | |
| TC-IMP-017 | Per-row error reporting | IT | PRD-IMP-007 | | | |

---

### OQ-4.3: Audit Trail Qualification

**Objective**: Verify HMAC-chained audit trail integrity and tamper detection.

| Test Case ID | Test Title | Test Type | Requirement | Result | Executed By | Date |
|---|---|---|---|---|---|---|
| TC-AUD-001 | Audit entries immutable | IT | PRD-AUD-001 | | | |
| TC-AUD-002 | Checksum chains correctly | UT | PRD-AUD-002 | | | |
| TC-AUD-003 | Genesis entry checksum | UT | PRD-AUD-002 | | | |
| TC-AUD-004 | Tampering detected | UT | PRD-AUD-003 | | | |
| TC-AUD-005 | Empty chain verifies | UT | PRD-AUD-003 | | | |
| TC-AUD-006 | Multi-entry chain verifies | UT | PRD-AUD-003 | | | |
| TC-AUD-007 | All 9 actions recorded | UT | PRD-AUD-004 | | | |
| TC-AUD-008 | Entry contains all fields | UT | PRD-AUD-005 | | | |

---

### OQ-4.4: Security Qualification

**Objective**: Verify database encryption, passphrase handling, and access control.

| Test Case ID | Test Title | Test Type | Requirement | Result | Executed By | Date |
|---|---|---|---|---|---|---|
| TC-SEC-001 | AES-256 encryption active | IT | PRD-SEC-001 | | | |
| TC-SEC-002 | PBKDF2 256K iterations | IT | PRD-SEC-002 | | | |
| TC-SEC-003 | Wrong passphrase rejected | IT | PRD-SEC-003 | | | |
| TC-SEC-004 | Passphrase zeroed | UT | PRD-SEC-004 | | | |
| TC-SEC-005 | No outbound PHI connections | MT | PRD-SEC-005 | | | |
| TC-SEC-006 | WAL mode enabled | IT | PRD-SEC-006 | | | |
| TC-SEC-007 | DB inaccessible without passphrase | IT | PRD-SEC-007 | | | |

---

### OQ-4.5: LLM Integration Qualification

**Objective**: Verify LLM sidecar lifecycle and criterion evaluation.

| Test Case ID | Test Title | Test Type | Requirement | Result | Executed By | Date |
|---|---|---|---|---|---|---|
| TC-LLM-001 | Localhost-only communication | IT/MT | PRD-LLM-001 | | | |
| TC-LLM-002 | Valid GGUF path accepted | UT | PRD-LLM-002 | | | |
| TC-LLM-003 | Non-GGUF path rejected | UT | PRD-LLM-002 | | | |
| TC-LLM-004 | Status transitions correct | UT | PRD-LLM-002 | | | |
| TC-LLM-005 | Server starts with parameters | IT | PRD-LLM-003 | | | |
| TC-LLM-006 | Server stops cleanly | IT | PRD-LLM-003 | | | |
| TC-LLM-007 | Health check endpoint | IT | PRD-LLM-003 | | | |
| TC-LLM-008 | Structured JSON evaluation | IT | PRD-LLM-004 | | | |
| TC-LLM-009 | Unparseable output handled | UT | PRD-LLM-005 | | | |
| TC-LLM-010 | Offline fallback to needs_review | IT | PRD-LLM-005 | | | |
| TC-LLM-011 | Binary discovery order | UT | PRD-LLM-006 | | | |

---

### OQ-4.6: User Interface Qualification

**Objective**: Verify key UI flows and navigation.

| Test Case ID | Test Title | Test Type | Requirement | Result | Executed By | Date |
|---|---|---|---|---|---|---|
| TC-UI-001 | Setup screen on first launch | E2E | PRD-UI-001 | | | |
| TC-UI-002 | Unlock with correct passphrase | E2E | PRD-UI-002 | | | |
| TC-UI-003 | Unlock rejected with wrong passphrase | E2E | PRD-UI-002 | | | |
| TC-UI-004 | Sidebar navigation works | E2E | PRD-UI-003 | | | |
| TC-UI-005 | Command palette opens | E2E | PRD-UI-004 | | | |
| TC-UI-006 | Onboarding modal 5 steps | E2E | PRD-UI-005 | | | |
| TC-UI-007 | Three-panel review resizable | E2E | PRD-UI-007 | | | |
| TC-UI-008 | Empty states displayed | E2E | PRD-UI-009 | | | |

---

### OQ-4.7: Database and Other Modules

| Test Case ID | Test Title | Test Type | Requirement | Result | Executed By | Date |
|---|---|---|---|---|---|---|
| TC-DB-001 | Schema migration creates tables | UT | PRD-DB-001 | | | |
| TC-DB-002 | 13 tables with correct columns | UT | PRD-DB-002 | | | |
| TC-DB-003 | Connection pool concurrent access | IT | PRD-DB-003 | | | |
| TC-DB-004 | Foreign key enforcement | IT | PRD-DB-004 | | | |
| TC-DB-005 | Indexes created | UT | PRD-DB-005 | | | |
| TC-ANL-001 | Patient demographics analytics | IT | PRD-ANL-001 | | | |
| TC-ANL-002 | Study screening analytics | IT | PRD-ANL-002 | | | |
| TC-ANL-003 | Summary metrics | IT | PRD-ANL-003 | | | |
| TC-ANL-004 | Data provider mode bridge | UT | PRD-ANL-004 | | | |
| TC-EXP-001 | Screening results exportable | IT | PRD-EXP-001 | | | |
| TC-EXP-002 | CSV export with headers | IT | PRD-EXP-002 | | | |
| TC-RVW-001 | Accept action | IT | PRD-RVW-002 | | | |
| TC-RVW-002 | Reject action | IT | PRD-RVW-002 | | | |
| TC-RVW-003 | Defer action | IT | PRD-RVW-002 | | | |
| TC-RVW-004 | Override recorded in audit | IT | PRD-RVW-003 | | | |
| TC-PIP-001 | Pipeline stages displayed | E2E | PRD-PIP-001 | | | |
| TC-PIP-002 | Pipeline data provider | IT | PRD-PIP-002 | | | |
| TC-COH-001 | Cohort filters applied | IT | PRD-COH-001 | | | |
| TC-COH-002 | Cohort saved to DB | IT | PRD-COH-002 | | | |
| TC-SPF-001 | Performance metrics displayed | IT | PRD-SPF-001 | | | |
| TC-SPF-002 | Data provider integration | IT | PRD-SPF-002 | | | |

---

## OQ-5: OQ Acceptance Criteria

- All Critical and High risk test cases must pass
- No unresolved Critical deviations
- All Major deviations documented with remediation plans
- Automated tests (cargo test) must pass 100%
- Test coverage meets targets defined in VMP Section 7.2

---

# Part 3: Performance Qualification (PQ)

## PQ-1: Purpose

The Performance Qualification verifies that TalOS SiteConnect performs reliably under realistic conditions representative of actual research site usage, including expected data volumes and concurrent operations.

## PQ-2: Scope

- Screening performance at scale (1,000+ patients)
- Import performance with large files (10,000+ rows)
- Audit trail verification at scale (10,000+ entries)
- Application startup and responsiveness
- Database query performance under load

## PQ-3: Prerequisites

- OQ completed and approved
- PQ test environment configured with production-equivalent hardware
- Synthetic test datasets prepared at specified volumes
- Performance monitoring tools available

## PQ-4: Test Environment

| Component | Specification |
|---|---|
| **macOS Test Machine** | Apple Silicon M-series, 16 GB RAM, 512 GB SSD |
| **Windows Test Machine** | Intel i7 or equivalent, 16 GB RAM, 512 GB SSD |
| **Test Data Volume** | 5,000 patients with full clinical data (diagnoses, meds, labs, vitals) |
| **Study Configuration** | 3 studies with 10-20 criteria each (mix of structured and LLM-required) |

## PQ-5: Test Scripts

---

### PQ-5.1: Application Startup Performance

**Test ID**: TC-PFM-001

**Objective**: Verify application starts within performance targets.

| Step | Action | Expected Result | Measurement Method | Actual Result | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Cold launch the application (not running) | Application window visible within 2 seconds | Stopwatch from click to window render | | |
| 2 | Repeat 5 times and record average | Average startup time < 2 seconds | Mean of 5 measurements | | |

**Acceptance Criteria**: Average startup time < 2 seconds on both macOS and Windows.

---

### PQ-5.2: Database Unlock Performance

**Test ID**: TC-PFM-002

**Objective**: Verify database unlock completes within performance targets.

| Step | Action | Expected Result | Measurement Method | Actual Result | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Enter correct passphrase on unlock screen | Dashboard loaded within 1 second | Timer from submit to dashboard render | | |
| 2 | Repeat 5 times and record average | Average unlock time < 1 second | Mean of 5 measurements | | |

**Acceptance Criteria**: Average unlock time < 1 second.

---

### PQ-5.3: Single Patient Screening Performance

**Test ID**: TC-PFM-003

**Objective**: Verify single patient screening completes within performance targets.

| Step | Action | Expected Result | Measurement Method | Actual Result | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Load database with 5,000 patients | Database loaded | Verify patient count | | |
| 2 | Screen a single patient against a 16-criterion study | Result returned within 100ms | Rust timer around `screen_patient()` | | |
| 3 | Repeat for 10 different patients | All < 100ms | Timer measurements | | |

**Acceptance Criteria**: P99 screening time < 100ms for single patient.

---

### PQ-5.4: Batch Screening Performance

**Test ID**: TC-PFM-004

**Objective**: Verify batch screening of 1,000 patients completes within performance targets.

| Step | Action | Expected Result | Measurement Method | Actual Result | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Load database with 1,000 patients with full clinical data | Database loaded | Patient count query | | |
| 2 | Execute batch screening against a 16-criterion study | All 1,000 patients screened within 10 seconds | Timer around `screen_all_patients()` | | |
| 3 | Verify results are sorted by score descending | Results correctly ordered | Programmatic verification | | |
| 4 | Verify no patients are dropped or duplicated | Result count = patient count | Count comparison | | |

**Acceptance Criteria**: Total batch screening time < 10 seconds for 1,000 patients.

---

### PQ-5.5: CSV Import Performance

**Test ID**: TC-PFM-005

**Objective**: Verify large CSV import completes within performance targets.

| Step | Action | Expected Result | Measurement Method | Actual Result | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Prepare a CSV file with 10,000 patient rows and 15 columns | File prepared | File line count | | |
| 2 | Execute auto-mapping | Column mapping returned within 100ms | Timer | | |
| 3 | Execute import with the mapping | Import completes within 30 seconds | Timer from execute to completion | | |
| 4 | Verify all records persisted | `SELECT count(*) FROM patients` matches expected count | Database query | | |
| 5 | Verify audit entry created | Import audit log entry exists | Database query | | |

**Acceptance Criteria**: 10,000-row import completes within 30 seconds including DB persistence.

---

### PQ-5.6: Audit Chain Verification Performance

**Test ID**: TC-PFM-006

**Objective**: Verify audit chain verification scales to high entry counts.

| Step | Action | Expected Result | Measurement Method | Actual Result | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Generate 10,000 audit entries programmatically | All entries written with valid chain | Entry count query | | |
| 2 | Run `verify_audit_chain()` | Verification completes within 5 seconds | Timer | | |
| 3 | Verify returned count = 10,000 | Count matches | Return value comparison | | |
| 4 | Tamper with entry #5,000 and re-verify | Tampering detected at entry ~5,000 | Error message inspection | | |

**Acceptance Criteria**: 10,000-entry chain verification < 5 seconds; tampering correctly detected.

---

### PQ-5.7: UI Responsiveness During Operations

**Test ID**: TC-PFM-008 (maps to PRD-PFM-008)

**Objective**: Verify the UI remains responsive during long-running operations.

| Step | Action | Expected Result | Measurement Method | Actual Result | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Initiate a batch screening of 500 patients | UI remains interactive (sidebar clickable, tooltips appear) | Manual observation | | |
| 2 | During screening, navigate to Settings page | Navigation completes without delay | Visual check | | |
| 3 | During import of 5,000 rows, interact with progress UI | Progress indicator updates; UI not frozen | Visual check, no "Not Responding" state | | |

**Acceptance Criteria**: No UI freeze exceeding 500ms during background operations.

---

### PQ-5.8: LLM Evaluation Performance

**Test ID**: TC-PFM-009 (maps to PRD-PFM-009)

**Objective**: Verify LLM criterion evaluation completes within acceptable time.

**Prerequisites**: BioMistral-7B GGUF model loaded; llama-server running on localhost.

| Step | Action | Expected Result | Measurement Method | Actual Result | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Submit a single criterion evaluation with 500-word patient context | Result returned within 30 seconds | Timer from request to response | | |
| 2 | Verify response is valid JSON with required fields | Fields: result, confidence, reasoning, evidence | JSON schema validation | | |
| 3 | Repeat 5 times and compute average | Average response time < 30 seconds | Mean of 5 measurements | | |

**Acceptance Criteria**: P95 LLM evaluation time < 30 seconds on recommended hardware.

---

### PQ-5.9: Database Query Performance

**Test ID**: TC-PFM-010 (maps to PRD-PFM-010)

**Objective**: Verify database queries perform within targets under realistic data volumes.

| Step | Action | Expected Result | Measurement Method | Actual Result | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Load 5,000 patients with associated data | Database populated | Row counts | | |
| 2 | Query patient list (SELECT * FROM patients LIMIT 100) | Results returned within 200ms | Timer | | |
| 3 | Query screening results for a study | Results returned within 200ms | Timer | | |
| 4 | Query analytics summary | Summary computed within 500ms | Timer | | |

**Acceptance Criteria**: All standard queries < 200ms; analytics < 500ms.

---

## PQ-6: Stress Test (Optional)

### PQ-6.1: Maximum Data Volume

| Step | Action | Expected Result | Actual Result | Pass/Fail |
|---|---|---|---|---|
| 1 | Load 50,000 patients with full clinical records | Database file size recorded; application remains functional | | |
| 2 | Screen all 50,000 against a study | Completes without crash; result set returned | | |
| 3 | Verify database integrity | No corruption detected; audit chain valid | | |

---

## PQ-7: PQ Acceptance Criteria

- All PQ test scripts must pass on at least one target platform (macOS or Windows)
- Performance must meet targets specified in PRD Section 17.1
- No data integrity issues observed during any performance test
- Application must remain responsive during all background operations
- All deviations documented and assessed for impact

---

## PQ-8: Final Validation Summary

| Phase | Tests Planned | Tests Executed | Tests Passed | Tests Failed | Deviations |
|---|---|---|---|---|---|
| IQ | __ | __ | __ | __ | __ |
| OQ | __ | __ | __ | __ | __ |
| PQ | __ | __ | __ | __ | __ |
| **Total** | __ | __ | __ | __ | __ |

### Validation Conclusion

_To be completed upon validation execution._

**Recommendation**: [ ] Approved for Production Use / [ ] Conditional Approval / [ ] Not Approved

| Role | Name | Signature | Date |
|---|---|---|---|
| Validation Lead | __________________ | __________________ | ________ |
| Quality Assurance | __________________ | __________________ | ________ |
| Project Sponsor | __________________ | __________________ | ________ |

---

*End of Document*
