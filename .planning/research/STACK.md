# Technology Stack

**Project:** Zetho API (NestJS + Appwrite gaming backend)
**Researched:** 2026-05-29
**Research mode:** Ecosystem (stack dimension)

## Recommended Stack

### Core Framework

| Technology                                          | Version        | Purpose                                | Why                                                                                                               |
| --------------------------------------------------- | -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Node.js LTS                                         | 24.x (Krypton) | Runtime for API + workers              | Current active LTS line in Node release index; better security cadence and ABI stability than Current-only lines. |
| TypeScript                                          | 5.7.x+         | Primary language                       | Already in use; strong typing across DTOs, guards, and Appwrite integrations reduces production defects.          |
| NestJS                                              | 11.1.x         | API framework and modular architecture | Stable mature ecosystem for guards/interceptors/scheduling/queues; best fit for existing codebase velocity.       |
| `@nestjs/platform-express` (now)                    | 11.1.x         | HTTP adapter                           | Lowest migration risk for short-horizon reliability/security work. Keep Express during hardening cycle.           |
| `@nestjs/platform-fastify` (later, benchmark-gated) | 11.1.x         | Higher-throughput adapter option       | Adopt only if measured p95/p99 latency bottleneck is transport-bound; not as a default migration.                 |

### Data Platform and Async Backbone

| Technology                            | Version                                                 | Purpose                                         | Why                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Appwrite (existing) + `node-appwrite` | `^25.2.0`                                               | Primary data/auth backend                       | Existing production dependency and domain model fit. Optimize around it instead of platform replacement this cycle. |
| Redis                                 | 7.x                                                     | Shared cache + queue backing + rate-limit state | Required foundation for distributed reliability (multi-instance safe cache/throttle/queues).                        |
| BullMQ + Nest adapter                 | `bullmq@^5.77.6`, `@nestjs/bullmq@^11.0.4`              | Durable background jobs and retry pipelines     | Standard Nest 2026 queue posture; Bull is maintenance mode while BullMQ is active and TypeScript-first.             |
| Cache via Keyv + Redis                | `@nestjs/cache-manager`, `cache-manager`, `@keyv/redis` | Response/domain cache with external store       | Keeps Nest cache APIs while moving off process-local memory for horizontal scale correctness.                       |

### Observability and Operations

| Technology                               | Version                                                                                 | Purpose                                        | Why                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| OpenTelemetry JS                         | `@opentelemetry/sdk-node@^0.218.0`, `@opentelemetry/auto-instrumentations-node@^0.76.0` | Traces/metrics/log correlation                 | Current standard for vendor-neutral observability and future portability.                 |
| OTLP Collector (OpenTelemetry Collector) | latest stable                                                                           | Telemetry routing/sampling/redaction           | Keeps instrumentation vendor-agnostic and lets you tune volume/cost without app rewrites. |
| Structured logging                       | `pino@^10.3.1`, `nestjs-pino@^4.6.1`, `pino-http@^11.0.0`                               | High-throughput JSON logs with request context | Faster and cleaner than ad-hoc logger calls; easier SIEM/APM ingestion.                   |
| Error + performance monitoring           | `@sentry/node@^10.55.0` (optional but recommended)                                      | Exception aggregation, tracing, alerting       | Fastest path to actionable prod visibility with minimal code footprint.                   |
| Metrics endpoint                         | `prom-client@^15.1.3`                                                                   | RED/USE metrics for SLOs                       | Simple standard for dashboards/alerts and capacity planning.                              |

### Security and API Hardening

| Technology                                       | Version                                                       | Purpose                                  | Why                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `helmet` (Express) / `@fastify/helmet` (Fastify) | `helmet@^8.2.0`, `@fastify/helmet@^13.0.2`                    | Baseline HTTP hardening headers          | Directly aligned with Nest security guidance; low-friction protection.                                  |
| `@nestjs/throttler`                              | `^6.5.0`                                                      | Endpoint and route-group rate limiting   | Standard brute-force/abuse control; supports multiple policy tiers.                                     |
| Redis-backed throttler storage                   | community storage provider + Redis                            | Distributed-safe limit state             | In-memory throttling breaks under horizontal scale and proxy hops.                                      |
| Validation (current posture)                     | `class-validator@^0.15.1` + `class-transformer`               | DTO input validation                     | Already pervasive in Nest stacks and your code; keep for speed this cycle, migrate only with clear ROI. |
| OpenAPI generation + governance                  | `@nestjs/swagger@^11.4.4` + `@stoplight/spectral-cli@^6.16.0` | Contract visibility + linted API quality | Prevents drift and catches breaking/schema issues before deploy.                                        |

### Testability and Delivery

| Technology                   | Version                                                          | Purpose                                           | Why                                                                                  |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Unit/integration test runner | Jest 30 (`jest@^30.0.5`, `ts-jest@^29.4.1`)                      | Existing test foundation                          | Keep existing runner to avoid migration drag while coverage and reliability improve. |
| Black-box API tests          | `supertest@^7.2.2`                                               | HTTP contract verification                        | Standard Nest e2e posture; already integrated.                                       |
| Ephemeral dependency tests   | `testcontainers@^12.0.1`                                         | Real Redis/Appwrite-compatible integration checks | Reduces false confidence from mocks and catches environment parity issues.           |
| Performance baselining       | `autocannon@^8.0.0` + k6 CLI (Grafana k6)                        | Throughput/latency regression testing             | Practical pairing: quick local checks (autocannon), scenario/load gates (k6).        |
| CI/CD security gates         | GitHub Actions + CodeQL + dependency audit (pnpm/npm audit, OSV) | Prevent vulnerable or broken releases             | Standard 2026 supply-chain posture for Node backends.                                |

