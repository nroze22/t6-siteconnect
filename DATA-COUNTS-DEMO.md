# SiteConnect · Data COUNTS internal demo

This is an alpha rehearsal built on existing SiteConnect code. It is not a finished NIH client, a validated privacy implementation, or a production deployment. The native app is Tauri + React + Rust (not Electron). It retains the desktop/local-processing foundation and original workspaces.

## Open and present

The supplied Mac app is a local Apple Silicon debug build, not a signed/notarized distribution release. It starts with Data COUNTS selected on first use of this build. It subsequently remembers the workspace you choose. Existing database files and the old workspace preference are not overwritten. Native clinical workspaces still require their original database passphrase; use **Return to synthetic rehearsal** if you do not want to unlock them. Never delete an existing database to access this demo.

For development, use Node and Rust/Tauri prerequisites, then:

```sh
npm ci
npm run dev -- --host 127.0.0.1
# Browser preview: http://127.0.0.1:1420
# Or, with the preview stopped, run the native development app:
npm run tauri dev
```

The native build embeds the interface and synthetic records; the core rehearsal does not require a development server, hospital connection or model download. Browser and desktop rehearsal sessions are separate. No hospital records can be uploaded through the new mode. Native JSON exports use the OS save dialog; browser exports use downloads.

## Five-minute presentation

1. **Overview:** introduce Northfield, a fictional hospital. There are 12 synthetic patients, two visits per patient and six laboratory tests: creatinine, urea nitrogen, sodium, potassium, glucose and hemoglobin. Values vary across patients and visits. They are illustrative, not a clinically validated dataset.
2. **Request:** show the versioned adult laboratory request for August 2026. It is an internal example, not an NIH-issued schema or actual authorized request. Download its JSON. Explain that original codes, values, units and timestamps matter.
3. **Source records:** inspect SYN-003 and its original source JSON. Source exports use FHIR R4-style Patient and Observation resources. The output uses an explicitly named demo schema. The source bundle is not externally conformance-certified.
4. **Run quality checks:** source v1 has 145 observations. A missing unit and a duplicate resource ID produce two release blockers. No output is authorized. AI does not infer the unit or silently discard a row.
5. **Load corrected source v2**, then run checks again. This selects a supplied corrected fixture, preserving the original fixture. The 144 records reconcile to 120 output + 12 adult-cohort exclusions + 12 permission exclusions. All exclusions are disjoint. The output contains 10 patients.
6. **Release & delivery:** review the exact request/source/eligibility versions, counts and SHA-256 digest. Check the review box and authorize this synthetic package. Export it. Date shifts preserve within-patient intervals, but the offsets and DEMO tokens are illustrative and unsuitable for real privacy protection.
7. **Simulate send with lost receipt**, then **Check simulated receipt**. This is a local simulator with no network transmission. Its single ingestion is reconciled; a repeated package does not create another ingestion.
8. Optional: **Overview → Apply synthetic revocation**, then rerun. SYN-003's 12 rows are excluded from the new snapshot: 108 output + 12 cohort + 24 permission exclusions = 144. Prior approval is invalidated. Historical receipts remain historical; this does not recall previously delivered data.
9. **Activity:** export local evidence. **Reset rehearsal** resets only this synthetic session. Use the workspace selector to show the retained Screening, Feasibility, Registry, Analytics and Full Access modes.

## Local model changes

The setup catalog now offers Gemma 4 E2B, E4B, 12B and 26B, retaining a Gemma 3 1B fallback. Automatic recommendations are conservative: E4B at 24 GB+ total RAM, E2B at 16 GB+, legacy lite below that where feasible. Model file size is not runtime memory. These are planning choices, not machine-specific performance guarantees.

