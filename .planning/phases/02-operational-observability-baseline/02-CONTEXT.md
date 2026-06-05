# Phase 2: Operational Observability Baseline - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers dependency-aware health/readiness endpoints, structured per-request correlation IDs, log-based metrics for critical paths, and documented SLI/SLO thresholds — so operators can detect, diagnose, and govern API/pipeline reliability without adding new product capabilities.

</domain>

<decisions>
## Implementation Decisions

### Health and Readiness Endpoints

- **D-01:** Use `@nestjs/terminus` (NestJS official health module) for health check implementation. Add it as a dependency.
- **D-02:** Expose two endpoints: `GET /health` (liveness — returns 200 if the process is running) and `GET /health/ready` (readiness — reflects real dependency state for deploy/rollback decisions).
- **D-03:** The readiness check must include a custom Appwrite connectivity indicator (ping via SDK) and a memory usage check. If Appwrite is unreachable, `/health/ready` must return a non-200 status.
- **D-04:** Health endpoints are unauthenticated (infrastructure-accessible) — no guard protection. They must not expose sensitive internals (no secrets, no full stack traces in responses).

### Logging and Correlation IDs

- **D-05:** Keep NestJS's built-in `Logger` as the logging transport — do not introduce pino/winston in this phase to minimize disruption on the short timeline. Structured log output must be parseable (JSON-compatible key=value or JSON format via `ConsoleLogger` options if supported).
- **D-06:** Add a `CorrelationIdMiddleware` (applied globally in `AppModule`) that generates a UUID v4 per inbound HTTP request, stores it in `AsyncLocalStorage`, and attaches it as `x-correlation-id` on the response header.
- **D-07:** All `Logger.log()` / `Logger.error()` / `Logger.warn()` calls on critical paths (webhook handlers, IGDB sync, editorial pipeline, raffle, zcoins) must include the correlation ID in their context. Implement a shared `LoggerService` wrapper or enrichment helper that reads from `AsyncLocalStorage` automatically.
- **D-08:** Cron jobs and scheduled pipelines that don't originate from HTTP requests generate their own internal correlation ID at job start and use it consistently throughout the job execution context.

### Metrics Collection

- **D-09:** Implement a `MetricsInterceptor` (global NestJS interceptor) that logs a structured metrics line after each HTTP request: path, method, HTTP status code, and duration in ms. This feeds any log aggregation tool downstream without requiring a separate metrics backend.
- **D-10:** Do NOT add Prometheus endpoints or OpenTelemetry SDK in this phase. Log-based metrics are sufficient for the 2-4 week timeline and Appwrite-hosted environment. A dedicated metrics backend can be introduced in a later phase if needed.
- **D-11:** Critical pipeline flows (IGDB sync, editorial pipeline, webhook processing) must emit start/end structured log entries with job type, outcome (success/error), and duration — enabling throughput and error-rate queries from logs.

### SLI/SLO Definition and Tracking

- **D-12:** Define the core SLIs in documentation/config comments (not a live database): availability (5xx rate on critical endpoints), latency p95 (target: ≤500ms for API reads), and IGDB freshness (sync lag). These are derived from the structured logs emitted by D-09/D-11.
- **D-13:** Do NOT add a dedicated SLO dashboard tool (Grafana, Datadog, etc.) in this phase — that infrastructure is out of scope for the short timeline. SLO observability in this phase means: the metrics signals exist in logs, thresholds are documented, and a future operator can wire them to any aggregation layer.
- **D-14:** Add a `GET /health/slo` endpoint (optional, non-critical path) that returns the documented SLI target thresholds as JSON metadata — not live computation. This makes targets machine-readable for future tooling without requiring a metrics DB.

### the agent's Discretion

- Exact correlation ID format (UUID v4 vs shorter nanoid) is flexible as long as it's unique per request and URL-safe.
- `AsyncLocalStorage` vs NestJS `REQUEST`-scoped injection for correlation propagation is an implementation choice — pick the approach that integrates cleanly with the existing NestJS middleware/interceptor patterns.
- Whether `MetricsInterceptor` and `CorrelationIdMiddleware` live under `src/common/interceptors/` and `src/common/middleware/` follows existing conventions.
- SLI target values (latency thresholds, error budget percentages) are chosen by the planner based on current baseline behavior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and requirement contracts

