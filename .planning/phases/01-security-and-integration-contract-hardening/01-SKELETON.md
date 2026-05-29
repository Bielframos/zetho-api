# Walking Skeleton - Zetho API

**Phase:** 1
**Generated:** 2026-05-29

## Capability Proven End-to-End

An authenticated actor can execute a protected mutation while webhook ingress rejects forged/replayed events and surfaces retryable integration failures through deterministic status contracts.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | NestJS 11 API modules/controllers/guards | Existing production stack; hardening can ship without migration risk. |
| Data layer | Appwrite TablesDB via injected provider | Existing transactional persistence and idempotency data already live here. |
| Auth | Appwrite session guard for user routes + dedicated system/webhook guards for machine routes | Implements D-01 through D-03 boundary split and prevents body-authoritative identity. |
| Deployment target | Existing Appwrite-hosted function/webhook + Nest API runtime | Keeps compatibility with current integrations while adding contract hardening. |
| Directory layout | Feature modules in src/modules and shared cross-cutting services under src/common | Matches current repo conventions and minimizes phase-1 integration friction. |

## Stack Touched in Phase 1

- [x] Project scaffold (framework, build, lint, test runner)
- [x] Routing - real guarded mutation and webhook ingress routes
- [x] Database - real write/read idempotency checks and replay-key persistence
- [x] API interaction - HTTP client/integration calls wired through bounded retry/timeout policy
- [x] Deployment path - documented local full-stack run via existing Nest/Appwrite integration surfaces

## Out of Scope (Deferred to Later Slices)

- Broad observability/SLO dashboards (Phase 2)
- Boundary extraction and transaction-core refactor (Phase 3)
- Performance optimization and CI quality gates expansion (Phase 4)
- Segment-aware live-ops feature delivery (Phase 5)

## Subsequent Slice Plan

Each later phase adds one vertical capability slice on top of this contract-hardening skeleton:

- Phase 2: Operational observability baseline for health, telemetry, and SLO visibility
- Phase 3: Boundary extraction and transaction-core determinism
- Phase 4: Performance and automated quality gates
- Phase 5: Segment-aware live-ops MVP
