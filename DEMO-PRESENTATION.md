# SiteConnect presentation kit

Latest: REQUEST-REVIEW.md documents request-focused extraction, the reviewer inbox, source-grounded corrections and the open-question gate.

New: DOCLING-INTEGRATION.md documents the advanced PDF reader, setup prerequisites, scan fixtures and current verification. The prior note/source timing below remains historical.

## Before the audience arrives

1. Open the updated Apple Silicon debug application. This is a local alpha build, not a signed production distribution.
2. In Administration, open Model setup. Resume/verify Gemma 4 E2B if the application has restarted. Installed files are reused; do not plan a model download during the meeting.
3. Select Check demo preparation. The native checks exercise a temporary file write/read, available working space, the fixed laboratory story and an optional model response. The file check does not prove permissions for an arbitrary destination folder.
4. Resolve any unknown receipt before starting fresh. Start fresh guided demo replaces the active synthetic rehearsal while retaining native journal revisions.
5. Open Local AI and load `sample-data/extraction/lab-pair.txt`. Extract and review each source quote. Narrative annotations do not modify releases. Optionally open `laboratory-source.xlsx`, review its fields and explicitly load it as the synthetic laboratory source. See SOURCE-EXTRACTION-REVIEW.md for the new workflow and current benchmark.
6. Export one package to the actual presentation folder and open it. Test the presentation display, sleep/wake and a full native offline restart. These machine-level checks are not replaced by browser testing.
7. Keep SiteConnect-Product-Video.mp4 available locally as a captioned backup. It has a quiet original music bed and works muted; there is no voiceover.

## Five-minute story

| Time | Show | Say |
|---|---|---|
| 0:00–0:40 | Request | A site starts with a defined cohort, window and field list. This is a synthetic Data COUNTS-focused example. |
| 0:40–1:30 | Quality blockers and source | The app identifies a missing unit and duplicate. We load a supplied corrected extract; no AI guesses the unit. |
| 1:30–2:30 | Local AI | Two candidate measurements appear beside exact source quotes. Review each; nothing is automatically imported. |
| 2:30–3:40 | Release & delivery | The corrected baseline accounts for 144 source records: 120 prepared, 12 excluded by age and 12 by fixture permission. Review, demo-authorize and export. |
| 3:40–4:30 | Lost receipt and recovery | Send to the simulator, reopen, then reconcile. The same package remains and the ingestion count stays at one. |
| 4:30–5:00 | Completion | Propose a bounded synthetic-data pilot with site operators. Explain the remaining integrations. |

Optional extension: load the later laboratory fixture and review five changed records, including a corrected result, cancellation, supplied reference interval, comparator and missing-result reason. Any prior authorization is invalidated.

## Capability sheet

**Working locally:** deterministic fixture checks, explicit source revision handling, source/output comparison, package export, saved synthetic state, model setup recovery and optional local extraction.

**Simulated:** authority/permissions, privacy tokens and date shifts, broker delivery and receipts. Demo approval is not hospital authorization.

**Integration work:** hospital authentication and reviewer roles, encrypted patient storage and key management, approved privacy/linkage, actual source and broker adapters, signed distribution/update/rollback, institution-specific acceptance and clinical validation.

SiteConnect is an alpha starting point. Do not claim deployed hospital clients, NIH endorsement, validated PPRL, compliance certification or clinical accuracy across arbitrary notes.

## Current verification

The new source extraction profile and file workflow are documented in SOURCE-EXTRACTION-REVIEW.md. Timing below for the previous fixed-note command is historical and does not describe the new broader profile.

- 271 frontend tests and 118 Rust tests passed; the Apple Silicon debug app built.
- Browser journey: two blockers → corrected source → 120-observation export and readable summary → unknown receipt → reload → same package reconciled, one ingestion.
- Loaded browser workflow continued with browser networking disabled. This is not a native clean-start offline test.
- 1024×768 browser layout had no page-level horizontal overflow. Keyboard focus reached the next operational tab. This is a focused check, not an accessibility certification or projector test.
- The shared extraction request was run against local Gemma 4 E2B three times: 7.25s, 2.68s and 2.70s. All three returned both exact measurements with source quotes. This is one fixed synthetic note, not a representative clinical validation set.
- The Mac was locked during the new native UI verification. The new note screen, native export preflight command and presentation-folder dialog still need on-device confirmation after unlock. The earlier native installer, download cancellation/resume and journal restart tests remain documented separately.

## Marketing assets

The one-pager uses an actual alpha screenshot. The 70-second product video is an edited, captioned montage of captured browser UI with gentle motion and an original synthesized music bed. It is not a continuous native screen recording. The AI segment is explicitly an evidence graphic from the real local API benchmark, not a fabricated app screenshot.

The PDF and video retain synthetic/alpha/simulated labels. The video ends with the integration boundary and invitation to define a pilot.

Technical references for the narrow local note request: [Ollama chat API](https://docs.ollama.com/api/chat) and [structured outputs](https://docs.ollama.com/capabilities/structured-outputs). The native command and benchmark share the same bundled request specification.
