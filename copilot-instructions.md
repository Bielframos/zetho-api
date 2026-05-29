<!-- GSD:project-start source:PROJECT.md -->
## Project

**Zetho API**

Zetho API is a NestJS backend for a gaming ecosystem that powers game catalog ingestion/search, editorial content generation, user profiles, raffles, rewards, and webhooks. It serves internal automations and public-facing experiences through Appwrite-backed data services and external integrations. This cycle focuses on professionalizing reliability, security, and delivery quality while adding high-value features.

**Core Value:** Deliver a reliable and secure gaming backend that continuously provides fresh, useful user value without operational friction.

### Constraints

- **Tech stack**: Keep current NestJS + Appwrite architecture — avoid disruptive platform migration in this cycle.
- **Timeline**: Short horizon (2-4 weeks) — prioritize high-leverage improvements first.
- **Compatibility**: Preserve existing API consumers and webhook contracts where possible.
- **Operational risk**: Changes touching sync/webhook/rewards flows must remain rollback-friendly.
- **Data integrity**: Mutating flows must preserve transactional correctness in Appwrite-backed domains.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript (target ES2023) - NestJS API in `src/**/*.ts` (`tsconfig.json`, `src/main.ts`).
- JavaScript (ESM) - Appwrite Function code in `functions/Gamer Scout/src/main.js`.
## Runtime
- Node.js >=20.0.0 for main API (`package.json` engines).
- Appwrite Function runtime Node 21.0 (`appwrite.config.json` function `gamer_scout`).
- pnpm workspace (`pnpm-lock.yaml`, `pnpm-workspace.yaml`).
- Lockfile: present (`pnpm-lock.yaml`).
## Frameworks
- NestJS 11 (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`) - HTTP API and module system.
- Appwrite SDK (`node-appwrite`) - users/accounts/tables access (`src/common/appwrite/appwrite.provider.ts`).
- Jest 30 + ts-jest - unit and e2e (`package.json`, `test/jest-e2e.json`).
- Supertest - e2e HTTP assertions (`package.json`).
- Nest CLI (`nest build`, `nest start`) - compile/run.
- TypeScript 5.7 - transpilation and declarations.
- ESLint 9 + typescript-eslint + Prettier 3 - lint/format (`eslint.config.mjs`).
## Key Dependencies
- `node-appwrite` - primary data/auth backend client (`src/common/appwrite/appwrite.provider.ts`).
- `googleapis` - YouTube Data API client (`src/modules/google/youtube.service.ts`).
- `genkit`, `@genkit-ai/compat-oai`, `@genkit-ai/google-genai` - AI agent orchestration (`src/common/ai/ai.module.ts`).
- `@nestjs/cache-manager` + `cache-manager` - in-memory caching configured in `src/app.module.ts`.
- `@nestjs/schedule` - cron/scheduled work (`src/app.module.ts`).
- `cookie-parser` - cookie middleware (`src/main.ts`).
## Configuration
- Runtime config is environment-variable driven via `process.env` across modules (`src/main.ts`, `src/common/appwrite/constants.ts`, `src/modules/igdb/igdb.service.ts`).
- `.env.example` exists and is empty; values expected from deployment environment.
- TypeScript config: `tsconfig.json`, `tsconfig.build.json`.
- Nest build config: `nest-cli.json`.
- Lint config: `eslint.config.mjs`.
## Platform Requirements
- Node.js 20+ and pnpm.
- Access to Appwrite project and API key for app data/auth integration.
- Long-running NestJS Node process (listens on `PORT` in `src/main.ts`).
- Appwrite project resources and function deployment (`appwrite.config.json`).
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Kebab-case for feature files: `src/modules/game/game.service.ts`, `src/modules/webhook/webhook.controller.ts`.
- Suffix-based role naming: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.dto.ts`, `*.guard.ts`, `*.pipe.ts`.
- Prompt assets use snake_case and dot suffixes: `src/common/ai/prompts/editor/pick_image.prompt`.
- Service/controller methods use camelCase: `findBySlug`, `findHypedUpcoming`, `syncPopularGames`.
- Controller handlers are verb-first and action oriented: `createPost`, `purchaseTickets`, `IGDBUpsertGame`.
- Some webhook handlers use PascalCase method names (`IGDBUpsertGame`, `IGDBDeleteGenre`) in `src/modules/webhook/webhook.controller.ts`.
- Local variables use camelCase (`cacheKey`, `criteriaQueries`, `exactMatch`).
- Constants are mostly UPPER_SNAKE_CASE for env-like values in scope (`MAX_REQUESTS_PER_SECOND`, `WINDOW_SIZE_MS` in `src/modules/igdb/igdb.service.ts`).
- Class-level static constants follow `readonly` + UPPER_SNAKE_CASE style (`DB_ID`, `IGDB_IMAGE_BASE`).
- DTO and entity-like type names use PascalCase (`SearchGamesDto`, `HypedUpcomingDto`, `IGDBGame`).
- `type` imports are preferred where possible (`import type { Cache } from 'cache-manager';`).
## Code Style
- Tool used: Prettier (`.prettierrc`).
- Key settings from `.prettierrc`:
- Additional Prettier ESLint enforcement in `eslint.config.mjs`:
- Tool used: ESLint 9 + `typescript-eslint` + `eslint-plugin-prettier/recommended` in `eslint.config.mjs`.
- Type-aware linting enabled via `parserOptions.projectService: true`.
- Key rule posture:
- Lint command auto-fixes by default: `eslint "{src,apps,libs,test}/**/*.ts" --fix` (`package.json`).
## Import Organization
- Runtime/test alias mapping exists for `src/*` and `infra/*` in Jest config (`package.json`, `test/jest-e2e.json`).
- Source code uses both alias-style absolute imports (`src/common/...`) and relative imports in the same modules.
## Error Handling
- Primary pattern is throwing Nest HTTP exceptions (`NotFoundException`, `ConflictException`, `UnauthorizedException`, `InternalServerErrorException`).
- Guards centralize auth failures and throw framework exceptions (for example `src/common/guards/session.guard.ts`).
- Services frequently convert upstream failures to domain/API-safe exceptions (`src/modules/igdb/igdb.service.ts`, `src/modules/profile/profile.service.ts`).
- Catch-and-rethrow is used, but some broad catches still include direct console output before exception wrapping.
## Logging
- Class-scoped logger: `private readonly logger = new Logger(ClassName)` in service/handler classes.
- Structured operational logs are common in integration-heavy services (`src/modules/igdb/igdb.service.ts`, `src/modules/webhook/handlers/zetho.handler.ts`).
- Outliers use `console.log`/`console.error` (`src/common/guards/session.guard.ts`, `src/common/ai/agents/editor/editor.service.ts`), reducing consistency.
## Comments
- Comments are sparse and mostly used for non-obvious behavior (rate limiting, migration locks, webhook semantics).
- Some modules include endpoint-level doc comments in Portuguese (`src/modules/raffle/raffle.controller.ts`).
- Not standardized across the codebase.
- Present in selected controllers/services only; not enforced by lint rules.
## Function Design
- Controllers are generally thin and delegate to services.
- Several services have large, multi-responsibility methods (for example `syncPopularGames` and search/migration flows in `src/modules/igdb/igdb.service.ts` and `src/modules/game/game.service.ts`).
- DTO-based inputs are common in controllers (`SearchGamesDto`, `CreateRaffleDto`).
- Untyped request objects appear in several controllers (`@Req() req: any` in `src/modules/raffle/raffle.controller.ts` and `src/modules/profile/profile.controller.ts`).
- Service methods return raw Appwrite rows and plain objects.
- Controllers usually return service promises directly without response mapping layers.
## Module Design
- Feature modules follow Nest modular composition with clear `module/controller/service` grouping (`src/modules/*`).
- Dependency injection is the dominant composition style, including cache and provider injection (`@Inject(CACHE_MANAGER)`, `Appwrite` provider usage).
- Not detected as a dominant pattern. Most imports point directly to implementation files.
## Reliability Risks From Current Conventions
- Validation strategy is inconsistent: custom Valibot pipe (`src/common/pipes/validation/validation.pipe.ts`) coexists with Nest built-in `ValidationPipe` usage in controllers (`src/modules/gazetho/gazetho.controller.ts`, `src/modules/raffle/raffle.controller.ts`).
- Type-safety baseline is intentionally relaxed (`noImplicitAny: false` in `tsconfig.json`, `no-explicit-any` disabled in ESLint, and frequent `as any` in Appwrite query calls).
- Logging strategy is mixed (`Logger` and `console.*`), which can fragment observability and log ingestion.
- No global validation pipe is configured in bootstrap (`src/main.ts`), so validation depends on per-controller/per-route discipline.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- Feature-first modules in `src/modules` with classic controller -> service flow.
- Shared infrastructure in `src/common` (guards, Appwrite provider, AI providers).
- Appwrite TablesDB acts as the system of record and transaction coordinator.
## Layers
- Purpose: Expose HTTP endpoints and apply guards/DTO validation.
- Location: `src/modules/*/*.controller.ts`
- Contains: Route handlers for games, igdb, profile, raffle, gazetho, webhook, sitemap, sandbox, zcoins.
- Depends on: Domain services, guards, DTOs.
- Used by: Public clients, system clients, webhooks, scheduled function callers.
- Purpose: Implement domain workflows and orchestration logic.
- Location: `src/modules/*/*.service.ts`, `src/common/ai/agents/*/*.service.ts`
- Contains: Game search/enrichment, IGDB sync, profile audits, raffle purchasing, content generation.
- Depends on: `Appwrite` provider, AI providers, external API services.
- Used by: Controllers and cron jobs.
- Purpose: External system adapters and cross-cutting services.
- Location: `src/common/appwrite/*`, `src/modules/google/*`, `src/modules/notifications/*`, `src/common/guards/*`
- Contains: Appwrite client bootstrap, YouTube API client, Evolution API sender, security guards.
- Depends on: Environment configuration and third-party SDKs.
- Used by: Application services and controllers.
- Purpose: Decouple scheduled sync trigger from main API process.
- Location: `functions/Gamer Scout/src/main.js`, `appwrite.config.json`
- Contains: Scheduled HTTP trigger to `/igdb/games/popular-sync`.
- Depends on: API endpoint + API key env vars.
- Used by: Appwrite cron scheduler.
## Data Flow
### Primary Request Path (Game Detail)
### Secondary Flow (Webhook Projection)
### Scheduled Editorial Flow
### Function-Scheduled IGDB Flow
- Primary persisted state is Appwrite TablesDB (`databaseId = app`) across modules.
- Request/session caching uses global cache manager (configured in `src/app.module.ts`).
- In-process transient state exists for token and migration locks (`IGDBService.authPromise`, `GameService.migrationPromises`).
## Key Abstractions
- Purpose: Single injected gateway for Account/Users/TablesDB operations.
- Examples: `src/common/appwrite/appwrite.provider.ts`, consumers in `src/modules/*/*.service.ts`.
- Pattern: Global singleton provider imported once in root module.
- Purpose: Enforce caller identity and role policy by endpoint type.
- Examples: `src/common/guards/session.guard.ts`, `src/common/guards/system-api.guard.ts`, `src/common/guards/webhook.guard.ts`.
- Pattern: Route-level `@UseGuards` plus optional role metadata.
- Purpose: Encapsulate prompt-driven workflows as injectable services.
- Examples: `src/common/ai/agents/editor/editor.service.ts`, `src/common/ai/agents/translator/translator.service.ts`.
- Pattern: Services depend on `AiModule` provider tokens and expose task-oriented methods.
## Entry Points
- Location: `src/main.ts`
- Triggers: Node process startup via `pnpm start*`.
- Responsibilities: Build Nest app, configure CORS/cookies, start listener.
- Location: `src/modules/webhook/webhook.controller.ts`
- Triggers: Appwrite and IGDB webhook events.
- Responsibilities: Validate webhook authenticity and dispatch to handlers.
- Location: `src/common/ai/agents/editor/editor.service.ts`
- Triggers: Nest scheduler (`@Cron` hourly).
- Responsibilities: Execute editorial generation/publish workflow.
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
### Transport-Level DTO Handling in Domain-heavy Controllers
## Error Handling
- Domain validation and auth failures use `BadRequestException`, `ConflictException`, `UnauthorizedException`, `ForbiddenException`.
- External/integration failures often log and continue where appropriate (for example post-share failures in notifications).
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| appwrite-typescript | Appwrite TypeScript SDK skill. Use when building browser-based JavaScript/TypeScript apps, React Native mobile apps, or server-side Node.js/Deno backends with Appwrite. Covers client-side auth (email, OAuth, anonymous), database queries, file uploads, real-time subscriptions, and server-side admin via API keys for user management, database administration, storage, and functions. | `.agents/skills/appwrite-typescript/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
