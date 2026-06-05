# Phase 2: operational-observability-baseline - Research

**Researched:** 2026-06-05  
**Domain:** NestJS operational observability baseline (health/readiness, correlation IDs, log-based metrics, SLI/SLO docs)  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use `@nestjs/terminus` (NestJS official health module) for health check implementation. Add it as a dependency.
- **D-02:** Expose two endpoints: `GET /health` (liveness — returns 200 if the process is running) and `GET /health/ready` (readiness — reflects real dependency state for deploy/rollback decisions).
- **D-03:** The readiness check must include a custom Appwrite connectivity indicator (ping via SDK) and a memory usage check. If Appwrite is unreachable, `/health/ready` must return a non-200 status.
- **D-04:** Health endpoints are unauthenticated (infrastructure-accessible) — no guard protection. They must not expose sensitive internals (no secrets, no full stack traces in responses).
- **D-05:** Keep NestJS's built-in `Logger` as the logging transport — do not introduce pino/winston in this phase to minimize disruption on the short timeline. Structured log output must be parseable (JSON-compatible key=value or JSON format via `ConsoleLogger` options if supported).
- **D-06:** Add a `CorrelationIdMiddleware` (applied globally in `AppModule`) that generates a UUID v4 per inbound HTTP request, stores it in `AsyncLocalStorage`, and attaches it as `x-correlation-id` on the response header.
- **D-07:** All `Logger.log()` / `Logger.error()` / `Logger.warn()` calls on critical paths (webhook handlers, IGDB sync, editorial pipeline, raffle, zcoins) must include the correlation ID in their context. Implement a shared `LoggerService` wrapper or enrichment helper that reads from `AsyncLocalStorage` automatically.
- **D-08:** Cron jobs and scheduled pipelines that don't originate from HTTP requests generate their own internal correlation ID at job start and use it consistently throughout the job execution context.
- **D-09:** Implement a `MetricsInterceptor` (global NestJS interceptor) that logs a structured metrics line after each HTTP request: path, method, HTTP status code, and duration in ms. This feeds any log aggregation tool downstream without requiring a separate metrics backend.
- **D-10:** Do NOT add Prometheus endpoints or OpenTelemetry SDK in this phase. Log-based metrics are sufficient for the 2-4 week timeline and Appwrite-hosted environment. A dedicated metrics backend can be introduced in a later phase if needed.
- **D-11:** Critical pipeline flows (IGDB sync, editorial pipeline, webhook processing) must emit start/end structured log entries with job type, outcome (success/error), and duration — enabling throughput and error-rate queries from logs.
- **D-12:** Define the core SLIs in documentation/config comments (not a live database): availability (5xx rate on critical endpoints), latency p95 (target: <=500ms for API reads), and IGDB freshness (sync lag). These are derived from the structured logs emitted by D-09/D-11.
- **D-13:** Do NOT add a dedicated SLO dashboard tool (Grafana, Datadog, etc.) in this phase — that infrastructure is out of scope for the short timeline. SLO observability in this phase means: the metrics signals exist in logs, thresholds are documented, and a future operator can wire them to any aggregation layer.
- **D-14:** Add a `GET /health/slo` endpoint (optional, non-critical path) that returns the documented SLI target thresholds as JSON metadata — not live computation. This makes targets machine-readable for future tooling without requiring a metrics DB.

### the agent's Discretion
- Exact correlation ID format (UUID v4 vs shorter nanoid) is flexible as long as it's unique per request and URL-safe.
- `AsyncLocalStorage` vs NestJS `REQUEST`-scoped injection for correlation propagation is an implementation choice — pick the approach that integrates cleanly with the existing NestJS middleware/interceptor patterns.
- Whether `MetricsInterceptor` and `CorrelationIdMiddleware` live under `src/common/interceptors/` and `src/common/middleware/` follows existing conventions.
- SLI target values (latency thresholds, error budget percentages) are chosen by the planner based on current baseline behavior.

