# Export boundaries — synthetic rehearsal

## Delivery envelope

`siteconnect-demo-delivery/1` contains the request, prepared observations and aggregate processing counts. It excludes original documents, source filenames/paths and patient-level exclusion lists. Observation fields use an explicit allowlist so additional internal fields do not automatically become delivery fields.

This is still synthetic output with illustrative tokens, date shifts and retained observation provenance. It is not a de-identification implementation, approved PPRL or a broker submission format. Free-text clinical content has not undergone an approved privacy process. Live delivery remains unavailable.

Export requires current approval. The builder snapshots the run before asynchronous work, recomputes the reviewed-content hash, validates package identity and count reconciliation, then hashes the delivery payload. The review hash binds local review context, including source identity and exclusions; it is deliberately distinct from the delivery payload hash.

Payload integrity is SHA-256 over UTF-8 JSON.stringify(payload), using the serialized property's ordering as emitted. This detects an accidental mismatch; it is not a signature, authentication or encryption. The file explicitly sets authenticated:false and warns that it is plaintext. Do not claim an attacker cannot modify the payload and replace its hash.

## Internal source evidence

The source evidence export contains original source content and source identity. It is labeled internal and plaintext. Keep it within the site review workspace. The processing activity export and readable review summary are also internal review artifacts, not outbound clinical packages. Synthetic-only constraints remain in force.

## Verified checkpoint

Automated tests exercise exclusion of internal context, tampering, stale approval, invalid runs, count manipulation and snapshot isolation. A real browser export of 120 synthetic observations was downloaded and independently checked with Node SHA-256. Frontend build and 330 tests passed; 1 test skipped. Native save dialog behavior was not retested this pass.

## Remaining security work

Authenticated encryption and decryption/recovery workflow, managed recipient/site keys, encrypted output policy, signed identities, broker authentication, TLS/network restrictions and production audit integration remain incomplete. The existing SQLCipher database is a separate storage mechanism; it does not encrypt these exported files. Keep organizational compliance and operational security validation separate from local code evidence.
