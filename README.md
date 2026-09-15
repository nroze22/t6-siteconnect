# TalOS SiteConnect

SiteConnect is a hospital-local desktop application under development. The current default experience is a **Data COUNTS laboratory-release alpha**, built around NIH RFI **75N95C26R00005**. It demonstrates a scoped request, original source inspection, quality checks, accountable review, local export and simulated delivery reconciliation.

This repository contains reusable foundations and an internal demonstration, **not a deployed hospital solution or a complete response to every RFI requirement**. Bundled patient records are synthetic. Local review approval is not hospital authorization; the delivery rehearsal does not contact a real broker.

## Current workflows

- **Laboratory release:** inspect the bundled request and source, resolve supplied source issues, reconcile counts and exclusions, review the exact prepared package, authorize it and save a local export. Encrypted export uses a separately held recovery key; plaintext formats remain available for internal review.
- **Source connections:** bounded FHIR R4 patient and Group Bulk Data previews, plus manual HL7 ORU R01, FHIR JSON/NDJSON and CSV/TSV inspection. Original payload evidence is retained for review. Synthetic walkthroughs are included; real endpoints require hospital registration and validation. These previews are separate from release processing.
- **Document review:** local structured extraction, source evidence and human review, with supported document readers and optional Docling layout/OCR. Extraction accuracy remains a measured limitation, not a clinical validation claim.
- **Model setup:** device checks, local model recommendations, runtime/model installation and response verification. Models and optional readers download on demand; the laboratory rehearsal itself does not require a model.
- **Operations:** saved rehearsal state, recovery tools, support summaries, demonstration preparation and explicit requirement-readiness tracking.

## Architecture and boundaries

- Tauri 2 / Rust desktop backend; React 19 / TypeScript / Vite frontend.
- Local inference through Ollama, with optional local Docling document processing.
- SQLCipher connection storage and OS credential storage for the implemented native connection path. The synthetic rehearsal journal has separate storage semantics; do not assume every local artifact is encrypted.
- Local JWE encrypted export and explicit recovery-key handling. Production key management, institutional identity and authorization, validated de-identification/PPRL, durable hospital ingestion and a real broker protocol remain open.
- Network access is used for requested setup downloads and configured hospital access. This is not a blanket network-free or compliance-certified product.

Earlier patient-screening and trial-discovery code is retained as alpha foundations. Standard builds hide the historical workspace selector. Maintainers can explicitly set `VITE_ENABLE_LEGACY_WORKSPACES=true` when building to expose those workspaces; that does not establish their production readiness.

## Development

Use a Node.js version compatible with the checked-in Vite toolchain, npm, and the Rust/Tauri prerequisites for the target OS. Mac native builds require Xcode command-line tools.

```bash
npm ci

# Browser rehearsal (native integrations are unavailable here)
npm run dev

# Native development
npm run tauri -- dev

# Automated frontend checks
npm test
npm run build

# Mac application bundle
npm run tauri -- build --bundles app
```

Model choice depends on available memory, disk, runtime support and measured performance. Use the app's device checks and validate extraction on the intended demo machine instead of relying on a fixed hardware promise.

## Verification and remaining work

The latest local checkpoint passed **406 frontend tests** (one opt-in live extraction test skipped), the frontend build and the Mac release build. The browser review/authorization flow was visually checked. The latest package's native visual check was skipped at the user's request; previous native checks do not establish this revision's full native behavior. Local packages are ad-hoc signed, not Developer ID signed or notarized.

Clean-install, upgrade/recovery, actual native save/storage completion and representative clinical extraction testing remain important next checks. Real hospital access, operational security and full RFI acceptance require additional implementation and external validation. See [STATE.md](STATE.md) for dated evidence and limitations.

## Documentation

- [Data COUNTS demonstration](DATA-COUNTS-DEMO.md)
- [Hospital source connectors and onboarding](docs/HOSPITAL_SOURCE_CONNECTORS.md)
- [Laboratory source profile](docs/LABORATORY_RELEASE_PROFILE.md)
- [Export boundaries](docs/EXPORT_BOUNDARIES.md) and [encrypted export/recovery](docs/ENCRYPTED_EXPORT.md)
- [Extraction evaluation](docs/EXTRACTION_EVALUATION.md) and [Docling integration](DOCLING-INTEGRATION.md)
- [Processing reconciliation](docs/PROCESSING_RECONCILIATION.md), [incremental review](docs/INCREMENTAL_REVIEW.md) and [performance validation](docs/PERFORMANCE_VALIDATION.md)
- [Dependency remediation and remaining findings](docs/DEPENDENCY_REMEDIATION.md)
