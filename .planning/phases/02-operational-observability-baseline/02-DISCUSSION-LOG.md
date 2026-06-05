# Phase 2: Operational Observability Baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 02-operational-observability-baseline
**Areas discussed:** Health Endpoints, Logging e Correlation IDs, Métricas, SLI/SLO Tracking
**Note:** User was unavailable during this session. Decisions were made autonomously based on project constraints (PROJECT.md, REQUIREMENTS.md, CONCERNS.md, ARCHITECTURE.md, Phase 1 CONTEXT.md).

---

## Health and Readiness Endpoints

| Option | Description | Selected |
|--------|-------------|----------|
| `@nestjs/terminus` | Official NestJS health check library, well-integrated, dependency indicators built-in | ✓ |
| Custom health controller | Manual implementation without library, more control but more code | |
| Simple liveness only | Single `/health` returning 200 if process alive, no dependency checks | |

**Decision:** `@nestjs/terminus` with two endpoints: `/health` (liveness) and `/health/ready` (readiness with Appwrite indicator + memory check).
**Notes:** CONCERNS.md explicitly flagged missing health endpoints as Medium severity. RELY-03 requires dependency-aware health signals for safe deploy/rollback.

---

## Logging and Correlation IDs

| Option | Description | Selected |
|--------|-------------|----------|
| Keep NestJS Logger + add correlation wrapper | Minimal disruption; add AsyncLocalStorage-backed correlation enrichment | ✓ |
| Switch to pino | Faster structured logging, but requires migration of all Logger calls | |
| Switch to winston | Rich plugin ecosystem, but migration overhead on short timeline | |

**Decision:** Keep NestJS `Logger`, add `CorrelationIdMiddleware` using `AsyncLocalStorage`, and a shared enrichment wrapper that injects `x-correlation-id` into all critical path logs.
**Notes:** PROJECT.md constraint — short 2-4 week horizon, avoid disruptive changes. Pino/winston are valid long-term choices but out of scope for this phase.

---

## Metrics Collection

| Option | Description | Selected |
|--------|-------------|----------|
| Log-based metrics via `MetricsInterceptor` | Global NestJS interceptor logs path/method/status/duration after each request | ✓ |
| Prometheus endpoint | Dedicated `/metrics` endpoint for scraping; requires metrics exporter library | |
| OpenTelemetry SDK | Full distributed tracing and metrics; significant setup overhead | |
| External APM (Datadog/NewRelic) | Agent-based instrumentation; infrastructure dependency | |

**Decision:** Log-based `MetricsInterceptor` globally applied. No Prometheus/OTEL in this phase.
**Notes:** Appwrite-hosted environment makes dedicated metrics backend non-trivial. Log aggregation is available from day 1. OBSV-02 is satisfied by having the signals exist — not by having a specific visualization tool.

---

## SLI/SLO Tracking

| Option | Description | Selected |
|--------|-------------|----------|
| Document SLI thresholds + derive from logs | Availability/latency/freshness targets defined in docs; metrics come from MetricsInterceptor logs | ✓ |
| Live SLO database | Store computed SLO state in Appwrite; expose error budget via API | |
| Grafana/dashboard tool | External SLO dashboard wired to metrics backend | |
| Skip SLO in this phase | Defer entirely to a later phase | |

**Decision:** Document SLI targets (availability, latency p95, IGDB freshness) and add optional `/health/slo` endpoint returning thresholds as JSON metadata. No live computation or external tool.
**Notes:** OBSV-03 requires the team to be *able* to track SLIs — Phase 2 establishes the signal layer. Live dashboards and error-budget automation are deferred.

---

## the agent's Discretion

- Correlation ID format (UUID v4 vs nanoid)
- `AsyncLocalStorage` vs REQUEST-scoped injection approach
- Exact directory placement of middleware/interceptor files
- SLI target threshold values (latency ms, error rate %)

## Deferred Ideas

- Prometheus endpoint — Phase 4+
- Grafana/Datadog dashboard — after metrics backend decision
- Distributed tracing (Jaeger/Zipkin) — Phase 3+ (after domain boundaries established)
- SLO error budget automation and alerts — Phase 5+
