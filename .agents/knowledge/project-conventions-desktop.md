# Project Conventions — Desktop (TalOS SiteConnect)

> Coding standards, architecture patterns, naming conventions, and development practices for the TalOS SiteConnect Tauri v2 desktop application.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Rust Coding Standards](#2-rust-coding-standards)
3. [TypeScript Conventions](#3-typescript-conventions)
4. [State Management Patterns](#4-state-management-patterns)
5. [Error Handling Across the Rust/JS Boundary](#5-error-handling-across-the-rustjs-boundary)
6. [Testing Strategy](#6-testing-strategy)
7. [Build and Release Process](#7-build-and-release-process)
8. [Naming Conventions](#8-naming-conventions)
9. [Performance Guidelines](#9-performance-guidelines)
10. [Integer Cents for Money](#10-integer-cents-for-money)

---

## 1. Project Structure

```
talos-siteconnect/
├── src/                          # React frontend (Vite-bundled)
│   ├── components/
│   │   ├── ui/                   # shadcn/ui base components (DO NOT modify)
│   │   ├── common/               # Shared components (LoadingSpinner, ErrorBoundary, etc.)
│   │   ├── patients/             # PatientList, PatientDetail, PatientImport
│   │   ├── studies/              # StudyList, StudyDetail, CriteriaEditor
│   │   ├── screening/            # ScreeningProgress, ScreeningResults, EligibilityCard
│   │   ├── analytics/            # PopulationChart, DemographicsPanel, InsightCards
│   │   ├── pitch/                # PitchBuilder, PitchPreview, PitchExport
│   │   └── settings/             # SettingsPanel, ModelManager, SecuritySettings
│   ├── lib/
│   │   ├── tauri.ts              # Typed Tauri invoke wrappers
│   │   ├── utils.ts              # Shared utility functions
│   │   └── constants.ts          # Application constants
│   ├── hooks/
│   │   ├── use-patients.ts       # Patient data fetching/mutation hooks
│   │   ├── use-studies.ts        # Study data hooks
│   │   ├── use-screening.ts      # Screening status/progress hooks
│   │   └── use-settings.ts       # Settings hooks
│   ├── stores/
│   │   ├── use-patient-store.ts  # Patient list state
│   │   ├── use-study-store.ts    # Study/criteria state
│   │   ├── use-screening-store.ts # Screening progress state
│   │   ├── use-ui-store.ts       # UI state (sidebar, modals, etc.)
│   │   └── use-auth-store.ts     # Authentication/session state
│   ├── types/
│   │   ├── patient.ts            # Patient, Diagnosis, Medication, LabResult types
│   │   ├── study.ts              # Study, Criterion, ScreeningResult types
│   │   ├── screening.ts          # ScreeningJob, CriterionResult types
│   │   └── common.ts             # Shared types (PaginatedResponse, etc.)
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Patients.tsx
│   │   ├── Studies.tsx
│   │   ├── Screening.tsx
│   │   ├── Analytics.tsx
│   │   ├── PitchBuilder.tsx
│   │   └── Settings.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css                 # Tailwind CSS entry point
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # Tauri application entry point
│   │   ├── lib.rs                # Module declarations
│   │   ├── commands/             # Tauri command handlers (one module per domain)
│   │   │   ├── mod.rs
│   │   │   ├── patients.rs       # import_patients, get_patients, get_patient, delete_patients
│   │   │   ├── studies.rs        # add_study, get_studies, get_study, remove_study, update_criteria
│   │   │   ├── screening.rs      # start_screening, get_screening_status, cancel_screening
│   │   │   ├── analytics.rs      # get_population_stats, get_demographics, get_insights
│   │   │   ├── export.rs         # export_csv, export_pitch_pdf, export_audit_log
│   │   │   ├── settings.rs       # get_settings, update_settings, change_passphrase
│   │   │   └── auth.rs           # authenticate, lock_session, check_session
│   │   ├── db/                   # Database layer
│   │   │   ├── mod.rs
│   │   │   ├── connection.rs     # SQLCipher connection management
│   │   │   ├── migrations.rs     # Schema migrations (versioned, sequential)
│   │   │   ├── patients.rs       # Patient CRUD operations
│   │   │   ├── studies.rs        # Study CRUD operations
│   │   │   ├── screening.rs      # Screening result storage/retrieval
│   │   │   ├── analytics.rs      # Aggregate query functions
│   │   │   ├── audit.rs          # Audit log operations
│   │   │   └── embeddings.rs     # sqlite-vec embedding operations
│   │   ├── import/               # Data import parsers
│   │   │   ├── mod.rs
│   │   │   ├── csv.rs            # CSV parser with encoding detection
│   │   │   ├── excel.rs          # Excel (.xlsx) parser
│   │   │   ├── mapping.rs        # Column mapping logic
│   │   │   └── validation.rs     # Data validation and normalization
│   │   ├── screening/            # Screening engine
│   │   │   ├── mod.rs
│   │   │   ├── engine.rs         # Main screening orchestrator
│   │   │   ├── rules.rs          # Rule-based criterion evaluation
│   │   │   ├── scoring.rs        # Composite scoring algorithm
│   │   │   ├── criteria_parser.rs # NL criteria → structured rules
│   │   │   └── batch.rs          # Batch processing with progress
│   │   ├── llm/                  # LLM sidecar management
│   │   │   ├── mod.rs
│   │   │   ├── sidecar.rs        # llama.cpp process lifecycle
│   │   │   ├── client.rs         # HTTP client for sidecar API
│   │   │   ├── prompts.rs        # Prompt template rendering
│   │   │   └── response.rs       # JSON response parsing and validation
│   │   ├── export/               # Export functionality
│   │   │   ├── mod.rs
│   │   │   ├── csv.rs            # CSV export
│   │   │   ├── pdf.rs            # PDF report generation
│   │   │   └── pitch.rs          # Sponsor pitch document assembly
│   │   ├── telemetry/            # Opt-in telemetry
│   │   │   ├── mod.rs
│   │   │   ├── anonymizer.rs     # K-anonymization logic
│   │   │   ├── payload.rs        # Telemetry payload construction
│   │   │   └── sender.rs         # HTTPS transmission with cert pinning
│   │   └── error.rs              # Application error types
│   ├── migrations/               # SQL migration files
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_add_embeddings.sql
│   │   └── ...
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   └── icons/
├── tests/                        # Integration and E2E tests
│   ├── fixtures/                 # Test data files (CSV, Excel)
│   └── e2e/                      # WebDriver E2E tests
├── .agents/
│   ├── skills/
│   └── knowledge/                # This directory
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── CLAUDE.md
```

### Key Principles

- **One module per domain** in `src-tauri/src/commands/`: Each file handles all Tauri commands for a single feature area
- **Database layer isolation**: All SQL queries live in `src-tauri/src/db/`. Command handlers never write raw SQL.
- **Frontend mirrors backend domains**: React components, hooks, stores, and types are organized by the same domains as the Rust commands
- **No business logic in command handlers**: Commands validate input, call domain functions, and return results. Business logic lives in the domain modules (`screening/`, `import/`, etc.)

---

## 2. Rust Coding Standards

### Error Handling

Use `thiserror` for defining error types and `anyhow` in command handlers for convenience:

```rust
// src-tauri/src/error.rs
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Import error: {0}")]
    Import(String),

    #[error("Screening error: {0}")]
    Screening(String),

    #[error("Authentication failed")]
    AuthFailed,

    #[error("Session expired")]
    SessionExpired,

    #[error("LLM error: {0}")]
    Llm(String),

    #[error("Export error: {0}")]
    Export(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("{0}")]
    Other(#[from] anyhow::Error),
}

// Enable serialization for Tauri command returns
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
```

### Database Operations

All database operations return `Result<T, AppError>`:

```rust
// src-tauri/src/db/patients.rs
use crate::error::AppError;
use rusqlite::Connection;

pub fn get_patients(
    conn: &Connection,
    offset: i64,
    limit: i64,
) -> Result<Vec<Patient>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, first_name, last_name, date_of_birth, sex
         FROM patients
         ORDER BY last_name, first_name
         LIMIT ?1 OFFSET ?2"
    )?;

    let patients = stmt.query_map(rusqlite::params![limit, offset], |row| {
        Ok(Patient {
            id: row.get(0)?,
            first_name: row.get(1)?,
            last_name: row.get(2)?,
            date_of_birth: row.get(3)?,
            sex: row.get(4)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;

    Ok(patients)
}
```

### Serialization

All types crossing the Rust/JS boundary must derive `Serialize` and `Deserialize`:

```rust
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]  // Rust snake_case → JS camelCase
pub struct Patient {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub date_of_birth: String,
    pub sex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreeningResult {
    pub patient_id: String,
    pub study_nct_id: String,
    pub score: f64,
    pub tier: String,
    pub criteria_results: Vec<CriterionResult>,
    pub data_completeness: f64,
}
```

**Important**: Use `#[serde(rename_all = "camelCase")]` on all types sent to the frontend. Rust uses `snake_case`; JavaScript/TypeScript uses `camelCase`. Serde handles the conversion automatically.

### Tauri Command Naming

Commands are `snake_case` in Rust, invoked as `camelCase` from JavaScript:

```rust
// Rust: snake_case
#[tauri::command]
async fn get_patients(
    state: tauri::State<'_, AppState>,
    offset: i64,
    limit: i64,
) -> Result<PaginatedResponse<Patient>, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Database(/* ... */))?;
    let patients = db::patients::get_patients(&conn, offset, limit)?;
    let total = db::patients::count_patients(&conn)?;
    Ok(PaginatedResponse { data: patients, total, offset, limit })
}
```

```typescript
// TypeScript: camelCase invocation
const result = await invoke<PaginatedResponse<Patient>>("get_patients", {
  offset: 0,
  limit: 50,
});
```

### Structured Logging

Use the `tracing` crate for all logging:

```rust
use tracing::{info, warn, error, debug, instrument};

#[instrument(skip(conn, passphrase))]  // Never log passphrase
fn authenticate(conn: &Connection, passphrase: &str) -> Result<bool, AppError> {
    info!("Authentication attempt");

    match open_encrypted_db(conn, passphrase) {
        Ok(_) => {
            info!("Authentication successful");
            Ok(true)
        }
        Err(e) => {
            warn!("Authentication failed: {}", e);
            Ok(false)
        }
    }
}
```

**PHI logging rules:**
- NEVER log patient names, MRNs, dates of birth, or diagnosis details
- Log patient counts, record IDs (internal, non-PHI), and operation types
- Use `#[instrument(skip(field))]` to exclude sensitive fields from span traces
- PHI fields wrapped in `PhiString` automatically log as `[REDACTED]` (see `desktop-security-architecture.md`)

### PHI Fields and Zeroize

```rust
use zeroize::{Zeroize, ZeroizeOnDrop};

// Types holding PHI must implement Zeroize
#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct PatientPhi {
    pub first_name: String,
    pub last_name: String,
    pub date_of_birth: String,
    pub mrn: String,
}

// Non-PHI types do not need Zeroize
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreeningScore {
    pub score: f64,
    pub tier: String,
    pub data_completeness: f64,
}
```

---

## 3. TypeScript Conventions

### Strict Mode

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": false
  }
}
```

**`any` is forbidden.** Use `unknown` with type guards:

```typescript
// BAD
function processData(data: any) { ... }

// GOOD
function processData(data: unknown) {
  if (isPatient(data)) {
    // data is now typed as Patient
  }
}

function isPatient(value: unknown): value is Patient {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "firstName" in value
  );
}
```

### Tauri Invoke Wrappers

All Tauri `invoke` calls are wrapped in typed helper functions in `lib/tauri.ts`:

```typescript
// src/lib/tauri.ts
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

// Zod schemas for runtime validation of Tauri responses
const PatientSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string(),
  sex: z.string(),
});

const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    total: z.number(),
    offset: z.number(),
    limit: z.number(),
  });

export type Patient = z.infer<typeof PatientSchema>;
export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  offset: number;
  limit: number;
};

// Typed invoke wrappers
export async function getPatients(
  offset: number,
  limit: number
): Promise<PaginatedResponse<Patient>> {
  const result = await invoke("get_patients", { offset, limit });
  return PaginatedResponseSchema(PatientSchema).parse(result);
}

export async function importPatients(
  filePath: string,
  mappings: ColumnMapping[]
): Promise<ImportResult> {
  const result = await invoke("import_patients", { filePath, mappings });
  return ImportResultSchema.parse(result);
}

export async function startScreening(
  studyNctId: string,
  patientIds?: string[]
): Promise<string> {
  // Returns job ID
  const result = await invoke("start_screening", { studyNctId, patientIds });
  return z.string().parse(result);
}
```

**Key rules:**
- Every `invoke` call has a typed wrapper function
- Every response is validated with Zod at runtime (catches Rust/JS type mismatches)
- Never call `invoke` directly from components — always use the wrapper

### Component File Naming

```
PascalCase.tsx        # Component files
PascalCase.test.tsx   # Co-located test files
```

Examples:
```
PatientList.tsx
PatientList.test.tsx
ScreeningProgress.tsx
ScreeningProgress.test.tsx
```

### Store Naming

```
use-{domain}.ts       # Zustand stores
```

Examples:
```
use-patient-store.ts
use-study-store.ts
use-screening-store.ts
use-ui-store.ts
use-auth-store.ts
```

---

## 4. State Management Patterns

### Zustand for UI State

Zustand stores manage frontend-only state. The Tauri backend is the source of truth for all data.

```typescript
// src/stores/use-patient-store.ts
import { create } from "zustand";
import type { Patient, PaginatedResponse } from "@/lib/tauri";
import { getPatients } from "@/lib/tauri";

interface PatientStore {
  // Data
  patients: Patient[];
  total: number;
  page: number;
  pageSize: number;

  // Loading states
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchPatients: () => Promise<void>;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

export const usePatientStore = create<PatientStore>((set, get) => ({
  patients: [],
  total: 0,
  page: 0,
  pageSize: 50,
  isLoading: false,
  error: null,

  fetchPatients: async () => {
    const { page, pageSize } = get();
    set({ isLoading: true, error: null });

    try {
      const result = await getPatients(page * pageSize, pageSize);
      set({
        patients: result.data,
        total: result.total,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to fetch patients",
        isLoading: false,
      });
    }
  },

  setPage: (page) => {
    set({ page });
    get().fetchPatients();
  },

  setPageSize: (size) => {
    set({ pageSize: size, page: 0 });
    get().fetchPatients();
  },
}));
```

### Source of Truth

```
┌──────────────────────────────────────────────────┐
│                    Frontend (React)                │
│                                                    │
│  Zustand Store ◄──── invoke() ────► Tauri Backend │
│  (UI state,         (typed          (SQLite =      │
│   cached data)       wrappers)       source of     │
│                                      truth)        │
└──────────────────────────────────────────────────┘
```

- **Zustand stores** hold: current page, loading states, cached query results, UI preferences (sidebar open, selected tab, etc.)
- **Tauri backend** holds: all patient data, study data, screening results, settings, audit log
- On any mutation (import, delete, update), the store refetches from the backend
- Stores NEVER write directly to the database — all writes go through Tauri commands

### Optimistic Updates with Rollback

For operations where immediate UI feedback is important:

```typescript
export const useStudyStore = create<StudyStore>((set, get) => ({
  // ...
  removeStudy: async (nctId: string) => {
    const previousStudies = get().studies;

    // Optimistic: remove from UI immediately
    set({
      studies: previousStudies.filter((s) => s.nctId !== nctId),
    });

    try {
      await removeStudy(nctId);
    } catch (err) {
      // Rollback: restore previous state on failure
      set({
        studies: previousStudies,
        error: "Failed to remove study. Please try again.",
      });
    }
  },
}));
```

### Loading and Error States

Every async operation must track loading and error states:

```typescript
interface AsyncState {
  isLoading: boolean;
  error: string | null;
}

// In components:
function PatientList() {
  const { patients, isLoading, error, fetchPatients } = usePatientStore();

  useEffect(() => {
    fetchPatients();
  }, []);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={fetchPatients} />;
  if (patients.length === 0) return <EmptyState message="No patients imported yet" />;

  return <DataTable data={patients} columns={columns} />;
}
```

---

## 5. Error Handling Across the Rust/JS Boundary

### Rust Side

Tauri commands return `Result<T, AppError>` where `AppError` implements `Serialize`:

```rust
#[tauri::command]
async fn import_patients(
    state: tauri::State<'_, AppState>,
    file_path: String,
    mappings: Vec<ColumnMapping>,
) -> Result<ImportResult, AppError> {
    // Validate inputs
    if !std::path::Path::new(&file_path).exists() {
        return Err(AppError::Validation(format!(
            "File not found: {}", file_path
        )));
    }

    // Acquire database connection
    let conn = state.db.lock()
        .map_err(|_| AppError::Database(rusqlite::Error::ExecuteReturnedResults))?;

    // Perform import
    let result = import::csv::import_from_csv(&conn, &file_path, &mappings)?;

    // Audit log
    db::audit::log_action(&conn, "patients_imported", "import", &serde_json::json!({
        "source": file_path.split('/').last().unwrap_or("unknown"),
        "count": result.imported_count,
        "format": "csv",
    }))?;

    Ok(result)
}
```

### JavaScript Side

```typescript
// src/lib/tauri.ts
export async function importPatients(
  filePath: string,
  mappings: ColumnMapping[]
): Promise<ImportResult> {
  try {
    const result = await invoke("import_patients", { filePath, mappings });
    return ImportResultSchema.parse(result);
  } catch (err) {
    // Tauri serializes Rust errors as strings
    if (typeof err === "string") {
      // Parse structured error messages
      if (err.startsWith("Validation error:")) {
        throw new ValidationError(err.replace("Validation error: ", ""));
      }
      if (err.startsWith("Database error:")) {
        throw new DatabaseError(err.replace("Database error: ", ""));
      }
      throw new AppError(err);
    }
    throw new AppError("An unexpected error occurred during import");
  }
}
```

### User-Facing vs Developer Errors

```typescript
// Error types for the frontend
class AppError extends Error {
  constructor(
    public userMessage: string,
    public technicalDetail?: string
  ) {
    super(userMessage);
  }
}

class ValidationError extends AppError {
  constructor(detail: string) {
    super(`Invalid input: ${detail}`, detail);
  }
}

class DatabaseError extends AppError {
  constructor(detail: string) {
    // User-friendly message; technical detail logged
    super("A database error occurred. Please try again.", detail);
    console.error("[DatabaseError]", detail);
  }
}
```

**Rules:**
- User-facing error messages: clear, non-technical, actionable ("File not found. Please check the file path and try again.")
- Developer errors: logged with full context to console and tracing (never shown to user)
- Never show raw Rust error messages to users (e.g., `rusqlite::Error::QueryReturnedNoRows` is meaningless to a CRC)

---

## 6. Testing Strategy

### Rust Unit Tests

Co-located in each module using `#[cfg(test)]`:

```rust
// src-tauri/src/screening/rules.rs

pub fn evaluate_numeric(value: f64, operator: &Operator, threshold: &Value) -> RuleResult {
    // ... implementation ...
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_numeric_gte_met() {
        let result = evaluate_numeric(8.2, &Operator::Gte, &Value::Float(7.0));
        assert_eq!(result, RuleResult::Met);
    }

    #[test]
    fn test_numeric_gte_not_met() {
        let result = evaluate_numeric(6.5, &Operator::Gte, &Value::Float(7.0));
        assert_eq!(result, RuleResult::NotMet);
    }

    #[test]
    fn test_numeric_between_inclusive() {
        let result = evaluate_numeric(7.0, &Operator::Between, &Value::Range(7.0, 10.5));
        assert_eq!(result, RuleResult::Met); // Lower bound inclusive
    }

    #[test]
    fn test_numeric_between_upper_inclusive() {
        let result = evaluate_numeric(10.5, &Operator::Between, &Value::Range(7.0, 10.5));
        assert_eq!(result, RuleResult::Met); // Upper bound inclusive
    }

    #[test]
    fn test_numeric_between_out_of_range() {
        let result = evaluate_numeric(11.0, &Operator::Between, &Value::Range(7.0, 10.5));
        assert_eq!(result, RuleResult::NotMet);
    }
}
```

### Rust Integration Tests

In the `tests/` directory within `src-tauri/`:

```rust
// src-tauri/tests/screening_integration.rs

use talos_siteconnect::screening::engine::ScreeningEngine;
use talos_siteconnect::db::connection::open_test_db;

#[test]
fn test_full_screening_pipeline() {
    let conn = open_test_db();
    // Insert test patients and study criteria
    // Run screening
    // Verify results
}
```

### React Component Tests

Co-located with components using Vitest + React Testing Library:

```typescript
// src/components/patients/PatientList.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PatientList } from "./PatientList";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("PatientList", () => {
  it("displays loading state initially", () => {
    render(<PatientList />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("displays patients after loading", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [
        { id: "1", firstName: "John", lastName: "Smith", dateOfBirth: "1965-03-15", sex: "M" },
      ],
      total: 1,
      offset: 0,
      limit: 50,
    });

    render(<PatientList />);
    await waitFor(() => {
      expect(screen.getByText("John Smith")).toBeInTheDocument();
    });
  });

  it("displays error state on failure", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce("Database error");

    render(<PatientList />);
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});
```

### E2E Tests

Use Tauri's WebDriver integration or Playwright:

```typescript
// tests/e2e/import-flow.test.ts
import { test, expect } from "@playwright/test";

test("import patients from CSV", async ({ page }) => {
  // Navigate to import page
  await page.click('[data-testid="nav-patients"]');
  await page.click('[data-testid="import-button"]');

  // Select file
  // Note: File dialog interaction requires Tauri-specific handling
  // Use a test fixture file path passed via environment variable

  // Verify import results
  await expect(page.locator('[data-testid="import-count"]')).toContainText("1,500");
});
```

### Coverage Targets

| Module | Target | Rationale |
|--------|--------|-----------|
| Screening engine (`screening/`) | 90% | Core business logic; errors directly impact patient eligibility |
| Import parsers (`import/`) | 85% | Data quality depends on correct parsing |
| Database layer (`db/`) | 80% | CRUD operations, migrations |
| React components | 80% | UI correctness |
| Tauri commands (`commands/`) | 75% | Thin wrappers; mostly delegation |
| Export (`export/`) | 75% | Output formatting |

---

## 7. Build and Release Process

### Development

```bash
# Start development mode (hot reload frontend, Rust rebuilds on change)
cargo tauri dev

# Run Rust tests
cd src-tauri && cargo test

# Run frontend tests
npm run test

# Run linter
npm run lint
cd src-tauri && cargo clippy -- -D warnings
```

### Production Build

```bash
# Build platform-specific installer
cargo tauri build

# Output locations:
# Windows: src-tauri/target/release/bundle/nsis/TalOS-SiteConnect-{version}-x64-setup.exe
# macOS:   src-tauri/target/release/bundle/dmg/TalOS-SiteConnect-{version}-{arch}.dmg
```

### CI Pipeline (GitHub Actions)

```yaml
# .github/workflows/build.yml
name: Build & Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, macos-14]  # macos-14 = ARM runner
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test
      - run: cd src-tauri && cargo test
      - run: cd src-tauri && cargo clippy -- -D warnings

  build:
    needs: test
    strategy:
      matrix:
        include:
          - os: windows-latest
            target: x86_64-pc-windows-msvc
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: macos-14
            target: aarch64-apple-darwin
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: cargo tauri build
      - uses: actions/upload-artifact@v4
        with:
          name: installer-${{ matrix.target }}
          path: src-tauri/target/release/bundle/
```

### Versioning

- **SemVer**: `MAJOR.MINOR.PATCH`
- Version is defined in:
  - `src-tauri/Cargo.toml` (Rust crate version)
  - `src-tauri/tauri.conf.json` (installer version)
  - `package.json` (frontend version)
- All three must be kept in sync (use a release script)
- Changelog maintained in `CHANGELOG.md`

### Code Signing

- **macOS**: Apple Developer ID certificate required for release builds. Set `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` environment variables in CI.
- **Windows**: Authenticode certificate required. EV certificate recommended for SmartScreen reputation. Set `WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` in CI.
- **CI**: Code signing credentials stored as GitHub Actions secrets, injected during build

---

## 8. Naming Conventions

### Rust

| Entity | Convention | Example |
|--------|-----------|---------|
| Crate name | kebab-case | `talos-siteconnect` |
| Module names | snake_case | `screening`, `criteria_parser` |
| Struct names | PascalCase | `Patient`, `ScreeningResult`, `CriterionRule` |
| Enum names | PascalCase | `RuleResult`, `Operator`, `AppError` |
| Enum variants | PascalCase | `RuleResult::Met`, `Operator::Between` |
| Function names | snake_case | `evaluate_criterion`, `import_patients` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_BATCH_SIZE`, `DEFAULT_PAGE_SIZE` |
| Type parameters | Single uppercase letter or PascalCase | `T`, `Item` |
| Tauri commands | snake_case (auto-mapped to camelCase in JS) | `get_patients`, `start_screening` |

### TypeScript / React

| Entity | Convention | Example |
|--------|-----------|---------|
| Component files | PascalCase.tsx | `PatientList.tsx`, `ScreeningProgress.tsx` |
| Component names | PascalCase | `PatientList`, `ScreeningProgress` |
| Hook files | use-{name}.ts | `use-patients.ts`, `use-screening.ts` |
| Hook functions | usePascalCase | `usePatients`, `useScreening` |
| Store files | use-{domain}-store.ts | `use-patient-store.ts` |
| Store hooks | usePascalCaseStore | `usePatientStore` |
| Type/Interface | PascalCase | `Patient`, `Study`, `ScreeningResult` |
| Functions | camelCase | `getPatients`, `formatDate`, `calculateScore` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_PAGE_SIZE`, `DEFAULT_TIMEOUT_MS` |
| CSS classes | Tailwind utility classes | `className="flex items-center gap-2"` |
| Test files | PascalCase.test.tsx | `PatientList.test.tsx` |

### Database

| Entity | Convention | Example |
|--------|-----------|---------|
| Table names | snake_case plural | `patients`, `diagnoses`, `lab_results`, `screening_results` |
| Column names | snake_case | `first_name`, `date_of_birth`, `study_nct_id` |
| Index names | idx_{table}_{columns} | `idx_patients_last_name`, `idx_lab_results_patient_id_name` |
| Foreign keys | {referenced_table}_id | `patient_id`, `study_id` |
| Migration files | {number}_{description}.sql | `001_initial_schema.sql`, `002_add_embeddings.sql` |

### Tauri Commands

| Convention | Example |
|-----------|---------|
| verb_noun | `import_patients`, `get_study`, `start_screening` |
| get_{entity} | `get_patients`, `get_patient`, `get_studies` |
| get_{entity}_{detail} | `get_patient_diagnoses`, `get_study_criteria` |
| {action}_{entity} | `import_patients`, `delete_patients`, `export_results` |
| {action}_{operation} | `start_screening`, `cancel_screening`, `check_session` |

---

## 9. Performance Guidelines

### Batch Database Operations

Never call `invoke()` in a loop. Batch operations into a single command:

```typescript
// BAD: N+1 invoke calls
for (const patientId of patientIds) {
  await invoke("get_patient", { patientId });
}

// GOOD: Single invoke with batch parameter
const patients = await invoke("get_patients_by_ids", { patientIds });
```

```rust
// Rust side: batch query
#[tauri::command]
fn get_patients_by_ids(
    state: tauri::State<'_, AppState>,
    patient_ids: Vec<String>,
) -> Result<Vec<Patient>, AppError> {
    let conn = state.db.lock().unwrap();
    let placeholders = patient_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!(
        "SELECT * FROM patients WHERE id IN ({})",
        placeholders
    );
    // ... execute with params
}
```

### Tauri Channels for Streaming Progress

Use Tauri channels for long-running operations that need real-time progress updates:

```rust
use tauri::ipc::Channel;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreeningProgress {
    current: usize,
    total: usize,
    patient_id: String,
    criterion: String,
    result: String,
}

#[tauri::command]
async fn start_screening(
    state: tauri::State<'_, AppState>,
    study_nct_id: String,
    on_progress: Channel<ScreeningProgress>,
) -> Result<ScreeningJobResult, AppError> {
    let total = patients.len() * criteria.len();
    let mut current = 0;

    for patient in &patients {
        for criterion in &criteria {
            let result = evaluate(patient, criterion)?;
            current += 1;

            on_progress.send(ScreeningProgress {
                current,
                total,
                patient_id: patient.id.clone(),
                criterion: criterion.text.clone(),
                result: format!("{:?}", result),
            })?;
        }
    }

    Ok(job_result)
}
```

```typescript
// Frontend: Listen for progress events
import { Channel } from "@tauri-apps/api/core";

const onProgress = new Channel<ScreeningProgress>();
onProgress.onmessage = (progress) => {
  useScreeningStore.getState().updateProgress(progress);
};

await invoke("start_screening", {
  studyNctId: "NCT12345678",
  onProgress,
});
```

### Pagination

Paginate all large result sets:

```typescript
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
```

- Patient lists: 50 rows per page
- Screening results: 50 rows per page
- Audit log: 100 rows per page
- Analytics computations: Lazy-loaded (computed on demand, not on page load)

### Debounce Search Inputs

```typescript
import { useDebouncedCallback } from "use-debounce";

function PatientSearch() {
  const [query, setQuery] = useState("");
  const search = usePatientStore((s) => s.searchPatients);

  const debouncedSearch = useDebouncedCallback((value: string) => {
    search(value);
  }, 300); // 300ms debounce

  return (
    <Input
      value={query}
      onChange={(e) => {
        setQuery(e.target.value);
        debouncedSearch(e.target.value);
      }}
      placeholder="Search patients..."
    />
  );
}
```

### Lazy-Load Analytics

Analytics computations can be expensive. Compute them only when the user navigates to the analytics page:

```typescript
function AnalyticsPage() {
  const { stats, isLoading, fetchStats } = useAnalyticsStore();

  // Only fetch when component mounts (user navigates to analytics)
  useEffect(() => {
    if (!stats) {
      fetchStats();
    }
  }, []);

  // ...
}
```

### Memory Management

- Release large data structures when leaving a page (clear store slices)
- For screening results with thousands of entries, use virtual scrolling (`@tanstack/react-virtual`)
- Model files are memory-mapped by llama.cpp — do not attempt to load them into Rust memory

---

## 10. Integer Cents for Money

All financial calculations use integer arithmetic in cents (or the smallest currency unit). This follows the same convention as the TalOS web platform.

### Why Integer Arithmetic

Floating-point arithmetic causes rounding errors:
```
0.1 + 0.2 = 0.30000000000000004  // JavaScript
```

For financial calculations in clinical trials (site payments, procedure costs, budget tracking), even tiny rounding errors compound and cause reconciliation failures.

### Implementation

```rust
// Rust: All money values stored and computed as i64 cents
pub struct Money {
    pub cents: i64,
    pub currency: String, // ISO 4217 (e.g., "USD")
}

impl Money {
    pub fn from_dollars(dollars: f64) -> Self {
        Money {
            cents: (dollars * 100.0).round() as i64,
            currency: "USD".to_string(),
        }
    }

    pub fn to_dollars(&self) -> f64 {
        self.cents as f64 / 100.0
    }

    pub fn add(&self, other: &Money) -> Money {
        assert_eq!(self.currency, other.currency, "Currency mismatch");
        Money {
            cents: self.cents + other.cents,
            currency: self.currency.clone(),
        }
    }
}
```

```typescript
// TypeScript: Display formatting happens in the frontend only
function formatCurrency(cents: number, currency: string = "USD"): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(dollars);
}

// Example: formatCurrency(125050) => "$1,250.50"
```

### Database Storage

```sql
-- Store money as INTEGER cents
CREATE TABLE procedure_costs (
    id INTEGER PRIMARY KEY,
    procedure_name TEXT NOT NULL,
    cost_cents INTEGER NOT NULL,  -- e.g., 125050 = $1,250.50
    currency TEXT NOT NULL DEFAULT 'USD'
);
```

### Rules

1. **All arithmetic on cents**: Addition, subtraction, multiplication by integers
2. **Round once, at the boundary**: When converting from external float (e.g., CSV import), round to cents immediately
3. **Never divide cents**: If division is needed (e.g., splitting costs), use integer division and handle remainder explicitly
4. **Display formatting is frontend-only**: Backend returns cents; frontend formats for display
5. **Consistency with TalOS web platform**: The same `integer cents` convention is used across all TalOS products
