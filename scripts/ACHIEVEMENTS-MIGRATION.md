# D8 migration order

1. Compare the live schema with `npm run appwrite:provision-012`, then apply only the reviewed additive schema with `npm run appwrite:provision-012 -- --apply`. The repository configs differ from the live project; do not run a broad Appwrite push. Wait for indexes to become available.
2. Follow the [coordinated rollout](../docs/feed-timeline-rollout.md): maintenance, verified backup, manifest-based `scripts/apply-entry-reconciliation.ts`, table/row permission revocation, backfills and readiness-gated deployment. Historical entry reconciliation preserves ledger and balances; do not replay it with `reconcile-unprocessed-entries.ts --apply`. API writes then enqueue completion and session events in the transactional outbox; keep its worker running for new activity.
3. Curate Soulslike games explicitly with `npx ts-node -r tsconfig-paths/register scripts/curate-soulslike.ts reviewed-game-ids.json`. Input is a reviewed JSON array of Appwrite game IDs. IGDB genre IDs and game names do not classify games.
4. Run `npx ts-node -r tsconfig-paths/register scripts/backfill-achievements.ts` for a read-only dry run, then repeat with `--apply`. The script pages through profiles and chronological `z_entries` with cursors, counts only transitions into `completed`, creates deterministic completion records, and reconciles badges. It logs each completed profile ID during apply; resume after interruption with `--after=<last-logged-profile-id>`. It is safe to rerun.
5. Verify the frontend widget after the backfill. Existing users' annual progress then appears immediately.

After adding or correcting curated games, rerun step 4 to award qualifying profiles. Badge unlocks and Z-Coin grants are permanent; removing a review or changing a game classification does not revoke an issued badge.

## Recovery

The outbox worker retries a failing event five times, then marks it `FAILED`. After fixing the cause, rerun the backfill command in step 4 **without** `--after`: it reconstructs annual completions from all historical `z_entries` (including games whose current read-model status changed), checks current reviews and completed hosted Jogatinas, and credits missing badges idempotently. This also repairs progress after a worker outage or a failed enqueue after a review was saved. Inspect `outbox_events` for `D8_ENTRY_COMPLETED`, `D8_RATING_CHANGED` and `GAMEPLAY_SESSION_COMPLETED` rows with status `FAILED`; the backfill repairs their achievement effects but does not change the outbox status. Keep the outbox worker running for subsequent events.
