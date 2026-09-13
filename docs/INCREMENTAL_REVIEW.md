# Local incremental review plans

The release screen can export a plaintext internal plan after current package approval, when a different approved snapshot exists. The baseline is the latest different **approved** snapshot, not necessarily the latest delivered snapshot. This is not an agreed broker protocol or hospital source lifecycle integration.

Each plan binds baseline and target review IDs, full row hashes, ordered target IDs, changed/added observations, and explicit withdrawals. Absence from the target snapshot does not establish source deletion. Changed patient tokens require authoritative identity review; no merge or unmerge is inferred.

Before export, local application reconstructs the target exactly. Application verifies the plan hash, exact baseline, operation uniqueness, target inventory and final row hash without mutating the input. Reapplying to the exact target returns already-applied. One review ID cannot describe different rows. Hashes detect inconsistencies, not sender authenticity.

Tests cover additions, updates, withdrawals, target order, deterministic hashes, idempotence, wrong baseline, tampering, conflicting operations, incomplete inventory, duplicate IDs and identity changes. Broker authentication, authoritative delete/merge/unmerge events, late-arrival cycle assignment and durable source synchronization remain open RFI8 requirements. Native file export is not verified for this feature.
