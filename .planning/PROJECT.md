# Zetho API

## What This Is

Zetho API is a NestJS backend for a gaming ecosystem that powers game catalog ingestion/search, editorial content generation, user profiles, raffles, rewards, and webhooks. It serves internal automations and public-facing experiences through Appwrite-backed data services and external integrations. This cycle focuses on professionalizing reliability, security, and delivery quality while adding high-value features.

## Core Value

Deliver a reliable and secure gaming backend that continuously provides fresh, useful user value without operational friction.

## Requirements

### Validated

- ✓ Game catalog ingestion and synchronization from IGDB, including webhook-driven updates and API-triggered sync flows — existing
- ✓ Content and editorial pipeline with AI-assisted generation and publication paths — existing
- ✓ User-facing core domains are operational: profiles, raffles, zcoins scoring, and notifications — existing
- ✓ Appwrite-based persistence, auth/session guard rails, and scheduled function execution are in production use — existing

### Active

- [ ] Improve reliability and observability across critical flows (sync, webhooks, editorial pipeline, and external integrations).
- [ ] Strengthen security and authorization boundaries, especially for mutation endpoints and secret/config handling.
- [ ] Raise engineering quality with meaningful automated tests for core business modules and integration behavior.
- [ ] Improve performance and scalability in known bottlenecks (leaderboards, sync throughput, and pipeline orchestration).
- [ ] Increment user-facing value with new backend features that align with the existing gaming platform.
- [ ] Reduce architectural coupling by refactoring oversized services into clearer bounded responsibilities.

### Out of Scope

- Full frontend redesign or web app rebuild — this initiative is backend-first and focused on API/platform outcomes.
- Full multi-tenant rearchitecture — not required for the short 2-4 week horizon.
- Replacing NestJS or Appwrite as foundational stack — would create unnecessary migration risk now.

## Context

The repository is a brownfield backend with a recent codebase map under `.planning/codebase/` documenting stack, architecture, concerns, conventions, integrations, and testing posture. Current strengths include broad domain coverage and strong integration reach. Current risks include uneven validation/test coverage, large service classes, operational blind spots, and security hardening gaps in selected endpoints.

Priority themes for this cycle:
- Reliability and observability
- Security and authorization
- Quality and test coverage
- Performance and scalability
- Architectural refactoring

Delivery horizon: short (2-4 weeks), with phased execution and measurable outcomes.

## Constraints

- **Tech stack**: Keep current NestJS + Appwrite architecture — avoid disruptive platform migration in this cycle.
- **Timeline**: Short horizon (2-4 weeks) — prioritize high-leverage improvements first.
- **Compatibility**: Preserve existing API consumers and webhook contracts where possible.
- **Operational risk**: Changes touching sync/webhook/rewards flows must remain rollback-friendly.
- **Data integrity**: Mutating flows must preserve transactional correctness in Appwrite-backed domains.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Initialize as brownfield with inferred validated capabilities | Existing production code and codebase map already prove baseline functionality | — Pending |
| Prioritize reliability, security, and quality before broad feature expansion | Reduces regressions and increases delivery confidence for new features | — Pending |
| Use coarse-grained phased roadmap for the current cycle | Matches short timeline and allows faster execution with clear milestones | — Pending |
| Keep planning docs committed to git | Improves traceability and team alignment during rapid iteration | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check -> still the right priority?
3. Audit Out of Scope -> reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-29 after initialization*
