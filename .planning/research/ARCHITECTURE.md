# Architecture Patterns

**Domain:** NestJS modular monolith with Appwrite backend
**Researched:** 2026-05-29
**Overall confidence:** HIGH

## Recommended Architecture

Evolve the current module-centric monolith into a boundary-driven modular monolith with explicit contracts between domains, durable async workflows for non-critical side effects, and transaction-backed consistency for critical mutations.

This should remain a single deployable application in the near term, but with internal architecture that is migration-ready if any module later needs to split into a service.

### Target Shape (Near-Term)

```text
Ingress (HTTP/Webhook/Cron)
  -> Application Facades (per domain use-case APIs)
    -> Domain Services (pure business logic)
      -> Ports (Appwrite, External APIs, Messaging, Cache)
        -> Adapters (Appwrite SDK, IGDB API, YouTube, Evolution, Queue)

Cross-cutting rails:
- Typed Config + startup validation
- Unified authz policy layer
- Structured logging + metrics + trace correlation IDs
- Idempotency + retry policies + dead-letter handling
```

## Component Boundaries

| Component                                                         | Responsibility                                             | Communicates With                |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------- |
| Ingress layer (`controllers`, webhook handlers, cron triggers)    | Transport concerns only: auth, validation, request mapping | Application facades              |
| Application facades (new per module)                              | Orchestrate use-case flow, transactions, and events        | Domain services, ports           |
| Domain services                                                   | Deterministic business rules; no SDK/network calls         | Ports, value objects             |
| Persistence port (`AppwriteTablesPort`)                           | Abstract row/query/transaction primitives                  | Appwrite adapter                 |
| Integration ports (`IgdbPort`, `YouTubePort`, `NotificationPort`) | Hide external API details and retries                      | Provider adapters                |
| Domain event bus (in-process first)                               | Decouple side effects from core writes                     | Event handlers, queue producer   |
| Async workflow module (queue workers)                             | Reliable processing for long/fragile work                  | Domain events, integration ports |
| Observability module                                              | Correlated logs, metrics, health, failure counters         | All modules                      |
| Policy module                                                     | Reusable authz and role checks, endpoint classification    | Ingress + facades                |

## Data Flow

### 1. Synchronous command flow (critical mutation)

1. Controller/webhook validates payload and principal.
2. Facade starts transaction boundary (Appwrite transaction where multi-row consistency is required).
3. Domain service applies business rules.
4. Persistence port stages writes.
5. Transaction commits.
6. Facade emits domain event (`...changed`) after commit.
7. API returns success with operation metadata.

Why: keeps write path deterministic and avoids partial writes.

### 2. Asynchronous side-effect flow (non-critical)

1. Domain event emitted after successful commit.
2. Event handler enqueues idempotent job (BullMQ) or executes guarded in-process listener for lightweight tasks.
3. Worker performs integration call (notifications, feed enrichment, external sync follow-up).
4. Worker records status and retry/dead-letter outcome.

Why: isolates flaky external dependencies from request latency and availability.

### 3. Read flow (query-heavy endpoints)

1. Controller delegates to query facade.
2. Query facade uses explicit `Query.select(...)` and indexed filters.
3. Cache only stable/read-mostly projections with bounded TTL.
4. Return lean DTOs, not raw table rows.

Why: reduces Appwrite payload size and keeps API contracts stable.

## Patterns To Follow

### Pattern 1: Facade + Port boundary per module

**What:** Add `application/` and `infrastructure/` seams inside each domain module, with interfaces at domain edges.
**When:** Immediately for high-churn modules (`game`, `igdb`, `webhook`, `raffle`, `zcoins`, `gazetho`).
**Benefit:** Reduces direct coupling to Appwrite SDK and external adapters.

### Pattern 2: Post-commit domain events

**What:** Emit events only after transaction success; listeners handle side effects.
**When:** For notifications, content publishing fan-out, enrichment, recalculations.
**Benefit:** Prevents side effects from triggering on failed writes.

### Pattern 3: Transaction-backed write orchestration

**What:** Use Appwrite Databases transactions (`createTransaction` -> stage operations with `transactionId` -> `updateTransaction` commit/rollback) for multi-row invariants.
**When:** Raffle purchases, zcoins updates, profile/economy coupled changes.
**Benefit:** Cuts race-condition and partial-write risk.

### Pattern 4: Typed, centralized configuration

**What:** Introduce `@nestjs/config` with startup schema validation and namespaced config per module.
**When:** First phase, before further module extraction.
**Benefit:** Removes hidden runtime failures from scattered `process.env` access.

### Pattern 5: Reliability envelope for async jobs

