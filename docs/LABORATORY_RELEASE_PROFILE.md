# Supported laboratory release projection

This synthetic request workflow is not a general FHIR implementation or a production lossless transport. Original file content remains in document evidence review; the release projection is a separate representation. Source hashes bind the imported file to the prepared package.

## Accepted input

FHIR JSON/NDJSON: individual Observation resources, arrays, or collection Bundles containing supported Observations and fixture Patients. Strict object validation covers the envelope, entries, resources and nested fields. A non-supported resource or field prevents release preparation for the entire file; it is not skipped. Patient IDs and supplied birth dates must match the synthetic authority. Bundle identity/fullUrl and synthetic tags remain in original evidence, not in each projected laboratory row.

Observations: supplied ID/version, final/corrected/cancelled status, one supplied test coding, fixture Patient reference, Serum/Whole blood specimen display, effective/issued timestamps, one numeric quantity or one standard missing-result reason. One bounded reference interval is supported. Quality checks separately enforce result consistency, required values and date sequencing.

Preserved clinical context includes distinct quantity display unit and machine code, unit system, comparator, coding version/text/userSelected (including false), reference interval text and both bounds' supplied unit systems/codes. A missing quantity machine code stays missing. No terminology mapping, unit conversion or reference-interval interpretation is performed. Projection previews do not substitute for original evidence.

CSV/TSV/XLSX: explicit LabInput columns only. Unknown columns and duplicate names fail rather than being discarded. Blank results become missing values, never zero. Optional referenceRange/referenceContext cells contain JSON; codingUserSelected accepts true/false. Formula cells still require resolved source values. These formats use the same synthetic authority and downstream quality gates.

## Still outside this profile

Components, interpretations, encounter references, identifiers, arbitrary extensions, additional provenance/security labels, general resource graphs, other result types and richer intervals require an expanded approved profile and corresponding privacy handling. They remain reviewable as source evidence but cannot enter this release workflow. This boundary does not satisfy the RFI's production losslessness requirement on its own.

## Verification

Regression coverage: release-boundary.test.ts checks unsupported nested fields/resources, conflicting absent/measured results, original nonmutation, supplied clinical context through prepared output, absent machine codes and blank table cells. Existing extraction tests exercise JSON, NDJSON, CSV, TSV and XLSX imports. DataCountsPage.test.ts covers retained imported source during correction/setup navigation.

Production evidence still required: program-approved schemas, real hospital content, permissions and privacy/linkage approval, reviewed clinical benchmarks, encrypted payload handling and broker acceptance.
