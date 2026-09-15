# Full-snapshot change review

The release screen compares the current output with the latest different reviewed snapshot. It does not claim that the earlier snapshot was delivered. Each changed output field has a label and explicit before/after values, including units and machine codes, terminology details, timing, specimen, provenance, reference context and patient token. Unknown added fields also receive details instead of an unexplained change count.

A changed patient token is flagged for identity review. It does not establish a merge or unmerge. A record absent from the next snapshot may have been excluded, revoked or outside scope; it is not proof of source deletion. Additions may be new, late arriving or newly permitted. The existing demonstration remains a full-snapshot workflow; this comparison is not an incremental broker protocol.

Duplicate record IDs make comparison ambiguous. Saved snapshots now use a strict output schema and unique IDs; invalid history enters blocked recovery without overwriting the original journal. Operators can export an explicitly plaintext internal recovery copy before an explicit reset. Neither invalid comparison history nor unreadable storage can authorize release.

Imported-source protection also covers the post-delivery lifecycle action: bundled changes are offered only for bundled fixtures. Imported sources require a revised imported file; they are never silently replaced with the example data.

## Deterministic review identity

Review hash version 5 serializes object keys in locale-independent code-unit order, omits undefined object properties and preserves array/record order. A save/restore normalization that merely reorders object properties no longer changes source/review identity. Values, source record order and real source changes remain bound to the digest. Earlier hash-version approvals require fresh review; historical receipt recovery preserves their old identities.

## Evidence and limits

365 automated tests passed, 1 skipped; frontend build passed. Tests cover all output-field explanations, property-order independence, snapshot additions/absences, duplicate IDs, history recovery, imported lifecycle protection and hash stability. Browser correction-after-release flow displayed the five changed laboratory records with field details. Independent review passed after checking the current code. Native save/recovery behavior remains unverified in this pass.

Remaining: authoritative source deletion/merge/unmerge events, a real incremental refresh protocol with idempotency, hospital identity/permission integration and broker acceptance. Do not infer these events from snapshot differences alone.
