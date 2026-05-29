# Domain Pitfalls

**Domain:** Gaming backend modernization (brownfield NestJS + Appwrite)
**Researched:** 2026-05-29

## Critical Pitfalls

Mistakes here commonly cause security incidents, major regressions, or expensive rewrites.

### Pitfall 1: Shipping Features Before Securing Mutation Boundaries
**What goes wrong:** New feature work lands while existing and new mutation endpoints still rely on request-body identity or weak/uneven guard coverage.
**Why it happens:** Teams optimize for visible feature throughput and defer guard/role standardization until "later".
**Consequences:** Account abuse, score/reward manipulation, and emergency hardening that blocks roadmap delivery.
**Warning signs:**
- New POST/PATCH/DELETE endpoints merge without explicit guard matrix review.
- Controller methods accept `userId` directly from body for privileged actions.
- Auth checks are inconsistent by module rather than policy-driven.
**Prevention strategy:**
- Define a mutation endpoint policy baseline (auth required by default, explicit public exceptions).
- Derive actor identity from session/JWT context, not payload.
- Add security acceptance criteria to PR template for every mutating route.
- Add targeted authz tests for critical domains (`zcoins`, `raffle`, `profile`, `webhook`).
**Which phase should address it:** Phase 1 - Security and Contract Hardening.

### Pitfall 2: "200 OK" Error Semantics in Async/Integration Flows
**What goes wrong:** Failing background/webhook operations return success-like HTTP statuses or swallow errors, so failures are invisible to callers and monitors.
**Why it happens:** Historical compatibility workarounds and missing error contract ownership.
**Consequences:** Silent data drift, no retries from upstream systems, and delayed detection.
**Warning signs:**
- Exceptions intentionally wrapped in success status codes.
- Fire-and-forget outbound calls in critical path without `await`, timeout, or response checks.
- Incidents first detected by manual data inspection, not alerts.
**Prevention strategy:**
- Standardize transport-level error semantics and idempotent retry behavior.
- Ensure all critical outbound calls are awaited, timeout-bounded, and instrumented.
- Add synthetic failure tests for webhook and sync paths.
**Which phase should address it:** Phase 1 - Security and Contract Hardening.

### Pitfall 3: Expanding Surface Area Without Centralized Config Validation
**What goes wrong:** Features and integrations expand while env vars remain loosely validated and inconsistently required.
**Why it happens:** Incremental integration growth without a typed config gate.
**Consequences:** Runtime crashes, insecure fallbacks, and environment-specific behavior differences.
**Warning signs:**
- Frequent `process.env` access spread across services/guards/functions.
- Boot succeeds despite missing required secrets/URLs.
- Incidents tied to staging/prod drift.
**Prevention strategy:**
- Introduce centralized typed config with fail-fast startup validation.
- Classify required vs optional vars by environment profile.
- Add config smoke test in CI and deploy preflight.
**Which phase should address it:** Phase 1 - Security and Contract Hardening.

### Pitfall 4: Refactoring Service Monoliths and Feature Work in the Same Change Set
**What goes wrong:** Teams try to split large services while simultaneously shipping feature behavior changes in the same PRs.
**Why it happens:** Pressure to "clean while building" without strangler boundaries.
**Consequences:** High regression risk, review blindness, rollback difficulty.
**Warning signs:**
- PRs touching orchestration, persistence, and business rules across many modules at once.
- No behavior-locking tests before structural extraction.
- Frequent merge conflicts around oversized services.
**Prevention strategy:**
- Separate structural refactors from behavioral changes.
- Introduce thin facades/use-case services with contract tests before extraction.
- Enforce max PR scope for modernization tracks.
**Which phase should address it:** Phase 2 - Modularization and Reliability Refactor.

### Pitfall 5: Keeping Full-History Aggregations on Hot Paths
**What goes wrong:** Leaderboards and analytics continue scanning transaction history in request time as data grows.
**Why it happens:** Fast MVP logic remains in place while usage scales.
**Consequences:** Latency spikes, higher infra cost, and request timeouts during peak load.
**Warning signs:**
- Offset pagination loops + in-memory aggregation in request handlers/services.
- N+1 profile lookups during scoreboard assembly.
- Response time grows with row count.
**Prevention strategy:**
- Introduce scheduled rollups/materialized aggregates for weekly/monthly boards.
- Use bulk profile hydration and index-aware queries.
- Add SLO-based performance regression tests for top endpoints.
**Which phase should address it:** Phase 3 - Performance and Scalability Hardening.

### Pitfall 6: Single-Process Rate Limiting for Multi-Instance Integrations
**What goes wrong:** Upstream API throttling/token caching is managed in process memory only.
**Why it happens:** Initial design assumes single instance and never revisits for horizontal scaling.
**Consequences:** Quota overruns, token stampedes, and intermittent sync failures after scaling out.
**Warning signs:**
- Token/rate state stored in class fields (`token`, timestamps, promises).
- Errors increase after adding replicas.
- Retry storms from multiple instances.
**Prevention strategy:**
- Move token and throttle coordination to shared cache/lock.
- Add distributed backoff and jitter policy.
- Create load test scenario for multi-instance sync.
**Which phase should address it:** Phase 3 - Performance and Scalability Hardening.

