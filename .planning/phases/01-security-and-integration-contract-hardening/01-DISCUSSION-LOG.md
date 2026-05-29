# Phase 1: Security and Integration Contract Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 1-Security and Integration Contract Hardening
**Areas discussed:** Mutation authorization envelope, Integration ingress authenticity and replay safety, Webhook/sync failure semantics and idempotency behavior, External call resilience contract

---

## Mutation authorization envelope

| Option | Description | Selected |
|--------|-------------|----------|
| Keep body-provided userId with minimal validation | Continue current style and validate userId/reason in service layer. | |
| Require authenticated session + role checks and derive identity from request.user | Protect all mutation routes with guard and policy; actor identity comes from auth context. | ✓ |
| Restrict all mutations to system API key only | Treat mutation APIs as machine-only and remove user session path. | |

**User's choice:** Auto mode selected recommended default (Option 2).
**Notes:** `[auto] Mutation authorization envelope - Q: "How should protected mutation endpoints enforce caller authorization and identity sourcing?" -> Selected: "Require authenticated session + role checks and derive identity from request.user" (recommended default)`

---

## Integration ingress authenticity and replay safety

| Option | Description | Selected |
|--------|-------------|----------|
| Validate shared secret/signature only | Keep current ingress checks and rely on downstream logic for duplicate handling. | |
| Validate signature + timing-safe compare + deterministic replay registry | Harden guard verification and block replays before side effects. | ✓ |
| Accept and deduplicate only at domain row level | Ingress remains permissive; dedupe occurs only inside handlers. | |

**User's choice:** Auto mode selected recommended default (Option 2).
**Notes:** `[auto] Integration ingress authenticity and replay safety - Q: "What contract should webhook ingress use for authenticity and replay handling?" -> Selected: "Validate signature + timing-safe compare + deterministic replay registry" (recommended default)`

---

## Webhook/sync failure semantics and idempotency behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Always return 200 and rely on logs | Preserve success HTTP status despite internal processing failures. | |
| Return 2xx for intentional no-op and 5xx/4xx for actionable failures | Expose retryable failures while keeping idempotent duplicates as no-op success. | ✓ |
| Fail hard for every anomaly including duplicates | Strictly fail all non-happy paths including repeated events. | |

**User's choice:** Auto mode selected recommended default (Option 2).
**Notes:** `[auto] Webhook/sync failure semantics and idempotency behavior - Q: "How should webhook/sync handlers signal failures and handle duplicate deliveries?" -> Selected: "Return 2xx for intentional no-op and 5xx/4xx for actionable failures" (recommended default)`

---

## External call resilience contract

| Option | Description | Selected |
|--------|-------------|----------|
| No timeout/retry policy; fail immediately | Keep single-attempt outbound behavior and bubble errors. | |
| Bounded timeout + capped retry/backoff + explicit error classification | Add controlled retries for retryable failures with structured terminal failure paths. | ✓ |
| Aggressive unbounded retries | Maximize eventual success at expense of latency and load. | |

**User's choice:** Auto mode selected recommended default (Option 2).
**Notes:** `[auto] External call resilience contract - Q: "What resilience policy should govern outbound integration calls in this phase?" -> Selected: "Bounded timeout + capped retry/backoff + explicit error classification" (recommended default)`

---

## the agent's Discretion

- Timeout and retry values per provider are left for plan/research calibration.
- Replay key persistence model (table/log shape) is left for planning details.

## Deferred Ideas

None.
