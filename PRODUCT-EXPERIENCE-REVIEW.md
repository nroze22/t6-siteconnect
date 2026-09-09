# Product experience and security review

September 8, 2026 · synthetic alpha

## Intended path

Start with the guided laboratory rehearsal. Model installation is optional for that path. For document extraction, use Local AI: open a synthetic document, run extraction, inspect each result beside its source, then export the review. Sidebar Settings opens model setup; returning preserves the open document. Administration retains operational diagnostics.

## Changes from this review

- Replacing a document asks before discarding its review. The replacement is read before the old source, decisions and questions are cleared. An unreadable or cancelled replacement retains the previous review.
- Running extraction again explicitly warns that the suggestions and decisions will be replaced. It becomes a secondary action after extraction completes.
- Opening the introduction no longer unmounts the document workspace. Switching product workspaces or closing the application still requires exporting the in-memory review; the UI states this prominently. Saved laboratory rehearsal state and in-memory document evidence are separate.
- Source-coverage problems take priority over a reassuring ready heading. Export and laboratory-import handlers recheck their gates; a pending receipt blocks changing the release source.
- Export opens a keyboard-accessible confirmation describing original source text, identifiers, rejected suggestions, decisions and open questions. It states that this JSON is neither de-identified nor encrypted by the export. The destination remains user-selected. Escape and the initially focused safe action preserve the review.
- The renderer now has a content security policy restricting scripts, images, fonts and connections to required local sources. External renderer connections are blocked. Development-only allowances support the local development server; they are not the production policy.
- Removed blanket filesystem-plugin scope over the home and Downloads directories. The static scope is app data; open/save dialogs grant selected paths for the session. Native Rust commands are a separate boundary and are not constrained by this plugin scope.

## Verification

292 frontend tests passed, including unreadable replacement, cancellation and export-disclosure cases. The Apple Silicon debug application built successfully.

A production browser preview served the actual compiled app with the production security policy. Verified onboarding, example-note source preview, replacement confirmation and Escape, preservation across reopening the introduction, PDF parsing, CSV review, and export disclosure. A controlled external fetch was blocked by connect-src as expected. No source content was sent by that test.

Native window interaction and save-dialog filesystem grants remain unverified on the locked Mac. Browser checks do not establish native IPC or operating-system behavior. The existing local model accuracy limits remain unchanged by this UI/security update.

## Remaining production boundaries

This is a synthetic alpha, not a clinically validated or compliance-certified hospital application. Real deployment still needs representative clinical evaluations, organizational identity and permissions, a reviewed native-command threat model, protected patient storage and retention policy, approved privacy/linkage, signed installation/update distribution, migration/rollback testing, and a live broker integration. Local operation alone does not prove security. Review exports deliberately contain source information and need appropriate handling.

## Primary references

- Tauri content security policy: https://v2.tauri.app/security/csp/
- Tauri dialog-selected filesystem scopes: https://v2.tauri.app/reference/javascript/dialog/
- Tauri filesystem permission boundaries: https://v2.tauri.app/plugin/file-system/