Download sizes and tags were checked against the [Ollama Gemma 4 catalog](https://ollama.com/library/gemma4) on September 8, 2026. The optional System panel calls the existing native adapter, warms an installed model and extracts a synthetic note. It never inserts that output into the clinical database or uses it to authorize a package. Extraction prompting now requires explicit source evidence and prohibits inventing diagnoses, codes, dates or units.

No running/configured Ollama model was available during verification. The native missing-model message was tested; live extraction quality and latency were not benchmarked. To demonstrate AI, configure a local model through the existing native Settings workflow and verify the supplied note before presenting. The structured laboratory rehearsal remains fully usable without AI.

## RFI alignment and remaining work

The reference is RFI **75N95C26R00005**, not an awarded contract. This implementation demonstrates selected behaviors; it does not establish compliance with the whole RFI.

| RFI requirement | Rehearsal coverage | Still required for a real client |
|---|---|---|
| 1 · Local leave-behind and lifecycle | Packaged local app; preserved desktop foundation | Hospital installer, supported VM environments, operator training, maintenance ownership and upgrades |
| 2 · Approved machine-readable request | Fixed, versioned example request and bound package | Authoritative signed/approved requests, complete schema enforcement and amendment workflow |
| 3 · Data quality | Actual fixture completeness, duplicate, numeric and date-sequence checks; correction gate | General source adapters, full validation rules and per-patient count policies |
| 4 · De-identification | Illustrative consistent date shifts | Validated identifier removal and approved de-identification method |
| 5 · PPRL | Clearly labeled DEMO tokens | Approved irreversible, cross-site-consistent linkage implementation and governance |
| 6 · Source fidelity | Preserved source code, unit, value, timestamp and revision evidence | General metadata/permissions preservation across all requested data types |
| 7 · Eligibility | Separate cohort and permission exclusions; revocation invalidates approval | Authoritative eligibility integration, effective dates and full revocation policy |
| 8 · Updates | Stable snapshot identity and controlled reruns/permission refresh | General incremental changes, source deletes, merges and correction semantics |
| 9 · Reconciliation | Actual stage-count reconciliation and release gate | Durable production stage ledger and all failure/recovery cases |
| 10 · Security attestations | No attestation claimed | Required BA/security agreements and institutional review |
| 11 · SIEM | Exportable local synthetic activity | Protected continuous hospital SIEM integration and tamper-resistant audit |
| 12 · Encryption and egress | Existing encrypted clinical DB foundation; rehearsal isolated | Encrypted output, approved TLS, endpoint allowlisting and full VM/egress controls |
| 13 · Hospital identity | No vendor broker credentials or remote access used by rehearsal | Hospital-managed VM/service identity and approved credentials |
| 14 · Performance | Small, functional lab scenario | Defined baseline/2×/5× load tests on target hardware |
| 15 · Broker delivery | Actual local digest/retry/reconciliation logic against simulator | Real protocol, durable queue, authenticated receipts, encrypted transport and recovery |

## Code and maintenance

- The new mode has its own synthetic session key. The old workspace preference is retained under its old key, while the new mode selector uses a versioned key. Reset does not clear clinical stores.
- The new mode does not start the clinical demo-data loader, file watcher or background extraction queue. Clinical database setup/unlock remains in place outside this mode.
- Existing FHIR lab normalization now preserves LOINC and full observation timestamps, updates a stable observation row on repeated import, and skips missing vital values instead of manufacturing zero. Full multi-source identity, deletes and merges remain future work.
- Every newly opened pooled SQLCipher connection is keyed. Relevant Epic and note-import audit writes use the checksum writer and surface failures. This is a bounded repair, not a complete audit/security redesign.
- Native import errors no longer fall through to a fake successful browser import.
- Regenerate committed examples with `npm run demo:fixtures`. This emits request, source v1/v2, permissions and expected outputs under `sample-data/data-counts/`.
- For demo updates, rebuild the app, retain prior binaries and rerun the walkthrough. Review request/source/schema version changes; do not silently carry an old approval to changed output. There is no automatic updater or production rollback system in this alpha.

## Verification

- TypeScript and Vite production build passed.
- 223 frontend tests passed; 108 Rust tests passed.
- Added regression coverage: source defects block release; exact counts; code/unit and time-interval preservation; stable identity; revocation invalidates approval; no duplicate simulated ingestion; FHIR-shaped source exports; pooled encrypted connections across reopen; lab update preservation; no fabricated zero vital.
- Browser walkthrough verified corrected release, authorization, lost-receipt reconciliation, 108-row revocation refresh, retained Screening workspace and reset.
- Packaged Apple Silicon app launched at `tauri://localhost`. Native request export saved and its JSON was read back. Native missing-model behavior and return from database unlock to the isolated rehearsal were verified.
- Existing compiler warnings and a large frontend bundle warning remain. No real hospital connection, live broker, approved PPRL, model inference benchmark, load test, signed installer or production upgrade was verified.
