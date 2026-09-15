# Hospital source connections — September 13, 2026

## What this build supports

Open **Source records → Source connections**. Synthetic walkthrough is on by default. Choose a route, check capabilities, and retrieve a complete bounded preview. The preview exposes original resources/message fields, source artifacts and SHA-256 hashes. It remains in this view's memory and clears when the view unmounts; it does not enter the screening database, synthetic journal or approved release.

| Route | Implemented | Still needed for hospital production |
|---|---|---|
| Epic / Oracle Health / other FHIR R4 | HTTPS Patient read and patient-scoped Observation search; optional DiagnosticReport; pagination, patient identity and supplied counts checked | Vendor registration, enabled resources/search parameters, authorized patient IDs, site sandbox tests and actual site validation |
| Group Bulk Data | Asynchronous Group export, bounded polling, validated manifest, strict NDJSON, file counts and server transaction time | Hospital-defined Group, large streaming imports, durable job resume and cleanup, incremental delete/merge/revocation lifecycle, cross-origin export allowlist |
| HL7 v2 laboratory messages | Manual UTF-8 ORU R01 file inspection with original PID/OBR/OBX fields, sending authority and whole-file evidence | Interface contract, durable MLLP receiver, ACK/NACK semantics, queue/replay/deduplication, site-specific profile validation; ADT is rejected |
| Managed hospital extracts | Manual FHIR JSON/NDJSON, CSV and TSV inspection; no silent malformed-line skipping | Scheduled SFTP/share ingestion, file manifest and mapping contract, permissions, durable reconciliation and source-to-release projection |
| Backend authorization | Site-controlled configuration, public ES384 JWKS registration, five-minute client assertion, bounded bearer token in OS credential store, disconnect | Site registration and granted scopes, discovery/algorithm negotiation, RS384 support, managed key rotation/recovery and operational access controls |

**This is source intake and inspection, not a production hospital connection certification or an RFI-complete product.** Existing legacy cohort integrations remain separate and unvalidated; this path never calls their clinical normalizer or sync engine. Real-source release is not enabled here.

## Hospital IT onboarding

1. Agree the permitted source, cohort, purpose, data scope, retention and accountable operator. A FHIR Group or patient ID does not itself establish permission to release data.
2. Supply the final HTTPS FHIR R4 base and approved OAuth token URL from the hospital's registration process / SMART discovery metadata. The UI uses explicit configuration; it does not discover or trust a token endpoint automatically. Ensure private_key_jwt with ES384 is accepted. RS384-only servers need an additional implementation.
3. Check the source's active R4 instance CapabilityStatement. This is separate from authentication. A protected metadata endpoint is not supported by this anonymous discovery step; coordinate an approved route with IT.
4. Connection configuration uses the existing local encrypted workspace database. If it is locked or not initialized, use **Set up or unlock storage** directly on Source connections. Existing databases require their original passphrase; creation requires confirmation and acknowledgment that the key is saved. Inspection errors stop setup, and existing databases cannot be recreated by this action. Save a named connection, show its public JWKS, and register the key and client ID with the hospital. Private signing keys and tokens stay in OS credentials; the renderer receives only the public key. The new ES384 service does not rotate older alpha registrations. Changes to endpoint/client/scopes isolate credentials under a new configuration fingerprint.
5. Authenticate access. Scopes must be explicit system read/search scopes (for example `system/Patient.rs system/Observation.rs`); request only the resources your selected route needs. Legacy `.read` syntax is supported when required by the server. Returned permissions may be narrower than requested; successful authentication does not establish complete source access.
6. Preview one approved patient or small Group. Inspect the actual record, clinical status, quantity comparator/unit, reference range, identity authority and retained source. No LLM is used to reinterpret already structured clinical data.
7. Validate results with hospital IT and clinical informatics against an independently generated expected extract. Reconcile unavailable/withheld information, corrections, cancellations and all counts before moving toward a future live release workflow.

## Deliberate limits and failure behavior

- Native endpoint access only; browser walkthrough uses bundled synthetic responses. Manual browser file intake is supported, but users must choose an approved environment for real data.
- HTTPS with TLS 1.2 minimum, no embedded credentials or fragments; no redirects. Follow-up URLs must retain exact scheme/host/port. Even a valid cross-origin bulk storage URL is blocked pending an approved policy. No certificate validation bypass.
- GET source reads and OAuth token POST only in this command surface. No source mutation or bulk DELETE cleanup. A kickoff creates a server export job; cancellation may leave that job running.
- 8 MiB maximum per native response, 12 MiB aggregate preview, 10,000 resources/rows. Patient preview: 1–10 distinct FHIR logical IDs and at most 25 pages per search. Bulk: at most 30 output files and 30 polling checks; a Retry-After greater than 30 seconds stops without polling early. Long exports need a resumable ingestion service.
- Token expiry is checked before each authenticated request; expired authorization requires authentication again. Native in-flight network work has a 30-second timeout; cancelled results are not accepted.
- No partial preview is returned after parse, identity, count or pagination failures. Bulk error/deletion files and partial manifests are rejected. A false requiresAccessToken sends no bearer token on output downloads.
- Original valid UTF-8 text (including BOM) is retained and hashed. Hashes describe decoded payload bytes, not compressed HTTP wire bytes or digitally signed provenance. No content is persisted by this view; this is not guaranteed secure memory erasure or a hospital retention policy.
- The patient route retrieves all returned Observations for explicit patients. It is not a lab-only or date-filtered query. Source previews do not establish completeness of all hospital information or validate a full FHIR/HL7 profile.
- CSV/TSV fields remain strings, including blanks. HL7 encoding, repeated fields, coded values and SN comparators remain original text; no fabricated terminology mapping. Original segments remain available even when not projected into preview records.
- Parsed record pane shows the first 20,000 characters; complete raw evidence can be paged. Record selector supports pages of 200. Source records are not approval-ready just because retrieval and parsing succeeded.

## Verification

Automated coverage includes wrong-patient responses, pagination/count failures, malformed NDJSON, bulk manifest errors and authorization flags, cancellation, relative next links, long Retry-After, BOM checksums, HL7 source authority/comparators and ambiguous tables. Native tests cover endpoint/origin rules, configuration-bound credentials, write-scope rejection, and ES384 signature verification using the exported JWK with audience/issuer/subject checks and unique assertion IDs.

Browser walkthroughs and a new native package are checked separately in STATE.md. Real hospital grant exchange, vendor endpoints, production operating-system controls and clinical validation require site access and remain unverified.

## Protocol references

- [Epic Bulk Data documentation](https://fhir.epic.com/Documentation?docId=fhir_bulk_data)
- [Oracle Health Millennium APIs](https://docs.oracle.com/en/industries/health/millennium-platform-apis/apis.html)
- [FHIR Bulk Data export](https://hl7.org/fhir/uv/bulkdata/en/export.html)
- [SMART Backend Services](https://hl7.org/fhir/smart-app-launch/backend-services.html)
- [SMART asymmetric client authentication](https://hl7.org/fhir/smart-app-launch/client-confidential-asymmetric.html): baseline client conformance requires both RS384 and ES384; this bounded implementation currently supplies ES384 only.

## Focused Mac experience
Standard builds open Data COUNTS and hide the historical header selector. Legacy source and stored preferences remain intact; maintainers can explicitly build with `VITE_ENABLE_LEGACY_WORKSPACES=true` to restore the old workspace menu. Source previews are separate from release processing; local storage unlock is not hospital authentication or permission to release.
