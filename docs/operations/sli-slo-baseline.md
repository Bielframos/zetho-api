# SLI/SLO Baseline

## Signals

- **Availability:** keep critical endpoints below 1% 5xx responses.
- **Latency:** API reads should stay at or below a 500ms p95 target.
- **IGDB freshness:** sync lag should remain within 60 minutes.

## Source of truth

These targets are published as static metadata from `GET /health/slo` and are derived from structured logs emitted by request metrics and critical pipeline lifecycle events.

## What is deferred

- Dashboards and alerting backends.
- Prometheus/OpenTelemetry instrumentation.
- Automated error-budget rollback logic.
