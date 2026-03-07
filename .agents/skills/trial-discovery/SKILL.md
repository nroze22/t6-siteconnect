# Skill: Trial Discovery & Financial Intelligence

> **Purpose**: Discover clinical trials from ClinicalTrials.gov, store them in a
> local SQLite database with full-text and semantic search, calculate financial
> opportunity metrics per trial, and generate sponsor pitch packages -- all
> running offline after initial data load.

---

## Table of Contents

1. [ClinicalTrials.gov Integration](#clinicaltrialsgov-integration)
2. [Trial Database Schema](#trial-database-schema)
3. [Search & Indexing](#search--indexing)
4. [Search UI](#search-ui)
5. [Financial Calculations](#financial-calculations)
6. [Revenue Dashboard](#revenue-dashboard)
7. [Sponsor Pitch Package](#sponsor-pitch-package)
8. [Custom Study Entry](#custom-study-entry)
9. [Sync Strategy](#sync-strategy)
10. [Testing](#testing)

---

## ClinicalTrials.gov Integration

### API v2 Reference

Base URL: `https://clinicaltrials.gov/api/v2/studies`

Key endpoints:

| Endpoint                   | Method | Description                     |
| -------------------------- | ------ | ------------------------------- |
| `/studies`                 | GET    | Search studies with filters     |
| `/studies/{nctId}`         | GET    | Get single study by NCT number  |
| `/version`                 | GET    | API version info                |

### Query Parameters

```
GET /api/v2/studies?
  query.cond=non-small+cell+lung+cancer    # Condition/disease
  &query.intr=pembrolizumab                 # Intervention
  &query.term=phase+3                       # General search term
  &filter.overallStatus=RECRUITING          # Status filter
  &filter.geo=distance(40.7128,-74.0060,50mi) # Geolocation filter
  &fields=NCTId,BriefTitle,EligibilityModule,StatusModule,SponsorCollaboratorsModule
  &pageSize=100                             # Max 1000
  &pageToken=<token>                        # Pagination cursor
  &sort=LastUpdatePostDate:desc             # Sort order
```

### Status Values

| API Status               | Display Label     |
| ------------------------ | ----------------- |
| `RECRUITING`             | Recruiting        |
| `NOT_YET_RECRUITING`     | Not Yet Recruiting|
| `ACTIVE_NOT_RECRUITING`  | Active            |
| `COMPLETED`              | Completed         |
| `ENROLLING_BY_INVITATION`| By Invitation     |
| `SUSPENDED`              | Suspended         |
| `TERMINATED`             | Terminated        |
| `WITHDRAWN`              | Withdrawn         |

### Fetching Studies

```rust
use reqwest;
use serde::Deserialize;

const API_BASE: &str = "https://clinicaltrials.gov/api/v2/studies";
const PAGE_SIZE: u32 = 100;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StudiesResponse {
    studies: Vec<ApiStudy>,
    next_page_token: Option<String>,
    total_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiStudy {
    protocol_section: ProtocolSection,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProtocolSection {
    identification_module: IdentificationModule,
    status_module: StatusModule,
    eligibility_module: Option<EligibilityModule>,
    description_module: Option<DescriptionModule>,
    design_module: Option<DesignModule>,
    sponsor_collaborators_module: Option<SponsorModule>,
    conditions_module: Option<ConditionsModule>,
    arms_interventions_module: Option<ArmsInterventionsModule>,
}

/// Fetch all studies matching a query, handling pagination.
async fn fetch_studies(
    condition: &str,
    status: Option<&str>,
) -> Result<Vec<ApiStudy>, FetchError> {
    let client = reqwest::Client::new();
    let mut all_studies = Vec::new();
    let mut page_token: Option<String> = None;

    loop {
        let mut url = format!(
            "{}?query.cond={}&pageSize={}",
            API_BASE,
            urlencoding::encode(condition),
            PAGE_SIZE,
        );

        if let Some(status_filter) = status {
            url.push_str(&format!("&filter.overallStatus={}", status_filter));
        }

        if let Some(ref token) = page_token {
            url.push_str(&format!("&pageToken={}", token));
        }

        let response: StudiesResponse = client
            .get(&url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| FetchError::Network(e.to_string()))?
            .json()
            .await
            .map_err(|e| FetchError::Parse(e.to_string()))?;

        all_studies.extend(response.studies);

        match response.next_page_token {
            Some(token) if !token.is_empty() => page_token = Some(token),
            _ => break,
        }
    }

    Ok(all_studies)
}
```

### Bulk Download (Offline Bootstrap)

For fully offline deployments, pre-load from the bulk download:

```
URL: https://clinicaltrials.gov/AllAPIJSON.zip
Size: ~3 GB compressed, ~15 GB uncompressed
Format: One JSON file per study in nested directories
```

```rust
/// Extract and parse the bulk download ZIP.
/// Only process studies matching target therapeutic areas.
async fn import_bulk_download(
    zip_path: &Path,
    db: &Database,
    therapeutic_areas: &[String],
    progress: impl Fn(u32, u32),
) -> Result<u32, ImportError> {
    let file = std::fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let total = archive.len() as u32;
    let mut imported = 0u32;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        if !entry.name().ends_with(".json") {
            continue;
        }

        let mut contents = String::new();
        entry.read_to_string(&mut contents)?;

        if let Ok(study) = serde_json::from_str::<ApiStudy>(&contents) {
            // Filter by therapeutic area if specified
            if should_import(&study, therapeutic_areas) {
                insert_study(db, &study)?;
                imported += 1;
            }
        }

        if i as u32 % 1000 == 0 {
            progress(i as u32, total);
        }
    }

    Ok(imported)
}
```

### Eligibility Criteria Parsing

The API returns eligibility criteria as a free-text block. Parse it into
structured individual criteria.

```rust
/// Parse eligibility criteria text into individual criterion rows.
///
/// Expected format:
/// ```text
/// Inclusion Criteria:
///   1. Age >= 18 years
///   2. Histologically confirmed NSCLC
///   - ECOG performance status 0-1
///
/// Exclusion Criteria:
///   1. Prior immunotherapy
///   2. Active autoimmune disease
/// ```
fn parse_eligibility_criteria(text: &str) -> Vec<ParsedCriterion> {
    let mut criteria = Vec::new();
    let mut current_type = CriterionType::Inclusion; // Default
    let mut criterion_number = 0u32;

    for line in text.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        // Detect section headers
        let lower = trimmed.to_lowercase();
        if lower.contains("inclusion criteria") || lower.contains("inclusion:") {
            current_type = CriterionType::Inclusion;
            criterion_number = 0;
            continue;
        }
        if lower.contains("exclusion criteria") || lower.contains("exclusion:") {
            current_type = CriterionType::Exclusion;
            criterion_number = 0;
            continue;
        }

        // Skip section-only lines (e.g., "Key Inclusion Criteria:")
        if lower.ends_with("criteria:") || lower.ends_with("criteria") {
            continue;
        }

        // Strip leading bullet/number markers
        let criterion_text = strip_leading_marker(trimmed);

        if criterion_text.is_empty() {
            continue;
        }

        criterion_number += 1;

        criteria.push(ParsedCriterion {
            criterion_type: current_type.clone(),
            number: criterion_number,
            text: criterion_text.to_string(),
            raw_line: trimmed.to_string(),
        });
    }

    criteria
}

/// Strip leading markers like "1.", "1)", "-", "*", "a.", etc.
fn strip_leading_marker(s: &str) -> &str {
    let s = s.trim_start_matches(|c: char| c == '-' || c == '*' || c == '\u{2022}');
    // Match patterns like "1.", "1)", "a.", "a)"
    let re = regex::Regex::new(r"^\s*(\d+|[a-zA-Z])[.)]\s*").unwrap();
    re.replace(s, "").trim().into()
}
```

### Study Data Mapping

```rust
/// Map an API study to our internal Study record.
fn map_api_study(api: &ApiStudy) -> StudyRecord {
    let proto = &api.protocol_section;
    let id_mod = &proto.identification_module;
    let status_mod = &proto.status_module;
    let elig = proto.eligibility_module.as_ref();
    let desc = proto.description_module.as_ref();
    let design = proto.design_module.as_ref();
    let sponsor = proto.sponsor_collaborators_module.as_ref();
    let conds = proto.conditions_module.as_ref();

    StudyRecord {
        nct_number: id_mod.nct_id.clone(),
        title: id_mod.brief_title.clone(),
        official_title: id_mod.official_title.clone(),
        status: status_mod.overall_status.clone(),
        phase: design
            .and_then(|d| d.phases.as_ref())
            .map(|p| p.join("/"))
            .unwrap_or_default(),
        sponsor_name: sponsor
            .and_then(|s| s.lead_sponsor.as_ref())
            .map(|s| s.name.clone())
            .unwrap_or_default(),
        conditions: conds
            .map(|c| c.conditions.join("; "))
            .unwrap_or_default(),
        summary: desc
            .map(|d| d.brief_summary.clone())
            .unwrap_or_default(),
        eligibility_criteria_text: elig
            .map(|e| e.eligibility_criteria.clone())
            .unwrap_or_default(),
        min_age: elig.and_then(|e| e.minimum_age.clone()),
        max_age: elig.and_then(|e| e.maximum_age.clone()),
        gender: elig
            .map(|e| e.sex.clone())
            .unwrap_or_else(|| "All".to_string()),
        enrollment_count: status_mod.enrollment_info
            .as_ref()
            .map(|e| e.count)
            .unwrap_or(0),
        last_updated: status_mod.last_update_submit_date.clone(),
        source: StudySource::ClinicalTrialsGov,
    }
}
```

---

## Trial Database Schema

### SQLite Schema

```sql
-- Core studies table
CREATE TABLE IF NOT EXISTS studies (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nct_number        TEXT UNIQUE,
    title             TEXT NOT NULL,
    official_title    TEXT,
    status            TEXT NOT NULL DEFAULT 'UNKNOWN',
    phase             TEXT,
    sponsor_name      TEXT,
    conditions        TEXT,  -- semicolon-separated
    summary           TEXT,
    eligibility_text  TEXT,
    min_age           TEXT,
    max_age           TEXT,
    gender            TEXT DEFAULT 'All',
    enrollment_count  INTEGER DEFAULT 0,
    therapeutic_area  TEXT,
    last_updated      TEXT,
    source            TEXT NOT NULL DEFAULT 'clinicaltrials.gov',
    -- Custom study fields
    is_custom         INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    deleted           INTEGER NOT NULL DEFAULT 0
);

-- Individual parsed criteria
CREATE TABLE IF NOT EXISTS study_criteria (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id        INTEGER NOT NULL REFERENCES studies(id),
    criterion_type  TEXT NOT NULL CHECK(criterion_type IN ('inclusion', 'exclusion')),
    criterion_number INTEGER NOT NULL,
    criterion_text  TEXT NOT NULL,
    -- Structured rule (populated by AI or manual entry)
    rule_json       TEXT,  -- JSON: { field, operator, value, unit }
    UNIQUE(study_id, criterion_type, criterion_number)
);

-- Financial estimates per study
CREATE TABLE IF NOT EXISTS study_financials (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id                  INTEGER NOT NULL UNIQUE REFERENCES studies(id),
    estimated_per_patient_cents INTEGER NOT NULL DEFAULT 0,
    enrollment_rate_pct       INTEGER NOT NULL DEFAULT 30,
    screen_failure_rate_pct   INTEGER NOT NULL DEFAULT 40,
    retention_rate_pct        INTEGER NOT NULL DEFAULT 85,
    notes                     TEXT,
    updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sync metadata
CREATE TABLE IF NOT EXISTS sync_metadata (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_type       TEXT NOT NULL,  -- 'full' | 'incremental'
    started_at      TEXT NOT NULL,
    completed_at    TEXT,
    studies_fetched INTEGER DEFAULT 0,
    studies_added   INTEGER DEFAULT 0,
    studies_updated INTEGER DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'in_progress',
    error           TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_studies_nct ON studies(nct_number);
CREATE INDEX IF NOT EXISTS idx_studies_status ON studies(status);
CREATE INDEX IF NOT EXISTS idx_studies_phase ON studies(phase);
CREATE INDEX IF NOT EXISTS idx_studies_sponsor ON studies(sponsor_name);
CREATE INDEX IF NOT EXISTS idx_studies_therapeutic ON studies(therapeutic_area);
CREATE INDEX IF NOT EXISTS idx_criteria_study ON study_criteria(study_id);
CREATE INDEX IF NOT EXISTS idx_criteria_type ON study_criteria(criterion_type);
```

### FTS5 Full-Text Search Index

```sql
-- Full-text search across study content
CREATE VIRTUAL TABLE IF NOT EXISTS studies_fts USING fts5(
    title,
    official_title,
    summary,
    conditions,
    eligibility_text,
    sponsor_name,
    content='studies',
    content_rowid='id',
    tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS studies_ai AFTER INSERT ON studies BEGIN
    INSERT INTO studies_fts(rowid, title, official_title, summary, conditions,
                           eligibility_text, sponsor_name)
    VALUES (new.id, new.title, new.official_title, new.summary,
            new.conditions, new.eligibility_text, new.sponsor_name);
END;

CREATE TRIGGER IF NOT EXISTS studies_ad AFTER DELETE ON studies BEGIN
    INSERT INTO studies_fts(studies_fts, rowid, title, official_title, summary,
                           conditions, eligibility_text, sponsor_name)
    VALUES ('delete', old.id, old.title, old.official_title, old.summary,
            old.conditions, old.eligibility_text, old.sponsor_name);
END;

CREATE TRIGGER IF NOT EXISTS studies_au AFTER UPDATE ON studies BEGIN
    INSERT INTO studies_fts(studies_fts, rowid, title, official_title, summary,
                           conditions, eligibility_text, sponsor_name)
    VALUES ('delete', old.id, old.title, old.official_title, old.summary,
            old.conditions, old.eligibility_text, old.sponsor_name);
    INSERT INTO studies_fts(rowid, title, official_title, summary, conditions,
                           eligibility_text, sponsor_name)
    VALUES (new.id, new.title, new.official_title, new.summary,
            new.conditions, new.eligibility_text, new.sponsor_name);
END;
```

### Vector Embeddings (sqlite-vec)

```sql
-- Semantic search via sqlite-vec extension
-- Embeddings generated by the local LLM or a small embedding model
CREATE VIRTUAL TABLE IF NOT EXISTS study_embeddings USING vec0(
    study_id INTEGER NOT NULL,
    embedding FLOAT[384]  -- Dimension depends on embedding model
);
```

```rust
/// Generate and store an embedding for a study.
async fn embed_study(
    db: &Database,
    study_id: i64,
    llm_client: &LlmClient,
    study_text: &str,
) -> Result<(), EmbedError> {
    // Use the LLM's embedding endpoint or a separate small model
    let embedding = llm_client.embed(study_text).await?;

    db.execute(
        "INSERT OR REPLACE INTO study_embeddings (study_id, embedding) VALUES (?1, ?2)",
        rusqlite::params![study_id, embedding.as_bytes()],
    )?;

    Ok(())
}

/// Semantic search: find studies similar to a query string.
async fn semantic_search(
    db: &Database,
    llm_client: &LlmClient,
    query: &str,
    limit: u32,
) -> Result<Vec<StudyRecord>, SearchError> {
    let query_embedding = llm_client.embed(query).await?;

    let results = db.query(
        "SELECT s.* FROM studies s
         INNER JOIN study_embeddings se ON s.id = se.study_id
         WHERE se.embedding MATCH ?1
         ORDER BY distance
         LIMIT ?2",
        rusqlite::params![query_embedding.as_bytes(), limit],
    )?;

    Ok(results)
}
```

---

## Search & Indexing

### Search Query Builder

```typescript
// frontend/src/lib/trial-search.ts

export interface TrialSearchParams {
  /** Free-text search query */
  query: string;
  /** Filter by therapeutic area */
  therapeuticArea?: string;
  /** Filter by trial phase */
  phase?: string[];
  /** Filter by recruitment status */
  status?: string[];
  /** Filter by sponsor name */
  sponsor?: string;
  /** Filter by indication / condition */
  indication?: string;
  /** Sort field */
  sortBy: 'relevance' | 'eligibleCount' | 'financialOpportunity' | 'lastUpdated';
  /** Sort direction */
  sortDir: 'asc' | 'desc';
  /** Pagination */
  page: number;
  pageSize: number;
}

export interface TrialSearchResult {
  studies: StudySummary[];
  totalCount: number;
  page: number;
  pageSize: number;
  searchTimeMs: number;
}

export interface StudySummary {
  id: number;
  nctNumber: string;
  title: string;
  phase: string;
  status: string;
  sponsorName: string;
  conditions: string;
  enrollmentCount: number;
  criteriaCount: { inclusion: number; exclusion: number };
  /** Financial opportunity if available */
  financialOpportunity?: FinancialOpportunity;
  /** Number of eligible patients (from screening results) */
  eligiblePatientCount?: number;
}
```

### SQL Query Generation

```rust
/// Build a search query from parameters.
/// Uses FTS5 MATCH for full-text and standard WHERE for filters.
fn build_search_query(params: &TrialSearchParams) -> (String, Vec<Box<dyn rusqlite::ToSql>>) {
    let mut conditions = Vec::new();
    let mut sql_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut param_idx = 1;

    // Always exclude soft-deleted
    conditions.push("s.deleted = 0".to_string());

    // Full-text search
    let use_fts = !params.query.is_empty();
    let base_table = if use_fts {
        // Join with FTS for relevance ranking
        format!(
            "studies_fts fts INNER JOIN studies s ON fts.rowid = s.id \
             WHERE fts.studies_fts MATCH ?{}",
            param_idx
        )
    } else {
        "studies s WHERE 1=1".to_string()
    };

    if use_fts {
        sql_params.push(Box::new(params.query.clone()));
        param_idx += 1;
    }

    // Status filter
    if let Some(ref statuses) = params.status {
        if !statuses.is_empty() {
            let placeholders: Vec<String> = statuses.iter().enumerate()
                .map(|(i, _)| format!("?{}", param_idx + i))
                .collect();
            conditions.push(format!("s.status IN ({})", placeholders.join(",")));
            for status in statuses {
                sql_params.push(Box::new(status.clone()));
                param_idx += 1;
            }
        }
    }

    // Phase filter
    if let Some(ref phases) = params.phase {
        if !phases.is_empty() {
            let placeholders: Vec<String> = phases.iter().enumerate()
                .map(|(i, _)| format!("?{}", param_idx + i))
                .collect();
            conditions.push(format!("s.phase IN ({})", placeholders.join(",")));
            for phase in phases {
                sql_params.push(Box::new(phase.clone()));
                param_idx += 1;
            }
        }
    }

    // Sponsor filter
    if let Some(ref sponsor) = params.sponsor {
        conditions.push(format!("s.sponsor_name LIKE ?{}", param_idx));
        sql_params.push(Box::new(format!("%{}%", sponsor)));
        param_idx += 1;
    }

    // Therapeutic area filter
    if let Some(ref area) = params.therapeutic_area {
        conditions.push(format!("s.therapeutic_area = ?{}", param_idx));
        sql_params.push(Box::new(area.clone()));
        param_idx += 1;
    }

    // Indication filter
    if let Some(ref indication) = params.indication {
        conditions.push(format!("s.conditions LIKE ?{}", param_idx));
        sql_params.push(Box::new(format!("%{}%", indication)));
        param_idx += 1;
    }

    // Sort
    let order_by = match params.sort_by.as_deref() {
        Some("lastUpdated") => "s.last_updated DESC",
        Some("eligibleCount") => "eligible_count DESC",
        Some("financialOpportunity") => "projected_revenue_cents DESC",
        _ if use_fts => "rank",  // FTS relevance
        _ => "s.last_updated DESC",
    };

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" AND {}", conditions.join(" AND "))
    };

    let offset = (params.page - 1) * params.page_size;

    let sql = format!(
        "SELECT s.* FROM {} {} ORDER BY {} LIMIT {} OFFSET {}",
        base_table, where_clause, order_by, params.page_size, offset,
    );

    (sql, sql_params)
}
```

---

## Search UI

### Search Bar Component

```typescript
// frontend/src/components/trials/TrialSearchBar.tsx

interface TrialSearchBarProps {
  onSearch: (params: TrialSearchParams) => void;
  isLoading: boolean;
}

export function TrialSearchBar({ onSearch, isLoading }: TrialSearchBarProps) {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<TrialFilters>(defaultFilters);

  // Debounced search on query change
  const debouncedSearch = useDebouncedCallback((q: string) => {
    onSearch({ query: q, ...filters, page: 1, pageSize: 20 });
  }, 300);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              debouncedSearch(e.target.value);
            }}
            placeholder="Search trials by condition, intervention, sponsor..."
            className="pl-9"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2">{activeFilterCount}</Badge>
          )}
        </Button>
      </div>

      {showFilters && (
        <TrialFilterPanel
          filters={filters}
          onChange={setFilters}
          onApply={() => onSearch({ query, ...filters, page: 1, pageSize: 20 })}
        />
      )}
    </div>
  );
}
```

### Filter Panel

```typescript
// frontend/src/components/trials/TrialFilterPanel.tsx

interface TrialFilterPanelProps {
  filters: TrialFilters;
  onChange: (filters: TrialFilters) => void;
  onApply: () => void;
}

export function TrialFilterPanel({ filters, onChange, onApply }: TrialFilterPanelProps) {
  return (
    <Card className="p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <Label>Therapeutic Area</Label>
          <Select
            value={filters.therapeuticArea}
            onValueChange={(v) => onChange({ ...filters, therapeuticArea: v })}
          >
            <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="oncology">Oncology</SelectItem>
              <SelectItem value="cardiology">Cardiology</SelectItem>
              <SelectItem value="neurology">Neurology</SelectItem>
              <SelectItem value="immunology">Immunology</SelectItem>
              <SelectItem value="rare_disease">Rare Disease</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Phase</Label>
          <MultiSelect
            options={['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4']}
            selected={filters.phase}
            onChange={(v) => onChange({ ...filters, phase: v })}
          />
        </div>

        <div>
          <Label>Status</Label>
          <MultiSelect
            options={['Recruiting', 'Not Yet Recruiting', 'Active']}
            selected={filters.status}
            onChange={(v) => onChange({ ...filters, status: v })}
          />
        </div>

        <div>
          <Label>Sponsor</Label>
          <Input
            value={filters.sponsor}
            onChange={(e) => onChange({ ...filters, sponsor: e.target.value })}
            placeholder="e.g., Pfizer"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={() => onChange(defaultFilters)}>
          Clear
        </Button>
        <Button onClick={onApply}>Apply Filters</Button>
      </div>
    </Card>
  );
}
```

### Results Display

```typescript
// frontend/src/components/trials/TrialResultsList.tsx

export function TrialResultsList({ results, viewMode, onSelect }: TrialResultsListProps) {
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.studies.map((study) => (
          <TrialCard key={study.id} study={study} onClick={() => onSelect(study)} />
        ))}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>NCT Number</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Phase</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Sponsor</TableHead>
          <TableHead>Eligible</TableHead>
          <TableHead className="text-right">Opportunity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.studies.map((study) => (
          <TableRow
            key={study.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => onSelect(study)}
          >
            <TableCell className="font-mono text-xs">{study.nctNumber}</TableCell>
            <TableCell className="max-w-xs truncate">{study.title}</TableCell>
            <TableCell><PhaseBadge phase={study.phase} /></TableCell>
            <TableCell><StatusBadge status={study.status} /></TableCell>
            <TableCell>{study.sponsorName}</TableCell>
            <TableCell>
              {study.eligiblePatientCount != null
                ? study.eligiblePatientCount
                : <span className="text-muted-foreground">--</span>
              }
            </TableCell>
            <TableCell className="text-right">
              {study.financialOpportunity
                ? formatCents(study.financialOpportunity.projectedRevenueCents)
                : <span className="text-muted-foreground">--</span>
              }
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

### Sort Controls

```typescript
// Available sort options
const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'eligibleCount', label: 'Eligible Patients' },
  { value: 'financialOpportunity', label: 'Financial Opportunity' },
  { value: 'lastUpdated', label: 'Last Updated' },
] as const;
```

---

## Financial Calculations

### Core Principle: Integer Cents

All monetary values are stored and calculated as integer cents to avoid
floating-point precision errors.

```typescript
/**
 * All money values in integer cents (USD).
 * $1.00 = 100 cents.
 * Never use floats for money.
 */

export interface FinancialOpportunity {
  /** Estimated revenue per patient in cents */
  estimatedPerPatientCents: number;
  /** Number of eligible patients in the local EHR */
  eligiblePatientCount: number;
  /** Expected enrollment rate (0-100) */
  enrollmentRatePercent: number;
  /** Expected screen failure rate (0-100) */
  screenFailureRatePercent: number;
  /** Expected retention rate through study completion (0-100) */
  retentionRatePercent: number;
  /** Projected number of patients who will actually enroll */
  projectedEnrollment: number;
  /** Projected total revenue in cents */
  projectedRevenueCents: number;
}

export interface FinancialAssumptions {
  enrollmentRatePercent: number;   // default: 30
  screenFailureRatePercent: number; // default: 40
  retentionRatePercent: number;     // default: 85
}

export const DEFAULT_ASSUMPTIONS: FinancialAssumptions = {
  enrollmentRatePercent: 30,
  screenFailureRatePercent: 40,
  retentionRatePercent: 85,
};
```

### Calculation Function

```typescript
/**
 * Calculate the financial opportunity for a study given eligible patients
 * and assumptions.
 *
 * Pipeline:
 *   eligible_patients
 *     * enrollment_rate        → approached_patients
 *     * (1 - screen_failure)   → enrolled_patients
 *     * retention_rate         → completing_patients
 *     * per_patient_revenue    → total_revenue
 */
export function calculateOpportunity(
  estimatedPerPatientCents: number,
  eligibleCount: number,
  assumptions: FinancialAssumptions = DEFAULT_ASSUMPTIONS,
): FinancialOpportunity {
  // Validate inputs
  if (estimatedPerPatientCents < 0) throw new Error('Per-patient value cannot be negative');
  if (eligibleCount < 0) throw new Error('Eligible count cannot be negative');

  const enrollmentRate = assumptions.enrollmentRatePercent / 100;
  const screenPassRate = (100 - assumptions.screenFailureRatePercent) / 100;
  const retentionRate = assumptions.retentionRatePercent / 100;

  // Integer math: multiply first, then divide to preserve precision
  const approachedPatients = Math.round(eligibleCount * enrollmentRate);
  const enrolledPatients = Math.round(approachedPatients * screenPassRate);
  const completingPatients = Math.round(enrolledPatients * retentionRate);

  const projectedRevenueCents = completingPatients * estimatedPerPatientCents;

  return {
    estimatedPerPatientCents,
    eligiblePatientCount: eligibleCount,
    enrollmentRatePercent: assumptions.enrollmentRatePercent,
    screenFailureRatePercent: assumptions.screenFailureRatePercent,
    retentionRatePercent: assumptions.retentionRatePercent,
    projectedEnrollment: completingPatients,
    projectedRevenueCents,
  };
}
```

### Formatting Utilities

```typescript
/** Format cents as USD currency string. */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

/** Format large cent values with abbreviations. */
export function formatCentsCompact(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  return formatCents(cents);
}
```

---

## Revenue Dashboard

### Dashboard Components

```typescript
// frontend/src/components/trials/RevenueDashboard.tsx

export function RevenueDashboard() {
  const { studies, assumptions, setAssumptions } = useTrialStore();

  const opportunities = useMemo(() =>
    studies
      .filter((s) => s.financialOpportunity)
      .sort((a, b) =>
        (b.financialOpportunity?.projectedRevenueCents ?? 0) -
        (a.financialOpportunity?.projectedRevenueCents ?? 0)
      ),
    [studies]
  );

  const totalRevenueCents = useMemo(() =>
    opportunities.reduce(
      (sum, s) => sum + (s.financialOpportunity?.projectedRevenueCents ?? 0),
      0
    ),
    [opportunities]
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Total Projected Revenue"
          value={formatCentsCompact(totalRevenueCents)}
          subtitle={`Across ${opportunities.length} studies`}
        />
        <MetricCard
          title="Total Eligible Patients"
          value={totalEligible.toString()}
          subtitle="Across all matched studies"
        />
        <MetricCard
          title="Avg Per-Patient Value"
          value={formatCents(avgPerPatientCents)}
          subtitle="Weighted average"
        />
      </div>

      {/* Assumption Sliders */}
      <Card className="p-4">
        <h3 className="font-medium mb-4">Financial Assumptions</h3>
        <div className="grid grid-cols-3 gap-6">
          <AssumptionSlider
            label="Enrollment Rate"
            value={assumptions.enrollmentRatePercent}
            onChange={(v) => setAssumptions({ ...assumptions, enrollmentRatePercent: v })}
            min={5} max={80} step={5}
          />
          <AssumptionSlider
            label="Screen Failure Rate"
            value={assumptions.screenFailureRatePercent}
            onChange={(v) => setAssumptions({ ...assumptions, screenFailureRatePercent: v })}
            min={10} max={70} step={5}
          />
          <AssumptionSlider
            label="Retention Rate"
            value={assumptions.retentionRatePercent}
            onChange={(v) => setAssumptions({ ...assumptions, retentionRatePercent: v })}
            min={50} max={100} step={5}
          />
        </div>
      </Card>

      {/* Top 10 Chart */}
      <Card className="p-4">
        <h3 className="font-medium mb-4">Top 10 Studies by Opportunity</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={opportunities.slice(0, 10)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="nctNumber" />
            <YAxis tickFormatter={(v) => formatCentsCompact(v)} />
            <Tooltip formatter={(v) => formatCents(v as number)} />
            <Bar dataKey="projectedRevenueCents" fill="#3B82F6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Detailed Table */}
      <OpportunityTable opportunities={opportunities} />
    </div>
  );
}
```

---

## Sponsor Pitch Package

### Input Data

```typescript
export interface PitchInput {
  /** Study details */
  study: StudySummary;
  /** Number and demographics of eligible patients */
  eligibleCount: number;
  demographics: {
    ageDistribution: { range: string; count: number }[];
    genderDistribution: { gender: string; count: number }[];
    raceDistribution: { race: string; count: number }[];
    insuranceDistribution: { type: string; count: number }[];
  };
  /** Site information */
  site: {
    name: string;
    address: string;
    piName: string;
    piCredentials: string;
    specialties: string[];
    previousTrialCount: number;
    averageEnrollmentRate: number;
    certifications: string[];
  };
  /** Financial projections */
  financialOpportunity: FinancialOpportunity;
}
```

### LLM-Generated Sections

```typescript
/**
 * Generate a sponsor pitch document using the local LLM.
 *
 * The document contains these sections:
 * 1. Executive Summary
 * 2. Patient Population Overview
 * 3. Enrollment Projection
 * 4. Site Capabilities & Experience
 * 5. Demographic Diversity
 * 6. Recommended Next Steps
 */
async function generatePitchPackage(
  input: PitchInput,
  llmClient: LlmClient,
): Promise<PitchDocument> {
  const systemPrompt = `You are a clinical research business development specialist.
Generate a professional sponsor pitch document for a clinical trial site.
Be specific, data-driven, and persuasive. Use the exact numbers provided.
Format each section with clear headers and bullet points where appropriate.`;

  const userPrompt = `Generate a sponsor pitch document for the following opportunity:

Study: ${input.study.title} (${input.study.nctNumber})
Phase: ${input.study.phase}
Sponsor: ${input.study.sponsorName}
Conditions: ${input.study.conditions}

Eligible Patients: ${input.eligibleCount}
Projected Enrollment: ${input.financialOpportunity.projectedEnrollment}

Site: ${input.site.name}
PI: ${input.site.piName}, ${input.site.piCredentials}
Previous Trials: ${input.site.previousTrialCount}
Historical Enrollment Rate: ${input.site.averageEnrollmentRate}%

Demographics:
${JSON.stringify(input.demographics, null, 2)}

Generate sections:
1. Executive Summary (2-3 paragraphs)
2. Patient Population Overview (with data tables)
3. Enrollment Projection (realistic timeline)
4. Site Capabilities & Experience
5. Demographic Diversity Statement
6. Recommended Next Steps`;

  const response = await llmClient.chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], narrativeGenerationParams());

  return parsePitchResponse(response.choices[0].message.content);
}
```

### Document Export

```typescript
/** Export pitch document as downloadable PDF or DOCX. */
async function exportPitchDocument(
  pitch: PitchDocument,
  format: 'pdf' | 'docx',
): Promise<Uint8Array> {
  // Use a template with site branding
  // Inject generated narrative content
  // Include data tables and charts as images
  // Return binary document
}
```

---

## Custom Study Entry

### Manual Study Form

```typescript
// frontend/src/components/trials/CustomStudyForm.tsx

interface CustomStudyFormData {
  title: string;
  sponsorName: string;
  nctNumber?: string;
  phase: string;
  therapeuticArea: string;
  conditions: string;
  summary?: string;
  inclusionCriteria: string; // One per line
  exclusionCriteria: string; // One per line
  estimatedPerPatientCents: number;
}

export function CustomStudyForm({ onSubmit, onCancel }: CustomStudyFormProps) {
  const form = useForm<CustomStudyFormData>({
    resolver: zodResolver(customStudySchema),
    defaultValues: {
      phase: 'Phase 3',
      therapeuticArea: 'oncology',
      estimatedPerPatientCents: 0,
    },
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <FormField name="title" label="Study Title" required />
        <FormField name="sponsorName" label="Sponsor" required />
        <FormField name="nctNumber" label="NCT Number" placeholder="Optional" />
        <PhaseSelect name="phase" />
      </div>

      <div>
        <Label>Inclusion Criteria (one per line)</Label>
        <Textarea
          {...form.register('inclusionCriteria')}
          rows={8}
          placeholder="Age >= 18 years&#10;Histologically confirmed diagnosis&#10;ECOG performance status 0-1"
        />
      </div>

      <div>
        <Label>Exclusion Criteria (one per line)</Label>
        <Textarea
          {...form.register('exclusionCriteria')}
          rows={6}
          placeholder="Prior immunotherapy&#10;Active autoimmune disease&#10;Uncontrolled brain metastases"
        />
      </div>

      <div>
        <Label>Estimated Per-Patient Value ($)</Label>
        <CurrencyInput
          name="estimatedPerPatientCents"
          control={form.control}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Create Study</Button>
      </div>
    </form>
  );
}
```

### AI-Assisted Criteria Parsing

When a user enters free-text criteria, the LLM can parse them into structured
rules for automated screening:

```typescript
async function parseCriteriaToRules(
  criteriaText: string[],
  llmClient: LlmClient,
): Promise<ParsedRule[]> {
  const prompt = `Parse each clinical trial eligibility criterion into a structured rule.
For each criterion, extract:
- field: the patient data field (age, diagnosis_code, lab_value, medication, etc.)
- operator: comparison operator (>=, <=, ==, !=, contains, not_contains, exists, between)
- value: the threshold or target value
- unit: unit of measurement if applicable
- confidence: how confident you are in the parsing (high/medium/low)

If a criterion is too complex or ambiguous for automated evaluation, set
operator to "manual_review" and explain in the notes field.

Criteria:
${criteriaText.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Respond in JSON format:
{ "rules": [ { "criterion_number": 1, "field": "...", "operator": "...", "value": "...", "unit": "...", "confidence": "...", "notes": "..." } ] }`;

  const response = await llmClient.chatCompletion(
    [
      { role: 'system', content: 'You are a clinical trial eligibility criteria parser.' },
      { role: 'user', content: prompt },
    ],
    criterionEvalParams(),
  );

  return JSON.parse(response.choices[0].message.content).rules;
}
```

### Human Review Step

After AI parsing, the user reviews and confirms each rule before screening:

```typescript
// frontend/src/components/trials/CriteriaRuleReview.tsx

export function CriteriaRuleReview({ criteria, parsedRules, onConfirm }: Props) {
  const [rules, setRules] = useState(parsedRules);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Review the AI-parsed rules below. Edit any that need correction,
        then confirm to enable automated screening.
      </p>

      {criteria.map((criterion, i) => (
        <Card key={i} className="p-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium">Criterion {i + 1}</p>
              <p className="text-sm text-muted-foreground">{criterion}</p>
            </div>
            <ConfidenceBadge confidence={rules[i]?.confidence} />
          </div>

          <div className="grid grid-cols-4 gap-2 mt-3">
            <Input
              label="Field"
              value={rules[i]?.field}
              onChange={(v) => updateRule(i, 'field', v)}
            />
            <Select
              label="Operator"
              value={rules[i]?.operator}
              options={OPERATORS}
              onChange={(v) => updateRule(i, 'operator', v)}
            />
            <Input
              label="Value"
              value={rules[i]?.value}
              onChange={(v) => updateRule(i, 'value', v)}
            />
            <Input
              label="Unit"
              value={rules[i]?.unit}
              onChange={(v) => updateRule(i, 'unit', v)}
            />
          </div>
        </Card>
      ))}

      <Button onClick={() => onConfirm(rules)}>
        Confirm Rules & Enable Screening
      </Button>
    </div>
  );
}
```

---

## Sync Strategy

### Default: Fully Offline

The application ships with a pre-loaded trial database containing studies from
target therapeutic areas. No internet connection is required for core
functionality.

### Manual Sync

```typescript
// frontend/src/components/trials/SyncControls.tsx

export function SyncControls() {
  const { lastSyncDate, syncStatus, triggerSync } = useTrialStore();

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground">
        Last synced: {lastSyncDate
          ? formatRelativeDate(lastSyncDate)
          : 'Never (using pre-loaded data)'}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={triggerSync}
        disabled={syncStatus === 'syncing'}
      >
        {syncStatus === 'syncing' ? (
          <>
            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
            Syncing...
          </>
        ) : (
          <>
            <RefreshCw className="h-3 w-3 mr-2" />
            Sync Trials
          </>
        )}
      </Button>
    </div>
  );
}
```

### Incremental Sync Logic

```rust
/// Perform an incremental sync: only fetch studies modified since last sync.
async fn incremental_sync(
    db: &Database,
    therapeutic_areas: &[String],
) -> Result<SyncResult, SyncError> {
    let last_sync = db.get_last_successful_sync()?;
    let since_date = last_sync
        .map(|s| s.completed_at)
        .unwrap_or_else(|| "2020-01-01".to_string());

    let sync_id = db.start_sync("incremental")?;
    let mut added = 0u32;
    let mut updated = 0u32;

    for area in therapeutic_areas {
        let studies = fetch_studies(area, Some("RECRUITING")).await?;

        for study in &studies {
            let record = map_api_study(study);

            match db.get_study_by_nct(&record.nct_number)? {
                Some(existing) => {
                    if existing.last_updated != record.last_updated {
                        db.update_study(&record)?;
                        updated += 1;
                    }
                }
                None => {
                    db.insert_study(&record)?;
                    added += 1;
                }
            }
        }
    }

    db.complete_sync(sync_id, added, updated)?;

    Ok(SyncResult { added, updated })
}
```

---

## Testing

### Unit Tests

```typescript
describe('calculateOpportunity', () => {
  it('calculates projected revenue correctly', () => {
    const result = calculateOpportunity(
      1000_00, // $1,000 per patient
      100,     // 100 eligible
      DEFAULT_ASSUMPTIONS,
    );

    // 100 * 0.30 = 30 approached
    // 30 * 0.60 = 18 enrolled (40% screen fail)
    // 18 * 0.85 = 15 completing (rounded)
    expect(result.projectedEnrollment).toBe(15);
    expect(result.projectedRevenueCents).toBe(15 * 1000_00);
  });

  it('handles zero eligible patients', () => {
    const result = calculateOpportunity(1000_00, 0, DEFAULT_ASSUMPTIONS);
    expect(result.projectedRevenueCents).toBe(0);
  });

  it('rejects negative per-patient value', () => {
    expect(() => calculateOpportunity(-100, 10, DEFAULT_ASSUMPTIONS)).toThrow();
  });

  it('uses integer math throughout', () => {
    const result = calculateOpportunity(333_33, 7, DEFAULT_ASSUMPTIONS);
    // All intermediate values should be integers
    expect(Number.isInteger(result.projectedEnrollment)).toBe(true);
    expect(Number.isInteger(result.projectedRevenueCents)).toBe(true);
  });
});

describe('parseEligibilityCriteria', () => {
  it('splits inclusion and exclusion sections', () => {
    const text = `
Inclusion Criteria:
  1. Age >= 18
  2. NSCLC diagnosis

Exclusion Criteria:
  1. Prior IO therapy
    `;

    const criteria = parseEligibilityCriteria(text);
    expect(criteria.filter(c => c.criterion_type === 'inclusion')).toHaveLength(2);
    expect(criteria.filter(c => c.criterion_type === 'exclusion')).toHaveLength(1);
  });

  it('handles various bullet styles', () => {
    const text = `
Inclusion Criteria:
- Age >= 18
* ECOG 0-1
1. Adequate organ function
a) Signed consent
    `;

    const criteria = parseEligibilityCriteria(text);
    expect(criteria).toHaveLength(4);
    expect(criteria[0].text).toBe('Age >= 18');
  });
});
```

### Integration Tests

- Mock the ClinicalTrials.gov API with realistic response payloads.
- Test full fetch-parse-store-search pipeline.
- Test FTS5 search returns relevant results.
- Test incremental sync only updates changed studies.
- Test financial calculations with edge cases (0 patients, 100% screen fail, etc.).

---

## Checklist

Before modifying the trial discovery system:

- [ ] All monetary values in integer cents, never floats
- [ ] ClinicalTrials.gov API calls handle pagination via pageToken
- [ ] Eligibility criteria parser handles varied bullet/numbering formats
- [ ] FTS5 triggers kept in sync with studies table
- [ ] Search debounced at 300ms on the frontend
- [ ] Sync metadata tracks start/end times and counts
- [ ] Custom studies marked with `is_custom = 1`
- [ ] AI-parsed rules require human review before screening
- [ ] Offline mode works with pre-loaded database
- [ ] All API responses validated before insertion
