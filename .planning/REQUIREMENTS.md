# Requirements: Zetho API

**Defined:** 2026-05-29
**Core Value:** Deliver a reliable and secure gaming backend that continuously provides fresh, useful user value without operational friction.

## v1 Requirements

### Security & Authorization

- [ ] **SECU-01**: User can only execute protected mutation endpoints when authenticated and authorized by role/policy.
- [ ] **SECU-02**: User identity for critical mutations is derived from authenticated context, not request body identity fields.
- [ ] **SECU-03**: System/webhook integrations can only access routes with validated secrets/signatures and replay protection.
- [ ] **SECU-04**: User receives explicit authorization error responses for denied operations (no silent success semantics).

### Reliability & Contracts

- [ ] **RELY-01**: Webhook ingestion is idempotent for duplicate deliveries of the same event.
- [ ] **RELY-02**: Sync and webhook processing returns failure status on internal processing errors to enable retries/alerts.
- [ ] **RELY-03**: User can rely on health/readiness endpoints that reflect dependency status for safe deploy/rollback automation.
- [ ] **RELY-04**: Critical external integrations use bounded retries/timeouts and observable failure paths.

### Observability & Operations

- [ ] **OBSV-01**: Operator can trace a request/job end-to-end using correlation IDs across logs.
- [ ] **OBSV-02**: Operator can monitor latency, error rate, and throughput for critical API and pipeline flows.
- [ ] **OBSV-03**: Team can track core SLIs/SLOs (availability, latency, freshness/correctness) and review error-budget status.

### Architecture & Maintainability

- [ ] **ARCH-01**: Team can evolve critical domains through explicit facade/domain/adapter boundaries instead of monolithic service classes.
- [ ] **ARCH-02**: Shared transaction lifecycle behavior is centralized for consistency across modules.
- [ ] **ARCH-03**: Domain side effects execute through explicit post-commit workflows instead of ad-hoc fire-and-forget calls.

### Data Integrity & Performance

- [ ] **DATA-01**: Critical multi-row invariants (economy/raffle/profile-sensitive writes) execute with deterministic transactional behavior.
- [ ] **DATA-02**: Weekly leaderboard and hot read paths meet agreed performance targets under representative load.
- [ ] **DATA-03**: Integration rate/token coordination remains correct under multi-instance deployments.

### Quality & Delivery

- [ ] **QUAL-01**: Team has automated tests covering critical security, webhook/sync, and transaction integrity flows.
- [ ] **QUAL-02**: Team has integration-level tests for at least one critical path in each high-risk domain (`igdb`, `webhook`, `raffle`, `zcoins`, `profile`).
- [ ] **QUAL-03**: CI blocks merges when lint/build/tests fail.

### User-Value Expansion

- [ ] **LIVE-01**: User can receive a first segment-aware live-ops experience (targeted campaign/reward path) backed by existing backend capabilities.
- [ ] **LIVE-02**: Operator can safely enable/disable the live-ops slice without destabilizing core flows.

## v2 Requirements

### Advanced Live-Ops and Experimentation

- **LIVE-03**: User receives adaptive experimentation-driven campaign variants with measurable statistical confidence.
- **LIVE-04**: Operator can manage full experimentation lifecycle (assignment, guardrails, analysis) from backend tooling.

### Platform Evolution

- **PLAT-01**: Team can evaluate service decomposition decisions with production SLO evidence and bounded migration plans.
- **PLAT-02**: Team can support broader real-time experiences where justified by validated demand.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full frontend redesign/replatform | Current initiative is API/platform-focused and backend-first. |
| NestJS/Appwrite platform replacement | High migration risk with low short-horizon ROI. |
| Broad microservices split | Premature for current maturity and timeline; boundary extraction first. |
| Multi-region active-active redesign | Not justified for this cycle and would dilute core hardening work. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SECU-01 | Phase 1 | Pending |
| SECU-02 | Phase 1 | Pending |
| SECU-03 | Phase 1 | Pending |
| SECU-04 | Phase 1 | Pending |
| RELY-01 | Phase 1 | Pending |
| RELY-02 | Phase 1 | Pending |
| RELY-03 | Phase 2 | Pending |
| RELY-04 | Phase 1 | Pending |
| OBSV-01 | Phase 2 | Pending |
| OBSV-02 | Phase 2 | Pending |
| OBSV-03 | Phase 2 | Pending |
| ARCH-01 | Phase 3 | Pending |
| ARCH-02 | Phase 3 | Pending |
| ARCH-03 | Phase 3 | Pending |
| DATA-01 | Phase 3 | Pending |
| DATA-02 | Phase 4 | Pending |
| DATA-03 | Phase 3 | Pending |
| QUAL-01 | Phase 4 | Pending |
| QUAL-02 | Phase 4 | Pending |
| QUAL-03 | Phase 4 | Pending |
| LIVE-01 | Phase 5 | Pending |
| LIVE-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-29*
*Last updated: 2026-05-29 after roadmap phase mapping*
