# Requirements Traceability Matrix (RTM)

## TalOS SiteConnect — On-Premise Patient Screening Application

| Field | Value |
|---|---|
| **Document ID** | RTM-SC-001 |
| **Version** | 1.0 |
| **Effective Date** | 2026-03-08 |
| **Classification** | GxP Regulated |
| **Parent Document** | VMP-SC-001, PRD-SC-001 |

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

## Legend

**Priority**: P1 = Must Have, P2 = Should Have, P3 = Nice to Have

**Risk Level**: Critical, High, Medium, Low

**Test Type**: UT = Unit Test, IT = Integration Test, E2E = End-to-End Test, PT = Performance Test, MT = Manual Test

**Status**: Designed, Ready, Passed, Failed, Blocked, Deferred

---

## Screening Engine

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-SCR-001 | AgeRange rule evaluates patient age against min/max bounds | P1 | Critical | TC-SCR-001, TC-SCR-002, TC-SCR-003 | UT | Passed |
| PRD-SCR-001 | GenderIs rule matches patient gender (case-insensitive) | P1 | Critical | TC-SCR-004, TC-SCR-005 | UT | Passed |
| PRD-SCR-001 | HasDiagnosis rule matches by ICD-10 prefix and status | P1 | Critical | TC-SCR-006, TC-SCR-007 | UT | Passed |
| PRD-SCR-001 | NoDiagnosis rule verifies absence of diagnosis | P1 | Critical | TC-SCR-008 | UT | Passed |
| PRD-SCR-001 | HasMedication rule matches by drug name substring | P1 | Critical | TC-SCR-009, TC-SCR-010 | UT | Passed |
| PRD-SCR-001 | NoMedication rule verifies absence of medication | P1 | Critical | TC-SCR-011 | UT | Passed |
| PRD-SCR-001 | LabValueRange rule checks most recent lab against thresholds | P1 | Critical | TC-SCR-012, TC-SCR-013 | UT | Passed |
| PRD-SCR-001 | VitalRange rule checks most recent vital against thresholds | P1 | Critical | TC-SCR-014 | UT | Designed |
| PRD-SCR-001 | And combinator requires all sub-rules to pass | P1 | High | TC-SCR-015, TC-SCR-016 | UT | Passed |
| PRD-SCR-001 | Or combinator requires at least one sub-rule to pass | P1 | High | TC-SCR-017 | UT | Passed |
| PRD-SCR-002 | Patient classified as eligible when all inclusion met, no exclusions | P1 | Critical | TC-SCR-018 | IT | Designed |
| PRD-SCR-002 | Patient classified as ineligible when exclusion triggered | P1 | Critical | TC-SCR-019 | IT | Designed |
| PRD-SCR-002 | Patient classified as potentially_eligible when 70%+ inclusion met | P1 | High | TC-SCR-020 | IT | Designed |
| PRD-SCR-002 | Patient classified as needs_review when >3 missing data points | P1 | High | TC-SCR-021 | IT | Designed |
| PRD-SCR-003 | Eligibility score computed correctly from inclusion ratio | P1 | High | TC-SCR-022 | UT | Designed |
| PRD-SCR-004 | Evidence text and source populated for each criterion | P1 | High | TC-SCR-023 | UT | Passed |
| PRD-SCR-005 | Missing data returns indeterminate result with confidence 0.0 | P1 | High | TC-SCR-024 | UT | Passed |
| PRD-SCR-006 | Exclusion criteria logic correctly inverted | P1 | Critical | TC-SCR-025, TC-SCR-026 | UT, IT | Passed |
| PRD-SCR-007 | Batch screening processes all patients sorted by score | P1 | Medium | TC-SCR-027 | IT | Passed |
| PRD-SCR-008 | Structured rules serialize/deserialize via JSON correctly | P1 | High | TC-SCR-028 | UT | Passed |

## Import Pipeline

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-IMP-001 | CSV files parsed with header detection | P1 | High | TC-IMP-001, TC-IMP-002 | UT, IT | Designed |
| PRD-IMP-002 | Column headers normalized (lowercase, strip special chars) | P1 | High | TC-IMP-003 | UT | Passed |
| PRD-IMP-002 | Exact column name match returns confidence 1.0 | P1 | High | TC-IMP-004 | UT | Passed |
| PRD-IMP-002 | Common EMR headers auto-mapped (Patient ID, DOB, Gender, ICD-10) | P1 | Critical | TC-IMP-005 | UT | Passed |
| PRD-IMP-002 | Epic-specific headers auto-mapped (PAT_MRN_ID, BIRTH_DATE, SEX_C) | P1 | High | TC-IMP-006 | UT | Passed |
| PRD-IMP-002 | No duplicate target field assignments | P1 | High | TC-IMP-007 | UT | Passed |
| PRD-IMP-002 | Minimum confidence threshold of 0.5 enforced | P1 | High | TC-IMP-008 | UT | Designed |
| PRD-IMP-003 | Import preview shows headers, mappings, and sample rows | P1 | Medium | TC-IMP-009 | IT | Designed |
| PRD-IMP-004 | New patients inserted; existing patients updated via COALESCE | P1 | Critical | TC-IMP-010, TC-IMP-011 | IT | Designed |
| PRD-IMP-004 | Diagnoses deduplicated by patient + description | P1 | High | TC-IMP-012 | IT | Designed |
| PRD-IMP-004 | Medications deduplicated by patient + drug name | P1 | High | TC-IMP-013 | IT | Designed |
| PRD-IMP-004 | Lab results always inserted (time-series) | P1 | High | TC-IMP-014 | IT | Designed |
| PRD-IMP-004 | Rows with empty patient ID skipped | P1 | Medium | TC-IMP-015 | IT | Designed |
| PRD-IMP-005 | Audit entry created on import execution | P1 | High | TC-IMP-016 | IT | Designed |
| PRD-IMP-007 | Per-row error reporting without aborting import | P1 | Medium | TC-IMP-017 | IT | Designed |

