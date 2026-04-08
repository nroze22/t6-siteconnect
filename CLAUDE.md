# TalOS SiteConnect -- Project Super-Prompt

> **On-Premise Patient Screening Desktop Application for Clinical Research Sites**
>
> Built with Tauri v2 (Rust), React 19, SQLite/SQLCipher, and local LLM inference.

---

## SECURITY MANDATE

**Every feature, component, and function MUST enforce PHI locality.** Patient data NEVER leaves the device. Before writing any code, reference the relevant skill file.

**Non-negotiable controls:**

1. **PHI Locality**: All patient data processed and stored locally. No network transmission of PHI. Ever.
2. **Encryption at Rest**: SQLCipher (AES-256) encrypts the entire database. User passphrase required.
3. **Memory Safety**: PHI in Rust uses Zeroize trait. No PHI in logs. Clear sensitive data after use.
4. **Audit Trail**: Every sensitive operation (import, screen, export, override) logged locally.
5. **Graceful Degradation**: LLM failure never crashes the app. Falls back to rule-based screening.
6. **Telemetry Isolation**: Optional, opt-in only, k-anonymized (k>=5), user previews before send.

---

## Architecture

```
+---------------------------------------------------+
|              Tauri v2 Desktop Shell (Rust)         |
|  +-------------+  +-----------+  +-------------+  |
|  | Data Import |  | Screening |  |   Trial     |  |
|  |   Engine    |  |  Engine   |  | Discovery   |  |
|  +-------------+  +-----------+  +-------------+  |
|  +-------------+  +-----------+  +-------------+  |
|  | SQLCipher   |  |  LLM      |  | Analytics   |  |
|  |  Database   |  | Sidecar   |  |  Engine     |  |
|  +-------------+  +-----------+  +-------------+  |
+---------------------------------------------------+
|           React 19 Frontend (Vite + shadcn/ui)     |
|  +-------------+  +-----------+  +-------------+  |
|  | 3-Panel     |  |  Trial    |  | Population  |  |
|  | Screening   |  |  Search   |  | Analytics   |  |
|  +-------------+  +-----------+  +-------------+  |
+---------------------------------------------------+
|              Local Storage (Encrypted)             |
|  SQLite + SQLCipher + sqlite-vec                   |
|  patients / diagnoses / medications / lab_results  |
|  screening_results / studies / study_criteria      |
+---------------------------------------------------+
|         llama-server Sidecar (localhost HTTP)       |
|  Gemma-4-E4B or Gemma-4-E2B (GGUF, CPU-only)      |
+---------------------------------------------------+
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Tauri v2 (Rust backend, system WebView) |
| Frontend | React 19 + Vite + TypeScript |
| UI Library | shadcn/ui + Tailwind CSS |
| Data Grid | TanStack Table |
| Charts | Recharts |
| State | Zustand |
| Validation | Zod + React Hook Form |
| Local Database | SQLite + SQLCipher (AES-256) + sqlite-vec |
| LLM Inference | llama.cpp (llama-server sidecar) |
| Primary Model | Gemma-4-E4B-GGUF (Q4_K_M, ~5.0GB) |
| Alt Model | Gemma-4-E2B-GGUF (Q4_K_M, ~3.1GB) |
| Premium Model | Gemma-4-26B-A4B-GGUF (Q4_K_M, ~16.9GB, 24GB+ RAM) |
| NER Pipeline | spaCy + scispaCy (Python sidecar) |
| Data Import | Custom parsers (CSV, XLSX, FHIR JSON, CDA XML, HL7v2) |
| Icons | Lucide React |
| Animations | Framer Motion |
| Testing | Vitest + RTL + WebDriver |

---

## Project Structure

```
talos-siteconnect/
+-- src/                              # React frontend (Vite)
|   +-- App.tsx
|   +-- main.tsx
|   +-- components/
|   |   +-- ui/                       # shadcn/ui base components
|   |   +-- import/                   # Data import UI
|   |   +-- screening/               # 3-panel screening interface
|   |   +-- trials/                   # Trial search & discovery
|   |   +-- analytics/               # Population analytics
|   |   +-- settings/                # App configuration
|   |   +-- layout/                  # Shell, sidebar, header
|   +-- lib/
|   |   +-- tauri.ts                 # Typed Tauri invoke wrappers
|   |   +-- llm.ts                   # LLM client helpers
|   |   +-- formatters.ts           # Currency, dates, numbers
|   +-- hooks/                       # Custom React hooks
|   +-- stores/                      # Zustand stores
|   +-- types/                       # TypeScript type definitions
|   +-- styles/                      # Global styles
+-- src-tauri/                        # Tauri Rust backend
|   +-- src/
|   |   +-- main.rs
|   |   +-- commands/                # Tauri command handlers
|   |   +-- db/                      # SQLite + migrations
|   |   +-- import/                  # Data parsers
|   |   +-- screening/              # Screening engine
|   |   +-- llm/                    # LLM sidecar management
|   |   +-- ner/                    # NER sidecar management
|   |   +-- crypto/                 # Encryption + anonymization
|   |   +-- telemetry/             # Optional anonymized reporting
|   +-- Cargo.toml
|   +-- tauri.conf.json
+-- ner-service/                      # Python NER (bundled via PyInstaller)
+-- .agents/
|   +-- skills/                      # 6 skill files
|   +-- knowledge/                   # 10 knowledge files
+-- package.json
+-- vite.config.ts
+-- tsconfig.json
+-- tailwind.config.ts
```

---

## Skill References

| Task | Skill |
|------|-------|
| Building the screening engine | `.agents/skills/patient-screening-engine/SKILL.md` |
| Data import & parsing | `.agents/skills/data-import-pipeline/SKILL.md` |
| Security & encryption | `.agents/skills/desktop-security/SKILL.md` |
| LLM sidecar lifecycle | `.agents/skills/llm-sidecar-management/SKILL.md` |
| Trial search & financials | `.agents/skills/trial-discovery/SKILL.md` |
| Three-panel screening UI | `.agents/skills/screening-ui-three-panel/SKILL.md` |

---

## Knowledge References

| Topic | File |
|-------|------|
| HIPAA preparatory research | `.agents/knowledge/hipaa-preparatory-research.md` |
| Eligibility criteria patterns | `.agents/knowledge/clinical-trial-eligibility-criteria-patterns.md` |
| EMR data formats | `.agents/knowledge/emr-data-formats-reference.md` |
| Tauri v2 development | `.agents/knowledge/tauri-v2-development-reference.md` |
| llama.cpp sidecar | `.agents/knowledge/llama-cpp-sidecar-integration.md` |
| Clinical LLM prompts | `.agents/knowledge/clinical-llm-prompts.md` |
| Trial matching algorithms | `.agents/knowledge/trial-matching-algorithms.md` |
| Desktop security | `.agents/knowledge/desktop-security-architecture.md` |
| Site deployment | `.agents/knowledge/site-deployment-playbook.md` |
| Project conventions | `.agents/knowledge/project-conventions-desktop.md` |

---

## Key Conventions

### TypeScript
- `strict: true` -- no exceptions
- Never use `any` -- use `unknown` + type guards
- All Tauri invoke calls wrapped in typed functions in `lib/tauri.ts`
- Zod schemas validate all Tauri command responses

### Rust
- `thiserror` for error types, `anyhow` for command handlers
- PHI fields implement `Zeroize` + `ZeroizeOnDrop`
- All database operations return `Result<T, AppError>`
- Structured logging via `tracing` crate -- never log PHI
- Commands: snake_case in Rust, camelCase in JS

### Data
- Integer cents for all financial calculations
- SQLCipher for all database encryption
- Incremental imports with deduplication
- Soft deletes only for patient data

### Security
- No PHI in logs, telemetry, error messages, or network calls
- Passphrase required on app launch
- Session timeout (default 30 min)
- Export requires explicit user action + audit log entry
- K-anonymization (k>=5) for any aggregate reporting

### Testing
- Rust: #[cfg(test)] modules co-located
- React: .test.tsx co-located with components
- Coverage: 90% screening engine, 85% import, 80% UI
- E2E: WebDriver for critical flows

### Commits
- Conventional Commits: `feat(scope): description`
- Scopes: screening, import, trials, analytics, security, ui, llm

---

## Three-Panel Screening UI (Hero Feature)

The main screening interface has three resizable panels:

1. **Left -- Patient Rank List** (~250px): Sorted by eligibility score, search/filter, bulk actions
2. **Middle -- Criteria Detail** (flex): Selected patient's criterion-by-criterion breakdown with evidence
3. **Right -- Source Data** (~350px): Raw patient data with interactive highlighting linked to criteria clicks

Clicking a criterion in the middle panel highlights the corresponding source data in the right panel. Study details and I/E criteria accessible via slide-out panel.

---

## Hardware Tiers

| Tier | RAM | Model | Features |
|------|-----|-------|----------|
| Minimum | 4GB | Gemma-4-E2B (IQ2_M, ~2.3GB) | Basic AI screening |
| Recommended | 8GB | Gemma-4-E2B (Q4_K_M, ~3.1GB) | AI screening + structured JSON |
| Optimal | 16GB+ | Gemma-4-E4B (Q4_K_M, ~5.0GB) | Full AI features, 128K context |
| Premium | 24GB+ | Gemma-4-26B-A4B (Q4_K_M, ~16.9GB) | Near-frontier reasoning, 256K context |

---

## Build Order

1. Tauri v2 scaffold + React shell + shadcn/ui
2. SQLite + SQLCipher database layer
3. CSV/Excel import engine + column mapping UI
4. Study management + curated trial seed data with financials
5. Criteria parser (NL -> structured rules)
6. Rule-based screening (Tier 1)
7. llama-server sidecar integration
8. LLM-assisted screening (Tier 2)
9. Three-panel screening review UI
10. Trial search & discovery
11. Financial opportunity calculator
12. Population analytics dashboard
13. AI insights generation
14. FHIR/CDA import parsers + NER pipeline
15. Telemetry + auto-update + installer packaging

---

## Trial Data Strategy

**We do NOT browse all ClinicalTrials.gov.** Instead, we provide a curated, high-quality list of
studies augmented with estimated financial data. The seed dataset contains ~50 realistic trials
across oncology, cardiology, neurology, diabetes, rare disease, and immunology — each with:
- Real NCT numbers and study details sourced from public ClinicalTrials.gov data
- Estimated per-patient payments (researched from industry benchmarks)
- Payment models (per-visit, milestone, hybrid)
- Site startup fees
- Estimated enrollment timelines

The curated list ships with the app. Sites can also manually add custom studies.
Future: TalOS network will push new curated studies to sites via optional sync.

See: `.agents/knowledge/curated-trial-seed-data.md` for the full seed dataset.

---

## Strategic Context

SiteConnect is the Trojan horse for building the TalOS site network:
- **Phase 1** (Months 1-12): Deploy free tool to 30-50+ sites
- **Phase 2** (Months 6-18): Aggregate anonymized eligibility counts, build sponsor marketplace
- **Phase 3** (Months 12-24): Upsell to TalOS EDC/ePRO/Payments for study execution

The on-prem free tool is not the business — it's the customer acquisition strategy.
The real businesses are: sponsor marketplace, EDC/ePRO upsells, and network data insights.

**7 Structural Advantages**: Zero data risk, zero IT friction, financial intelligence (nobody else
shows the money), free to sites, AI transparency, operational intelligence, network without lock-in.

---

*Built for the Talosix Site Network Strategy. Get into the sites. Build the network. Own the supply side.*
