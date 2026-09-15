# Docling synthetic test documents

These files contain no patient data. They test document parsing, not clinical decisions.

- lab-table.pdf: digital table, corrected result, less-than comparator and missing unit.
- lab-table-scanned.pdf: pixel-only version requiring OCR.
- lab-table-scan.jpg: visible scan source, provided for inspection; direct image upload is not enabled in the app.
- two-column-notes.pdf: separate synthetic patients and clinical context in two columns.
- expected.json: independently specified phrases and test/value/unit rows for the parser checks.
- expected-layout.json: captured Docling output for the digital table, used to regression-test the UI adapter.

The final local benchmark used Docling 2.126.0 and installed Tesseract English. RapidOCR misread units in an earlier experiment. Inspect original source regions; do not treat the fixture benchmark as clinical validation.
