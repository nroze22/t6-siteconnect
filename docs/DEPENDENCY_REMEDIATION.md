# Dependency remediation — 2026-09-13

## Result

Compatible lockfile updates removed 13 of 15 npm findings, including both critical findings. Vite is 7.3.6 and Vitest/coverage are 4.1.11; package minimum ranges now match those reviewed versions. Forty-three packages changed without forced major-version changes. The runtime-only npm audit reports zero known findings. This is npm advisory evidence, not security certification or a Rust/native dependency audit.

The full audit retains two high findings: image-size and its dependent presentation-tool package pptxgenjs. Both stem from image-size parser denial-of-service advisories with no upstream patched release listed. Do not use npm's suggested forced pptxgenjs downgrade. The presentation tooling is a development dependency; the clinical renderer does not import it.

## Local mitigation and reproduction

Before mitigation, zero-length ICNS entries and JXL partial-stream boxes timed out after 1.5 seconds in separate subprocesses. After adding minimum-size and buffer-bound checks, these cases throw immediately. The HEIF malformed-box case also fails safely. Valid PNG and ICNS dimensions remain unchanged.

scripts/security/patch-image-size.cjs applies to exactly image-size 1.2.1, checks exact source targets, is idempotent and rejects unknown installed versions/content. It adds an ICNS entry bounds check and rejects zero/undersized container boxes before parsers can return them. This keeps supported normal image parsing while preventing the reproduced nonadvancing loops. It is a local mitigation, not an upstream vulnerability fix or a reason to suppress the audit.

postinstall, prebuild and pretest apply the patch. A clean npm ci --ignore-scripts followed by the security checks reapplied it successfully; no reliance on manually edited node_modules remains. If presentation development tools are omitted, patching logs a no-op. An installed but unexpected version fails closed. Omitted-tools and unexpected-version branches were checked in an isolated temporary directory.

Run `npm run test:security-dependencies` to check malformed inputs with subprocess timeouts and valid-image controls. If installing with scripts disabled, explicitly run the mitigation before invoking presentation tooling directly. Remove this workaround only after checking an upstream fix and rerunning the regression inputs.

## Verification

- Clean locked dependency install succeeded.
- 337 tests passed, 1 skipped; frontend build passed.
- Malformed-image probes and valid controls passed.
- Independent read-only review identified the omitted-dev-tools install edge, now fixed and directly tested.
- Patched Vite server restarted; browser release and readiness navigation passed.
- Full audit: two high findings retained; runtime-only audit: zero known findings.
- Native package and Rust dependency audit not verified in this pass.

Evidence: DEPENDENCY_AUDIT_2026-09-13.json (before), DEPENDENCY_AUDIT_AFTER_2026-09-13.json and DEPENDENCY_AUDIT_RUNTIME_2026-09-13.json.

Advisories: https://github.com/advisories/GHSA-w3rx-r6r6-pgpr and https://github.com/advisories/GHSA-5p2g-fcmc-qvqq.
