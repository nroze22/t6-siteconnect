# TalOS SiteConnect - Product Requirements Document

**Version:** 1.1
**Last Updated:** April 3, 2026
**Status:** Active Development
**Owner:** Talosix

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Product Vision & Strategy](#3-product-vision--strategy)
4. [Target Users & Personas](#4-target-users--personas)
5. [Product Architecture](#5-product-architecture)
6. [Feature Requirements](#6-feature-requirements)
7. [Data Models](#7-data-models)
8. [Security & Compliance](#8-security--compliance)
9. [AI / LLM Integration](#9-ai--llm-integration)
10. [Hardware & Deployment](#10-hardware--deployment)
11. [Performance Requirements](#11-performance-requirements)
12. [Testing Strategy](#12-testing-strategy)
13. [Go-to-Market & Phasing](#13-go-to-market--phasing)
14. [Appendices](#14-appendices)

---

## 1. Executive Summary

TalOS SiteConnect is an **on-premise, HIPAA-ready desktop application** that enables clinical research sites to screen their patient populations against clinical trial eligibility criteria using a combination of deterministic rules and local AI inference — all without any patient data ever leaving the device.

It replaces the manual, spreadsheet-driven feasibility and screening process with an intelligent, data-driven workflow that covers the full lifecycle: **data import, eligibility screening, financial modeling, enrollment pipeline management, population analytics, and regulatory compliance**.

**Key differentiators:**
- **Zero data egress** — 100% on-premise processing with encrypted storage (SQLCipher AES-256)
- **Local AI** — Gemma 4 (E2B/E4B/26B-A4B) via llama.cpp sidecar; no cloud API calls with PHI
- **Financial intelligence** — Per-study revenue projections, cost modeling, and site fit scoring
- **Instant deployment** — No IT infrastructure, no BAA, no network configuration
- **Free to sites** — Customer acquisition strategy for the TalOS network

---

## 2. Problem Statement

### The Status Quo

Clinical research sites evaluate trial feasibility and screen patients using a painful, manual process:

1. **Spreadsheet screening** — Coordinators manually review charts against printed eligibility criteria, tracking results in Excel. A single protocol with 30+ criteria across 1,000 patients can take weeks.
2. **No financial visibility** — Sites accept studies without understanding per-patient economics, leading to unprofitable trials that drain coordinator bandwidth.
3. **Compliance anxiety** — Sites fear HIPAA violations when using cloud tools for pre-screening, so they default to paper-based workflows.
4. **Siloed data** — Patient demographics, diagnoses, medications, and labs live in EMR systems with no easy way to query across protocols.
5. **Missed opportunities** — Without population analytics, sites can't proactively identify trials that match their patient demographics.

### The Cost

- **80+ hours** per protocol for manual feasibility screening
- **40%+ screen failure rates** due to imprecise pre-screening
- **$15K-50K lost** per failed screen (site startup costs not recovered)
- **Zero visibility** into which trials are financially worth pursuing

---

## 3. Product Vision & Strategy

### Vision

Every clinical research site has an intelligent, private screening system that maximizes patient-trial matching while protecting patient privacy absolutely.

### Strategic Context

SiteConnect is the **Trojan horse** for building the TalOS site network:

| Phase | Timeline | Objective |
|-------|----------|-----------|
| **Phase 1** | Months 1-12 | Deploy free tool to 30-50+ sites. Build trust and adoption. |
| **Phase 2** | Months 6-18 | Aggregate anonymized eligibility counts. Build sponsor marketplace. |
| **Phase 3** | Months 12-24 | Upsell to TalOS EDC/ePRO/Payments for study execution. |

The on-premise free tool is **not the business** — it's the customer acquisition strategy. The real businesses are:
- **Sponsor marketplace** — Sponsors pay to see anonymized feasibility data across the network
- **EDC/ePRO upsells** — Full study execution platform (sister product: TalOS ePRO)
- **Network data insights** — Aggregated, de-identified intelligence across sites

### 7 Structural Advantages

1. **Zero data risk** — PHI never leaves the device
2. **Zero IT friction** — Desktop install, no servers, no BAA
3. **Financial intelligence** — Nobody else shows the money
4. **Free to sites** — No cost barrier to adoption
5. **AI transparency** — Local LLM with explainable criterion-level evidence
6. **Operational intelligence** — Pipeline, registry, and analytics in one tool
7. **Network without lock-in** — Sites own their data, always

---

## 4. Target Users & Personas

### Primary Users

| Persona | Role | Key Needs |
|---------|------|-----------|
| **Clinical Research Coordinator (CRC)** | Day-to-day screening & enrollment | Fast patient screening, clear eligibility evidence, pipeline tracking, easy data import |
| **Research Director** | Portfolio strategy & financials | Study prioritization, financial projections, population analytics, sponsor pitch materials |
| **Feasibility/Finance Manager** | Budget analysis & ROI | Per-study cost modeling, revenue projections, burden assessment, scenario comparison |

### Secondary Users

| Persona | Role | Key Needs |
|---------|------|-----------|
| **Regulatory/Compliance Officer** | Audit & reporting | Immutable audit trail, NAACCR submission, export controls, HIPAA documentation |
| **IT/Privacy Officer** | Deployment & security | On-premise architecture, encryption verification, no network dependencies |
| **Principal Investigator** | Medical oversight | Override screening decisions, review AI determinations, approve enrollment |

---

## 5. Product Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop Shell | Tauri v2 (Rust) | Lightweight native wrapper (~2-5 MB vs Electron's ~150 MB) |
| Frontend | React 19 + Vite + TypeScript | Modern reactive UI with hot reload |
| UI Framework | shadcn/ui + Tailwind CSS 4.2 | Consistent, accessible component library |
| Data Grid | TanStack React Table | Virtualized, sortable, filterable tables |
| Charts | Recharts | Data visualization for analytics |
| Animations | Framer Motion | Smooth page transitions and micro-interactions |
| State | Zustand | Per-domain stores with localStorage persistence |
| Validation | Zod + React Hook Form | Schema-validated forms and API responses |
| Database | SQLite + SQLCipher + sqlite-vec | Encrypted storage with vector search |
| LLM Inference | llama.cpp (llama-server sidecar) | Local model execution via OpenAI-compatible API |
| Primary Model | Gemma-4-E4B-GGUF (Q4_K_M) | Full AI screening with 128K context (~5.0 GB) |
| Alt Model | Gemma-4-E2B-GGUF (Q4_K_M) | Edge-optimized AI for 8GB systems (~3.1 GB) |
| Premium Model | Gemma-4-26B-A4B-GGUF (Q4_K_M) | Near-frontier MoE reasoning, 256K context (~16.9 GB) |
| NER Pipeline | spaCy + scispaCy (Python sidecar) | Biomedical entity extraction |
| Data Import | Custom parsers | CSV, XLSX, FHIR R4 JSON, C-CDA XML, HL7v2 |
| Icons | Lucide React | Consistent iconography |

### System Diagram

```
+-----------------------------------------------------------+
|                Tauri v2 Desktop Shell (Rust)               |
|  +---------------+  +-------------+  +-----------------+  |
|  | Data Import   |  | Screening   |  | Trial Discovery |  |
|  | Engine        |  | Engine      |  | & Financials    |  |
|  +---------------+  +-------------+  +-----------------+  |
|  +---------------+  +-------------+  +-----------------+  |
|  | SQLCipher     |  | LLM Sidecar |  | Analytics       |  |
|  | Database      |  | Manager     |  | Engine          |  |
|  +---------------+  +-------------+  +-----------------+  |
|  +---------------+  +-------------+  +-----------------+  |
|  | Registry &    |  | Audit       |  | Export          |  |
|  | NAACCR        |  | Logger      |  | Engine          |  |
|  +---------------+  +-------------+  +-----------------+  |
+-----------------------------------------------------------+
|             React 19 Frontend (Vite + shadcn/ui)           |
|  +---------------+  +-------------+  +-----------------+  |
|  | 3-Panel       |  | Trial       |  | Population      |  |
|  | Screening UI  |  | Discovery   |  | Analytics       |  |
|  +---------------+  +-------------+  +-----------------+  |
|  +---------------+  +-------------+  +-----------------+  |
|  | Enrollment    |  | Patient     |  | Site            |  |
|  | Pipeline      |  | Registry    |  | Performance     |  |
|  +---------------+  +-------------+  +-----------------+  |
+-----------------------------------------------------------+
|                Local Encrypted Storage                     |
|  SQLite + SQLCipher (AES-256) + sqlite-vec                 |
|  15+ tables: patients, diagnoses, medications, labs,       |
|  screening_results, studies, criteria, audit_log, ...      |
+-----------------------------------------------------------+
|              llama-server Sidecar (localhost)               |
|  Gemma 4 E4B / E2B / 26B-A4B (GGUF, CPU-only)             |
|  OpenAI-compatible API on 127.0.0.1:808x                   |
+-----------------------------------------------------------+
```

### Frontend Architecture

**11 Main Workspaces:**

| # | Page | Purpose |
|---|------|---------|
| 1 | Dashboard | KPI overview, quick actions, pipeline summary |
| 2 | Import Data | Multi-format import wizard with auto-mapping |
| 3 | Screening | 3-panel eligibility screening (hero feature) |
| 4 | Trial Discovery | Browse research pack, financial modeling |
| 5 | Review Queue | Pending screening decisions and overrides |
| 6 | Population Analytics | Feasibility queries, diversity profiling, forecasting |
| 7 | Enrollment Pipeline | Kanban-style patient enrollment tracking |
| 8 | Patient Registry | Consent management, availability tracking |
| 9 | Tumor Registry (NAACCR) | Cancer case abstraction and state submission |
| 10 | Site Performance | Enrollment velocity, retention, financial metrics |
| 11 | Settings | Site profile, LLM config, security, preferences |

**State Management (Zustand Stores):**

| Store | Domain |
|-------|--------|
| `useAppStore` | Navigation, theme, lock state, LLM status |
| `useSiteProfileStore` | 7-section site intelligence profile |
| `useScreeningStore` | Selected patient/study, criterion results, evidence |
| `useMatrixScreeningStore` | Multi-protocol screening, matrix/best-match views |
| `usePipelineStore` | Enrollment stages, activity logging |
| `useRegistryStore` | Consent tracking, availability, auto-match |
| `useNaacrStore` | Reportable cases, abstraction status, validation |
| `useAnalyticsStore` | Filters, drill-down, comparison, snapshots |
| `useResearchPackStore` | Study data, benchmarks, sponsor profiles |
| `useLlmQueueStore` | Background LLM task queue |
| `useWatcherStore` | File watcher status for import monitoring |

---

## 6. Feature Requirements

### 6.1 Data Import Pipeline

**Priority:** P0 (Core)

**Supported Formats:**
- CSV (comma, tab, pipe delimited)
- XLSX (Excel, via calamine crate)
- FHIR R4 JSON (Bundle, Patient, Condition, MedicationStatement, Observation)
- C-CDA XML (Continuity of Care Document)
- HL7v2 (ADT, ORU, ORM message types)

**Import Workflow (5 Steps):**

1. **Select** — Drag-and-drop or file picker. Format auto-detected by extension + content sniffing (JSON structure check, XML namespace check, regex patterns).
2. **Preview** — First 50 rows displayed. Data layout detected (long vs. wide format based on ID duplication ratio > 30%).
3. **Map** — Auto-column mapping via Jaro-Winkler similarity on headers + value pattern analysis (ICD-10 regex, date regex, numeric ranges). Confidence threshold: >= 0.7 for high-confidence, >= 0.5 for suggestion. User confirms/adjusts in interactive mapper.
4. **Validate** — Row-level validation with error/warning/info severity. Duplicate checking against existing patients by MRN. Line-number references for each issue.
5. **Complete** — Batch insert within transaction (rollback on error). Import profile saved for recurring sources. Celebration animation on success.

**Target Data Fields:**

| Category | Fields |
|----------|--------|
| Demographics | PatientId (MRN), FirstName, LastName, DateOfBirth, Gender, Race, Ethnicity |
| Diagnoses | DiagnosisCode (ICD-10), DiagnosisDescription, DiagnosisDate, Status |
| Medications | MedicationCode (RxNorm), MedicationName, StartDate, EndDate, Dose, Frequency |
| Labs | LabCode (LOINC), LabName, LabValue, LabUnit, LabDate, ReferenceRange |
| Vitals | VitalType, VitalValue, VitalUnit, VitalDate |
| Clinical Notes | NoteText, NoteDate, NoteType |

**Entity Extraction (Unstructured Text):**
- Pass 1: spaCy NER (en_core_sci_lg) for biomedical entity detection
- Pass 2: LLM disambiguation and code assignment (ICD-10, RxNorm, LOINC)

**Key Principles:**
- No data loss — original + normalized data both stored
- Full transformation logging for audit
- Incremental imports update existing records, never duplicate
- All processing on-device; no temp files with PHI; no PHI in logs
- Import profiles saveable/reusable for recurring data sources
- File watcher mode for automated monitoring of import directories

---

### 6.2 Patient Screening Engine (Hero Feature)

**Priority:** P0 (Core)

**Two-Tier Architecture:**

#### Tier 1: Deterministic Rule Engine (Rust)

Evaluates structured eligibility criteria against patient data using exact matching.

**Operators:**
`Eq`, `Neq`, `Gt`, `Gte`, `Lt`, `Lte`, `In`, `NotIn`, `Between`, `Contains`, `Exists`, `NotExists`, `WithinDays`, `WithinMonths`

**Code System Support:**
- ICD-10: Hierarchical prefix matching (e.g., C34 matches C34.1, C34.2, C34.90)
- RxNorm: Exact code matching
- LOINC: Exact code matching

**Compound Logic:**
- AND, OR, NOT operators with arbitrary nesting
- EXCEPT clauses (e.g., "No cancer except non-melanoma skin cancer")
- Temporal requirements (washout periods, recency windows)

**Result Types:**
- `Met` — Criterion satisfied (confidence: 1.0)
- `NotMet` — Criterion not satisfied (confidence: 1.0)
- `Unknown` — Insufficient data to evaluate
- `NeedsReview` — Requires human judgment

**Performance Target:** 10,000 patients x 30 criteria < 5 seconds

#### Tier 2: LLM-Assisted Screening

Handles criteria that require clinical judgment, subjective interpretation, or multi-factor reasoning.

**When Invoked:**
- Subjective criteria ("adequate organ function", "clinically significant disease")
- Multi-factor reasoning requiring cross-referencing multiple data points
- Clinical note analysis for unstructured evidence
- Ambiguous or compound criteria that don't decompose to simple rules

**Model Options (Gemma 4 family, Apache 2.0 license):**
- Gemma 4 E2B (Q4_K_M, ~3.1 GB) — Recommended tier, 8GB RAM, 128K context
- Gemma 4 E4B (Q4_K_M, ~5.0 GB) — Optimal tier, 16GB+ RAM, 128K context
- Gemma 4 26B-A4B (Q4_K_M, ~16.9 GB) — Premium tier, 24GB+ RAM, 256K context, MoE (3.8B active)

**Parameters:**
- Temperature: 0.1 (deterministic evaluation)
- Max tokens: 512 per criterion
- JSON mode: Enforced for structured responses
- Confidence range: 0.5-0.9 (never exceeds 0.9; Tier 1 owns 1.0)
- Concurrency: Max 5 parallel LLM calls

**Graceful Degradation:**
- LLM unavailable → Tier 2 criteria marked `NeedsReview`
- Core rule-based screening always works regardless of LLM status

#### Scoring Algorithm

```
score = (inclusion_met_ratio x 0.6 + exclusion_clear_ratio x 0.4) x 100
        - unknown_penalty - review_penalty
```

| Factor | Weight | Description |
|--------|--------|-------------|
| Inclusion met ratio | 60% | Proportion of inclusion criteria with Met status |
| Exclusion clear ratio | 40% | Proportion of exclusion criteria with NotMet (clear) status |
| Unknown penalty | -5 per | Deduction for each Unknown criterion |
| Review penalty | -3 per | Deduction for each NeedsReview criterion |

**Status Assignment:**

| Status | Condition |
|--------|-----------|
| Eligible | Score >= 80 AND zero Unknown criteria |
| Potentially Eligible | Score >= 50 |
| Not Eligible | Score < 50 OR any inclusion criterion failed |
| Excluded | Any exclusion criterion triggered (Met) |

#### Multi-Protocol Screening

- **Matrix View:** Patient x Study grid with color-coded eligibility cells
- **Best Match View:** Top study matches per patient, ranked by score
- Batch screening across multiple protocols simultaneously

#### Human Override

- Any criterion result can be overridden by authorized users
- Override captures: new status, reason text, user ID, timestamp
- Override audit-logged and visually distinguished in UI
- Original AI/rule determination preserved alongside override

---

### 6.3 Three-Panel Screening Interface

**Priority:** P0 (Core)

The hero UI for reviewing screening results. Three resizable panels:

```
+-------------------+---------------------------+---------------------+
| Patient Rank List | Criteria Detail           | Source Data Viewer   |
| (~20% width)      | (~50% width)              | (~30% width)         |
+-------------------+---------------------------+---------------------+
```

#### Left Panel: Patient Rank List

- **Virtualized list** (TanStack React Virtual) for 10K+ patient performance
- **Row content:** Rank badge, patient ID (MRN), age, gender icon, eligibility score badge, status icon
- **Filtering:** Text search by ID/name, status filter (eligible / potentially / ineligible / needs review), score range slider
- **Summary bar:** Color-coded status distribution counts
- **Bulk actions:** Select all, bulk accept, bulk reject
- **Sort:** By score descending (best matches first)
- **Keyboard:** Arrow keys to navigate, Enter to select

#### Middle Panel: Criteria Detail

- **Patient header:** Demographics, key vitals, insurance info
- **Score display:** Circular progress ring (green >= 85, lime >= 70, amber >= 50, red < 50)
- **Inclusion section:** "X/Y met" summary with expandable criterion cards
- **Exclusion section:** "X/Y triggered" summary with expandable criterion cards
- **Criterion card contents:**
  - Criterion number + full text
  - Result badge (MET / NOT MET / UNKNOWN / REVIEW) — inverted display for exclusion criteria
  - Confidence indicator (Rule 100% / AI XX% / Manual)
  - Override indicator if human-overridden
  - Missing data chip if status is Unknown
  - Expandable evidence preview (citations to specific source data)
  - Override button (pencil icon) for authorized users
- **Action bar:** Accept, Reject (with reason), Defer (with note) buttons

#### Right Panel: Source Data Viewer

- **Tabbed interface:** Demographics, Diagnoses, Medications, Labs, Vitals, Notes
- **Demographics tab:** Key-value grid
- **Clinical data tabs:** TanStack Table with sorting/filtering per column
- **Notes tab:** Expandable cards with timestamps and note types
- **Interactive highlighting:** Clicking a criterion in the middle panel highlights the corresponding evidence rows in the active source data tab
- **Study detail button:** Opens slide-out panel with full protocol information

#### Interaction Patterns

| Action | Result |
|--------|--------|
| Click patient row | Load details in middle + right panels |
| Click criterion card | Highlight matching evidence in right panel |
| Click pencil icon | Open override modal |
| Arrow keys | Navigate patient list |
| Space | Expand/collapse criterion evidence |
| Cmd+L | Lock session |

---

### 6.4 Trial Discovery & Financial Intelligence

**Priority:** P0 (Core)

#### Research Pack

A curated, monthly intelligence bundle shipped with the application containing:

- **~50 realistic clinical trials** across oncology, cardiology, neurology, diabetes, rare disease, and immunology
- **Real NCT numbers** and study details sourced from public ClinicalTrials.gov data
- **Estimated per-patient payments** researched from industry benchmarks
- **Payment models:** Per-visit, milestone, hybrid
- **Site startup fee estimates**
- **Enrollment timeline projections**
- **Procedure cost benchmarks** (CMS fee schedule anchored with sponsor markups)
- **Sponsor profiles** (reputation, payment velocity, therapeutic focus)
- **Therapeutic area landscapes** (competition density, saturation, enrollment trends)

#### Study Browsing

- **Study cards** with financial estimates, burden badges, site fit scores
- **Filters:** Therapeutic area, phase, sponsor, status, per-patient fee range
- **Detailed view modal** with protocol, endpoints, locations, eligibility criteria
- **Full-text search** (FTS5) across title, summary, conditions, criteria, sponsor
- **Semantic search** via sqlite-vec (384-dim embeddings) for concept-level matching

#### 3-Tier Financial Estimation

| Tier | Level | Inputs | Output |
|------|-------|--------|--------|
| Tier 1 | Directional | Study metadata only | Per-patient range (low/high) + burden badge |
| Tier 2 | Protocol-based | Study + procedure benchmarks + archetype | Revenue/cost drivers, margin estimate |
| Tier 3 | Site-specific | Tier 2 + site profile (rates, overhead, capacity) | Full P&L projection with KPIs |

**Core Financial Calculation (Integer Cents):**
```
projected_enrollment = eligible_patients x enrollment_rate x (1 - screen_failure_rate) x retention_rate
projected_revenue_cents = projected_enrollment x per_patient_cents
```

**Default Assumptions (adjustable):** 30% enrollment rate, 40% screen failure, 85% retention

**Budget Wizard:** Interactive scenario builder with adjustable sliders for all assumptions. Generates comparison view across studies.

#### Site Fit Scoring

Evaluates study compatibility against site profile:
- Therapeutic area alignment
- Phase experience match
- Operational capacity (coordinator hours, equipment needs)
- Patient population overlap
- Financial attractiveness

#### Custom Study Entry

- Manual form for studies not in the research pack
- AI-assisted criteria parsing (natural language to structured rules) with human review
- Confidence scoring on parsed rules
- Full financial modeling available for custom studies

#### ClinicalTrials.gov Sync (Optional)

- Default: Fully offline with pre-loaded research pack
- Manual sync: User-initiated HTTPS fetch from ClinicalTrials.gov API v2
- Incremental: Only fetches studies modified since last sync
- No PHI transmitted — only study metadata retrieved

---

### 6.5 Population Analytics

**Priority:** P1

#### Feasibility Query Builder

- **Cross-filter interface** with active filter badge bar
- **Criteria:** Diagnosis codes (ICD-10), age range, gender, lab value ranges, medication status, BMI, race/ethnicity
- **Saved queries** for recurring feasibility checks
- **Results:** Patient count, demographic breakdown, cohort drill-down

#### Enrollment Forecasting

- **Monte Carlo simulation** for enrollment trajectory projections
- **Inputs:** Eligible count, enrollment rate, screen failure rate, retention, timeline
- **Output:** Projected enrollment curve with confidence intervals (P10/P50/P90)

#### Diversity Profiling

- **Race/ethnicity distribution** of eligible patients vs. study requirements
- **Gender balance** analysis
- **Geographic distribution** (if captured)
- **FDA diversity guidance** alignment checks

#### Smart Insights

- Auto-generated plain-English narratives ("42% of your NSCLC population meets age criteria but fails on ECOG status")
- Threshold monitoring ("15 patients are within 2 weeks of lab expiration for Study X")
- Opportunity alerts ("New patients imported match 3 active studies")

#### Export

- CSV export of cohort lists
- PowerPoint report generation with charts and insights
- PDF feasibility summaries for sponsor communication

---

### 6.6 Enrollment Pipeline

**Priority:** P1

**Kanban-style workflow tracking:**

```
Identified → Contacted → Interested → Consented → Enrolled
                                                       ↓
                                              Screen Failed
```

- **Patient cards:** MRN, age, primary diagnosis, current stage, days in stage, next action, assigned staff
- **Activity logging:** Call attempts, notes, stage advancement, screen failure reasons
- **Assignment tracking:** Staff owner per patient with handoff capability
- **Stage metrics:** Conversion rates, average time per stage, bottleneck identification

---

### 6.7 Patient Registry & Consent

**Priority:** P1

#### Consent Management

| Consent Type | Description |
|-------------|-------------|
| General Research | Broad consent for research screening |
| Condition-Specific | Consent limited to specific conditions |
| Full Record | Complete medical record access for research |
| Healthy Volunteer | Consent for healthy volunteer studies |

- **Status tracking:** Active, expired, withdrawn, pending
- **Consent recording modal** with type, date, expiration, notes
- **Availability states:** Available, enrolled (in study), washout period, unavailable

#### Auto-Match Notifications

- When new screening results are generated, auto-match against registry
- Notify coordinators of newly eligible patients who have active consent
- Washout period enforcement prevents premature re-screening

---

### 6.8 Tumor Registry (NAACCR)

**Priority:** P2

#### Reportable Case Detection

- Auto-detection of cancer diagnoses from ICD-10 codes
- Manual flagging for borderline cases
- Integration with screening results (patients screened for oncology trials)

#### Abstraction Workspace

- Structured data entry for NAACCR required fields
- **Auto-population** from existing patient data (diagnoses, labs, procedures)
- **Field sources:** Auto (from data), Manual (user-entered), LLM (AI-extracted)
- **Confidence scoring** per field

#### Staging Support

- TNM staging (clinical and pathological)
- ICD-O-3 morphology and topography codes
- AJCC stage group derivation

#### Validation & Submission

- Rule-based validation against NAACCR submission requirements
- Error/warning/info severity levels with field-level guidance
- NAACCR XML export for state cancer registry submission

#### Status Workflow

```
Draft → In Progress → Complete → Submitted → Accepted
```

---

### 6.9 Site Performance Dashboard

**Priority:** P2

**Metrics:**
- Enrollment velocity (patients enrolled per month)
- Screen failure rate (by study, by criterion)
- Patient retention rate
- Revenue per coordinator hour
- Study-level performance comparison
- Industry benchmark comparison

---

### 6.10 Dashboard & Navigation

**Priority:** P0

#### Dashboard

- **KPI cards** with animated counters: Total patients, active studies, eligible candidates, projected revenue
- **Pipeline stage waterfall** visualization
- **Recent activity timeline** (imports, screenings, overrides)
- **Top opportunity highlights** (highest-value studies)
- **Quick actions:** Import data, run screening, discover trials

#### Navigation

- **Sidebar** with 13 navigation items + keyboard shortcuts
- **Keyboard shortcuts:** Backtick (`) for dashboard, 1-9 for pages, 0 for settings, Cmd+K for command palette, Cmd+L for session lock
- **Command palette** (Ctrl/Cmd+K): Search pages, actions, and studies
- **Context-sensitive help drawer** per page

---

### 6.11 Site Onboarding & Profile

**Priority:** P1

**6-Step Onboarding Wizard:**

| Step | Content |
|------|---------|
| 1. Research Profile | Therapeutic area focus, study type preferences, accepted phases |
| 2. Operational Capacity | Team composition (coordinators, PIs), equipment/capabilities, throughput |
| 3. Financial Defaults | Hourly rates (coordinator, PI, regulatory, nurse), overhead, screen failure assumptions |
| 4. Data Readiness | EHR system, export types (CSV/FHIR/HL7), watch folder config |
| 5. Patient Population | Disease area strengths, recruitment channels, diversity priorities |
| 6. Workflow Preferences | Primary users, approval workflows, output preferences |

Profile data persists locally and informs:
- Study fit scoring (auto-rank studies by site compatibility)
- Financial Tier 3 estimates (site-specific cost modeling)
- Import configuration defaults
- Workflow customization

---

## 7. Data Models

### 7.1 Patient Data

```
Patient
├── patient_id (MRN) — PRIMARY KEY
├── first_name, last_name
├── date_of_birth, age (computed)
├── gender, race, ethnicity
├── insurance_status
├── import_source, import_date
└── is_deleted (soft delete)

Diagnosis
├── patient_id → Patient
├── code (ICD-10)
├── description
├── onset_date
├── status (active, resolved, chronic)
└── confidence_score

Medication
├── patient_id → Patient
├── code (RxNorm)
├── name, dose, frequency
├── start_date, end_date
├── last_admin_date
└── source_provenance

LabResult
├── patient_id → Patient
├── code (LOINC)
├── name, value, unit
├── reference_range
├── abnormal_flag
└── collected_date

VitalSign
├── patient_id → Patient
├── type (height, weight, bmi, bp_systolic, bp_diastolic, heart_rate, temperature)
├── value, unit
└── recorded_date

ClinicalNote
├── patient_id → Patient
├── note_text
├── note_type (progress, discharge, operative, etc.)
├── note_date
└── extraction_metadata (entities found)
```

### 7.2 Study / Trial Data

```
Study
├── nct_number — PRIMARY KEY
├── title, brief_summary
├── phase (1, 2, 3, 4)
├── status (recruiting, active, completed, etc.)
├── sponsor, sponsor_type
├── conditions[] (therapeutic areas)
├── eligibility_criteria_text
├── enrollment_count
├── start_date, completion_date
└── locations[]

StudyCriterion
├── study_id → Study
├── criterion_number
├── type (inclusion | exclusion)
├── text (natural language)
├── structured_rule (JSON — tier 1)
├── llm_prompt (text — tier 2)
├── evaluation_tier (1 | 2)
└── is_active

FinancialDetails
├── study_id → Study
├── per_patient_cents (integer)
├── startup_fee_cents (integer)
├── payment_model (per_visit | milestone | hybrid)
├── enrollment_rate_estimate
├── screen_failure_rate_estimate
├── retention_rate_estimate
└── source (research_pack | manual | calculated)
```

### 7.3 Screening Results

```
ScreeningResult
├── patient_id → Patient
├── study_id → Study
├── overall_score (0-100)
├── status (eligible | potentially_eligible | not_eligible | excluded)
├── screened_at (timestamp)
├── screening_tier (1 | 2 | mixed)
└── reviewed_by (null until human review)

CriterionResult
├── screening_result_id → ScreeningResult
├── criterion_id → StudyCriterion
├── status (met | not_met | unknown | needs_review)
├── confidence (0.0-1.0)
├── evidence_text
├── evidence_source (which data field matched)
├── determination_source (rule | ai | manual_override)
├── override_reason (null unless overridden)
├── override_by (null unless overridden)
└── override_at (null unless overridden)
```

### 7.4 Registry & NAACCR

```
PatientConsent
├── patient_id → Patient
├── consent_type (general_research | condition_specific | full_record | healthy_volunteer)
├── status (active | expired | withdrawn | pending)
├── consent_date, expiration_date
└── notes

PatientRegistryStatus
├── patient_id → Patient
├── availability (available | enrolled | washout | unavailable)
├── current_study_id (if enrolled)
├── washout_end_date
└── max_concurrent_studies

ReportableCase (NAACCR)
├── patient_id → Patient
├── case_id
├── diagnosis_code (ICD-O-3)
├── morphology_code, topography_code
├── tnm_clinical, tnm_pathological
├── ajcc_stage_group
├── treatment_modalities[]
├── vital_status
├── abstraction_status (draft | in_progress | complete | submitted | accepted)
└── validation_errors[]
```

### 7.5 Audit Trail

```
AuditEntry
├── entry_id — AUTO INCREMENT
├── timestamp
├── user_id
├── action (import | screen | export | override | login | setting_change)
├── entity_type, entity_id
├── details (JSON)
├── hmac_sha256 (integrity hash)
└── is_immutable (always true)
```

---

## 8. Security & Compliance

### 8.1 HIPAA Compliance

**Legal Basis:** 45 CFR 164.512(i)(1)(ii) — "Preparatory to Research"

SiteConnect operates under the **preparatory-to-research** exemption, which permits covered entity workforce members to review PHI for research preparation without individual patient authorization, provided:

1. Use is solely to review PHI for preparing a research protocol
2. No PHI is removed from the covered entity during review
3. PHI access is necessary for the screening purpose

**Why SiteConnect Complies:**
- Workforce members screening internal data on internal systems
- Data stays on-premises (architecturally enforced — no network transmission)
- Local LLM (no cloud AI calls with PHI)
- Outputs are aggregate counts + de-identified summaries
- No BAA required (no third-party access to PHI)

**Site Documentation Required:**
- Preparatory-to-research attestation
- Three representations in writing
- Data scope definition
- Audit log retention (6 years under HIPAA)
- Small cell suppression (counts < 5) in reports

### 8.2 Encryption

| Layer | Method | Details |
|-------|--------|---------|
| Database | SQLCipher AES-256-CBC | PBKDF2-HMAC-SHA512, 256,000 iterations, unique IV per 4KB page, SHA-512 HMAC per page |
| Key Storage | OS Keychain (macOS) / DPAPI (Windows) | Derived key cached in secure enclave after passphrase entry |
| Memory | Zeroize crate | PHI fields implement `Zeroize` + `ZeroizeOnDrop`, manual `.zeroize()` after use |
| Transport | N/A | No network transmission of PHI. LLM calls to localhost only. |

### 8.3 Access Control

- **Authentication:** Passphrase-based unlock on every app launch
- **Session timeout:** Configurable (default 30 minutes of inactivity)
- **Screen lock detection:** Auto-lock on system sleep/screen lock
- **Manual lock:** Cmd+L keyboard shortcut
- **Passphrase is not recoverable** — if lost, data cannot be accessed (by design)

### 8.4 Audit Trail

- **Scope:** Every sensitive operation (import, screening run, export, override, login attempt, setting change)
- **Storage:** Append-only table in encrypted database
- **Integrity:** HMAC-SHA256 per entry — tamper-evident chain
- **Retention:** Minimum 6 years (HIPAA requirement)
- **Export:** CSV download for compliance review

### 8.5 Export Controls

- Requires explicit user action (button click)
- Audit logged with who/when/what
- PHI export blocked by default — reports are de-identified aggregates
- Patient-level lists stay internal to the application
- Small cell suppression enforced (counts < 5 suppressed in all external reports)

### 8.6 Threat Model

| Threat | Mitigation |
|--------|-----------|
| Device theft | SQLCipher AES-256 encryption at rest |
| Unauthorized access | Passphrase on launch, session timeout |
| Malicious insider | Export audit logging, explicit export actions |
| Memory dump | Zeroize crate for PHI in memory |
| Shoulder surfing | Session timeout, manual lock |
| Supply chain | Code signing (Authenticode/Notarization), checksum verification |
| Model tampering | SHA-256 checksum on model file load |
| LLM prompt injection | Gemma 4 native JSON schema conformance, input sanitization |

---

## 9. AI / LLM Integration

### 9.1 Sidecar Architecture

The LLM runs as a **managed child process** (sidecar) using llama-server from the llama.cpp project. It exposes an OpenAI-compatible API on localhost.

**Lifecycle State Machine:**
```
Starting → Health Check → Ready ←── (process alive)
    ↓                                      ↓
    └── (fail x3) ──→ Disabled        (crash) → Error → Restart
                                                   ↑
                                         (exponential backoff: 1s, 2s, 4s)
```

### 9.2 Model Selection

All models are from the **Gemma 4** family (Google DeepMind, April 2026), licensed under **Apache 2.0** for unrestricted commercial bundling.

| Model | Params (Total/Active) | Q4_K_M Size | RAM Required | Context | Use Case |
|-------|----------------------|-------------|-------------|---------|----------|
| None | — | — | < 4 GB | — | Rule-based only (Tier 1) |
| Gemma 4 E2B | 4.5B / 2.3B active | ~3.1 GB | 4-8 GB | 128K tokens | Edge-optimized AI screening |
| Gemma 4 E4B | 8B / 4.5B active | ~5.0 GB | 16 GB+ | 128K tokens | Full AI features |
| Gemma 4 26B-A4B | 26B / 3.8B active (MoE) | ~16.9 GB | 24 GB+ | 256K tokens | Near-frontier reasoning |

**Key improvements over prior models (BioMistral-7B, Gemma 3 1B):**
- **Reasoning:** GPQA Diamond 84.3% (vs 42.4% Gemma 3) — critical for complex eligibility criteria
- **Structured output:** Native JSON schema conformance + function calling (86.4% on t2-bench vs 6.6% Gemma 3)
- **Context window:** 128K-256K tokens (vs 4K BioMistral / 2K Gemma 3) — process entire patient records in one prompt
- **Edge-optimized:** E2B/E4B designed for on-device CPU inference with pruned parameter activation
- **License:** Apache 2.0 (vs custom Gemma License) — no user count limits or redistribution restrictions

**Hardware Detection:** Automatic RAM detection on startup determines recommended tier.

### 9.3 Platform Binaries

| Platform | Binary |
|----------|--------|
| macOS Intel | `llama-server-x86_64-apple-darwin` |
| macOS ARM (Apple Silicon) | `llama-server-aarch64-apple-darwin` |
| Windows x64 | `llama-server-x86_64-pc-windows-msvc.exe` |

Gemma 4 has day-one support in llama.cpp and Ollama (v0.20+). GGUF files available from Unsloth and Bartowski on Hugging Face.

### 9.4 Clinical Parameters

| Use Case | Temperature | Max Tokens | JSON Mode |
|----------|-------------|------------|-----------|
| Criterion evaluation | 0.1 | 512 | Yes |
| Entity extraction | 0.2 | 1024 | Yes |
| Narrative/insight generation | 0.3 | 2048 | No |

### 9.5 Ollama Support

Alternative to bundled llama-server — if users have Ollama installed:
- Auto-detect Ollama installation and available models
- Pull recommended models with progress streaming
- Use Ollama as backend instead of managed sidecar

### 9.6 Feature Availability by Tier

| Feature | No LLM | Gemma 4 E2B | Gemma 4 E4B | Gemma 4 26B-A4B |
|---------|--------|-------------|-------------|-----------------|
| Rule-based screening (Tier 1) | Yes | Yes | Yes | Yes |
| AI criterion evaluation (Tier 2) | No | Yes | Yes | Yes |
| Structured JSON output | No | Yes | Yes | Yes |
| Clinical note entity extraction | No | Basic | Full | Full |
| Semantic search | No | Basic | Yes | Yes |
| Narrative insight generation | No | Basic | Full | Full |
| Sponsor pitch generation | No | Basic | Full | Full |
| Full patient record in single prompt | No | Yes (128K) | Yes (128K) | Yes (256K) |

### 9.7 Graceful Degradation

- LLM failure **never crashes the app**
- Tier 2 criteria fall back to `NeedsReview` status
- All rule-based features continue to function
- User notified: "AI features unavailable — restart from Settings"
- Manual retry available in Settings > Troubleshooting

---

## 10. Hardware & Deployment

### 10.1 Hardware Tiers

| Tier | RAM | CPU | Disk | LLM Model | Screening Mode |
|------|-----|-----|------|-----------|----------------|
| Minimum | 4 GB | 2 cores (x64) | 5 GB | Gemma 4 E2B (IQ2_M, ~2.3 GB) | Basic AI screening |
| Recommended | 8 GB | 4 cores | 8 GB | Gemma 4 E2B (Q4_K_M, ~3.1 GB) | AI + structured JSON |
| Optimal | 16 GB+ | 4+ cores | 12 GB | Gemma 4 E4B (Q4_K_M, ~5.0 GB) | Full AI, 128K context |
| Premium | 24 GB+ | 4+ cores | 25 GB | Gemma 4 26B-A4B (Q4_K_M, ~16.9 GB) | Near-frontier reasoning |

### 10.2 Supported Platforms

| Platform | Architecture | Status |
|----------|-------------|--------|
| Windows 10 (21H2+) | x64 | Supported |
| Windows 11 | x64 | Supported |
| macOS 12+ | Intel (x86_64) | Supported |
| macOS 12+ | Apple Silicon (ARM) | Supported |
| Linux | — | Future |

### 10.3 Installation Methods

**Standard Install:**
1. Download installer (.dmg for macOS, .msi/.exe for Windows)
2. Run setup wizard
3. Choose passphrase for database encryption
4. Hardware detection recommends Gemma 4 model variant (E2B, E4B, or 26B-A4B)
5. Download model via Ollama or direct GGUF sideload
6. Site onboarding wizard (6 steps)

**USB Edge Pack (Air-Gapped):**
1. Pre-loaded USB with installer + model files
2. Verify SHA-256 checksums
3. Offline installation — no internet required at any point
4. Model files copied from USB to local storage

### 10.4 Performance Expectations

| Operation | Minimum (4GB) | Recommended (8GB) | Optimal (16GB+) | Premium (24GB+) |
|-----------|---------------|-------------------|-----------------|-----------------|
| Data import (10K patients) | 15-30 sec | 10-20 sec | 8-15 sec | 8-15 sec |
| Rule screening (1K patients, 10 criteria) | 2-5 sec | 1-3 sec | 1-2 sec | 1-2 sec |
| AI screening per criterion/patient | 2-5 sec (E2B IQ2) | 1-3 sec (E2B Q4) | 1-3 sec (E4B) | 1-2 sec (26B-A4B, 3.8B active) |
| Full AI screening (1K patients, 10 criteria) | 6-14 hours | 3-8 hours | 3-8 hours | 3-6 hours |
| App launch to ready | 2-5 sec | 2-5 sec | 2-5 sec | 2-5 sec |
| LLM sidecar startup | 5-15 sec | 10-20 sec | 15-30 sec | 30-90 sec |

*Note: Full AI screening runs as a background batch process. The 26B-A4B MoE model only activates 3.8B parameters per token, so inference speed is comparable to much smaller dense models despite the large file size.*

### 10.5 IT Security Questionnaire Quick Answers

| Question | Answer |
|----------|--------|
| Does the app transmit PHI? | No |
| Is network connectivity required? | No (optional for trial sync) |
| Is a BAA required? | No |
| Is there an audit log? | Yes — append-only, HMAC-protected |
| What encryption is used? | AES-256-CBC via SQLCipher |
| Are system services installed? | No |
| Are admin privileges required? | Installation only |
| How is the app updated? | User-initiated installer packages |

### 10.6 Updates & Uninstall

- **Updates:** Via installer packages, user-initiated, never automatic
- **Uninstall:** Standard OS removal + optional "Secure Wipe" (overwrite database with zeros)

---

## 11. Performance Requirements

| Metric | Target |
|--------|--------|
| App launch to interactive | < 5 seconds |
| Database unlock | < 2 seconds |
| Patient list render (10K records) | < 1 second (virtualized) |
| Tier 1 screening batch (10K patients x 30 criteria) | < 5 seconds |
| Page transition | < 300 ms (animated) |
| Import preview (10K rows) | < 3 seconds |
| Search / filter response | < 100 ms |
| Memory usage (idle) | < 200 MB |
| Memory usage (LLM active) | < 4 GB (E2B) / < 6 GB (E4B) / < 18 GB (26B-A4B) |
| Binary size (without model) | < 50 MB |

---

## 12. Testing Strategy

### 12.1 Coverage Targets

| Domain | Target |
|--------|--------|
| Screening engine (Rust) | 90% |
| Import pipeline (Rust) | 85% |
| UI components (React) | 80% |
| Financial engine | 85% |
| Security / encryption | 95% |

### 12.2 Test Types

| Type | Framework | Scope |
|------|-----------|-------|
| Unit (Rust) | `#[cfg(test)]` co-located | Commands, DB operations, screening logic, import parsers |
| Unit (React) | Vitest + React Testing Library | Components, stores, hooks, utilities |
| Integration | Vitest | Data flow through Tauri bridge, store interactions |
| E2E | Playwright / WebDriver | Full user workflows (import → screen → review → export) |

### 12.3 Critical Test Flows

1. **Import → Screen → Review:** Import CSV → run screening → review results → override criterion → verify audit log
2. **Multi-protocol screening:** Select 3 studies → batch screen → verify matrix view → best match ranking
3. **Encryption round-trip:** Create DB → lock → unlock → verify data integrity
4. **LLM degradation:** Start screening → kill LLM → verify fallback to NeedsReview
5. **Export controls:** Generate report → verify small cell suppression → verify audit entry

---

## 13. Go-to-Market & Phasing

### Build Order

| Phase | Features | Priority |
|-------|----------|----------|
| 1 | Tauri scaffold + React shell + shadcn/ui | P0 |
| 2 | SQLite + SQLCipher database layer | P0 |
| 3 | CSV/Excel import + column mapping UI | P0 |
| 4 | Study management + curated trial seed data with financials | P0 |
| 5 | Criteria parser (NL → structured rules) | P0 |
| 6 | Rule-based screening (Tier 1) | P0 |
| 7 | llama-server sidecar integration | P0 |
| 8 | LLM-assisted screening (Tier 2) | P0 |
| 9 | Three-panel screening review UI | P0 |
| 10 | Trial search & discovery | P0 |
| 11 | Financial opportunity calculator | P1 |
| 12 | Population analytics dashboard | P1 |
| 13 | AI insights generation | P1 |
| 14 | FHIR/CDA import parsers + NER pipeline | P2 |
| 15 | Telemetry + auto-update + installer packaging | P2 |

### Deployment Targets

| Milestone | Timeline | Target |
|-----------|----------|--------|
| Alpha (internal) | Month 3 | Core import + screening + 3-panel UI |
| Beta (5 pilot sites) | Month 6 | Full feature set, installer packages |
| GA (public launch) | Month 9 | 30+ site deployments |
| Network phase | Month 12 | Anonymized feasibility marketplace |

### Success Metrics

| Metric | Target (Year 1) |
|--------|-----------------|
| Sites deployed | 30-50+ |
| Patients screened per site | 1,000+ |
| Time saved per protocol (vs. manual) | 60-80% |
| Screen failure rate reduction | 15-25% |
| User retention (monthly active) | > 70% |
| Net Promoter Score | > 50 |

---

## 14. Appendices

### A. Glossary

| Term | Definition |
|------|-----------|
| **CRC** | Clinical Research Coordinator — primary day-to-day user |
| **CRO** | Contract Research Organization |
| **EDC** | Electronic Data Capture |
| **ePRO** | Electronic Patient-Reported Outcomes |
| **FHIR** | Fast Healthcare Interoperability Resources (HL7 standard) |
| **FTS5** | SQLite Full-Text Search extension |
| **HIPAA** | Health Insurance Portability and Accountability Act |
| **ICD-10** | International Classification of Diseases, 10th Revision |
| **LOINC** | Logical Observation Identifiers Names and Codes |
| **LLM** | Large Language Model |
| **MRN** | Medical Record Number |
| **NAACCR** | North American Association of Central Cancer Registries |
| **NCT** | National Clinical Trial (ClinicalTrials.gov identifier) |
| **NER** | Named Entity Recognition |
| **PHI** | Protected Health Information |
| **RxNorm** | Normalized names for clinical drugs (NLM) |
| **SQLCipher** | SQLite extension providing AES-256 encryption |
| **sqlite-vec** | SQLite extension for vector similarity search |

### B. Related Projects

| Project | Relationship |
|---------|-------------|
| TalOS ePRO | Sister product — web-based ePRO for study execution (Next.js + Firestore) |
| TalOS Network | Future — sponsor marketplace built on anonymized site data |
| TalOS EDC | Future — electronic data capture for enrolled patients |

### C. Regulatory References

- **45 CFR 164.512(i)(1)(ii)** — HIPAA preparatory-to-research exemption
- **NAACCR Standards** — Cancer registry reporting requirements
- **FDA 21 CFR Part 11** — Electronic records (future consideration for EDC integration)
- **ICH-GCP E6(R2)** — Good Clinical Practice guidelines

### D. Seed Data

The application ships with a curated research pack of ~50 realistic clinical trials spanning:
- **Oncology:** NSCLC, breast cancer, melanoma, colorectal, lymphoma
- **Cardiology:** Heart failure, atrial fibrillation, coronary artery disease
- **Neurology:** Alzheimer's, Parkinson's, multiple sclerosis
- **Diabetes:** Type 2, NASH/NAFLD
- **Rare Disease:** Various orphan indications
- **Immunology:** Rheumatoid arthritis, lupus, IBD

Each trial includes real NCT numbers, eligibility criteria, and estimated financial data based on industry benchmarks.

### E. Demo Data

For development and demonstrations, the application includes 50 simulated Epic EHR patients with:
- Realistic demographics, diagnoses (ICD-10), medications (RxNorm), lab results (LOINC)
- Representative disease distributions matching common clinical trial populations
- Used as fallback when Tauri backend is unavailable (web dev mode)

---

*Built for the Talosix Site Network Strategy. Get into the sites. Build the network. Own the supply side.*