- `.planning/ROADMAP.md` — Phase 2 goal, success criteria, and requirement mapping (RELY-03, OBSV-01, OBSV-02, OBSV-03).
- `.planning/REQUIREMENTS.md` — Full requirement definitions for RELY-03, OBSV-01, OBSV-02, OBSV-03.
- `.planning/PROJECT.md` — Project-level constraints (short 2-4 week timeline, keep NestJS+Appwrite stack, no disruptive migrations).
- `.planning/STATE.md` — Current execution state and phase continuity.

### Existing application entry points and cross-cutting infrastructure

- `src/main.ts` — Bootstrap, ConsoleLogger setup, global middleware/pipe registration point.
- `src/app.module.ts` — Root module composition — where global middleware, interceptors, and new modules must be registered.
- `src/common/guards/` — Guard patterns to follow for consistent NestJS cross-cutting code style.

### Critical flows that must emit correlation IDs and metrics

- `src/modules/webhook/handlers/zetho.handler.ts` — Webhook projection handler (high criticality).
- `src/modules/webhook/handlers/igdb.handler.ts` — IGDB webhook handler.
- `src/modules/igdb/igdb.service.ts` — IGDB sync pipeline (external integration, scheduled).
- `src/common/ai/agents/editor/editor.service.ts` — Editorial pipeline (hourly cron).
- `src/modules/zcoins/zcoins.service.ts` — Economy/leaderboard domain.
- `src/modules/raffle/raffle.service.ts` — Raffle lifecycle domain.

### Appwrite integration point (for health check indicator)

- `src/common/appwrite/appwrite.provider.ts` — Appwrite client and TablesDB access (health check must ping via this provider).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `ConsoleLogger` (configured in `src/main.ts:13`): Already set up as the app logger — extend its options or wrap it for structured output rather than replacing.
- `Logger` (NestJS built-in): Used consistently across services (`IGDBService`, handlers) via `new Logger(ServiceName.name)` — the enrichment wrapper must be backward-compatible with this pattern.
- `@nestjs/schedule` (already installed): Cron-based correlation ID generation for pipeline jobs follows the same lifecycle hooks.

### Established Patterns

- Global providers are registered in `src/app.module.ts` — health module, correlation middleware, and metrics interceptor all register there.
- NestJS guard pattern (`@UseGuards` + class implementing `CanActivate`) is the existing cross-cutting convention — middleware/interceptor additions should follow the same injectable-class pattern.
- No existing health, metrics, or APM module — this phase greenfield-adds all of them.

### Integration Points

- `MetricsInterceptor` wires globally via `APP_INTERCEPTOR` provider in `AppModule`.
- `CorrelationIdMiddleware` wires via `configure(consumer: MiddlewareConsumer)` in `AppModule`.
- Health module registers at `/health` path via `TerminusModule` + custom `HealthController`.
- Appwrite health indicator calls a lightweight SDK operation (e.g., `account.get()` or `databases.list()`) to confirm connectivity.

</code_context>

<specifics>
## Specific Ideas

- Health checks should use Kubernetes-style split between liveness (process alive) and readiness (dependencies OK) — this matches standard deploy/rollback automation expectations even if not on Kubernetes today.
- Correlation IDs must appear in log lines that operators would actually read during incident diagnosis — webhook failures, IGDB sync errors, editorial pipeline failures are the priority paths.
- Metrics logs should be easy to grep or query by `path` and `status` — avoid free-form messages; use structured key=value pairs.

</specifics>

<deferred>
## Deferred Ideas

- **Prometheus/OpenTelemetry endpoint** — valid investment but heavyweight for this phase; defer to Phase 4 or a dedicated observability phase.
- **Grafana or Datadog dashboard** — depends on metrics backend choice; defer until metrics signals are confirmed useful.
- **Distributed tracing (Jaeger/Zipkin)** — useful once multi-service architecture exists (Phase 3+); correlation IDs are the precursor.
- **SLO error budget automation** (alerts, automated rollbacks) — Phase 5+ tooling; Phase 2 establishes the signal foundation only.

</deferred>

---

*Phase: 2-Operational Observability Baseline*
*Context gathered: 2026-06-05*
