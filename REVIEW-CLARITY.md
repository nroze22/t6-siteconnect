# Review clarity refinement

September 9, 2026

- Structured-file summaries distinguish laboratory observation counts from raw source-field counts. Narrative results are labeled suggested facts.
- Contextual results use meaningful field titles such as Source test code. Raw values and exported evidence remain unchanged.
- Results visibly distinguish preview-only, needs review, reviewed, rejected and source mismatch states. Next-result navigation follows document order, skips decisions and wraps at the end.
- A direct Continue to export action appears once review gates pass.
- Export status is tied to the current source and decisions. Edits invalidate that status. Successful native writes are called saved; browser downloads are only called requested. Replacement prompts account for the current export status.
- The source panel asks for patient association on laboratory measurements rather than repeating that warning for every metadata or raw parser field.

Verification: 295 frontend tests passed before the final copy adjustment; focused review/navigation tests and the final app build also verified afterward. Browser checks used a real synthetic CSV, confirmed 144 observations versus 1,872 source fields, requested an actual download and verified that a later decision change invalidates export status. Native app inspection on September 9 reached the database passphrase screen: the Mac is accessible, but signed-in native verification still requires the user to unlock SiteConnect. No passphrase was requested or reset.

Security restrictions, source-evidence requirements and release gates from the preceding build remain in place. This is a synthetic alpha; these checks do not establish clinical validity or hospital deployment readiness.
