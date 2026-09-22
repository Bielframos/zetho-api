# Appwrite 0.12.0 production schema and backfills — 2026-09-22

Project: `690a16460002c718253a` at `https://appwrite.adstrito.com/v1`, database `app`.

## Schema safety gate

A read-only snapshot found 37 existing tables. The API config described four additional tables, ten optional columns on existing tables, and three additional indexes. The frontend config is a partial and older schema; both configs differ from production in existing permissions, numeric bounds, index order metadata, and buckets. Running `appwrite push all` or `appwrite push tables` against them is unsafe.

`npm run appwrite:provision-012` passed against the live schema with 37 create-only operations. `npm run appwrite:provision-012 -- --apply` completed and passed its postcheck. A second live dry run reported zero remaining operations. No existing table permissions changed, and no existing table reported a lower row count after the schema operation. The create-only script does not update or delete rows, tables, columns, or indexes. Existing client write permissions remain until the coordinated API/frontend cutover.

## Backfills

- Feed: dry run found 14 ratings, 46 comments, 19 lists, 3,276 journal entries (1,645 latest owner/game states), and 206 list items. The main apply completed. A targeted second pass handled 149 latest invalid statuses. Final paginated count: 7,226 feed events, including 5,685 status events; independent validation found zero stale status sources and zero missing status sources.
- Achievements: dry run found 46 profiles, 1,235 unique completion events and zero badge candidates. Apply completed successfully; `completion_events` has 1,235 rows, `user_badges` and badge Z-Coin transactions have zero.
- Playtime: dry run found zero games with historical completed playtime; no apply was needed. The script scanned 55,770 existing `z_entry_count` rows without writing to them.
- Social counters: dry run found zero corrections; no apply was needed.

## Deferred repair and cutover

The entry reconciliation dry run found 718 rows without `processedAt`, including 85 older than an already processed entry for the same owner/game. It exited before writes. Replaying those 85 directly could regress `z_entries_read` and misstate counters or Z-Coins. Repair requires chronological per-owner/game reconstruction and ledger audit. The remaining 633 entries are only replay candidates after isolation and a write pause.

There were 21 pre-existing outbox events marked `FAILED` at audit time, including two `GAMEPLAY_SESSION_COMPLETED` events. The achievements backfill recomputed completed-session progress, but it did not change outbox statuses.

The API/frontend release, revocation of client write permissions, and disabling of the three Appwrite webhooks have not been performed. Repeat feed and achievements backfills after the coordinated cutover to include activity created in the interim.