## Audit Trail

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-AUD-001 | Audit entries are immutable (no update/delete) | P1 | Critical | TC-AUD-001 | IT | Designed |
| PRD-AUD-002 | SHA-256 checksum chains from previous entry | P1 | Critical | TC-AUD-002 | UT | Passed |
| PRD-AUD-002 | Genesis entry uses 64-char zero string as previous checksum | P1 | Critical | TC-AUD-003 | UT | Passed |
| PRD-AUD-003 | Chain verification detects tampering | P1 | Critical | TC-AUD-004 | UT | Passed |
| PRD-AUD-003 | Empty chain verifies successfully | P1 | Medium | TC-AUD-005 | UT | Passed |
| PRD-AUD-003 | Multi-entry chain verifies successfully | P1 | Critical | TC-AUD-006 | UT | Passed |
| PRD-AUD-004 | All 9 audit actions recorded correctly | P1 | High | TC-AUD-007 | UT | Designed |
| PRD-AUD-005 | Audit entry contains UUID, timestamp, action, details, checksum | P1 | High | TC-AUD-008 | UT | Passed |

## Security and Database Encryption

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-SEC-001 | Database encrypted with SQLCipher AES-256 | P1 | Critical | TC-SEC-001 | IT | Designed |
| PRD-SEC-002 | PBKDF2 with 256,000 iterations configured | P1 | Critical | TC-SEC-002 | IT | Designed |
| PRD-SEC-003 | Incorrect passphrase returns InvalidPassphrase error | P1 | Critical | TC-SEC-003 | IT | Designed |
| PRD-SEC-004 | Passphrase zeroed from memory after use | P1 | Critical | TC-SEC-004 | UT | Designed |
| PRD-SEC-005 | No outbound network connections for PHI | P1 | Critical | TC-SEC-005 | MT | Designed |
| PRD-SEC-006 | WAL journaling mode enabled | P1 | High | TC-SEC-006 | IT | Designed |
| PRD-SEC-007 | Database inaccessible without passphrase | P1 | Critical | TC-SEC-007 | IT | Designed |

## Database Operations

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-DB-001 | Schema auto-migration creates all tables | P1 | Critical | TC-DB-001 | UT | Passed |
| PRD-DB-002 | 13 tables created with correct columns | P1 | High | TC-DB-002 | UT | Passed |
| PRD-DB-003 | r2d2 connection pool manages concurrent access | P1 | High | TC-DB-003 | IT | Designed |
| PRD-DB-004 | Foreign key relationships enforced | P2 | Medium | TC-DB-004 | IT | Designed |
| PRD-DB-005 | 13 indexes created on key columns | P2 | Medium | TC-DB-005 | UT | Designed |

## Analytics

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-ANL-001 | Patient demographics analytics computed | P2 | Medium | TC-ANL-001 | IT | Designed |
| PRD-ANL-002 | Per-study screening analytics computed | P2 | Medium | TC-ANL-002 | IT | Designed |
| PRD-ANL-003 | Summary metrics (patients, studies, screenings) | P2 | Low | TC-ANL-003 | IT | Designed |
| PRD-ANL-004 | Data provider bridges Tauri and demo modes | P2 | Medium | TC-ANL-004 | UT | Designed |

## Export

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-EXP-001 | Screening results exportable | P2 | Medium | TC-EXP-001 | IT | Designed |
| PRD-EXP-002 | CSV export with headers | P2 | Medium | TC-EXP-002 | IT | Designed |

## LLM Integration

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-LLM-001 | LLM runs on localhost only (127.0.0.1:8384) | P1 | Critical | TC-LLM-001 | IT, MT | Designed |
| PRD-LLM-002 | GGUF model path validated (.gguf extension) | P1 | High | TC-LLM-002, TC-LLM-003 | UT | Designed |
| PRD-LLM-002 | LLM status transitions tracked correctly | P1 | High | TC-LLM-004 | UT | Designed |
| PRD-LLM-003 | Server start with configured parameters | P1 | High | TC-LLM-005 | IT | Designed |
| PRD-LLM-003 | Server stop terminates process cleanly | P1 | High | TC-LLM-006 | IT | Designed |
| PRD-LLM-003 | Health check via HTTP GET /health | P1 | Medium | TC-LLM-007 | IT | Designed |
| PRD-LLM-004 | Criterion evaluation returns structured JSON | P1 | High | TC-LLM-008 | IT | Designed |
| PRD-LLM-005 | Unparseable LLM output returns "unknown" with confidence 0.0 | P1 | Critical | TC-LLM-009 | UT | Designed |
| PRD-LLM-005 | LLM offline returns "needs_review" for criteria | P1 | Critical | TC-LLM-010 | IT | Designed |
| PRD-LLM-006 | Binary discovery searches bundled, data dir, PATH, common paths | P2 | Medium | TC-LLM-011 | UT | Designed |

