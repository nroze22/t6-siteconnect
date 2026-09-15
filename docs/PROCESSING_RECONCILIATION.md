# Local processing reconciliation

The synthetic engine records six ordered stages: source read, quality, request scope, fixture permissions, demo transformation and count reconciliation. Completed stages have nonnegative integer input/output/excluded/held counts and conserve records. Quality failure holds the whole extract and leaves downstream stages explicitly not run; a held record is not counted as an eligibility exclusion.

Approval, simulated sending and both delivery export paths reject missing, reordered, blocked or inconsistent stage records. The source rows and source identity are copied before asynchronous hashing. The complete source snapshot—including excluded records—is hashed and bound to the shared review digest. Changing an excluded value changes approval identity even if outbound observations are identical. Reprocessing unchanged input produces the same digest.

Activity displays the count record and exports it with local evidence. These are deterministic local processing outcomes, not a production immutable stage audit, authenticated site identity, actual connector telemetry or a broker receipt. Timestamped durable production stages, transaction recovery and operational audit/SIEM integration still require implementation and validation.

## Upgrade and receipt recovery

Review digest engine version 4 includes source-snapshot hash and stages. Older saved approvals no longer authorize rebuilt packages. Earlier receipts retain their original package/digest/count; they are never rewritten to the current identity.

Activity exposes unresolved historical simulated receipts. Explicit resolution records a simulator event and updates that receipt's status only. It does not authorize current input, add an ingestion or communicate externally. A new simulated delivery is blocked while a different receipt remains unknown. History actions stay disabled until current-run recomputation completes so a current receipt cannot be mistaken for historical.

## Evidence

349 automated tests passed, 1 skipped; frontend build passed. Regression tests cover stage conservation, held/not-run states, ledger corruption, source snapshot isolation, excluded-record changes, deterministic reprocessing, older-receipt migration and recomputation races. Browser inspected completed processing counts and resolved a synthetic historical receipt. Independent read-only review identified both migration edge cases and guided their regression fixes. Native persistence/migration remains unverified in this pass.

## Next

Broaden refresh lifecycle coverage with explicit add/update/delete/merge/unmerge/late-arrival semantics and stable identity, then run representative baseline/2x/5x workload reports. Fixed synthetic request counts are a demonstration policy, not a general clinical completeness rule.
