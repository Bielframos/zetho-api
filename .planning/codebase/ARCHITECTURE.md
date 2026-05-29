<!-- refreshed: 2026-05-29 -->
# Architecture

**Analysis Date:** 2026-05-29

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     NestJS HTTP + Scheduled Entry Layer                    │
├──────────────────────┬──────────────────────────┬───────────────────────────┤
│ API Controllers      │ Webhook Ingress          │ Scheduled Jobs            │
│ `src/modules/*/*.`   │ `src/modules/webhook/*`  │ `src/common/ai/agents/`   │
│ `controller.ts`      │                          │ `editor/editor.service.ts`│
└──────────────┬───────┴───────────────┬──────────┴───────────────┬──────────┘
               │                       │                          │
               ▼                       ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Application Service Layer                            │
│ `src/modules/*/*.service.ts`, `src/common/ai/agents/*/*.service.ts`       │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               Data + External Integration Adapter Layer                     │
│ Appwrite: `src/common/appwrite/appwrite.provider.ts`                       │
│ External APIs: IGDB/Twitch, YouTube, Unsplash, Evolution WhatsApp          │
│ Function worker: `functions/Gamer Scout/src/main.js`                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Bootstrap + platform setup | Starts Nest app, CORS/cookie parser, raw-body webhook support | `src/main.ts` |
| Root composition | Wires cache, scheduler, infra modules, and feature modules | `src/app.module.ts` |
| Appwrite gateway | Centralized Appwrite client and typed DB clients | `src/common/appwrite/appwrite.provider.ts` |
| AI runtime container | Creates Genkit providers for OpenAI-compatible and Google GenAI | `src/common/ai/ai.module.ts` |
| Game catalog domain | Search/read/enrich game records and media with cache and migrations | `src/modules/game/game.service.ts` |
| IGDB ingestion domain | Pulls/syncs catalog from IGDB and persists to Appwrite | `src/modules/igdb/igdb.service.ts` |
| Webhook projection domain | Consumes Appwrite and IGDB webhooks, projects data/counters | `src/modules/webhook/handlers/zetho.handler.ts` |
| Editorial pipeline | Hourly trend analysis + article generation + publish + notify | `src/common/ai/agents/editor/editor.service.ts` |
| Content API domain | CRUD/search/sitemap-oriented access to posts | `src/modules/gazetho/gazetho.service.ts` |
| Economy + raffle domain | ZCoins ledger/leaderboards and raffle lifecycle | `src/modules/zcoins/zcoins.service.ts`, `src/modules/raffle/raffle.service.ts` |
| Scheduled function boundary | Daily Appwrite Function calling API sync endpoint | `functions/Gamer Scout/src/main.js` |

## Pattern Overview

**Overall:** Modular monolith with NestJS module boundaries and service-centric orchestration.

**Key Characteristics:**
- Feature-first modules in `src/modules` with classic controller -> service flow.
- Shared infrastructure in `src/common` (guards, Appwrite provider, AI providers).
- Appwrite TablesDB acts as the system of record and transaction coordinator.

## Layers

**Presentation Layer (Controllers):**
- Purpose: Expose HTTP endpoints and apply guards/DTO validation.
- Location: `src/modules/*/*.controller.ts`
- Contains: Route handlers for games, igdb, profile, raffle, gazetho, webhook, sitemap, sandbox, zcoins.
- Depends on: Domain services, guards, DTOs.
- Used by: Public clients, system clients, webhooks, scheduled function callers.

**Application Layer (Services):**
- Purpose: Implement domain workflows and orchestration logic.
- Location: `src/modules/*/*.service.ts`, `src/common/ai/agents/*/*.service.ts`
- Contains: Game search/enrichment, IGDB sync, profile audits, raffle purchasing, content generation.
- Depends on: `Appwrite` provider, AI providers, external API services.
- Used by: Controllers and cron jobs.

**Infrastructure Layer:**
- Purpose: External system adapters and cross-cutting services.
- Location: `src/common/appwrite/*`, `src/modules/google/*`, `src/modules/notifications/*`, `src/common/guards/*`
- Contains: Appwrite client bootstrap, YouTube API client, Evolution API sender, security guards.
- Depends on: Environment configuration and third-party SDKs.
- Used by: Application services and controllers.

**Function Runtime Layer:**
- Purpose: Decouple scheduled sync trigger from main API process.
- Location: `functions/Gamer Scout/src/main.js`, `appwrite.config.json`
- Contains: Scheduled HTTP trigger to `/igdb/games/popular-sync`.
- Depends on: API endpoint + API key env vars.
- Used by: Appwrite cron scheduler.

## Data Flow

### Primary Request Path (Game Detail)

1. HTTP request enters Nest bootstrap app and router (`src/main.ts:10`, `src/main.ts:30`).
2. Route `GET /games/:slug` resolves in game controller (`src/modules/game/game.controller.ts:20`).
3. Domain read/enrichment and cache/migration logic executes in game service (`src/modules/game/game.service.ts:40`).
4. Service fetches and updates Appwrite tables via provider-backed TablesDB client (`src/common/appwrite/appwrite.provider.ts:14`).
5. Response is returned from controller with enriched game payload.

### Secondary Flow (Webhook Projection)