**What:** Queue retries, bounded backoff, idempotency keys, DLQ/failed-job observability.
**When:** Introduce before moving expensive sync operations to background workers.
**Benefit:** Improves resilience without silent data drift.

## Anti-Patterns To Avoid

### Anti-Pattern 1: Controller/service omniscience

**What:** One service directly calling many domains and external APIs.
**Why bad:** Hidden dependencies and high regression blast radius.
**Instead:** Facade orchestrates domain + ports; each dependency is explicit.

### Anti-Pattern 2: Global mutable state in services

**What:** Shared mutable promises/locks without clear ownership.
**Why bad:** Concurrency bugs and hard-to-reproduce failures.
**Instead:** Encapsulate lock/idempotency behavior in dedicated infra utilities with metrics.

### Anti-Pattern 3: Sync external side effects inside critical command path

**What:** Notification/enrichment calls in request transaction path.
**Why bad:** Increases latency and failure coupling.
**Instead:** Emit event and process side effect asynchronously.

## Suggested Build Order And Dependency Implications

### Phase A: Foundations and safety rails (first)

Scope:

- Introduce `ConfigModule` globally with schema validation.
- Centralize env access and secret naming.
- Add request correlation IDs, structured logs, and baseline metrics.
- Standardize global validation/serialization defaults.

Dependencies:

- Required before major refactors to avoid changing behavior without visibility.
- Low risk, high leverage.

### Phase B: Boundary extraction in critical modules

Scope:

- Refactor `game`, `igdb`, `webhook`, `raffle`, `zcoins` into facade/domain/port structure.
- Replace direct cross-module calls with interface contracts.
- Publish internal domain events for side-effect hooks.

Dependencies:

- Depends on Phase A config/observability for safe rollout.
- Enables parallel work by reducing hidden coupling.

### Phase C: Transactional consistency + async workflows

Scope:

- Wrap multi-row mutations in Appwrite transactions where invariants exist.
- Add BullMQ for durable background jobs for non-critical side effects.
- Implement idempotency + retry/DLQ policy.

Dependencies:

- Depends on Phase B contracts (ports/events) for clean async handoff.
- Requires operational telemetry from Phase A to tune retries.

### Phase D: Query/read-model optimization and operability hardening

Scope:

- Introduce dedicated query services and projection tables where needed.
- Optimize Appwrite queries (`select`, indexes, pagination strategy).
- Add runbooks, health checks, and rollback playbooks per critical flow.

Dependencies:

- Depends on stable write/event model from Phase C.
- Can execute incrementally per endpoint.

## Dependency Graph (Roadmap Input)

```text
Phase A (Safety Rails)
  -> required by -> Phase B (Boundary Extraction)
  -> required by -> Phase C (Transactions + Async)

Phase B
  -> unlocks clean event contracts for -> Phase C

Phase C
  -> stabilizes write model for -> Phase D (Read-model optimization)
```

## Scalability Considerations

| Concern                  | At 100 users              | At 10K users                                              | At 1M users                                              |
| ------------------------ | ------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| Sync write contention    | Direct writes acceptable  | Add transaction boundaries for hot invariants             | Introduce finer-grained sharding strategy by domain keys |
| External API reliability | Inline retries acceptable | Queue side effects + backoff + DLQ                        | Dedicated worker pools + rate-limit governance           |
| Query performance        | Basic pagination          | Index audit + select field minimization + cache hot paths | Projection/read-model strategy with strict SLA tiers     |
| Operational visibility   | Logs only                 | Structured logs + metrics + error taxonomy                | SLOs, alerting, and automated remediation runbooks       |

## Confidence Notes

- **HIGH:** Nest module boundaries, events, config validation, and queue patterns are directly supported in official Nest docs.
- **HIGH:** Appwrite transaction orchestration (`createTransaction`, staged operations via `transactionId`, commit conflict checks) is documented and suitable for multi-row consistency.
- **MEDIUM:** Exact transaction coverage needed per existing workflow should be validated module-by-module during implementation.

## Sources

- NestJS Modules: https://docs.nestjs.com/modules (official docs)
- NestJS Configuration: https://docs.nestjs.com/techniques/configuration (official docs)
- NestJS Events: https://docs.nestjs.com/techniques/events (official docs)
- NestJS Queues (BullMQ): https://docs.nestjs.com/techniques/queues (official docs)
- NestJS Validation: https://docs.nestjs.com/techniques/validation (official docs)
- Appwrite Databases Queries: https://appwrite.io/docs/products/databases/queries (official docs)
- Appwrite Databases Relationships: https://appwrite.io/docs/products/databases/relationships (official docs)
- Appwrite Databases Transactions: https://appwrite.io/docs/products/databases/transactions (official docs)
- Existing project context: `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`