### Deferred Ideas (OUT OF SCOPE)
- **Prometheus/OpenTelemetry endpoint** — valid investment but heavyweight for this phase; defer to Phase 4 or a dedicated observability phase.
- **Grafana or Datadog dashboard** — depends on metrics backend choice; defer until metrics signals are confirmed useful.
- **Distributed tracing (Jaeger/Zipkin)** — useful once multi-service architecture exists (Phase 3+); correlation IDs are the precursor.
- **SLO error budget automation** (alerts, automated rollbacks) — Phase 5+ tooling; Phase 2 establishes the signal foundation only.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| RELY-03 | health/readiness reflect dependency status | Terminus + custom Appwrite indicator + memory thresholds + unauthenticated `/health` + `/health/ready` strategy [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/recipes/terminus.md] |
| OBSV-01 | trace request/job end-to-end with correlation IDs | AsyncLocalStorage + middleware + cron context bootstrap + response header propagation [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/async_context.md] |
| OBSV-02 | monitor latency/error/throughput | global `APP_INTERCEPTOR` metrics log line + pipeline start/end logs [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/interceptors.md] |
| OBSV-03 | track SLI/SLO and error budget status | `/health/slo` metadata endpoint + docs-based SLI catalog and phased rollout [VERIFIED: codebase grep] |
</phase_requirements>

## Project Constraints (from copilot-instructions.md)

- Keep current NestJS + Appwrite architecture and avoid disruptive platform migration this cycle. [VERIFIED: codebase grep]
- Keep short 2–4 week execution scope; prioritize high-leverage baseline instrumentation over platform additions. [VERIFIED: codebase grep]
- Preserve existing API/webhook contracts where possible. [VERIFIED: codebase grep]
- Follow existing module/service/guard conventions and class-based Nest cross-cutting patterns. [VERIFIED: codebase grep]
- Project skill loaded: `appwrite-typescript`; prefer `node-appwrite` server patterns already in repo. [VERIFIED: codebase grep]

## Summary

This repo already uses NestJS 11, `ConsoleLogger` with `json: true`, Appwrite provider DI, and critical flows in webhook/igdb/editor/raffle/zcoins, but it has no health endpoints, no async context propagation, and no global metrics interceptor yet. [VERIFIED: codebase grep]

Primary planning focus should be: add a small Health module (`/health`, `/health/ready`, optional `/health/slo`), add one global correlation middleware + ALS context service, add one global metrics interceptor, and standardize structured start/end log envelopes on critical jobs. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/recipes/terminus.md] [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/interceptors.md] [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/async_context.md]

**Primary recommendation:** Implement `@nestjs/terminus` + `AsyncLocalStorage` + global `APP_INTERCEPTOR` logging now, while documenting SLI targets and leaving metrics backend/tracing for later phases. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/recipes/terminus.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| `/health` liveness | API / Backend | — | Endpoint is process-owned and served by Nest HTTP layer. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/recipes/terminus.md] |
| `/health/ready` dependency readiness | API / Backend | Database / Storage | Readiness composes Appwrite connectivity and memory indicator results. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/recipes/terminus.md] |
| Correlation ID propagation | API / Backend | — | Request entry happens in Nest middleware and context propagates across async chain. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/middlewares.md] [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/async_context.md] |
| Request latency/error/throughput logs | API / Backend | — | Interceptor captures method/path/status/duration after handler completion. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/interceptors.md] |
| SLI/SLO metadata publication | API / Backend | — | `/health/slo` is a static contract endpoint in API layer. [VERIFIED: codebase grep] |
| Pipeline observability (cron/webhook/IGDB) | API / Backend | External integrations | Jobs run in Nest process and call Appwrite/IGDB/Twitch/etc. [VERIFIED: codebase grep] |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---|---:|---|---|
| `@nestjs/terminus` | 11.1.1 (published 2026-02-18) | Health indicators + aggregated health responses | Official Nest health module with readiness/liveness docs and predefined indicators. [VERIFIED: npm registry] [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/recipes/terminus.md] |
| `node:async_hooks` (`AsyncLocalStorage`) | Node built-in (stable since Node 16.4) | Per-request async context for correlation ID | Official Node-recommended performant/memory-safe async context propagation. [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/async_context.md] |
| Nest `ConsoleLogger` / `Logger` | Already in repo | Structured log transport | Current app already uses JSON logger bootstrap and class loggers; no transport migration needed. [VERIFIED: codebase grep] [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/techniques/logger.md] |