1. Webhook endpoint receives event (`src/modules/webhook/webhook.controller.ts:25`).
2. Guard validates webhook signature or secret (`src/common/guards/webhook.guard.ts`, `src/common/guards/igdb.guard.ts`).
3. Handler performs projection/update (`src/modules/webhook/handlers/zetho.handler.ts:51`, `src/modules/webhook/handlers/igdb.handler.ts:20`).
4. Handler persists aggregate counters and related rows in Appwrite tables.

### Scheduled Editorial Flow

1. Cron trigger starts editor pipeline hourly (`src/common/ai/agents/editor/editor.service.ts:121`).
2. Pipeline fetches feeds and runs trend/article prompts (`src/common/ai/agents/editor/editor.service.ts:141`).
3. Generated post is persisted through content module service (`src/modules/gazetho/gazetho.service.ts:28`).
4. Post publication notification is sent via Evolution adapter (`src/modules/notifications/notifications.service.ts`).

### Function-Scheduled IGDB Flow

1. Appwrite schedules function daily (`appwrite.config.json:53`).
2. Function calls protected endpoint (`functions/Gamer Scout/src/main.js:10`).
3. IGDB controller route executes sync (`src/modules/igdb/igdb.controller.ts:21`).
4. IGDB service fetches and upserts games (`src/modules/igdb/igdb.service.ts:188`).

**State Management:**
- Primary persisted state is Appwrite TablesDB (`databaseId = app`) across modules.
- Request/session caching uses global cache manager (configured in `src/app.module.ts`).
- In-process transient state exists for token and migration locks (`IGDBService.authPromise`, `GameService.migrationPromises`).

## Key Abstractions

**Appwrite Provider:**
- Purpose: Single injected gateway for Account/Users/TablesDB operations.
- Examples: `src/common/appwrite/appwrite.provider.ts`, consumers in `src/modules/*/*.service.ts`.
- Pattern: Global singleton provider imported once in root module.

**Guard-based access envelope:**
- Purpose: Enforce caller identity and role policy by endpoint type.
- Examples: `src/common/guards/session.guard.ts`, `src/common/guards/system-api.guard.ts`, `src/common/guards/webhook.guard.ts`.
- Pattern: Route-level `@UseGuards` plus optional role metadata.

**AI Agent services:**
- Purpose: Encapsulate prompt-driven workflows as injectable services.
- Examples: `src/common/ai/agents/editor/editor.service.ts`, `src/common/ai/agents/translator/translator.service.ts`.
- Pattern: Services depend on `AiModule` provider tokens and expose task-oriented methods.

## Entry Points

**HTTP API entrypoint:**
- Location: `src/main.ts`
- Triggers: Node process startup via `pnpm start*`.
- Responsibilities: Build Nest app, configure CORS/cookies, start listener.

**Webhook entrypoint:**
- Location: `src/modules/webhook/webhook.controller.ts`
- Triggers: Appwrite and IGDB webhook events.
- Responsibilities: Validate webhook authenticity and dispatch to handlers.

**Cron entrypoint (in API):**
- Location: `src/common/ai/agents/editor/editor.service.ts`
- Triggers: Nest scheduler (`@Cron` hourly).
- Responsibilities: Execute editorial generation/publish workflow.

**Cron entrypoint (function):**
- Location: `functions/Gamer Scout/src/main.js`
- Triggers: Appwrite function schedule.
- Responsibilities: Trigger IGDB popular sync endpoint with system API key.

## Architectural Constraints

- **Threading:** Single-process Node.js event loop model; concurrency inside services uses async batching and Promise pools.
- **Global state:** Global `Appwrite` provider plus service-level mutable state in `IGDBService` and `GameService`.
- **Circular imports:** `EditorModule` imports `GameModule`; `GameModule` imports `TranslatorModule`; translator only imports `AiModule`, so no circular module chain is detected.
- **Environment coupling:** Secrets/config are read directly from `process.env` across guards/services instead of centralized config module.

## Anti-Patterns

### Configuration Scattered Across Services

**What happens:** Many services and guards read `process.env` directly.
**Why it's wrong:** Harder testability and inconsistent failure behavior when env vars are absent.
**Do this instead:** Centralize config via a dedicated config provider/module and inject typed values into `src/common/guards/*` and `src/modules/*/*.service.ts`.

### Transport-Level DTO Handling in Domain-heavy Controllers

**What happens:** Some controllers perform request normalization/parsing logic inline before service calls.
**Why it's wrong:** Mixed transport and domain concerns increase duplication across controllers.
**Do this instead:** Push normalization into DTO pipes or dedicated validators near `src/common/pipes/validation/validation.pipe.ts` and keep controller methods thin.

## Error Handling

**Strategy:** Exception-driven control flow using Nest exceptions, with selective error swallowing for non-critical side effects.

**Patterns:**
- Domain validation and auth failures use `BadRequestException`, `ConflictException`, `UnauthorizedException`, `ForbiddenException`.
- External/integration failures often log and continue where appropriate (for example post-share failures in notifications).

## Cross-Cutting Concerns

**Logging:** Nest `Logger` in services/handlers for pipeline and integration observability.
**Validation:** DTO validation via Nest `ValidationPipe` in controllers and a custom valibot pipe available under `src/common/pipes/validation/validation.pipe.ts`.
**Authentication:** Combination of session JWT guard, system API key guard, and webhook signature/secret guards.

---

*Architecture analysis: 2026-05-29*
