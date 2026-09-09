# Synthetic source-review fixtures

No patient data. The five laboratory-source formats contain the same 144 laboratory observations for SYN-001 through SYN-012. Under the fixed demo request, 120 are prepared and 24 excluded. CSV/TSV/XLSX use the canonical headers shown in these files; arbitrary site column names are not mapped automatically. FHIR fixtures are a supported synthetic subset, not universal FHIR conformance tests.

The narrative cases and PDF/DOCX are synthetic extraction challenges. `benchmark-cases.json` contains development expectations. The image-only PDF intentionally requires unsupported OCR. HL7 demonstrates raw field locations, not a live interface.

See SOURCE-EXTRACTION-REVIEW.md in the source archive for exact coverage, settings and limitations.
