# Request-aware source review — alpha update

September 8, 2026. Synthetic files only.

## Implemented

The laboratory release workflow and extraction backend now share one versioned request definition. Request-focused extraction is the default for the next narrative run; the generic extraction option remains available. Each returned candidate identifies a requested field. The backend rejects unknown request versions and validates field identities; the reviewer checks field/category consistency as well as source quotes.

Request coverage distinguishes Not assessed, Not found, Uncertain, Evidence found and Not applicable. Narrative evidence is document-level: it does not establish that every observation has every required field, that a patient belongs to the cohort, or that dates fall inside the request window. Not found may mean model omission. Structured laboratory inputs report actual supplied-field counts and retain the existing cohort/quality/release engine.

The reviewer inbox groups source mismatches, missing units, uncertain/historical context and patient-association questions. Reviewers can correct a source-grounded annotation or reject a suggestion with a recorded reason. Corrections preserve original model output, require a new review decision and cannot edit original parsed records. Reopened rejections remain in change history.

Open questions carry the request field, source hash, time, status and reason. Unresolved questions block loading a file into the laboratory release workflow. They can still be exported with the review. Resolution requires a recorded explanation; it does not supply a missing value or bypass the existing release checks. Optional reference intervals and missing-result reasons can be recorded as not applicable with a reason.

Review exports contain the request definition/key, findings, open-question history, original annotations, effective reviewed annotations, correction/rejection history and original source evidence. Questions are retained when an approved structured source is explicitly loaded into the synthetic journal. Unsaved narrative review state remains in memory; export before closing or rerunning. A new file or extraction starts a new review, rather than carrying decisions into another source.

## Verification

- 278 frontend tests passed, including source-grounded correction, rejection reasons, unprocessed-vs-missing states, unsupported fields and structured completeness boundaries.
- 118 native tests passed; the Apple Silicon debug application built.
- Browser: uploaded the 144-row CSV; saw source-field counts, absent reference intervals and unestablished eligibility; recorded an uncertain terminology question; reviewed the file; confirmed laboratory import was disabled while review export worked. The downloaded review retained the request version and source-bound question. Recording a resolution re-enabled import.
- Native file-dialog and screen verification remains separate; the Mac was locked during the preceding native UI checks. Local model requests were exercised directly through Ollama.

## Model results and limits

The request-labs/2 profile passed three of four small synthetic checks in this run. It preserved two measurements, a missing unit and an empty administrative response. In the comparator/status case it returned the correct status value but invented a source label; exact-source validation blocks that candidate. Median elapsed time across these four cases was 13.58 seconds, with a bounded repair attempt when needed.

A richer note returned eight of nine expected field values after repair in 54.7 seconds. The source test code was omitted and the birth-date category did not match the request schema convention; these remain review items. It did not extract the unrelated medication. These are development checks, not held-out clinical validation, a claim of complete metadata extraction or a guarantee for other documents/models.

The update improves request binding, visibility of gaps and operator control. It does not implement a second independent clinical-model verification pass, automatic cross-document correction/supersession resolution, persistent site-specific mappings, reviewer identity/authentication or a representative annotated evaluation corpus. Those remain next steps. Existing Docling, basic-reader and synthetic-only security/integration boundaries remain documented in DOCLING-INTEGRATION.md.

## Demo

1. Open Local AI and load the synthetic example note or request-context.txt. Keep request focus selected, run the local model and expand Request coverage.
2. Inspect missing or uncertain fields, then use the inbox to inspect a source mismatch. Correct the annotation using exact source text and explain why; review it again.
3. Record an open question for missing evidence. Export the review with its questions.
4. Open laboratory-source.csv from the existing sample kit. Record an uncertain question, review the parsed fields and demonstrate that laboratory import remains blocked.
5. Resolve the question with a reason. Load the source, then use the existing quality checks, explicit package review and simulated delivery flow.

No candidate is automatically imported into a laboratory release. Evidence found is not hospital authorization, cohort eligibility or clinical validation.
