# SiteConnect operations refinement

This revision implements improvements across the seven review areas within the synthetic alpha. It does not turn the prototype into an authenticated hospital system or establish compliance.

## Delivered behavior

| Review area | Change |
|---|---|
| Workspace density | Compact guidance, a single operational tab row, a brief synthetic banner with expandable detail, and a larger source table viewport. Removed the duplicate overview progress strip. |
| Accurate progress | “Request loaded” describes an automated state without implying human review. Passed source checks show the correct next action. Stored approval is visible after reopening. |
| Persistent model setup | A native task owns installation rather than a React panel. A journal remembers the model and setup phase. Navigation can detach and reconnect. Cancel preserves installed files; interrupted setup offers explicit resume. Reopening requires response verification before the model becomes active. |
| Release decision | Counts, destination, scope of approval, exclusions and changes lead the screen. Technical identifiers are expandable. A readable text summary accompanies JSON export. Approved snapshots provide a previous/current comparison. |
| Clinical scenarios | Source v3 adds corrected creatinine, a cancelled result, a supplied sodium interval, potassium expressed as “<2.5 mmol/L”, and a missing glucose result. Cancelled/missing values have a reason rather than fabricated numeric data. Request/schema v3 explicitly includes lifecycle and source-context fields. |
| Administration | Model setup, diagnostics and rehearsal reset are under Administration. The legacy workspace selector remains explicit. A pending model job can be reopened from the operational status notice. |
| Durable operations | Native rehearsal state migrates to a separate SQLite transaction journal. FULL synchronous commits, revision conflict checks and chained integrity digests preserve ordered snapshots. The renderer gates release on a successful save. Browser preview retains browser storage. |

## Important operational boundaries

The journal holds synthetic data only and uses a separate file from the existing clinical database. On Unix its main file is restricted to the user. Hash chaining detects accidental or unsophisticated edits; it is not a signed, externally anchored or immutable audit trail, and someone with write access could rewrite the chain. The journal is not encrypted patient storage. Do not import PHI into it.

Approval remains a clearly labeled demo action. No hospital identity provider, role authorization, electronic signature or institutional approval policy is configured. A production identity-provider choice was requested. Neither a display name nor an operating-system username is being substituted for authenticated hospital approval.

The delivery endpoint is still a local simulator. The durable demo recovery test does not validate a real broker, queue protocol or authenticated receipt. Prior delivered packages are historical; permission changes do not recall them.

Cancellation stops SiteConnect's download request when possible and preserves local files. It does not delete models, cancel unrelated Ollama clients, or forcibly terminate an external runtime installer. During runtime installation it takes effect after the current installer step. A full application quit interrupts the native task; resume rechecks installed files rather than blindly treating the old phase as completed.

The lifecycle scenario is a controlled example, not a general FHIR adapter. Its cancellation notices are intentionally included as records in request v3; they are not measured results. Source-provided intervals are illustrative, not general clinical reference guidance. Method-specific mappings, diagnostic reports, source deletes/merges and general source integration remain future work.

## Verification evidence

- Frontend and Rust checks cover numeric/missing/cancelled result semantics, five-record comparison, stale source approval, job reattachment, restored errors, journal transaction conflicts, altered history and reopen recovery.
- Native session migration preserved the supplied synthetic source state and displayed “Saved to native transaction journal.”
- A baseline request-v3 package was approved and sent to the simulator. The application was closed while its receipt was unknown. On reopening, the same package, approval and single ingestion were restored; checking the receipt reconciled that one ingestion.
- Loading lifecycle source v3 retained the prior approved snapshot, produced five changed records and kept new authorization disabled until review.
- All 243 frontend tests and 113 Rust tests passed, and the Apple Silicon debug app built successfully.
- The actual Ollama runtime and Gemma 4 E2B model installed on this Mac. Cancellation, resume and restart recovery were exercised; the native job then completed its real response check. This does not establish clinical extraction accuracy. The final completed screen was not rechecked because the Mac was locked.

## Remaining production acceptance gates

Hospital identity and reviewer authorization; encrypted storage/output and managed keys; approved de-identification/linkage; real source and broker integration; signed update/rollback packages; target-platform clean installs, performance tests and failure injection. These depend on institutional integration choices and cannot be honestly completed with synthetic fixtures alone.
