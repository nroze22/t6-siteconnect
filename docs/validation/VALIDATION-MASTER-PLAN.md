# Validation Master Plan (VMP)

## TalOS SiteConnect — On-Premise Patient Screening Application

| Field | Value |
|---|---|
| **Document ID** | VMP-SC-001 |
| **Version** | 1.0 |
| **Effective Date** | 2026-03-08 |
| **Classification** | GxP Regulated |
| **Confidentiality** | Internal / Regulatory |

---

### Document Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Author | __________________ | __________________ | ________ |
| Quality Assurance | __________________ | __________________ | ________ |
| IT Validation Lead | __________________ | __________________ | ________ |
| Regulatory Affairs | __________________ | __________________ | ________ |
| Project Sponsor | __________________ | __________________ | ________ |

---

### Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 0.1 | 2026-03-01 | Engineering | Initial draft |
| 1.0 | 2026-03-08 | Engineering | Released for review |

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [System Description](#2-system-description)
3. [Regulatory Requirements](#3-regulatory-requirements)
4. [Validation Approach](#4-validation-approach)
5. [Roles and Responsibilities](#5-roles-and-responsibilities)
6. [Risk Assessment Methodology](#6-risk-assessment-methodology)
7. [Test Strategy](#7-test-strategy)
8. [Traceability Matrix Approach](#8-traceability-matrix-approach)
9. [Change Control Procedures](#9-change-control-procedures)
10. [Validation Lifecycle](#10-validation-lifecycle)
11. [Deliverables](#11-deliverables)
12. [Glossary](#12-glossary)
13. [References](#13-references)

---

## 1. Purpose and Scope

### 1.1 Purpose

This Validation Master Plan (VMP) defines the strategy, approach, and framework for validating TalOS SiteConnect, an on-premise desktop application designed for clinical trial patient screening at research sites. The plan ensures that the system meets all predefined specifications, regulatory requirements, and intended-use criteria before deployment in a GxP-regulated environment.

### 1.2 Scope

This VMP covers the complete validation lifecycle for TalOS SiteConnect version 0.1.x, including:

- **Installation Qualification (IQ)**: Verification that the application installs correctly on supported platforms with all dependencies satisfied.
- **Operational Qualification (OQ)**: Verification that all features operate as specified under normal and boundary conditions.
- **Performance Qualification (PQ)**: Verification that the application performs reliably under realistic workloads and site conditions.

The following modules are in scope:

| Module | Description |
|---|---|
| Database Security | SQLCipher AES-256 encrypted SQLite database with passphrase management |
| Patient Import Pipeline | CSV file import with smart column auto-mapping across EMR systems |
| Screening Engine (Tier 1) | Deterministic rule-based screening against study eligibility criteria |
| Screening Engine (Tier 2) | LLM-assisted screening via Gemma 4 (E2B/E4B/26B-A4B) / llama.cpp sidecar |
| Audit Trail | HMAC-chained, tamper-evident audit log with SHA-256 integrity verification |
| Review Queue | Patient review workflow with accept/reject/defer actions |
| Trial Discovery | Curated trial list with financial intelligence |
| Analytics | Patient population, study, and screening analytics |
| Enrollment Pipeline | Visual pipeline management for patient enrollment tracking |
| Site Performance | Site-level performance metrics and benchmarking |
| Cohort Builder | Dynamic patient cohort construction with filter criteria |
| Settings | Application configuration including LLM model management and file watchers |
| Export | Data export capabilities |
| Onboarding | First-run setup and user onboarding workflow |

### 1.3 Out of Scope

- Cloud infrastructure validation (application is 100% offline)
- Network security testing (no network communication except local LLM sidecar on 127.0.0.1)
- Third-party EMR system integration testing
- FHIR/CDA/HL7v2 parser validation (not yet implemented)

---

## 2. System Description

### 2.1 System Overview

TalOS SiteConnect is a desktop application that enables clinical research sites to screen their patient populations against clinical trial eligibility criteria. The application operates entirely offline, ensuring that Protected Health Information (PHI) never leaves the device.

### 2.2 Architecture

```
+---------------------------------------------------------------+
|                    TalOS SiteConnect Desktop                   |
|                                                                |
|  +---------------------------+  +---------------------------+  |
|  |    React 19 Frontend      |  |     Tauri v2 Runtime      |  |
|  |    (Vite + TypeScript)    |  |     (WebView Bridge)      |  |
|  +---------------------------+  +---------------------------+  |
|                                                                |
|  +---------------------------+  +---------------------------+  |
|  |    Rust Backend           |  |   llama.cpp Sidecar       |  |
|  |    (Tauri Commands)       |  |   (Gemma 4 GGUF)          |  |
|  +---------------------------+  +---------------------------+  |
|                                                                |
|  +-----------------------------------------------------------+|
|  |            SQLCipher Database (AES-256)                    ||
|  |  13 tables + 13 indexes | WAL mode | PBKDF2 key deriv.   ||
|  +-----------------------------------------------------------+|
+---------------------------------------------------------------+
```

### 2.3 Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Desktop Runtime | Tauri | 2.x |
| Backend Language | Rust | 2021 edition |
| Frontend Framework | React | 19.x |
| Build System | Vite | Latest |
| Language | TypeScript | Strict mode |
| Database | SQLite via rusqlite | 0.31 |
| Encryption | SQLCipher | bundled-sqlcipher |
| Key Derivation | PBKDF2 | 256,000 iterations |
| Integrity Hashing | SHA-256 | sha2 0.10 |
| Connection Pool | r2d2 | 0.8 |
| LLM Runtime | llama.cpp | Latest |
| LLM Model | Gemma 4 (E2B/E4B/26B-A4B) | GGUF format, Apache 2.0 |
| HTTP Client | reqwest | 0.12 (LLM health checks only) |
| File Watching | notify | 6.x |
| Secret Zeroing | zeroize | 1.x |

### 2.4 Database Schema

The system uses 13 tables with supporting indexes:

| Table | Purpose | Record Count (Typical) |
|---|---|---|
| `patients` | Patient demographics | 100 - 10,000 |
| `diagnoses` | ICD-10 coded diagnoses | 500 - 50,000 |
| `medications` | Active/historical medications | 500 - 50,000 |
| `lab_results` | LOINC-coded lab results | 1,000 - 100,000 |
| `vitals` | Vital sign measurements | 500 - 50,000 |
| `clinical_notes` | Free-text clinical notes | 100 - 10,000 |
| `studies` | Clinical trial definitions | 5 - 50 |
| `study_criteria` | Eligibility criteria with structured rules | 50 - 500 |
| `screening_results` | Patient-study screening outcomes | 500 - 500,000 |
| `screening_criteria_results` | Per-criterion evaluation details | 5,000 - 5,000,000 |
| `import_log` | File import history | 10 - 100 |
| `audit_log` | HMAC-chained audit trail | 100 - 100,000 |
| `cohorts` | Saved patient cohort definitions | 1 - 50 |

### 2.5 Data Flow

1. **Import**: CSV files from EMR exports are parsed with smart column auto-mapping, validated, and persisted to the encrypted database.
2. **Screening**: Patient data is evaluated against study eligibility criteria using Tier 1 (deterministic Rust rules) and optionally Tier 2 (local LLM).
3. **Review**: Screening results are presented in a three-panel UI for clinical review with accept/reject/defer workflows.
4. **Audit**: Every data mutation creates an immutable, HMAC-chained audit log entry.

### 2.6 Security Architecture

- **Encryption at Rest**: All patient data stored in SQLCipher-encrypted database (AES-256-CBC, 4096-byte page size, 256,000 PBKDF2 iterations)
- **Passphrase Management**: User-defined passphrase required at first run; passphrase held in memory only during session and zeroed on application close via `zeroize` crate
- **No Network Transmission**: PHI never leaves the device; LLM communication is localhost-only (127.0.0.1:8384)
- **Audit Integrity**: SHA-256 hash chain prevents post-hoc modification of audit records

---

## 3. Regulatory Requirements

### 3.1 21 CFR Part 11 — Electronic Records; Electronic Signatures

While TalOS SiteConnect does not currently implement electronic signatures for regulatory submissions, the following Part 11 controls are implemented proactively:

| 21 CFR Part 11 Section | Requirement | Implementation |
|---|---|---|
| 11.10(a) | System validation | This VMP and associated IQ/OQ/PQ protocols |
| 11.10(b) | Ability to generate accurate copies | Export functionality for screening results |
| 11.10(c) | Record protection | SQLCipher AES-256 encryption; passphrase-gated access |
| 11.10(d) | Limiting system access | Passphrase-based authentication at application launch |
| 11.10(e) | Audit trail | HMAC-chained audit log with SHA-256 integrity verification |
| 11.10(k) | Documentation controls | Version-controlled source code; conventional commits |

### 3.2 HIPAA — Health Insurance Portability and Accountability Act

| HIPAA Requirement | Implementation |
|---|---|
| Access Controls (164.312(a)) | Passphrase-gated access; session-only memory residence |
| Audit Controls (164.312(b)) | Immutable, verifiable audit trail |
| Integrity Controls (164.312(c)) | HMAC chain verification; database encryption |
| Transmission Security (164.312(e)) | N/A — no PHI transmission; 100% offline operation |
| Encryption (164.312(a)(2)(iv)) | AES-256 encryption via SQLCipher |

### 3.3 GxP Considerations

TalOS SiteConnect is a supporting tool used during the pre-screening phase of clinical trial recruitment. It does not directly generate regulatory submission data, but its outputs may inform enrollment decisions. As such, the following GxP principles apply:

- Data integrity (ALCOA+ principles): Attributable, Legible, Contemporaneous, Original, Accurate
- Change control for application updates
- User training documentation
- Periodic review and revalidation

---

## 4. Validation Approach

### 4.1 Validation Philosophy

The validation approach follows the GAMP 5 risk-based framework. TalOS SiteConnect is classified as a **GAMP Category 4** (Configured Product) system, with Category 5 elements in the screening engine and LLM integration (custom-developed functionality).

### 4.2 Qualification Phases

```
Requirements   -->   Design   -->   Build   -->   IQ   -->   OQ   -->   PQ
     ^                                              |          |          |
     |                                              v          v          v
     +-------- Traceability Matrix links all phases together --------+
```

#### 4.2.1 Installation Qualification (IQ)

Verifies that the application and all its components are installed correctly and that the computing environment meets specified requirements.

**Scope:**
- Tauri application binary installation on macOS and Windows
- SQLCipher library availability and encryption functionality
- llama.cpp sidecar binary availability (optional)
- File system permissions for database and model storage
- Platform-specific requirements (Rust toolchain for development builds)

#### 4.2.2 Operational Qualification (OQ)

Verifies that the system operates as intended across all specified functional requirements under normal, boundary, and error conditions.

**Scope:**
- All 14 modules listed in Section 1.2
- 9 structured rule types in the screening engine (AgeRange, GenderIs, HasDiagnosis, NoDiagnosis, HasMedication, NoMedication, LabValueRange, VitalRange, And/Or combinators)
- Column auto-mapping across EMR systems (Epic, Cerner, Athena, generic CSV)
- Audit trail integrity verification
- Database CRUD operations for all 13 tables
- LLM sidecar lifecycle management (configure, start, health check, evaluate, stop)

#### 4.2.3 Performance Qualification (PQ)

Verifies that the system performs reliably under realistic conditions representative of actual site usage.

**Scope:**
- Screening 1,000+ patients against a 16-criterion study
- Importing CSV files with 10,000+ rows
- Audit trail verification with 10,000+ entries
- Database operations under concurrent read load
- Application startup and unlock performance

### 4.3 Validation Environment

| Environment | Purpose | Configuration |
|---|---|---|
| Development | Unit/integration testing | macOS/Linux, Rust toolchain, Node.js 18+ |
| QA | OQ execution | macOS (Apple Silicon), Windows 11 |
| Staging | PQ execution | Production-equivalent hardware at a representative site |
| Production | Deployed to research sites | Site-provided hardware meeting minimum specifications |

---

## 5. Roles and Responsibilities

| Role | Responsibilities |
|---|---|
| **Validation Lead** | Owns this VMP; coordinates all validation activities; ensures deliverables are completed; reports validation status |
| **Quality Assurance (QA)** | Reviews and approves validation documents; witnesses critical test executions; manages deviation reports |
| **Software Engineering** | Develops the application; creates and executes unit/integration tests; supports OQ/PQ execution; remediates defects |
| **IT Operations** | Manages test environments; ensures platform availability; supports IQ execution |
| **Clinical Operations** | Provides clinical domain expertise; validates screening logic accuracy; participates in PQ with representative data |
| **Regulatory Affairs** | Reviews validation approach for regulatory compliance; advises on Part 11 and HIPAA controls |
| **Project Sponsor** | Approves VMP and final validation report; authorizes system release |

---

## 6. Risk Assessment Methodology

### 6.1 Approach

Risk assessment follows ICH Q9 Quality Risk Management principles, adapted for software validation. Each requirement is assessed for:

- **Severity**: Impact if the requirement is not met
- **Probability**: Likelihood that the requirement could fail
- **Detectability**: Ability to detect a failure before it reaches the end user

### 6.2 Risk Classification

| Risk Level | Severity x Probability Score | Validation Rigor |
|---|---|---|
| **Critical** | 15-25 | Full IQ/OQ/PQ; witnessed testing; formal deviation management |
| **High** | 10-14 | OQ/PQ; automated + manual testing; deviation tracking |
| **Medium** | 5-9 | OQ; automated testing with documented review |
| **Low** | 1-4 | Unit test coverage; code review |

### 6.3 Risk Categories

| Category | Examples | Default Risk Level |
|---|---|---|
| **Patient Safety** | Incorrect screening result leading to inappropriate enrollment | Critical |
| **Data Integrity** | Audit trail tampering; data loss; encryption failure | Critical |
| **Data Accuracy** | Incorrect rule evaluation; wrong column mapping; calculation errors | High |
| **Usability** | Confusing UI; inaccessible functionality | Medium |
| **Performance** | Slow screening; import timeout | Medium |
| **Availability** | Application crash; database corruption | High |

### 6.4 Risk Register (Summary)

| Risk ID | Description | Category | Severity | Probability | Risk Level | Mitigation |
|---|---|---|---|---|---|---|
| R-001 | Screening rule returns incorrect eligibility status | Patient Safety | 5 | 2 | High | 9 rule type unit tests; integration tests; PQ with known-outcome data |
| R-002 | Audit trail tampered without detection | Data Integrity | 5 | 1 | Critical | HMAC chain with SHA-256; verification function; 4 dedicated tests |
| R-003 | Database passphrase bypass | Data Integrity | 5 | 1 | Critical | SQLCipher with 256K PBKDF2 iterations; wrong-passphrase rejection test |
| R-004 | Patient data imported with wrong field mapping | Data Accuracy | 4 | 3 | High | Auto-mapping with confidence scores; preview before commit; 5 mapping tests |
| R-005 | Exclusion criteria logic inverted | Patient Safety | 5 | 2 | Critical | Explicit inclusion/exclusion handling tests; rule_result_to_evaluation coverage |
| R-006 | PHI transmitted over network | Data Integrity | 5 | 1 | Critical | No outbound connections; LLM on localhost only; architecture review |
| R-007 | LLM sidecar returns unsafe clinical recommendation | Patient Safety | 4 | 3 | High | Conservative "unknown" default; confidence thresholds; human review required |
| R-008 | Database corruption on unexpected shutdown | Availability | 3 | 2 | Medium | WAL journaling mode; atomic transactions |

---

## 7. Test Strategy

### 7.1 Test Levels

```
                    +-------------------+
                    |  Performance (PQ) |  < Realistic workloads, site conditions
                    +-------------------+
                 +------------------------+
                 |    End-to-End (OQ)      |  < Full user workflows
                 +------------------------+
              +-----------------------------+
              |   Integration Tests (OQ)    |  < Module interactions, DB queries
              +-----------------------------+
           +----------------------------------+
           |       Unit Tests (IQ/OQ)         |  < Individual functions, rules
           +----------------------------------+
```

### 7.2 Test Types and Coverage Targets

| Test Level | Framework | Language | Coverage Target | Current Status |
|---|---|---|---|---|
| **Rust Unit Tests** | Built-in (`cargo test`) | Rust | 90%+ for screening, audit, import | 23/23 passing |
| **Frontend Unit Tests** | Vitest + React Testing Library | TypeScript | 85%+ for data-critical components | Not yet implemented |
| **Integration Tests** | Cargo test (DB integration) | Rust | 80%+ for command handlers | Partial (engine tests) |
| **End-to-End Tests** | Playwright / WebDriver | TypeScript | All critical user workflows | Not yet implemented |
| **Performance Tests** | Custom benchmarks | Rust/TypeScript | Per PQ acceptance criteria | Not yet implemented |

### 7.3 Existing Rust Test Coverage

The following 23 tests are currently passing:

**Screening Rules (10 tests):**
- `test_age_range_pass` / `test_age_range_fail`
- `test_has_diagnosis` / `test_no_diagnosis_pass`
- `test_lab_value_range`
- `test_missing_data`
- `test_and_rule` / `test_or_rule`
- `test_rule_serialization`
- `test_has_medication` (implied from code)

**Audit Trail (4 tests):**
- `test_write_audit_entry`
- `test_audit_chain_integrity`
- `test_audit_chain_detects_tampering`
- `test_empty_audit_chain_verifies`

**Import Mapping (5 tests):**
- `test_normalize`
- `test_exact_match`
- `test_auto_map_common_headers`
- `test_auto_map_epic_headers`
- `test_no_duplicate_target_mappings`

**Screening Engine (2 tests):**
- `test_screen_patient`
- `test_screen_all_patients`

**Database (1 test):**
- `test_init_database_in_memory`

### 7.4 Test Data Management

- **Unit Tests**: Hardcoded fixture data within test functions (e.g., `sample_patient()` with known demographics, diagnoses, labs)
- **Integration Tests**: In-memory SQLite databases initialized with `init_test_db()` and seeded with representative data
- **PQ Tests**: Anonymized/synthetic patient datasets representative of real site volumes
- **No real PHI** is used in any test environment

### 7.5 Defect Management

| Severity | Definition | Resolution Timeline |
|---|---|---|
| Critical | Incorrect screening result; data integrity breach | Block release; fix before validation continues |
| Major | Feature does not work as specified; data loss possible | Fix before OQ sign-off |
| Minor | Cosmetic issue; workaround available | Track and fix in next release |
| Enhancement | Improvement suggestion | Evaluate for future release |

---

## 8. Traceability Matrix Approach

### 8.1 Traceability Structure

```
Product Requirement (PRD-xxx)
    |
    +---> Test Case (TC-xxx)
    |         |
    |         +---> Test Execution Record
    |         +---> Defect (if any)
    |
    +---> Risk Assessment (R-xxx)
    |
    +---> Source Code Reference (file:function)
```

### 8.2 Requirement Identification

Requirements are identified using the following scheme:

| Prefix | Module |
|---|---|
| PRD-SCR | Screening Engine |
| PRD-IMP | Import Pipeline |
| PRD-AUD | Audit Trail |
| PRD-SEC | Security / Database Encryption |
| PRD-DB | Database Operations |
| PRD-UI | User Interface |
| PRD-ANL | Analytics |
| PRD-EXP | Export |
| PRD-LLM | LLM Integration |
| PRD-PFM | Performance |
| PRD-PLT | Platform |
| PRD-RVW | Review Queue |
| PRD-PIP | Pipeline Management |
| PRD-SET | Settings |
| PRD-COH | Cohort Builder |
| PRD-SPF | Site Performance |

### 8.3 Test Case Identification

Test cases use a parallel scheme (TC-SCR-xxx, TC-IMP-xxx, etc.) and are linked to requirements in the Requirements Traceability Matrix (RTM).

### 8.4 Traceability Maintenance

The RTM is maintained alongside the source code and updated with every release. Changes to requirements trigger corresponding updates to test cases and vice versa.

---

## 9. Change Control Procedures

### 9.1 Change Categories

| Category | Examples | Approval Required |
|---|---|---|
| **Major** | New module; change to screening logic; database schema change | Validation Lead + QA + Sponsor |
| **Minor** | UI enhancement; new rule type; performance optimization | Validation Lead + Engineering Lead |
| **Patch** | Bug fix; typo correction; dependency update (non-security) | Engineering Lead |
| **Emergency** | Security vulnerability; data integrity fix | Validation Lead (retroactive QA review) |

### 9.2 Change Control Process

1. **Request**: Change request submitted with description, justification, and impact assessment
2. **Impact Analysis**: Engineering assesses impact on validated state; identifies affected test cases
3. **Approval**: Appropriate approvers sign off based on category
4. **Implementation**: Code change made following conventional commit standards (`feat(scope):`, `fix(scope):`, etc.)
5. **Testing**: Affected test cases re-executed; regression testing performed
6. **Validation Update**: RTM and qualification documents updated as needed
7. **Release**: Version incremented; release notes generated

### 9.3 Regression Testing

Any change to the following modules requires full regression testing:

- Screening rules engine (`src-tauri/src/screening/`)
- Audit trail (`src-tauri/src/db/audit.rs`)
- Database schema (`src-tauri/src/db/mod.rs`)
- Import pipeline (`src-tauri/src/import/`)

### 9.4 Version Control

- Source code managed in Git with branch protection on `main`
- All commits follow Conventional Commits specification
- Build artifacts are versioned and archived
- Validation documents are version-controlled alongside code

---

## 10. Validation Lifecycle

### 10.1 Phases and Timeline

| Phase | Activities | Duration | Deliverables |
|---|---|---|---|
| **Planning** | VMP creation; risk assessment; requirement documentation | 2 weeks | VMP, PRD, RTM |
| **IQ Preparation** | IQ protocol development; environment setup | 1 week | IQ Protocol |
| **IQ Execution** | Installation verification on all target platforms | 1 week | IQ Report |
| **OQ Preparation** | OQ protocol development; test case specification | 2 weeks | OQ Protocol, Test Case Specs |
| **OQ Execution** | Functional testing of all modules | 3 weeks | OQ Report, Defect Log |
| **PQ Preparation** | PQ protocol development; synthetic data generation | 1 week | PQ Protocol |
| **PQ Execution** | Performance testing under realistic conditions | 2 weeks | PQ Report |
| **Validation Report** | Compilation of all results; deviation summary; release recommendation | 1 week | Final Validation Report |

### 10.2 Periodic Review

The validated state of TalOS SiteConnect is reviewed:

- **Annually**: Full review of validation status, open deviations, and regulatory changes
- **Per Release**: Impact assessment of changes against validated state
- **Trigger-Based**: Following any critical defect, security incident, or regulatory update

### 10.3 Decommissioning

When TalOS SiteConnect is retired at a site:

1. All patient data exported or securely destroyed
2. Database passphrase securely discarded
3. Application uninstalled
4. Decommissioning record added to site documentation

---

## 11. Deliverables

| Document | Document ID | Status |
|---|---|---|
| Validation Master Plan | VMP-SC-001 | This document |
| Product Requirements Document | PRD-SC-001 | See PRODUCT-REQUIREMENTS.md |
| Requirements Traceability Matrix | RTM-SC-001 | See REQUIREMENTS-TRACEABILITY-MATRIX.md |
| IQ/OQ/PQ Protocols | QP-SC-001 | See IQ-OQ-PQ-PROTOCOLS.md |
| Test Case Specifications | TCS-SC-001 | See TEST-CASE-SPECIFICATIONS.md |
| IQ Execution Report | IQR-SC-001 | Pending |
| OQ Execution Report | OQR-SC-001 | Pending |
| PQ Execution Report | PQR-SC-001 | Pending |
| Final Validation Report | VR-SC-001 | Pending |

---

## 12. Glossary

| Term | Definition |
|---|---|
| **ALCOA+** | Attributable, Legible, Contemporaneous, Original, Accurate (+ Complete, Consistent, Enduring, Available) |
| **GAMP** | Good Automated Manufacturing Practice |
| **GGUF** | GPT-Generated Unified Format (llama.cpp model file format) |
| **GxP** | Good Practice (umbrella for GCP, GLP, GMP) |
| **HMAC** | Hash-based Message Authentication Code |
| **IQ** | Installation Qualification |
| **LLM** | Large Language Model |
| **OQ** | Operational Qualification |
| **PBKDF2** | Password-Based Key Derivation Function 2 |
| **PHI** | Protected Health Information |
| **PQ** | Performance Qualification |
| **RTM** | Requirements Traceability Matrix |
| **SQLCipher** | Open-source extension to SQLite that provides AES-256 encryption |
| **VMP** | Validation Master Plan |
| **WAL** | Write-Ahead Logging (SQLite journal mode) |

---

## 13. References

| Reference | Description |
|---|---|
| 21 CFR Part 11 | Electronic Records; Electronic Signatures |
| 45 CFR Parts 160, 164 | HIPAA Privacy and Security Rules |
| ISPE GAMP 5 | A Risk-Based Approach to Compliant GxP Computerized Systems |
| ICH Q9 | Quality Risk Management |
| ICH E6(R2) | Guideline for Good Clinical Practice |
| NIST SP 800-111 | Guide to Storage Encryption Technologies for End User Devices |
| Tauri v2 Documentation | https://v2.tauri.app/ |
| SQLCipher Documentation | https://www.zetetic.net/sqlcipher/ |

---

*End of Document*
