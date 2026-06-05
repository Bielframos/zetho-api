# Roadmap: Zetho API

## Overview

This roadmap delivers a backend-hardening MVP in five coarse phases: secure and reliable mutation/integration boundaries first, operational visibility second, architectural maintainability and transactional integrity third, performance and quality assurance fourth, and a controlled live-ops value slice last.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Security and Integration Contract Hardening** - Lock down mutation access and make external ingress/processing failure-safe.
- [x] **Phase 2: Operational Observability Baseline** - Make runtime health, telemetry, and SLO status reliably visible.
- [ ] **Phase 3: Boundary Extraction and Transaction Core** - Establish maintainable domain boundaries with deterministic write integrity.
- [ ] **Phase 4: Performance and Quality Gates** - Raise throughput/read performance while enforcing automated quality controls.
- [ ] **Phase 5: Segment-Aware Live-Ops MVP** - Deliver one safe, toggleable targeted campaign/reward experience.

## Phase Details

### Phase 1: Security and Integration Contract Hardening

**Goal**: Users and integrations can only perform authorized actions, and webhook/sync contracts fail safely for retryable operations.
**Depends on**: Nothing (first phase)
**Requirements**: SECU-01, SECU-02, SECU-03, SECU-04, RELY-01, RELY-02, RELY-04
**Mode:** mvp
**Success Criteria** (what must be TRUE):

1. User can execute protected mutations only when authenticated and authorized by policy/role.
2. User sees explicit authorization failures when access is denied.
3. Integration endpoints reject invalid signatures/secrets and replayed events.
4. Duplicate webhook deliveries do not produce duplicate state changes.
5. Failed webhook/sync processing and bounded external-call failures return observable error status for retry/alerting.
   **Plans**: 3 plans
   Plans:
   **Wave 1**

- [x] 01-01-PLAN.md - Harden user mutation authorization and authenticated actor identity contracts.
- [x] 01-02-PLAN.md - Enforce webhook authenticity, replay idempotency, and retry-safe failure semantics.

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 01-03-PLAN.md - Add bounded outbound integration retries/timeouts with structured failure classification.

### Phase 2: Operational Observability Baseline

**Goal**: Operators can quickly detect, diagnose, and govern API/pipeline reliability using standardized telemetry and dependency-aware health signals.
**Depends on**: Phase 1
**Requirements**: RELY-03, OBSV-01, OBSV-02, OBSV-03
**Mode:** mvp
**Success Criteria** (what must be TRUE):

1. Operator can use health/readiness endpoints that reflect real dependency state for safe deploy and rollback decisions.
2. Operator can follow a correlation ID across critical request/job logs end to end.
3. Operator can view latency, error-rate, and throughput metrics for critical API and pipeline paths.
4. Team can review SLI/SLO and error-budget status from a shared operational view.
   **Plans**: TBD

### Phase 3: Boundary Extraction and Transaction Core

**Goal**: Core domains evolve through explicit boundaries, with deterministic transaction behavior and reliable distributed coordination for invariant-sensitive flows.
**Depends on**: Phase 2
**Requirements**: ARCH-01, ARCH-02, ARCH-03, DATA-01, DATA-03
**Mode:** mvp
**Success Criteria** (what must be TRUE):

1. Team can change critical domain behavior through facade/domain/adapter seams without editing monolithic service logic.
2. Critical multi-write business operations complete with deterministic transactional outcomes.
3. Cross-module transaction lifecycle behavior is consistent for comparable operations.
4. Domain side effects run through explicit post-commit workflows instead of implicit fire-and-forget calls.
5. Multi-instance deployments preserve correct integration token/rate coordination behavior.
   **Plans**: TBD

### Phase 4: Performance and Quality Gates

**Goal**: Critical reads meet performance targets and delivery quality is protected by automated tests and CI enforcement.
**Depends on**: Phase 3
**Requirements**: DATA-02, QUAL-01, QUAL-02, QUAL-03
**Mode:** mvp
**Success Criteria** (what must be TRUE):

1. User-facing leaderboard and other hot read paths meet agreed performance targets under representative load.
2. Team can rely on automated tests that cover critical security, sync/webhook, and transaction integrity scenarios.
3. Team has integration-level coverage for critical paths in igdb, webhook, raffle, zcoins, and profile domains.
4. Merge attempts fail automatically when lint, build, or tests fail in CI.
   **Plans**: TBD

### Phase 5: Segment-Aware Live-Ops MVP

**Goal**: Users receive one targeted live-ops reward experience that operators can control safely without destabilizing core backend flows.
**Depends on**: Phase 4
**Requirements**: LIVE-01, LIVE-02
**Mode:** mvp
**Success Criteria** (what must be TRUE):

1. Eligible users can receive a segment-aware campaign/reward path powered by existing backend capabilities.
2. Operators can enable or disable the live-ops slice quickly and safely.
3. Disabling live-ops does not break core profile, raffle, zcoins, notification, or sync/webhook flows.
   **Plans**: TBD

## Progress

| Phase                                          | Plans Complete | Status      | Completed |
| ---------------------------------------------- | -------------- | ----------- | --------- |
| 1. Security and Integration Contract Hardening | 3/3            | Completed   | 2026-05-29 |
| 2. Operational Observability Baseline          | 3/3            | Completed   | 2026-06-05 |
| 3. Boundary Extraction and Transaction Core    | 0/TBD          | Not started | -         |
| 4. Performance and Quality Gates               | 0/TBD          | Not started | -         |
| 5. Segment-Aware Live-Ops MVP                  | 0/TBD          | Not started | -         |
