# Advanced PDF reader — SiteConnect alpha

September 8, 2026. Synthetic documents only.

## What is implemented

Local AI now offers an Advanced PDF reader using Docling 2.126.0. The existing readers for CSV, TSV, XLSX, FHIR, HL7, DOCX and text remain available. The new integration is specifically for PDFs, including scanned PDF pages; standalone image files are not enabled in this UI.

The desktop defaults to requesting the advanced reader for PDFs. If setup is missing, it stops with a clear setup message. Users can explicitly uncheck the advanced option to use the basic text-PDF reader. There is no silent substitution or fabricated extraction result.

PDF layout, reading order, table rows and page provenance feed the existing Ollama extraction/review flow. Blank table cells retain their column positions. The original PDF is rendered separately in the viewer. Docling block coordinates and table-region coordinates accompany the text; they are not character-perfect OCR highlights. Original Docling references and raw table cells accompany reviewed evidence exports.

A selected source location can highlight its document region before AI extraction. AI candidates remain separate from the original source. Narrative documents do not automatically become laboratory release records.

## Setup and operation

Open Local AI → Advanced PDF reader → Set up advanced reader. Setup checks available disk space, locates Python 3.12, creates an isolated virtual environment, installs pinned top-level packages, downloads models and initializes the pipeline before marking it ready. Allow at least 6 GiB free during setup and 1 GiB for processing. Existing installation files can be reused on retry. Setup can be cancelled.

Python 3.12 must already be installed. This alpha does not bundle or automatically install Python. Tesseract English is preferred when an installed executable is available; otherwise the reader uses RapidOCR ONNX. Tesseract is not automatically installed. The actual OCR engine is displayed and recorded in each result.

On this Mac, the application-managed Python environment and Docling models were installed and initialized successfully. Its existing Tesseract installation was used in the final benchmark. Model/runtime assets remain outside the application ZIP; other computers need their own setup. The installed environment and model artifacts are approximately 2 GiB here, before working files and package-download overhead.

Document processing runs in a macOS sandbox that denies network access, with additional offline model configuration in the worker. Setup permits model/package downloads. Remote Docling services are disabled. Non-macOS worker code has offline configuration but does not provide this macOS OS-level network sandbox; it has not been platform-tested.

Only one Docling operation runs at a time. Processing has a five-minute supervisor timeout, a four-minute pipeline limit, a 12 MB / 30-page input limit, 100,000 extracted-character limit and bounded result size. Cancelling or timing out terminates the worker process group on macOS. Temporary synthetic input PDFs are removed after ordinary completion/cancellation; abrupt application or machine termination may leave a temporary file in the isolated runtime directory.

## Verification behavior

The adapter validates the source SHA-256, page count, page dimensions, source references and coordinate bounds before displaying Docling evidence. Numeric token sets are compared with a PDF's native text layer where one exists. Agreement does not establish correct table-row association, patient assignment or clinical meaning. Scans are explicitly identified as lacking independent text-layer confirmation.

Suspicious laboratory units outside a small supported list are flagged, not corrected. The list is a conservative alpha guard, not a universal unit vocabulary. Missing/ambiguous page provenance, empty unprocessed pages and numeric disagreement mark coverage incomplete and block reviewed export. Multi-page items without one unambiguous page location are not assigned a guessed page.

This is document-reader verification, not two independent clinical-model extractions. A second blind clinical extraction/adjudication pass is not implemented. Existing Ollama schema validation, exact quote checks, rejection/review and bounded repair remain in place. Matching an OCR quote only proves agreement with OCR text, not the original scan.

## Measured results

The application-managed runtime processed three synthetic development documents while a macOS sandbox denied network access:

| Document | Result | End-to-end time |
|---|---|---|
| Digital laboratory table | All expected phrases and test/value/unit rows retained | 12.30 seconds |
| Pixel-only scan of that table | All expected phrases and test/value/unit rows retained | 6.99 seconds |
| Two-column notes for separate synthetic patients | All expected phrases retained | 5.94 seconds |

Median: 6.99 seconds. These timings include worker startup and document parsing, not subsequent Ollama entity extraction. They are a small development benchmark used to select settings, not an independent clinical validation set or a throughput guarantee. Multi-column phrase recovery does not prove downstream patient attribution.

An earlier RapidOCR run misread mg/dL and g/dL on the scan. Tesseract preserved both, including the less-than comparator and empty glucose unit cell. The fallback must not be assumed equivalent to the tested Tesseract configuration. An Apple Vision experiment returned no readable content in this environment and was not selected.

271 frontend tests, 118 native tests and two Python coordinate tests passed. Tests cover wrong-file results, unknown pages, invalid coordinates, numeric disagreement, scan labeling, real worker provenance, setup failures, cancellation before startup and supervisor timeout. The Apple Silicon debug app built. The Mac remained locked during native screen verification; clicking through the new setup and file-dialog UI still needs confirmation after unlock.

## Demonstration

1. Open Local AI and acknowledge synthetic data.
2. Confirm the Advanced PDF reader shows Ready. Check readiness after restarting or replacing the app.
3. Open lab-table.pdf. Choose a table-row source location and inspect its highlighted region.
4. Open lab-table-scanned.pdf. Confirm the OCR engine and scan-only review message. Inspect the original values, units and missing cell before running Ollama.
5. Run local entity extraction, review each candidate and reject unsupported suggestions. A source-match label is not clinical approval.
6. Compare two-column-notes.pdf. Review patient association explicitly.

The existing one-pager and product video show the preceding alpha revision. They were not regenerated for this integration.

## Remaining boundaries

Independent annotated clinical evaluation, handwriting and degraded scans, complex merged/multi-page tables, cross-page patient context, terminology validation and reviewer correction/adjudication remain work. This integration does not establish hospital authorization, approved privacy/linkage, compliance, encrypted patient storage or production-ready distribution.

Implementation references: [Docling offline and table settings](https://docling-project.github.io/docling/usage/advanced_options/), [Docling document model](https://docling-project.github.io/docling/reference/docling_document/).