## Opinionated Posture (Safe + Fast Evolution)

1. Keep Nest 11 + Express + Appwrite as the base in this milestone; do not perform foundational migrations during reliability/security hardening.
2. Add Redis once and use it for three concerns together: cache, throttling, queues.
3. Introduce BullMQ for all non-trivial async work (webhook fan-out, retries, backfills, score recompute, content pipelines).
4. Standardize telemetry around OpenTelemetry + structured logs, then optionally fan into Sentry/Grafana.
5. Treat OpenAPI as a build artifact and lint it in CI before merge.
6. Expand tests with testcontainers-backed integration cases for critical flows (webhooks, IGDB sync, rewards, notifications).

## Alternatives Considered

| Category                 | Recommended                  | Alternative              | Why Not                                                                                                                               |
| ------------------------ | ---------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Queueing                 | BullMQ                       | Bull                     | Bull is in maintenance mode; BullMQ is active and better aligned with current Nest guidance.                                          |
| HTTP adapter (near-term) | Express                      | Fastify now              | Fastify is valid, but immediate migration adds compatibility risk during a hardening-focused cycle. Benchmark-gate migration instead. |
| Observability            | OpenTelemetry-first          | Vendor-specific SDK only | Locks telemetry model and exporters too early; harder to change vendors later.                                                        |
| Validation               | class-validator (this cycle) | Full Zod migration now   | Good long-term option, but full migration slows immediate reliability/security delivery.                                              |
| Caching/throttling state | Redis-backed                 | In-memory only           | In-memory state is unsafe for horizontal scale and inconsistent under restarts.                                                       |

## What NOT To Use (for this milestone)

| Do Not Use                                               | Why                                                                   | Use Instead                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `@nestjs/bull` / `bull` for new work                     | Maintenance-mode ecosystem                                            | `@nestjs/bullmq` + `bullmq`                                                     |
| Process-local cache/throttle as final architecture       | Breaks consistency in multi-instance deployments                      | Redis-backed Keyv cache + Redis throttler storage                               |
| Big-bang migration to new ORM/data layer                 | High risk, low immediate reliability ROI for Appwrite-centric backend | Keep Appwrite-first; isolate data access behind services for future optionality |
| Unstructured console logging as primary logging strategy | Poor correlation and weak production diagnostics                      | Pino + request IDs + OTel trace correlation                                     |
| Feature work without queue-based retries/idempotency     | Causes webhook and external API fragility                             | Durable jobs with retry/backoff + idempotency keys                              |

## Installation

```bash
# Core upgrades around current architecture
pnpm add @nestjs/core@^11 @nestjs/common@^11 @nestjs/platform-express@^11 @nestjs/config@^4

# Reliability backbone
pnpm add redis ioredis@^5 bullmq@^5 @nestjs/bullmq@^11
pnpm add @nestjs/cache-manager cache-manager @keyv/redis

# Security hardening
pnpm add helmet@^8 @nestjs/throttler@^6

# Observability
pnpm add pino@^10 pino-http@^11 nestjs-pino@^4
pnpm add @opentelemetry/sdk-node@^0.218 @opentelemetry/auto-instrumentations-node@^0.76
pnpm add prom-client@^15
pnpm add @sentry/node@^10

# API contract + quality gates
pnpm add @nestjs/swagger@^11
pnpm add -D @stoplight/spectral-cli@^6 testcontainers@^12 autocannon@^8
```

## Confidence Notes

| Area                                    | Confidence | Notes                                                                                                |
| --------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| Nest + security + queue recommendations | HIGH       | Backed by official Nest docs for performance, helmet, throttling, caching, and queues.               |
| Runtime/version guidance                | HIGH       | Verified against live npm registry and Node release index on 2026-05-29.                             |
| Appwrite server SDK posture             | MEDIUM     | Verified from current Appwrite Node quickstart and package registry; one reference URL returned 404. |
| Tooling choices for CI/ops              | MEDIUM     | Industry-standard and practical, but exact vendor mix should match org constraints and budget.       |

## Sources

- Nest docs: https://docs.nestjs.com/
- Nest performance/Fastify: https://docs.nestjs.com/techniques/performance
- Nest queues: https://docs.nestjs.com/techniques/queues
- Nest caching: https://docs.nestjs.com/techniques/caching
- Nest helmet: https://docs.nestjs.com/security/helmet
- Nest rate limiting: https://docs.nestjs.com/security/rate-limiting
- Nest OpenAPI: https://docs.nestjs.com/openapi/introduction
- Appwrite Node quickstart: https://appwrite.io/docs/quick-starts/node
- OpenTelemetry JS docs: https://opentelemetry.io/docs/languages/js/
- Sentry Node docs: https://docs.sentry.io/platforms/javascript/guides/node/
- OWASP REST Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- BullMQ docs: https://docs.bullmq.io/
- Redis docs: https://redis.io/docs/latest/
- Fastify docs: https://fastify.dev/docs/latest/Guides/Getting-Started/
- Node releases index: https://nodejs.org/dist/index.json
