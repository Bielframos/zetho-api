# Phase 1: Security and Integration Contract Hardening - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase hardens mutation and integration boundaries so only authorized actors can mutate state, while webhook/sync ingress and processing failures behave deterministically for retry and alerting.

</domain>

<decisions>
## Implementation Decisions

### Mutation authorization and identity source

- **D-01:** Protect all user-reachable mutation endpoints with `AppwriteSessionGuard` plus role policy where required; avoid public mutation routes without guard coverage.
- **D-02:** Derive actor identity from authenticated context (`request.user`) for protected mutations. Body-provided identity fields (for example `userId`) are not trusted as authority.
- **D-03:** Keep machine-only mutation paths explicit and isolated behind system/webhook guards rather than sharing public payload contracts.

### Integration ingress authenticity and replay safety

- **D-04:** Validate inbound webhook authenticity with canonical raw-body signature/secret verification and timing-safe comparisons.
- **D-05:** Add replay/duplicate protection at ingress using deterministic event keys persisted before side effects; duplicate deliveries must short-circuit safely.
- **D-06:** Signature validation must be resilient to deployment URL drift by using stable canonical message construction for signing input.

### Webhook/sync failure semantics and idempotency

- **D-07:** Return non-2xx status for retryable or internal processing failures in webhook/sync handlers.
- **D-08:** Return 2xx only for intentional no-op outcomes (unsupported event type, already-processed/idempotent duplicate) with explicit reason logging.
- **D-09:** Preserve existing domain idempotency checks (`z_entries_read` anti-spam state, checksum-based IGDB upsert short-circuit) and run them before costly side effects.

### External integration resilience contract

- **D-10:** Outbound calls to IGDB/Twitch and other critical providers must use bounded timeout and capped retries with jitter for retryable failures (`429`/`5xx`/network timeouts).
- **D-11:** Non-retryable failures (`4xx` contract issues, auth misconfiguration) fail fast and return observable error status to upstream callers.
- **D-12:** Classify and log integration failures with enough structure (provider, operation, retryability, terminal status) to support alerts and safe retries.

### the agent's Discretion

- Exact timeout and retry values per integration can be tuned during planning (for example per endpoint risk and provider quota), as long as bounds and retry caps are explicit and testable.
- Storage implementation for replay keys is flexible (dedicated table or constrained log table) if it guarantees deterministic dedupe and bounded retention.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and requirement contracts

- `.planning/ROADMAP.md` - Phase 1 goal, requirements mapping, and success criteria baseline.
- `.planning/REQUIREMENTS.md` - Security/reliability requirement definitions (SECU-01..04, RELY-01..02, RELY-04).
- `.planning/PROJECT.md` - Project-level constraints, out-of-scope boundaries, and delivery priorities.
- `.planning/STATE.md` - Current execution state and continuity markers.

### Existing enforcement and ingress implementation points

- `src/common/guards/session.guard.ts` - Current authenticated-session and role metadata enforcement behavior.
- `src/common/guards/webhook.guard.ts` - Current Appwrite webhook signature verification implementation.
- `src/common/guards/igdb.guard.ts` - Current IGDB webhook secret validation path.
- `src/modules/webhook/webhook.controller.ts` - Integration ingress routes and present response semantics.

### Existing idempotency and mutation behaviors

- `src/modules/webhook/handlers/zetho.handler.ts` - `z_entries_read` anti-spam/idempotency and transaction orchestration.
- `src/modules/webhook/handlers/igdb.handler.ts` - IGDB upsert failure semantics and current HTTP response behavior.
- `src/modules/zcoins/zcoins.controller.ts` - Public mutation routes currently accepting body identity.
- `src/modules/igdb/igdb.service.ts` - External call/token/rate-limit logic and retry/timeout gap area.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `AppwriteSessionGuard` already resolves authenticated user and supports role metadata checks for protected endpoints.
- Webhook guards (`AppwriteWebhookGuard`, `IGDBGuard`) provide existing integration ingress hooks that can be hardened instead of replaced.
- `ZethoHandler.syncEntry` already persists deterministic read-model state (`z_entries_read`) and performs transactional side effects.

### Established Patterns

- NestJS controller + service + guard layering is the dominant backend pattern and should remain the enforcement path.
- Appwrite TablesDB transaction blocks (`createTransaction` / `updateTransaction`) are the standard write integrity mechanism for multi-write operations.
- Requirement-driven phase planning under `.planning/` is the active delivery contract; scope expansion must be deferred.

### Integration Points

- Mutation hardening touches controller guard usage and payload/identity contracts (`zcoins`, plus any other unguarded mutating routes found in planning).
- Ingress hardening connects at webhook guards and webhook controller return semantics.
- Retry/timeout and failure classification connect in integration adapters/services (`IGDBService` and similar outbound providers).

</code_context>

<specifics>
## Specific Ideas

- Maintain explicit, user-visible authorization failure semantics for denied protected mutations.
- Favor idempotent duplicate handling over best-effort retries that can create duplicate state changes.
- Keep this phase focused on hardening and reliability contracts, not on introducing new product capabilities.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

_Phase: 1-Security and Integration Contract Hardening_
_Context gathered: 2026-05-29_