### Supporting
| Library | Version | Purpose | When to Use |
|---|---:|---|---|
| Node `crypto.randomUUID()` | Node built-in | RFC4122 v4 correlation IDs | Use instead of adding `uuid` package for HTTP and cron correlation IDs. [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/crypto.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| ALS middleware context | REQUEST-scoped providers | REQUEST scope is heavier and touches more providers; ALS is simpler for cross-cutting ID lookup in this phase. [ASSUMED] |
| Log-only metrics | Prometheus/OpenTelemetry now | More powerful but conflicts with locked short-scope decision D-10. [VERIFIED: codebase grep] |

**Installation:**
```bash
pnpm add @nestjs/terminus
```
[VERIFIED: npm registry]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---|---|---|---|---|---|---|
| `@nestjs/terminus` | npm | ~7.5 years | 2,311,720/week | github.com/nestjs/terminus | OK | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram
```text
HTTP Request
   |
   v
CorrelationIdMiddleware (create/read x-correlation-id, ALS.run, set response header)
   |
   v
Controller/Guards/Services  ---> Critical service logs include correlationId
   |
   v
MetricsInterceptor (method, path, status, durationMs, correlationId)
   |
   v
JSON log stream (transport = Nest ConsoleLogger)

Cron Job Trigger
   |
   v
Job wrapper (generate correlationId, ALS.run)
   |
   v
IGDB/Editor/Webhook pipeline logs (start/end/outcome/duration)
```
[CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/middlewares.md] [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/interceptors.md] [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/async_context.md]

### Recommended Project Structure
```text
src/
├── modules/health/
│   ├── health.module.ts
│   ├── health.controller.ts         # /health, /health/ready, /health/slo
│   └── indicators/
│       └── appwrite-health.indicator.ts
└── common/
    ├── observability/
    │   ├── correlation-context.service.ts
    │   ├── logger-context.service.ts
    │   └── slo.targets.ts
    ├── middleware/
    │   └── correlation-id.middleware.ts
    └── interceptors/
        └── metrics.interceptor.ts
```
[ASSUMED]

### Pattern 1: Health endpoints split by liveness/readiness
**What:** `/health` as process alive; `/health/ready` aggregates dependency checks. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/recipes/terminus.md]  
**When to use:** Always for deploy/rollback safety and dependency-aware automation. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/recipes/terminus.md]

### Pattern 2: Correlation context via AsyncLocalStorage
**What:** Wrap each request/job in `AsyncLocalStorage.run(store, next)` and read via `getStore()` in logger helper. [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/async_context.md]  
**When to use:** Any async chain where logs need request/job identity. [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/async_context.md]

### Pattern 3: Global metrics interceptor as log emitter
**What:** Register interceptor via `APP_INTERCEPTOR` so every route emits one structured metrics log event. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/interceptors.md]  
**When to use:** Baseline observability without dedicated metrics backend. [VERIFIED: codebase grep]

### Anti-Patterns to Avoid
- Returning readiness 200 when Appwrite is down. [VERIFIED: codebase grep]
- Free-form string logs for latency/errors (hard to query). [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/techniques/logger.md]
- Creating per-request logger transport instances. [ASSUMED]

## Don’t Hand-Roll

