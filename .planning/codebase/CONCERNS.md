# Codebase Concerns

**Analysis Date:** 2026-05-29

## Tech Debt

**Business-heavy service classes (coupling + maintainability hotspot):**
- Severity: High
- Issue: Domain logic, persistence, transaction handling, and external API orchestration are concentrated in single services with very large file size and many responsibilities.
- Files: `src/common/ai/agents/editor/editor.service.ts`, `src/modules/igdb/igdb.service.ts`, `src/modules/raffle/raffle.service.ts`, `src/modules/game/game.service.ts`, `src/modules/profile/profile.service.ts`, `src/modules/webhook/handlers/zetho.handler.ts`
- Impact: Higher regression risk, slower onboarding, harder refactors, and difficult isolation testing.
- Rationale: The largest files range from ~570 to ~701 lines and mix concerns (I/O, orchestration, business rules, data updates).
- Fix approach: Extract orchestrators from domain services, move Appwrite read/write operations into repository-like adapters per bounded context, and split workflows into smaller use-case services.

**Duplicated IGDB upsert/update logic across modules:**
- Severity: Medium
- Issue: Similar conflict-resolution and transaction logic is duplicated between IGDB ingestion paths.
- Files: `src/modules/igdb/igdb.service.ts`, `src/modules/webhook/handlers/igdb.handler.ts`
- Impact: Bug fixes can diverge between paths; behavior consistency becomes harder to guarantee.
- Rationale: Both files implement near-identical upsert conflict handling, checksum checks, and company-replace transaction sequences.
- Fix approach: Centralize shared IGDB upsert flow in one service and reuse from webhook + API entrypoints.

**Custom validation pipe exists but is mostly unused:**
- Severity: Medium
- Issue: A project-level validation pipe is implemented but request validation is applied inconsistently, mostly per-controller.
- Files: `src/common/pipes/validation/validation.pipe.ts`, `src/main.ts`, `src/modules/game/game.controller.ts`, `src/modules/profile/profile.controller.ts`, `src/modules/zcoins/zcoins.controller.ts`
- Impact: Input hardening varies by route; accidental weak endpoints are more likely.
- Rationale: `main.ts` does not register a global pipe, and several controllers rely on ad-hoc parsing/body extraction.
- Fix approach: Adopt one global validation strategy and make DTO validation mandatory for mutating endpoints.

## Known Bugs

**Webhook IGDB errors are surfaced as HTTP 200:**
- Severity: High
- Symptoms: Failures in webhook processing are thrown as `HttpException(..., HttpStatus.OK)`.
- Files: `src/modules/webhook/handlers/igdb.handler.ts`
- Trigger: Any internal exception during `upsertGame`, `upsertGenre`, or `deleteGenre`.
- Workaround: Inspect logs; HTTP status alone is not trustworthy.
- Rationale: Monitoring and retry systems can treat failed operations as successful.

**Cache invalidation call is fire-and-forget without error handling:**
- Severity: Medium
- Symptoms: Frontend revalidation can fail silently while API flow continues as if successful.
- Files: `src/common/ai/agents/editor/editor.service.ts`
- Trigger: Network issues, invalid `FRONTEND_REVALIDATE_SECRET`, or non-200 revalidation response.
- Workaround: Manual frontend cache refresh/redeploy.
- Rationale: `invalidateFrontendCache()` performs `fetch(...)` without `await` or response validation.

## Security Considerations

**Unauthenticated ZCoins mutation endpoints:**
- Severity: Critical
- Risk: External clients can attempt direct score/balance mutations by posting `userId` and `reason` payloads.
- Files: `src/modules/zcoins/zcoins.controller.ts`, `src/modules/zcoins/zcoins.service.ts`
- Current mitigation: Service-side reason validation against score table.
- Recommendations: Protect `POST /zcoins/input` and `POST /zcoins/output` with `AppwriteSessionGuard` + role checks, and derive `userId` from authenticated session rather than request body.
- Rationale: Direct body-provided identity on mutation endpoints is a high-value abuse surface.

**Environment/config values are used without startup validation:**
- Severity: High
- Risk: Misconfiguration causes runtime failures, weak security posture, or inconsistent guard behavior.
- Files: `src/main.ts`, `src/common/appwrite/constants.ts`, `src/common/appwrite/appwrite.provider.ts`, `src/common/ai/ai.module.ts`, `src/common/guards/webhook.guard.ts`, `src/common/guards/system-api.guard.ts`, `src/modules/google/youtube.service.ts`, `src/modules/notifications/evolution.service.ts`, `functions/Gamer Scout/src/main.js`
- Current mitigation: Partial runtime checks in selected services/guards.
- Recommendations: Add a centralized typed config module with required/optional schema checks and fail-fast bootstrap.
- Rationale: Several critical secrets/URLs are cast and consumed directly from `process.env`.

**Webhook secret/signature comparison is plain equality:**
- Severity: Medium
- Risk: Comparison is not constant-time and relies on exact URL reconstruction from environment.
- Files: `src/common/guards/webhook.guard.ts`, `src/common/guards/igdb.guard.ts`
- Current mitigation: HMAC and shared-secret checks exist.
- Recommendations: Use timing-safe comparison and strict canonical message construction independent of mutable deployment URL strings.
- Rationale: Equality checks and URL-coupled signatures are fragile under proxy/base URL drift.

