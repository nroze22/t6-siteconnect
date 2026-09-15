# Request readiness implementation

The Request tab now accepts a versioned JSON specification for a local readiness review. Download the template and format schema, edit a copy, and upload it. Two synthetic examples are in `sample-data/request-preflight`.

The checker validates identity/version, approval declarations, cohort, source systems, domains/fields, calendar dates, full/incremental mode, cadence and timezone, permission source/version/rule, and output schema. It rejects unknown fields, duplicate lists, impossible or reversed dates, incomplete approval declarations and files over 256 KiB. The JSON Schema describes the structural format; application checks additionally enforce date ordering and approval timestamp requirements.

A readable report identifies unsupported sources, domains, fields, cohort/window changes, schedules, output schemas and incremental processing. It records the uploaded file's SHA-256 and check time. The hash identifies bytes, not authority. No remote calls, scheduling, source queries or execution occur. No input instruction is evaluated. No field substitution or ontology mapping is attempted.

Every imported request remains execution-blocked. Approval text and permission references cannot establish authoritative site approval. The existing synthetic release request, its checks, extraction configuration and release approval remain unchanged. This adds part of RFI requirement 2; it does not complete that requirement.

The report survives tab changes in the current workspace. Invalid replacement uploads retain the previous report with an explicit error. Closing/reloading the workspace clears this in-memory review; use Export readiness report to retain it. Export is explicit plaintext JSON containing the specification; browser downloads are reported as requested, not confirmed saved. Native export uses the existing selected-file save flow.

Validation: 307 frontend tests passed (one opt-in live inference test skipped), including 12 new schema/workflow tests. Browser exercised both supplied fixtures, tab navigation, unsupported requirements and a real downloaded report; its source hash was independently verified. No live hospital, permission authority or TDB is connected. Native signed-in interaction still requires the existing database to be unlocked by its owner.
