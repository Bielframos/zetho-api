# Project Research Summary

**Project:** Zetho API
**Domain:** Gaming ecosystem backend (NestJS modular monolith + Appwrite)
**Researched:** 2026-05-29
**Confidence:** MEDIUM-HIGH

## Executive Summary

Zetho API is a gaming/community backend where credibility depends less on net-new surface area and more on correctness, reliability, and secure operation under integration pressure. The research converges on a pragmatic pattern used by mature teams in this domain: preserve the current platform core (NestJS 11 + Appwrite), harden mutation and integration boundaries first, then scale value features through event-driven workflows. In short, this is a hardening-and-architecture-discipline milestone, not a rewrite milestone.

The recommended approach is a boundary-driven modular monolith with explicit facade/domain/port seams, transaction-backed write paths for invariant-sensitive flows, and durable async processing for side effects. Operationally, Redis should be introduced once and reused for cache, distributed throttling state, and queue coordination; observability should standardize on structured logs plus OpenTelemetry and core metrics before major refactors proceed. This sequencing creates safe acceleration: better incident response now, faster feature velocity later.

The biggest risks are policy drift on mutating routes, silent failure semantics in webhook/sync paths, and structural-plus-behavioral change mixed in the same refactors. Mitigation is clear: enforce an authz matrix and actor identity policy first, normalize error semantics and idempotent retries, and separate contract-preserving refactors from behavior changes behind tests and flags. If that discipline holds, roadmap risk drops substantially while preserving room for differentiators (segment-aware live-ops, experimentation) in later phases.

## Key Findings

### Recommended Stack

The stack recommendation is conservative where risk is high and progressive where leverage is high: keep NestJS 11 + Express + Appwrite for near-term delivery stability, then add infrastructure primitives (Redis, BullMQ, OTel, Pino, throttling, OpenAPI linting) that improve reliability and engineering speed without platform churn. Fastify and broader schema/validation migrations remain optional, benchmark-gated improvements rather than immediate dependencies.

Critical versions are anchored to current ecosystem posture from the research date: Node.js 24.x LTS, Nest 11.1.x, node-appwrite 25.2.0, BullMQ 5.x, and current OpenTelemetry JS lines.

**Core technologies:**

- Node.js 24.x LTS: runtime baseline - active LTS support and predictable security cadence.
- NestJS 11.1.x: API framework - strong modular patterns (guards, pipes, queues, config) aligned with current codebase.
- Appwrite + node-appwrite 25.2.0: primary data/auth platform - existing fit; optimize usage before any replacement discussion.
- Redis 7.x: shared state backbone - enables distributed-safe cache/throttling/queue behavior.
- BullMQ + @nestjs/bullmq: durable async workflows - retry/backoff/idempotency/DLQ patterns for integration-heavy flows.
- OpenTelemetry + Pino + prom-client: observability core - correlated traces/logs/metrics for SLOs and incident response.

### Expected Features

Feature research emphasizes that baseline trust features are now mandatory in this domain and should be completed before broad differentiator expansion. The most valuable sequence is: secure mutation integrity, guarantee webhook/sync correctness, operationalize SLIs/SLOs, then layer selective live-ops intelligence.

**Must have (table stakes):**

- AuthN/AuthZ hardening for all mutating APIs - consistent policy and object-level authorization.
- Webhook security and idempotent ingestion - signature verification, replay protection, dedup/retry discipline.
- Rate limiting/quotas and distributed controls - abuse prevention and integration stability.
- Observability baseline plus SLI/SLO starter set - measurable reliability and error-budget governance.
- Risk-based test pyramid and CI release gates - safer modernization in a brownfield codebase.

**Should have (competitive):**

- Segment-aware live-ops orchestration - personalized engagement/reward flows.
- Event-driven automation workflows - lower operational latency for campaign/editorial actions.
- Content intelligence maturity (AI + human-in-the-loop) - improved quality at lower editorial cost.
- Cross-channel notification optimization - better activation and reduced fatigue.

**Defer (v2+):**

- Broad experimentation platform rollout - defer until telemetry and segmentation data quality are stable.
- Platform rewrites/microservices/multi-region active-active - high complexity, weak immediate ROI for current milestone.
- Blanket real-time websocket expansion - target only proven high-value domains.

### Architecture Approach

Architecture findings strongly support evolving to a boundary-driven modular monolith: transport-only ingress, application facades for use-case orchestration, pure domain services for business rules, and explicit ports/adapters for Appwrite/external APIs/messaging. Critical writes should use Appwrite transaction orchestration where invariants exist; post-commit domain events should trigger async side effects via BullMQ. This pattern reduces coupling, preserves migration optionality, and aligns delivery with reliability goals.

**Major components:**

1. Ingress layer (controllers/webhooks/cron) - auth/validation/request mapping only.
2. Application facades per domain - orchestrate transactions, domain calls, and event emission.
3. Domain services + value objects - deterministic business logic without network/SDK coupling.
4. Ports/adapters layer - Appwrite, IGDB/YouTube, notification providers, cache, queue integration.
5. Async workflow module - retryable idempotent side-effect processing with DLQ visibility.
6. Observability + policy modules - cross-cutting telemetry, health, and reusable authorization policy.

### Critical Pitfalls

1. **Feature expansion before mutation security baseline** - enforce auth-required-by-default and actor-from-session policy before new mutating endpoints.
2. **Success-like error semantics in async/integration paths** - normalize HTTP error contracts, await and timeout critical outbound calls, and test synthetic failures.
3. **Config sprawl without centralized validation** - introduce typed config with fail-fast startup checks and CI preflight.
4. **Mixing structural refactors with behavior changes in same PRs** - separate tracks: contract-preserving extraction first, behavior deltas later behind tests/flags.
5. **Hot-path full-history aggregation and process-local throttling at scale** - shift to rollups/projections and shared distributed coordination.

