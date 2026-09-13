# SiteConnect goal checkpoint — 2026-09-13

## Objective
Optimize the app against all 15 NIH Data COUNTS RFI 75N95C26R00005 technical criteria, with coherent operator workflows, preserved source evidence, clinical review safeguards and truthful production boundaries. Native goal remains active. RFI coverage is not completed compliance or clinical validation.

## Acceptance and current evidence
- PASS: Replace one-item sidebar and duplicate tabs with shared task navigation, grouped operations and administration. Desktop and compact browser screenshots inspected at 1440x900 and 1280x720; compact sidebar retains every destination. Explicit sidebar/brand navigation dismisses introduction without claiming completion.
- PASS for current local scenario: Request -> source checks -> two blockers -> corrected fixture -> 144 accounted records -> model setup -> release review. Browser exercised; corrected state retained across destinations. Shared mount design preserves document workbench. Imported release source across correction/setup navigation now has an automated regression; full document workbench session still needs dedicated browser coverage.
- PASS: All 15 criteria represented in Production readiness with foundation, remaining work, owner, complexity and completion evidence. No criterion marked complete; live processing unavailable.
- PASS bounded: Strict supported-profile validation now covers FHIR envelopes and nested fields plus tabular columns. Distinct quantity codes, terminology details and reference context survive projection/output; absent machine codes stay absent and blank results stay missing. See docs/LABORATORY_RELEASE_PROFILE.md. Imported correction cannot replace source with bundled fixture. Code-system labels reflect supplied system; generated imported JSON labeled projection. FHIR release guards reject specified unpreserved metadata/context and mismatched quantity display/machine codes. This is an explicit supported profile, NOT general FHIR losslessness.
- PASS: 325 tests passed, 1 skipped; frontend build passed (large-chunk warning); git diff check passed. Independent read-only review covered navigation and strict source profile. Found and fixed onboarding routing and missing-machine-code fabrication. Imported-source regression also passes.
- UNVERIFIED: Updated native build/package, device behavior, real hospital connectors/IAM/permissions/PPRL/broker, organizational compliance, representative clinical extraction accuracy, baseline/2x/5x performance. Existing Sep9 app ZIP predates these changes.

## Evidence
Changed source: navigation.ts, requirements.ts, DataCountsNavigation, ProductionReadiness, Sidebar, App mount key, DataCountsPage, release.ts and associated regression tests.
Browser captures: ../../outputs/SiteConnect-Navigation-2026-09-13.png and ../../outputs/SiteConnect-Readiness-2026-09-13.png.
RFI reference: ../rfi-current-check.txt; prior gap assessment: ../../outputs/SiteConnect-RFI-Gap-Assessment.md.
Test/build logs: /tmp/siteconnect-tests.log and /tmp/siteconnect-build.log (ephemeral).

## Next implementation slices
1. Supported input profile and imported-source navigation regression implemented. Expand from this bounded profile only with corresponding source/privacy semantics and evidence; general FHIR fidelity remains incomplete.
2. Separate internal source-bearing review exports from release payloads; implement authenticated encrypted export/recovery under a documented local key lifecycle. Current synthetic review exports contain plaintext evidence; never enable live use on this basis.
3. Add deterministic stage reconciliation and failure recovery tests, full/incremental change fixtures including deletes/merges/unmerges, then representative performance reports.
4. Improve request and permission authority workflows against an agreed program specification. Real connector, IAM, approved PPRL/de-identification and broker implementation require external contracts/access and validation. Do not simulate these as complete.
5. Run reviewed clinical extraction benchmarks against source-grounded expected facts; document recall and false positives by content type/model. Then native package and device validation after disk-space preflight (last observed ~3.3 GiB free).

## Exact resume action
Next inspect review/export payload composition and current native encryption facilities. Separate internal source-bearing review evidence from release payloads before adding authenticated encryption and recovery. Keep the active goal open until locally feasible work and required evidence are handled; external dependencies remain explicit.
