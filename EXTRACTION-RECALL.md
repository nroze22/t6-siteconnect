# Extraction recall update

September 8, 2026. Alpha demonstration; synthetic data only.

## What changed

Opening a narrative source now immediately shows conservatively recognized laboratory measurements and labeled request fields. These candidates come from source rules, not a model. The local Gemma pass adds interpretation and other facts, with smaller 3,000-byte batches. Supported duplicate occurrences are merged; repeated observations at different locations remain separate.

Source rules recover recognized analyte/value/unit phrases, explicitly labeled patient and observation identifiers, test codes, specimen, status, birth date and ISO timestamps. Docling header/row segments can yield arbitrary named laboratory results, including results with missing units. Source spelling, comparators, offsets and blank cells are preserved.

Every recovered candidate displays its source origin. Rules deliberately leave assertion unknown and patient association unassigned. Review the original context, especially negation, historical values and multi-patient documents. Rules do not establish that a value is current, belongs to a patient or meets the requested cohort. Reviewer corrections and rejections retain an audit record and the original candidate.

A separate coverage check flags numeric/unit passages without a supported measurement candidate. It is limited to recognized unit patterns and is not a completeness guarantee. Findings and their source locations are included in the evidence export. Narrative annotations do not automatically enter the laboratory release.

## Actual local test

Model: gemma4:e2b. Real local Ollama, synthetic fixtures, current request profile and source validation, at most one repair. These are small development acceptance cases, not clinical validation.

| Source | Expected values | Model-only source-validated matches | Combined matches | Model processing |
|---|---:|---:|---:|---:|
| Built-in example note | 2 lab measurements | 1/2 | 2/2 | 43.4 s |
| Labeled request-context note | 9 values | 7/9 | 9/9 | 49.2 s |

Recovered values remain context-unknown until reviewed. Counts measure source-backed value recall, not complete clinical interpretation or correct linkage. Unsupported model candidates remain visible for rejection; recovery does not hide model errors. Immediate source rules do not wait for these model timings.

285 frontend tests passed. The explicit live model acceptance test passed separately. 118 native tests passed during the request-review work. Apple Silicon debug application rebuilt. Browser checks cover actual source-rule output; new native screens still require an unlocked Mac for interaction verification.

## Remaining limitations

The compact model still omits facts and can misclassify fields. The source rules cover a finite analyte and unit vocabulary; unfamiliar prose, OCR mistakes, unusual tables and missing units require review. There is no independent second clinical-model verification pass, validated clinical recall score, or 10x accuracy claim. The rules and model can share source/OCR errors. Real site documents need a representative, independently annotated evaluation set before production use.

See REQUEST-REVIEW.md for the request coverage checklist, review inbox and open-question workflow. See DOCLING-INTEGRATION.md for local document-reader installation and OCR limitations.
