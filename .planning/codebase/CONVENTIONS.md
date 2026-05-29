# Coding Conventions

**Analysis Date:** 2026-05-29

## Naming Patterns

**Files:**

- Kebab-case for feature files: `src/modules/game/game.service.ts`, `src/modules/webhook/webhook.controller.ts`.
- Suffix-based role naming: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.dto.ts`, `*.guard.ts`, `*.pipe.ts`.
- Prompt assets use snake_case and dot suffixes: `src/common/ai/prompts/editor/pick_image.prompt`.

**Functions:**

- Service/controller methods use camelCase: `findBySlug`, `findHypedUpcoming`, `syncPopularGames`.
- Controller handlers are verb-first and action oriented: `createPost`, `purchaseTickets`, `IGDBUpsertGame`.
- Some webhook handlers use PascalCase method names (`IGDBUpsertGame`, `IGDBDeleteGenre`) in `src/modules/webhook/webhook.controller.ts`.

**Variables:**

- Local variables use camelCase (`cacheKey`, `criteriaQueries`, `exactMatch`).
- Constants are mostly UPPER_SNAKE_CASE for env-like values in scope (`MAX_REQUESTS_PER_SECOND`, `WINDOW_SIZE_MS` in `src/modules/igdb/igdb.service.ts`).
- Class-level static constants follow `readonly` + UPPER_SNAKE_CASE style (`DB_ID`, `IGDB_IMAGE_BASE`).

**Types:**

- DTO and entity-like type names use PascalCase (`SearchGamesDto`, `HypedUpcomingDto`, `IGDBGame`).
- `type` imports are preferred where possible (`import type { Cache } from 'cache-manager';`).

## Code Style

**Formatting:**

- Tool used: Prettier (`.prettierrc`).
- Key settings from `.prettierrc`:
  - `singleQuote: true`
  - `trailingComma: all`
- Additional Prettier ESLint enforcement in `eslint.config.mjs`:
  - `prettier/prettier` is `error` with `endOfLine: auto`.

**Linting:**

- Tool used: ESLint 9 + `typescript-eslint` + `eslint-plugin-prettier/recommended` in `eslint.config.mjs`.
- Type-aware linting enabled via `parserOptions.projectService: true`.
- Key rule posture:
  - `@typescript-eslint/no-explicit-any`: off
  - `@typescript-eslint/no-floating-promises`: warn
  - `@typescript-eslint/no-unsafe-argument`: warn
- Lint command auto-fixes by default: `eslint "{src,apps,libs,test}/**/*.ts" --fix` (`package.json`).

## Import Organization

**Order:**

1. Side-effect/bootstrap imports (for example `import './crypto-polyfill';` and dotenv init in `src/main.ts`).
2. Third-party packages (`@nestjs/*`, `node-appwrite`, `cache-manager`).
3. Absolute app imports via alias-like roots (`src/...`).
4. Relative local module imports (`./game.dto`, `../igdb/igdb.service`).

**Path Aliases:**

- Runtime/test alias mapping exists for `src/*` and `infra/*` in Jest config (`package.json`, `test/jest-e2e.json`).
- Source code uses both alias-style absolute imports (`src/common/...`) and relative imports in the same modules.

## Error Handling

**Patterns:**

- Primary pattern is throwing Nest HTTP exceptions (`NotFoundException`, `ConflictException`, `UnauthorizedException`, `InternalServerErrorException`).
- Guards centralize auth failures and throw framework exceptions (for example `src/common/guards/session.guard.ts`).
- Services frequently convert upstream failures to domain/API-safe exceptions (`src/modules/igdb/igdb.service.ts`, `src/modules/profile/profile.service.ts`).
- Catch-and-rethrow is used, but some broad catches still include direct console output before exception wrapping.

## Logging

**Framework:** Nest `Logger` is the main standard.

**Patterns:**

- Class-scoped logger: `private readonly logger = new Logger(ClassName)` in service/handler classes.
- Structured operational logs are common in integration-heavy services (`src/modules/igdb/igdb.service.ts`, `src/modules/webhook/handlers/zetho.handler.ts`).
- Outliers use `console.log`/`console.error` (`src/common/guards/session.guard.ts`, `src/common/ai/agents/editor/editor.service.ts`), reducing consistency.

## Comments

**When to Comment:**

- Comments are sparse and mostly used for non-obvious behavior (rate limiting, migration locks, webhook semantics).
- Some modules include endpoint-level doc comments in Portuguese (`src/modules/raffle/raffle.controller.ts`).

**JSDoc/TSDoc:**

- Not standardized across the codebase.
- Present in selected controllers/services only; not enforced by lint rules.

## Function Design

**Size:**

- Controllers are generally thin and delegate to services.
- Several services have large, multi-responsibility methods (for example `syncPopularGames` and search/migration flows in `src/modules/igdb/igdb.service.ts` and `src/modules/game/game.service.ts`).

**Parameters:**

- DTO-based inputs are common in controllers (`SearchGamesDto`, `CreateRaffleDto`).
- Untyped request objects appear in several controllers (`@Req() req: any` in `src/modules/raffle/raffle.controller.ts` and `src/modules/profile/profile.controller.ts`).

**Return Values:**

- Service methods return raw Appwrite rows and plain objects.
- Controllers usually return service promises directly without response mapping layers.

## Module Design

**Exports:**

- Feature modules follow Nest modular composition with clear `module/controller/service` grouping (`src/modules/*`).
- Dependency injection is the dominant composition style, including cache and provider injection (`@Inject(CACHE_MANAGER)`, `Appwrite` provider usage).

**Barrel Files:**

- Not detected as a dominant pattern. Most imports point directly to implementation files.

## Reliability Risks From Current Conventions

- Validation strategy is inconsistent: custom Valibot pipe (`src/common/pipes/validation/validation.pipe.ts`) coexists with Nest built-in `ValidationPipe` usage in controllers (`src/modules/gazetho/gazetho.controller.ts`, `src/modules/raffle/raffle.controller.ts`).
- Type-safety baseline is intentionally relaxed (`noImplicitAny: false` in `tsconfig.json`, `no-explicit-any` disabled in ESLint, and frequent `as any` in Appwrite query calls).
- Logging strategy is mixed (`Logger` and `console.*`), which can fragment observability and log ingestion.
- No global validation pipe is configured in bootstrap (`src/main.ts`), so validation depends on per-controller/per-route discipline.

---

_Convention analysis: 2026-05-29_