## Performance Bottlenecks

**Leaderboard computation scans and aggregates transaction history in app layer:**
- Severity: High
- Problem: Weekly leaderboard loops through pages and aggregates in memory, then resolves each profile separately.
- Files: `src/modules/zcoins/zcoins.service.ts`
- Cause: Offset pagination over `zcoin_transactions` + per-user lookup (`findProfileByUserId`) creates N+1 access pattern.
- Improvement path: Add pre-aggregated leaderboard table/materialized snapshots and bulk profile fetch strategy.
- Rationale: Cost grows with transaction volume and player count.

**In-memory IGDB rate-limit/token state is per-process only:**
- Severity: Medium
- Problem: Throttle/token reuse logic does not coordinate across horizontally scaled instances.
- Files: `src/modules/igdb/igdb.service.ts`
- Cause: `requestTimestamps`, `token`, `tokenExpiry`, and `authPromise` are process-local.
- Improvement path: Use distributed coordination (cache/lock), centralized token cache, and shared rate-limit state.
- Rationale: Multi-instance deployments can exceed upstream API constraints despite local throttling.

## Fragile Areas

**Manual Appwrite transaction choreography repeated across modules:**
- Severity: High
- Files: `src/modules/webhook/handlers/zetho.handler.ts`, `src/modules/webhook/handlers/igdb.handler.ts`, `src/modules/zcoins/zcoins.service.ts`, `src/modules/raffle/raffle.service.ts`, `src/modules/game/game.service.ts`, `src/modules/profile/profile.service.ts`, `src/modules/igdb/igdb.service.ts`
- Why fragile: Repeated create/operations/commit/rollback blocks increase chance of inconsistent error semantics and partial rollback handling.
- Safe modification: Encapsulate transaction lifecycle in a shared helper and enforce standard rollback + error mapping rules.
- Test coverage: Limited automated coverage of rollback/error paths.

**Direct module-to-module coupling in AI/editor flow:**
- Severity: Medium
- Files: `src/common/ai/agents/editor/editor.service.ts`
- Why fragile: Editor pipeline depends on feeds parsing, game lookup, YouTube service, notifications, AI prompt outputs, and external media APIs in one execution path.
- Safe modification: Isolate each stage (ingest, analyze, draft, enrich, publish, notify) behind explicit interfaces and stage-level contracts.
- Test coverage: No targeted tests for stage failures and fallback behavior.

## Scaling Limits

**Weekly leaderboard throughput tied to full-history reads:**
- Severity: High
- Current capacity: Bounded by 500-row pages and in-process aggregation loops.
- Limit: Response latency and memory grow with `zcoin_transactions` size.
- Scaling path: Incremental aggregates per period, scheduled rollups, and index-aware query strategy.

**Feed/AI pipeline fan-out in scheduled editor run:**
- Severity: Medium
- Current capacity: Hourly cron executes multi-feed fetch + AI processing + external services sequentially.
- Limit: External provider latency/failure can elongate run and reduce reliability.
- Scaling path: Queue-based stage execution, retries with backoff, and idempotent publish checkpoints.

## Dependencies at Risk

**External API dependency volatility (IGDB/Twitch, Unsplash, Google, Evolution):**
- Severity: Medium
- Risk: API quota shifts, auth key rotation, or upstream contract changes degrade critical flows.
- Impact: Game sync, media enrichment, notifications, and editorial automation can fail.
- Migration plan: Add provider-level adapters, fallback providers, circuit-breaker/retry policy, and SLA-aware monitoring.
- Files: `src/modules/igdb/igdb.service.ts`, `src/common/ai/agents/editor/editor.service.ts`, `src/modules/google/youtube.service.ts`, `src/modules/notifications/evolution.service.ts`

## Missing Critical Features

**No CI pipeline detected in repository:**
- Severity: High
- Problem: No `.github/workflows` directory detected.
- Blocks: Reliable pre-merge checks for lint/test/build and policy enforcement.
- Files: `package.json`, `test/app.e2e-spec.ts`, `src/app.controller.spec.ts`

**No health/readiness endpoints for operational checks:**
- Severity: Medium
- Problem: No dedicated health module/controller detected.
- Blocks: Infrastructure-level readiness/liveness checks and safer rollout automation.
- Files: `src/main.ts`, `src/app.module.ts`

## Test Coverage Gaps

**Business-critical modules are effectively untested:**
- Severity: Critical
- What's not tested: IGDB sync, webhook handlers, raffle transactions, profile audit/invite flows, zcoins mutation safety, AI/editor orchestration.
- Files: `src/modules/igdb/igdb.service.ts`, `src/modules/webhook/handlers/zetho.handler.ts`, `src/modules/webhook/handlers/igdb.handler.ts`, `src/modules/raffle/raffle.service.ts`, `src/modules/profile/profile.service.ts`, `src/modules/zcoins/zcoins.service.ts`, `src/common/ai/agents/editor/editor.service.ts`
- Risk: Regressions in data integrity, auth boundaries, and external integration behavior can reach production unnoticed.
- Priority: High
- Rationale: Existing tests are starter-level (`src/app.controller.spec.ts`, `test/app.e2e-spec.ts`) and do not cover core domain flows.

---

*Concerns audit: 2026-05-29*