| Problem | Don’t Build | Use Instead | Why |
|---|---|---|---|
| Health aggregation | custom status combiner | `HealthCheckService` + indicators | Already handles healthy/unhealthy status composition. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/recipes/terminus.md] |
| Async context propagation | custom async hooks implementation | `AsyncLocalStorage` | Node docs explicitly recommend ALS as optimized and memory-safe. [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/async_context.md] |
| UUID v4 generation | local UUID function | `crypto.randomUUID()` | Built-in RFC4122 v4 secure generator. [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/crypto.md] |

## Common Pitfalls

### Pitfall 1: Global interceptor created outside DI
**What goes wrong:** interceptor can’t inject services if registered with `useGlobalInterceptors(new ...)` outside module context. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/interceptors.md]  
**How to avoid:** register with `APP_INTERCEPTOR` provider in module. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/interceptors.md]

### Pitfall 2: Correlation ID missing in scheduled jobs
**What goes wrong:** cron logs are disconnected from request traces. [VERIFIED: codebase grep]  
**How to avoid:** generate and run ALS context at job entry for `EditorService` and IGDB-triggered pipeline starts. [VERIFIED: codebase grep]

### Pitfall 3: “JSON logger” with colorized output
**What goes wrong:** colorized JSON may hurt strict parser compatibility in some log pipelines. [ASSUMED]  
**How to avoid:** keep JSON logs parseable in production (disable colors if parser requires strict JSON). [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/techniques/logger.md]

## Code Examples

### Custom health indicator pattern
```typescript
import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';

@Injectable()
export class AppwriteHealthIndicator {
  constructor(private readonly healthIndicatorService: HealthIndicatorService) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    // ping appwrite SDK here
    return indicator.up();
  }
}
```
Source: [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/recipes/terminus.md]

### Global interceptor registration
```typescript
import { APP_INTERCEPTOR } from '@nestjs/core';

providers: [{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }];
```
Source: [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/interceptors.md]

### AsyncLocalStorage request context
```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
const als = new AsyncLocalStorage<{ correlationId: string }>();
```
Source: [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/async_context.md]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Ad-hoc health routes | Terminus indicators + readiness/liveness split | Nest Terminus guidance current | Faster safe deploy/rollback automation. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/recipes/terminus.md] |
| Manual async context hacks | `AsyncLocalStorage` stable API | Stable since Node 16.4.0 | Reliable correlation propagation in async chains. [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/async_context.md] |
| Text logs only | JSON logger output | Current Nest logger docs | Better query/filter in aggregators. [CITED: https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/techniques/logger.md] |

## SLI/SLO Documentation and Phased Rollout (Recommended)

1. **Phase 2 (this phase):** define `slo.targets.ts` (availability, p95 latency, IGDB freshness), expose `/health/slo` static metadata, emit required logs for computation. [VERIFIED: codebase grep]  
2. **Phase 3:** add daily/weekly manual error-budget review checklist in runbook using log queries. [ASSUMED]  
3. **Phase 4+:** connect log fields to metrics backend and dashboards (Prometheus/Otel/Grafana/Datadog) without changing application log contract. [VERIFIED: codebase grep]

## Risks, Tradeoffs, Migration Path

- **Tradeoff:** Log-based metrics are low-friction but weaker for long-term percentile analytics than dedicated metrics DB. [ASSUMED]
- **Risk:** Missing env/config for Appwrite health ping can make readiness unstable in non-prod. [VERIFIED: codebase grep]
- **Migration path:** Keep stable metric field names now (`path`, `method`, `status`, `durationMs`, `correlationId`, `jobType`, `outcome`) so future collectors can ingest historical and new signals consistently. [ASSUMED]
- **Migration path:** Introduce tracing later by mapping `correlationId` to trace/span IDs at ingestion layer first, then optional SDK instrumentation. [ASSUMED]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | REQUEST-scoped DI is heavier than ALS for this phase | Standard Stack | Could bias implementation choice |
| A2 | Colorized JSON may break strict parsers in some pipelines | Common Pitfalls | Potential unnecessary hardening task |
| A3 | Phase 3/4 rollout sequence for dashboards/reviews | SLI/SLO rollout | Planning sequence may need reprioritization |

