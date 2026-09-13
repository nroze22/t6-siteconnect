# Encrypted demo export and recovery

## Implemented local workflow

Release review offers encrypted export first. A fresh 256-bit cryptographically random key is generated per export dialog. The operator stores it separately in an approved password manager and confirms it before saving. The application does not persist this key in storage, journal, export headers or logs. A failed or cancelled save leaves the key available for retry; completing or closing the dialog releases its state. JavaScript memory cannot provide guaranteed secure erasure.

The .jwe file uses jose 6.2.12 Compact JWE, direct symmetric key management (`dir`), AES-256-GCM (`A256GCM`) and the library-generated random IV. Only these algorithms are accepted on recovery. Protected header type, export structure, inner payload hash and count consistency are checked after authenticated decryption. Wrong keys, tampering, truncation and invalid application content fail closed. Supported file size is bounded.

System & support opens an encrypted file with its separate key. Successful opening displays the package and observation count. It does not restore a rehearsal session or authorize delivery. The key input is cleared after an attempt. Closing the review or leaving the screen releases decrypted state. Saving a plaintext review copy is a separate explicit action with an in-place disclosure.

## Key ownership and limitations

The operator owns custody of the recovery key. SiteConnect has no escrow, reset or hidden recovery key. Losing it means losing access to that file. Anyone possessing the key can decrypt or create an authenticated file, so this is not sender authentication or a digital signature. Never store the key beside the file or transmit them together.

This feature does not implement hospital KMS, recipient identity, key rotation/revocation, approved broker encryption, FIPS validation, whole-disk encryption, managed permissions or organizational compliance. Revoking access to a copied symmetric key cannot erase existing copies. Synthetic-only operation remains mandatory; encryption does not make illustrative privacy tokens/date shifts suitable for live delivery. Internal review exports and optional plaintext demo exports remain available and visibly labeled.

## Evidence

337 automated tests passed, 1 skipped; frontend build passed. New tests cover round-trip, randomness, wrong keys, modified header/IV/ciphertext/tag, truncation, algorithm/type mismatch, limits, inner integrity, confirmation, cancellation and failed-save retry. Browser downloaded an encrypted 120-observation package, reopened it successfully and closed the decrypted review. Independent read-only review found no blocking implementation defect. Native save-dialog and packaged app behavior are unverified this pass.

Dependency audit completed after a sandbox DNS failure was retried with network access. The audit reports 15 existing dependency vulnerabilities, including 2 critical and 9 high, with no jose finding. See DEPENDENCY_AUDIT_2026-09-13.json. Remediation and updated checks are required next; this is not a security-ready release.

## Standards and library references

- JWA AES-GCM and direct key management: https://www.rfc-editor.org/rfc/rfc7518.html
- Web Crypto API: https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/
- jose CompactEncrypt: https://github.com/panva/jose/blob/main/docs/jwe/compact/encrypt/classes/CompactEncrypt.md
