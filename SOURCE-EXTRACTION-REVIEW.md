# SiteConnect source extraction — alpha review

Updated September 8, 2026. Synthetic files only.

## What changed

Local AI now opens real files into a source review workspace. Structured records use deterministic readers, preserving supplied values. Narrative documents use Ollama with a shared JSON Schema and constrained extraction profile. Clicking a candidate returns to its original segment; text is highlighted and PDF pages retain coordinate-based source overlays. AI annotations remain separate from original data.

The local model produces candidates, not clinically validated facts. Exact source matching does not establish correct patient association, completeness, timing or interpretation. Review each candidate in context, accept supported candidates or reject suggestions. Rejected suggestions remain in the evidence export. Unsupported candidates cannot be accepted. Incomplete extraction or missing OCR coverage blocks reviewed export.

## Format coverage

| Input | Working source location | Release workflow |
|---|---|---|
| Text PDF | Rendered original page and text coordinates | Narrative annotations only |
| DOCX | Paragraph and exact text; not original Word page layout | Narrative annotations only |
| TXT / Markdown | Paragraph / text offsets | Narrative annotations only |
| CSV / TSV | Row, column and original cell value | Canonical synthetic laboratory headers |
| XLSX | Worksheet and cell address, stored raw value | Canonical synthetic laboratory headers; formulas block release |
| FHIR JSON / NDJSON | Resource JSON pointer and original field value | Supported synthetic Observation / Patient representation |
| HL7 files | Message, segment and numbered field | Raw field review only; no feed integration |

Scanned PDFs, image OCR, C-CDA, legacy XLS and RTF are not supported. Excel date serials are preserved, not silently converted; formulas are not evaluated. DOCX tracked changes and omitted images receive explicit coverage warnings. No live EHR, LIS, PACS or VNA connector is implied. This implements a useful file-based slice of the RFI's source-fidelity and unstructured-data needs, not complete RFI coverage.

## Ollama configuration

Profile `source-entities/6`, shared by native code and the benchmark:

- `/api/chat` with an explicit JSON Schema supplied in `format`, strict required fields and no additional properties.
- Temperature 0; seed 42; reasoning enabled; context 8,192 tokens; output cap 4,096 tokens; repeat penalty 1.0; keep-alive 10 minutes.
- Sequential bounded source batches; at most 24 candidates per response. Hitting the cap, invalid schema or truncated output stops completion.
- 180 seconds per attempt. One repair attempt for source-grounding errors; repaired output must still pass validation. Cancellation stops the active local request.
- Every candidate identifies a segment, kind, label, value, nullable unit and subject, assertion, and verbatim quote. Quotes must occur uniquely in their segment, and copied fields must occur inside the quote. Diagnosis value is the condition phrase; uncertainty and negation belong in assertion.
- No inferred units, ontology codes, diagnoses from measurements, automatic de-identification or automatic release from AI output.

File limits: 12 MB, 30 PDF pages, 100,000 extracted characters and 12,000 structured fields. Office ZIP expansion is checked before decompression. Oversized content fails explicitly rather than being silently truncated. These are alpha limits, not a hospital-scale throughput claim.

## Actual local results

On this Mac with Gemma 4 E2B, the selected profile passed 9 of 10 synthetic development cases. Median elapsed time was 9.07 seconds per case, including repair time when used. Cases cover multiple measurements, negation, medication history, missing units, comparators, uncertainty, vitals, embedded instructions, administrative text and multiple patients.

The uncertainty case failed: the model used “possible” as the diagnosis value instead of “pneumonia,” including after a repair. Source/diagnosis validation blocks acceptance. The multiple-patient case passed after repair. The benchmark is a small set used during tuning, not held-out evaluation, a clinical accuracy percentage or a production throughput estimate. Larger files take multiple sequential calls. Test additional models and independent institution-specific samples before choosing a deployment profile.

## Verified workflow

- 264 frontend tests and 116 native tests passed; Apple Silicon debug application built.
- Five structured fixture formats each retained 144 laboratory rows and produced 120 output observations with no fixture quality blockers.
- Browser: uploaded the XLSX fixture, reviewed cells, loaded it as the laboratory source, reloaded the page, ran checks, reviewed/authorized and exported 120 observations. The exported file contains the matching source SHA-256 and original source evidence.
- Browser: real text PDF opened and rendered. Desktop model calls were benchmarked directly against local Ollama; the new native screen/file-dialog journey still needs verification after the Mac is unlocked.

## Run the demo

1. Verify Gemma 4 E2B in Administration → Model setup before presenting.
2. Open Local AI, acknowledge synthetic files, then open `lab-pair.txt`. Extract, click each candidate, review the original passage and accept or reject it. Export reviewed evidence.
3. Open `synthetic-clinical-report.pdf` to inspect original pages. Larger documents need more time; do not imply instant processing.
4. Open `laboratory-source.xlsx` or the equivalent CSV/FHIR fixture. Select a field to inspect its source location, then acknowledge source review.
5. Choose Use as laboratory source. Run quality checks, review the 120 prepared / 24 excluded records, authorize the demo package and export.
6. Use `image-only-needs-ocr.pdf` to demonstrate the explicit unsupported-content boundary. Never describe it as successfully extracted.

Importing another file invalidates previous approval. The source file hash is bound into the package digest. Original source evidence accompanies the export. Narrative annotations cannot replace the deterministic laboratory source.

## Remaining work

Independent annotated evaluation, broader FHIR/HL7 and document layouts, OCR with coordinates, multi-page clinical context, reviewer corrections and adjudication, terminology versioning, real source adapters and institution-specific acceptance remain development work. The fixed release profile permits only the twelve synthetic patients; arbitrary hospital files are not supported for release. Files stay in memory until exported or explicitly loaded into the synthetic journal. This is not encrypted patient storage or an authenticated clinical audit trail.

The app remains an alpha starting point, with simulated authority, privacy/linkage and delivery. Signed distribution, tested updates/rollback and hospital security controls remain separate work.