## Open Questions (RESOLVED)

1. `/health/ready` will **fail closed** when any critical dependency check fails, including Appwrite connectivity (aligned with D-03 and RELY-03).  
2. Initial SLI/SLO targets for this phase are fixed as: availability error-rate target <=1% (critical API paths), latency p95 target <=500ms for read endpoints, and IGDB freshness lag target <=15 minutes (aligned with D-12).  
3. The Appwrite readiness ping will use a lightweight **read-only health probe** against an existing low-cost SDK call already authenticated by current server credentials; implementation selects the minimal-cost call available in `Appwrite` provider with timeout guard and no sensitive payload exposure.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | Nest runtime + ALS + crypto UUID | ✓ | v24.15.0 | — |
| pnpm | package install | ✓ | 11.1.2 | npm |
| npm registry access | package verification | ✓ | npm 11.12.1 | — |
| Appwrite runtime credentials/env | readiness connectivity checks | ✗ (not present in current shell) | — | Implement code + validate in deployed env |

**Missing dependencies with no fallback:** none for coding/planning.  
**Missing dependencies with fallback:** Appwrite credentials for runtime validation (defer to deploy/staging verification).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | Existing guards (`AppwriteSessionGuard`, `SystemApiKeyGuard`) remain unchanged for observability paths except intentionally public health endpoints. [VERIFIED: codebase grep] |
| V3 Session Management | yes | Preserve current session guard behavior; do not leak session data in logs. [VERIFIED: codebase grep] |
| V4 Access Control | yes | Keep health endpoints intentionally unauthenticated but data-minimal. [VERIFIED: codebase grep] |
| V5 Input Validation | yes | Metrics/health endpoints should avoid unvalidated free-form user payload logging. [ASSUMED] |
| V6 Cryptography | yes | Use `crypto.randomUUID()` and existing HMAC/timing-safe patterns; never custom crypto. [CITED: https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/crypto.md] [VERIFIED: codebase grep] |

### Known Threat Patterns for NestJS + Appwrite observability

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Sensitive data leakage via logs | Information Disclosure | Structured allowlist fields, no request bodies/secrets in metrics logs. [ASSUMED] |
| Correlation ID spoofing | Spoofing | Accept client header optionally but always normalize/validate and overwrite malformed IDs. [ASSUMED] |
| Health endpoint reconnaissance | Information Disclosure | Keep response minimal (`up/down`, simple details), no stack traces/keys. [VERIFIED: codebase grep] |

## Sources

### Primary (HIGH confidence)
- NestJS Terminus docs (official docs repo):  
  https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/recipes/terminus.md
- NestJS Interceptors docs (official docs repo):  
  https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/interceptors.md
- NestJS Middlewares docs (official docs repo):  
  https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/middlewares.md
- NestJS Logger docs (official docs repo):  
  https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/techniques/logger.md
- Node.js async context docs (official Node repo):  
  https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/async_context.md
- Node.js crypto docs (official Node repo):  
  https://raw.githubusercontent.com/nodejs/node/HEAD/doc/api/crypto.md
- Repository source inspection (`src/main.ts`, `src/app.module.ts`, webhook/igdb/editor/raffle/zcoins files). [VERIFIED: codebase grep]
- npm registry verification (`npm view`, npm downloads API) + slopcheck output. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- NestJS Terminus GitHub README examples:  
  https://raw.githubusercontent.com/nestjs/terminus/master/README.md

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (official Nest/Node docs + npm registry + codebase verification).
- Architecture: HIGH (locked decisions + official middleware/interceptor patterns).
- Pitfalls: MEDIUM (some operational caveats are assumption-based).

**Research date:** 2026-06-05  
**Valid until:** 2026-07-05

---

## RESEARCH COMPLETE
