# Workflow grouping refinement

September 9, 2026

- Replaced the duplicate release navigation cards with a compact, noninteractive progress line. Tabs remain the navigation controls.
- Reduced header, panel, step and section spacing while retaining readable text and visible focus states.
- Grouped document selection, synthetic-data confirmation and reader settings. These collapse after a file is loaded and can be reopened to change the input.
- Added a direct Inspect parsed fields action for structured files. It navigates to evidence; it does not approve it.
- Moved rerunning completed narrative extraction to the optional settings area.
- Grouped export explanation, export action and laboratory handoff in one area. Review and confirmation gates remain enforced.
- Put the separate request-readiness checker behind an explicitly optional disclosure below the active request.
- Removed stale cross-tab download notices and duplicate export notices while retaining export-state and session-boundary explanations.

Validation: 307 frontend tests passed during implementation; the final eight affected workflow tests passed after the disclosure changes. Final frontend and Apple Silicon debug app build succeeded. Browser checked real synthetic CSV upload, collapsed file controls, source navigation, review-to-export navigation, confirmation cancellation, review invalidation and reopening optional request checks. Signed-in native interaction was not reverified.

This changes interface organization, not extraction accuracy, approval authority, privacy or broker capability.
