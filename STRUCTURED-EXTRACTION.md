# Structured extraction contract

September 8, 2026 · request-labs/3 · synthetic alpha

## Implemented design

1. **Evidence before interpretation.** The schema requires a source reference and verbatim quote, and the prompt instructs the model to copy evidence first. Source text remains untrusted input. Actual exact matching is checked separately; ordering alone does not establish correctness.
2. **Different shapes for different facts.** A measurement contains source, quote, laboratory field, raw value, assertion, test label, optional raw unit and optional same-quote subject. Context contains source, quote, requested field, raw value and assertion. It cannot contain irrelevant unit, subject, label or category fields.
3. **Software supplies redundant fields.** Category follows field identity. Context display labels derive from the copied value; the model cannot invent a heading that does not exist in the source. Original values remain unnormalized.
4. **Document-bound grammar.** Each inference schema enumerates only the source IDs actually supplied in that batch. Field identities and assertion states are constrained. Additional properties are prohibited. The schema is passed both to Ollama's format parameter and the system prompt.
5. **Layered validation.** Native wire-shape checks run before canonical conversion. Native and frontend checks independently verify source identity, unique exact quote, copied fields and field/category compatibility. A bounded repair retains the original wire shape. Truncation, invalid shape and entity-cap responses fail closed.
6. **Complementary recall.** Direct source rules and the limited measurement-coverage audit remain active. They do not impersonate model results. Source-backed candidates are merged by source occurrence; uncertainty and reviewer decisions remain visible and auditable.

This is a fact-extraction contract, not an automatically generated FHIR release. Normalized dates, terminology mappings, result-to-patient linkage and cohort eligibility require their own deterministic validation and/or explicit review. Missing values are not fabricated to fill the request. No self-reported confidence percentage is used as a release gate.

## Measured local results

Actual local gemma4:e2b with schema-constrained decoding and source validation. Same two synthetic fixtures as the previous update. These small development cases do not establish performance on real clinical documents.

| Fixture | Previous model source-backed matches | New model source-backed matches | Combined pipeline |
|---|---:|---:|---:|
| Built-in note: expected lab measurements | 1/2 | 2/2 | 2/2 |
| Labeled request-context note: expected values | 7/9 | 9/9 | 9/9 |

No unsupported model candidates remained in either new run. The first run also returned a supported contextual fact. Recorded model wall times were 24.2 and 36.9 seconds; these are observations rather than a controlled speed comparison. Exact copied values do not prove correct clinical assertion or linkage.

Validation: 290 frontend tests, 120 native tests, and the explicit live-model acceptance test passed. Apple Silicon debug app rebuilt. Native screen interaction remains unverified while the Mac is locked.

## What remains

Broader independently annotated examples, difficult OCR/table layouts, repeated patients, negation, amended results and missing data need evaluation before production claims. We have not implemented an independent clinical verifier or automatic clinical normalization. A second pass from the same model is a repair, not independent double verification. More complex agent orchestration is not assumed to improve accuracy without controlled evaluation.

## Current primary references

- Ollama structured outputs: https://docs.ollama.com/capabilities/structured-outputs — schema in format and prompt, typed validation, deterministic settings.
- Google structured outputs: https://ai.google.dev/gemini-api/docs/structured-output — typed output design; used as design context, not an inference provider in this application.