### Pitfall 7: Trying to "Test Everything" at Once Without Risk-Based Sequencing
**What goes wrong:** Team starts broad test effort without prioritizing highest-risk flows and contracts first.
**Why it happens:** Coverage % target dominates over business-risk targeting.
**Consequences:** Slow test rollout, persistent blind spots in critical flows, and brittle low-value tests.
**Warning signs:**
- Coverage rises while critical modules still have no meaningful tests.
- Few tests for transaction rollback/error paths.
- E2E suite grows but remains flaky due to external dependency coupling.
**Prevention strategy:**
- Define test pyramid by risk: mutation security, transactional integrity, webhook/sync idempotency first.
- Stabilize deterministic mocks/fixtures for external APIs.
- Add coverage thresholds per critical module, not only global.
**Which phase should address it:** Phase 4 - Quality and Test Expansion.

## Moderate Pitfalls

### Pitfall 1: Observability Added Late and Inconsistently
**What goes wrong:** Metrics/logging are added after changes ship, leaving no reliable before/after baseline.
**Warning signs:**
- No request correlation IDs across webhook/sync/editorial paths.
- Dashboards focus on host metrics, not domain outcomes.
**Prevention strategy:**
- Add domain SLOs, structured logs, and correlation IDs before major changes.
- Instrument golden paths first (IGDB sync, webhook handlers, zcoins mutations, editorial pipeline).
**Which phase should address it:** Phase 2 - Modularization and Reliability Refactor.

### Pitfall 2: Contract Drift Between API Consumers and Refactored Endpoints
**What goes wrong:** Refactors alter payload/status behavior without explicit compatibility checks.
**Warning signs:**
- Consumer bugs rise immediately after backend refactors.
- No contract tests or compatibility snapshot for high-traffic routes.
**Prevention strategy:**
- Capture OpenAPI/contract snapshots and diff in CI.
- Use additive change patterns and feature flags for breaking behavior.
**Which phase should address it:** Phase 2 - Modularization and Reliability Refactor.

### Pitfall 3: Long-Lived Transactions and Coarse Retry Logic
**What goes wrong:** Transaction windows become too long and conflict handling is generic, causing repeated failures under concurrency.
**Warning signs:**
- Conflict errors spike during busy periods.
- Retries re-run full flows with side effects.
**Prevention strategy:**
- Keep transactions short and staged operations tightly scoped.
- Implement conflict-aware retry paths with idempotency keys/checkpoints.
**Which phase should address it:** Phase 3 - Performance and Scalability Hardening.

## Minor Pitfalls

### Pitfall 1: CI Quality Gates Introduced Too Late
**What goes wrong:** Modernization progresses without automated lint/test/build enforcement on each merge.
**Warning signs:**
- Manual pre-merge checks vary by engineer.
- Regressions discovered only after deploy.
**Prevention strategy:**
- Add minimal CI gate early (lint + unit + smoke e2e) and tighten progressively.
**Which phase should address it:** Phase 1 - Security and Contract Hardening.

### Pitfall 2: Missing Health/Readiness Contracts During Rollouts
**What goes wrong:** Deployments proceed without robust health/readiness endpoints tied to critical dependencies.
**Warning signs:**
- Rollouts rely on process up/down only.
- Instances receive traffic before dependencies are ready.
**Prevention strategy:**
- Add liveness/readiness endpoints with dependency checks and startup grace policies.
**Which phase should address it:** Phase 1 - Security and Contract Hardening.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Security hardening + feature shipping | Mutations remain partially unauthenticated while features expand | Freeze new mutating endpoints until guard matrix + actor-identity policy is enforced |
| Reliability refactor | Structural and behavioral changes mixed together | Enforce two-lane work: contract-preserving refactors first, behavior changes behind flags |
| Performance tuning | Premature micro-optimizations ignore true hotspots | Instrument first, optimize only top percentile latency/cost endpoints |
| Test expansion | Coverage target gaming with low-value tests | Risk-based test plan with mandatory suites for critical transaction/auth/webhook flows |
| Integration scaling | Process-local throttling fails under replicas | Shared token/throttle coordinator and chaos/load scenarios before scale-out |

## Sources

- Internal project context (HIGH confidence):
  - `.planning/PROJECT.md`
  - `.planning/codebase/CONCERNS.md`
  - `.planning/codebase/TESTING.md`
- NestJS docs (MEDIUM-HIGH confidence, official):
  - https://docs.nestjs.com/pipes
  - https://docs.nestjs.com/fundamentals/testing
  - https://docs.nestjs.com/security/authentication
- Appwrite docs (MEDIUM-HIGH confidence, official):
  - https://appwrite.io/docs/products/databases/transactions
