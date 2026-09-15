# SiteConnect clinical data and experience review

September 8, 2026 · Internal synthetic alpha demo

The revised application supports a working, guided laboratory-data release rehearsal. It is suitable for an internal demonstration of the workflow. It has not been clinically validated or accepted by a hospital. No clinician or laboratory informaticist has signed off on these fixtures. This is a hospital data-operations workflow, not a diagnostic tool or a trial-enrollment decision system.

## What was checked and changed

| Area | Implemented behavior and evidence |
|---|---|
| Laboratory meaning | Checked six codes against official LOINC definitions: [creatinine 2160-0](https://loinc.org/2160-0), [urea nitrogen 3094-0](https://loinc.org/3094-0), [sodium 2951-2](https://loinc.org/2951-2), [potassium 2823-3](https://loinc.org/2823-3), [glucose 2345-7](https://loinc.org/2345-7), and [hemoglobin 718-7](https://loinc.org/718-7). Chemistry examples use serum; hemoglobin uses whole blood. Code, value, unit, status and specimen travel with the output. This does not validate the clinical distribution of generated values. |
| Clinical context | The UI explicitly says when reference ranges, flags and fasting status were not supplied. It does not manufacture normal/abnormal interpretations or diagnose diabetes from a glucose value. |
| Time semantics | Observation time is distinguished from when that result version became available to providers, consistent with [FHIR R4 Observation definitions](https://hl7.org/fhir/R4/observation-definitions.html). Neither is casually relabeled specimen collection time. Request-window filtering uses original clinical timestamps before illustrative privacy shifts. |
| Source references | All 144 corrected observations resolve to the 12 patients in the 156-resource bundle. Entries have full URLs; specimen display context is supplied without inventing specimen identifiers. FHIR permits display-only references; see [FHIR R4 references](https://hl7.org/fhir/R4/references.html). These are bounded structural checks, not an external conformance certification. |
| Release quality | Invalid calendar dates, missing timezones, unknown patients, missing required context, incorrect unit systems, duplicate records and missing units block release. The expected 12 observations per patient and final-only status are this controlled example's policies, not universal clinical requirements. |
| Cohort and permission | Exact adult cutoff and UTC-window boundary tests cover inclusion. Exclusions show the patient, count and reason. The corrected snapshot reconciles 144 = 120 released + 12 cohort + 12 permission exclusions. Revocation changes this to 108 + 12 + 24. Reasons are disjoint. |
| Review integrity | Package identity binds the complete request, source version, eligibility version, exclusions and output. A changed package displays a fresh-review notice and cannot inherit approval for a different digest. |
| Source inspection | Fixed a search-selection mismatch that could leave the previous lab's evidence visible. Issue inspection clears unrelated filtering. A regression test checks the correction. |
| Operator experience | Light default, three-step introduction, contextual next action, plain-language field labels, explicit release review, historical receipts and a clear completion state remain in place. Core rehearsal requires no hospital credentials or model download. |

## Verification completed

- 232 frontend tests passed across 14 test files, including three UI tests and new clinical boundary cases.
- TypeScript/Vite compilation and the Apple Silicon native debug bundle completed successfully.
- The earlier 108 passing Rust tests remain the backend verification baseline; this pass did not modify Rust code or rerun them.
- Browser walkthrough confirmed request v2, corrected source evidence, explicit authorization, simulated lost acknowledgment and receipt reconciliation without another ingestion of that package. Browser error log was empty at the end of this walkthrough.
- The rebuilt native app was restarted and displayed request v2, schema v2 and the revised clinical labels in light mode.
- Fixture checks confirmed 156 resources, 144 final observations, resolvable patient references and the expected six code/unit/specimen combinations. No source reference ranges were fabricated.

## What a real site must validate before use

1. **Laboratory source fidelity:** local codes and LOINC mappings, assay methods, specimen distinctions, original units and precision, age/sex-specific reference intervals and source abnormal flags. Include qualitative results, comparators such as “<”, missing-result reasons and nonnumeric values. The current numeric fixtures do not implement all of these.
2. **Result lifecycle:** preliminary, final, amended, corrected and cancelled results; out-of-order updates; stable source identity; duplicates across feeds; patient merges and deletions. The controlled final-only demo is not a general laboratory ingestion system.
3. **Time and cohort policy:** date-only and uncertain birth dates, local timezone/DST behavior, collection versus effective versus issued timestamps, request boundaries, and eligibility effective dates. Current fixtures use an explicit UTC request window.
4. **Authority and privacy:** actual approved requests, hospital-managed identities and permissions, effective revocations, approved linkage/de-identification, encrypted output and durable audit. Demo tokens and date shifts are intentionally illustrative.
5. **Delivery and operations:** real broker protocol, durable queue/restart recovery, authenticated receipts, source incremental updates, disconnected operation, support diagnostics, signed installation, upgrades and rollback on supported site hardware.
6. **Observed usability:** have a site data operator and laboratory informaticist independently run request review, defect correction, exclusion explanation, release approval and interrupted-delivery recovery. Record misunderstandings and completion outcomes before claiming the experience is site-validated.

Live model extraction, hospital connectivity, real broker delivery, production security, load performance and installer signing are unverified. The optional local model is not responsible for lab interpretation, filling missing units or authorizing release. Existing compiler and bundle-size warnings remain.