## Implications for Roadmap

Based on combined research, suggested phase structure:

### Phase 1: Security, Contracts, and Operational Baseline

**Rationale:** Highest risk concentration; creates a safe foundation for all later work.
**Delivers:** Authz matrix for all mutating routes, actor identity enforcement, webhook signature/replay/idempotency baseline, typed config validation, health/readiness, initial CI gate.
**Addresses:** Table stakes for auth integrity, webhook reliability, secure config lifecycle, release safety.
**Avoids:** Pitfalls 1-3 and minor rollout/control failures.

### Phase 2: Boundary Extraction and Reliability Refactor

**Rationale:** Dependency-minimizing structural cleanup after observability and policy rails exist.
**Delivers:** Facade/domain/port seams in critical modules (`game`, `igdb`, `webhook`, `raffle`, `zcoins`), post-commit domain events, contract snapshots/diffs in CI, two-lane refactor governance.
**Uses:** Nest module patterns, ConfigModule/validation, structured telemetry.
**Implements:** Explicit component boundaries from architecture research.

### Phase 3: Transactional Integrity and Async Workflow Platform

**Rationale:** Once boundaries exist, invariant-sensitive writes and side-effect reliability can be implemented cleanly.
**Delivers:** Appwrite transaction orchestration for critical multi-row invariants, BullMQ workers with retry/backoff/idempotency/DLQ, distributed rate/token coordination via Redis.
**Addresses:** Data correctness, webhook/sync durability, integration scaling hazards.
**Avoids:** Long-lived transaction conflicts, retry storms, silent drift.

### Phase 4: Read-Model Performance and Quality Expansion

**Rationale:** Optimize only after write model and async reliability stabilize.
**Delivers:** Query-service/projection optimizations, `select`/index/pagination tuning, SLO-driven perf tests, risk-prioritized integration and contract test depth.
**Addresses:** Performance table stakes and test foundation maturity.
**Avoids:** Premature optimization and coverage gaming.

### Phase 5: Focused Differentiator Slice (Segment-Aware Live-Ops)

**Rationale:** Introduce one high-value differentiator after operational and correctness baselines are dependable.
**Delivers:** Narrow personalized campaign/reward trigger path using existing notifications/editorial/event infrastructure.
**Addresses:** Competitive differentiation with controlled blast radius.
**Avoids:** Over-broad experimentation platform rollout before telemetry readiness.

### Phase Ordering Rationale

- Security and contract correctness must precede scale and feature breadth because they directly control trust, abuse resistance, and rollback safety.
- Boundary extraction before transactions/queues reduces coupling and enables clean event-driven handoff.
- Transaction/async platform before read optimization ensures the system is first correct and resilient, then fast.
- Differentiators come last to avoid compounding risk while core reliability signals are still immature.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 3:** Appwrite transaction coverage boundaries and conflict strategy per workflow; distributed throttling/token coordination specifics under multi-instance load.
- **Phase 5:** Segmentation model, experimentation guardrails, and policy/audit requirements for live-ops personalization.

Phases with standard patterns (skip research-phase):

- **Phase 1:** Security/config/health/CI hardening patterns are well-documented across Nest/OWASP/SRE sources.
- **Phase 2:** Modular monolith boundary extraction and post-commit event patterns are established and already mapped in current architecture research.

## Confidence Assessment

| Area         | Confidence  | Notes                                                                                                                                                            |
| ------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH        | Strongly grounded in current official docs + live package/version verification; only minor Appwrite source mismatch noted.                                       |
| Features     | MEDIUM-HIGH | Table stakes and differentiation patterns align with platform docs and SRE guidance, but product-specific prioritization still requires stakeholder calibration. |
| Architecture | HIGH        | Pattern fit is direct for current codebase shape and supported by official Nest/Appwrite capabilities.                                                           |
| Pitfalls     | HIGH        | Risks are concrete, observed in brownfield modernization contexts, and map clearly to current repository concerns.                                               |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- Appwrite transaction fit by domain flow: validate exactly which mutation paths require strict transaction boundaries versus eventual consistency.
- External integration policy matrix: formalize per-provider retry semantics, timeout budgets, and rate-limit handling in implementation specs.
- SLO target calibration: define realistic initial latency/availability/freshness thresholds using production baseline telemetry.
- Differentiator success metrics: establish measurable retention/engagement hypotheses before scaling live-ops personalization beyond a thin slice.

## Sources

### Primary (HIGH confidence)

- .planning/research/STACK.md - validated runtime/framework/dependency posture and versions.
- .planning/research/ARCHITECTURE.md - boundary model, data flow, dependency ordering.
- Official NestJS docs (modules/config/events/queues/security/openapi).
- Official Appwrite docs (queries/relationships/transactions).
- Node release index and npm package registry checks captured in stack research.

### Secondary (MEDIUM confidence)

- .planning/research/FEATURES.md - domain feature categorization and prioritization.
- .planning/research/PITFALLS.md - phase-scoped failure patterns and mitigations.
- SRE and OWASP API guidance used to contextualize operational/security baselines.

### Tertiary (LOW confidence)

- Vendor capability comparisons beyond official docs where source depth was not uniform; treat as directional and validate during phase planning.

---

_Research completed: 2026-05-29_
_Ready for roadmap: yes_