## User Interface

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-UI-001 | Setup screen displayed on first launch | P1 | High | TC-UI-001 | E2E | Designed |
| PRD-UI-002 | Unlock screen requires passphrase | P1 | Critical | TC-UI-002, TC-UI-003 | E2E | Designed |
| PRD-UI-003 | Sidebar navigation to all modules | P1 | Medium | TC-UI-004 | E2E | Designed |
| PRD-UI-004 | Command palette accessible via keyboard shortcut | P2 | Low | TC-UI-005 | E2E | Designed |
| PRD-UI-005 | Onboarding modal shows 5 steps | P3 | Low | TC-UI-006 | E2E | Designed |
| PRD-UI-007 | Three-panel review resizable | P2 | Medium | TC-UI-007 | E2E | Designed |
| PRD-UI-009 | Empty states displayed when no data | P2 | Low | TC-UI-008 | E2E | Designed |

## Performance

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-PFM-001 | App startup < 2 seconds | P1 | Medium | TC-PFM-001 | PT | Designed |
| PRD-PFM-002 | Database unlock < 1 second | P1 | Medium | TC-PFM-002 | PT | Designed |
| PRD-PFM-003 | Single patient screening < 100ms | P1 | High | TC-PFM-003 | PT | Designed |
| PRD-PFM-004 | 1,000 patient batch screening < 10s | P1 | High | TC-PFM-004 | PT | Designed |
| PRD-PFM-005 | 10,000-row CSV import < 30 seconds | P1 | Medium | TC-PFM-005 | PT | Designed |
| PRD-PFM-006 | Audit chain verification (10K entries) < 5s | P1 | Medium | TC-PFM-006 | PT | Designed |

## Review Queue

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-RVW-001 | Three-panel layout renders correctly | P1 | Medium | TC-UI-007 | E2E | Designed |
| PRD-RVW-002 | Accept action updates review status | P1 | High | TC-RVW-001 | IT | Designed |
| PRD-RVW-002 | Reject action updates review status | P1 | High | TC-RVW-002 | IT | Designed |
| PRD-RVW-002 | Defer action updates review status | P1 | High | TC-RVW-003 | IT | Designed |
| PRD-RVW-003 | Override with justification recorded in audit | P1 | Critical | TC-RVW-004 | IT | Designed |

## Pipeline Management

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-PIP-001 | Pipeline stages displayed visually | P2 | Low | TC-PIP-001 | E2E | Designed |
| PRD-PIP-002 | Pipeline data from data provider | P2 | Low | TC-PIP-002 | IT | Designed |

## Cohort Builder

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-COH-001 | Filter criteria applied to patient list | P2 | Medium | TC-COH-001 | IT | Designed |
| PRD-COH-002 | Cohort definition saved to database | P2 | Medium | TC-COH-002 | IT | Designed |

## Site Performance

| REQ ID | Requirement Description | Priority | Risk Level | Test Case IDs | Test Type | Status |
|---|---|---|---|---|---|---|
| PRD-SPF-001 | Performance metrics computed and displayed | P2 | Low | TC-SPF-001 | IT | Designed |
| PRD-SPF-002 | Data sourced via data provider | P2 | Low | TC-SPF-002 | IT | Designed |

---

## Summary Statistics

| Category | Total Requirements | Test Cases | Passed | Designed | Blocked |
|---|---|---|---|---|---|
| Screening Engine | 20 | 28 | 15 | 13 | 0 |
| Import Pipeline | 15 | 17 | 6 | 11 | 0 |
| Audit Trail | 8 | 8 | 6 | 2 | 0 |
| Security | 7 | 7 | 0 | 7 | 0 |
| Database | 5 | 5 | 2 | 3 | 0 |
| Analytics | 4 | 4 | 0 | 4 | 0 |
| Export | 2 | 2 | 0 | 2 | 0 |
| LLM Integration | 10 | 11 | 0 | 11 | 0 |
| User Interface | 7 | 8 | 0 | 8 | 0 |
| Performance | 6 | 6 | 0 | 6 | 0 |
| Review Queue | 4 | 4 | 0 | 4 | 0 |
| Pipeline | 2 | 2 | 0 | 2 | 0 |
| Cohort Builder | 2 | 2 | 0 | 2 | 0 |
| Site Performance | 2 | 2 | 0 | 2 | 0 |
| **TOTAL** | **94** | **106** | **29** | **77** | **0** |

---

*End of Document*
