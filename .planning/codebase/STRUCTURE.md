# Codebase Structure

**Analysis Date:** 2026-05-29

## Directory Layout

```text
zetho-api/
├── src/                        # NestJS application source
│   ├── common/                 # Shared infra: appwrite, ai, guards, pipes
│   ├── modules/                # Feature modules (controllers/services/dtos)
│   ├── main.ts                 # Runtime bootstrap entrypoint
│   └── app.module.ts           # Root module composition
├── functions/                  # Appwrite Functions runtime code
│   └── Gamer Scout/            # Scheduled IGDB sync trigger function
├── test/                       # E2E test harness and setup
├── appwrite.config.json        # Appwrite project/functions/tables schema config
├── package.json                # Scripts and dependency manifest
└── tsconfig*.json              # TypeScript compiler config
```

## Directory Purposes

**src/common:**

- Purpose: Cross-cutting infrastructure shared by all domains.
- Contains: `appwrite/`, `ai/`, `guards/`, `pipes/`.
- Key files: `src/common/appwrite/appwrite.provider.ts`, `src/common/ai/ai.module.ts`, `src/common/guards/session.guard.ts`.

**src/modules:**

- Purpose: Business domains with clear endpoint ownership.
- Contains: One folder per domain (`game`, `igdb`, `profile`, `raffle`, `gazetho`, `zcoins`, `webhook`, `sitemap`, `google`, `notifications`, `sandbox`).
- Key files: `src/modules/game/game.controller.ts`, `src/modules/igdb/igdb.service.ts`, `src/modules/webhook/webhook.controller.ts`.

**functions/Gamer Scout:**

- Purpose: Appwrite function app area for scheduled outbound sync trigger.
- Contains: `src/main.js`, function package manifest and README.
- Key files: `functions/Gamer Scout/src/main.js`, `appwrite.config.json`.

**test:**

- Purpose: End-to-end testing entrypoints and jest setup.
- Contains: `app.e2e-spec.ts`, `jest-e2e.json`, `jest.setup.ts`.
- Key files: `test/app.e2e-spec.ts`, `test/jest-e2e.json`.

## Key File Locations

**Entry Points:**

- `src/main.ts`: Process bootstrapping and HTTP server start.
- `src/app.module.ts`: Root module dependency composition.
- `functions/Gamer Scout/src/main.js`: Function runtime entry for scheduled sync.

**Configuration:**

- `package.json`: Scripts, deps, Jest config.
- `eslint.config.mjs`: Lint ruleset configuration.
- `tsconfig.json`: TypeScript project configuration.
- `appwrite.config.json`: Appwrite resources and function schedule.

**Core Logic:**

- `src/modules/game/game.service.ts`: Game read/search/migration logic.
- `src/modules/igdb/igdb.service.ts`: IGDB acquisition and persistence.
- `src/modules/gazetho/gazetho.service.ts`: Content API logic.
- `src/common/ai/agents/editor/editor.service.ts`: Editorial AI orchestration.
- `src/modules/raffle/raffle.service.ts`: Ticket purchase and key delivery workflow.

**Testing:**

- `src/app.controller.spec.ts`: Unit-style app controller test.
- `test/app.e2e-spec.ts`: E2E smoke coverage.

## Naming Conventions

**Files:**

- Nest layer suffixes: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.dto.ts`.
- Utilities/constants: descriptive names like `game-search.utils.ts`, `notifications.constants.ts`.
- Function app runtime: plain JavaScript entry `src/main.js` under function directory.

**Directories:**

- Feature domains are singular lowercase folders in `src/modules`.
- Shared capabilities grouped by concern under `src/common`.
- Function app directories use Appwrite-visible names (`functions/Gamer Scout`).

## Where to Add New Code

**New API Feature:**

- Primary code: add `module/controller/service/dto` under a new or existing folder in `src/modules/<feature>/`.
- Wiring: register the new module in `src/app.module.ts` imports.
- Guards: add auth/role/webhook guards under `src/common/guards` if reusable.
- Tests: add controller/service tests near source (`src/...*.spec.ts`) and e2e flows under `test/`.

**New AI Agent Capability:**

- Implementation: add a new service/module under `src/common/ai/agents/<agent>/`.
- Prompts: place prompt templates in `src/common/ai/prompts/`.
- Integrations: import upstream modules in the agent module, mirroring `src/common/ai/agents/editor/editor.module.ts`.

**New Webhook Type:**

- Endpoint mapping: add route in `src/modules/webhook/webhook.controller.ts`.
- Handler logic: place projection logic in `src/modules/webhook/handlers/`.
- Verification: create or reuse guard in `src/common/guards/`.

**New Scheduled Work:**

- In-API cron: add `@Cron` flow in an existing service and ensure module is loaded by `AppModule`.
- External function cron: create a new folder under `functions/`, add `src/main.js`, and register it in `appwrite.config.json`.

**Utilities:**

- Domain-specific helpers: keep in the domain folder (example `src/modules/game/game-search.utils.ts`).
- Cross-domain helpers: place in a dedicated folder under `src/common/`.

## Folder Ownership

**Content and Editorial Ownership:**

- `src/modules/gazetho/` owns post CRUD/search endpoints.
- `src/common/ai/agents/editor/` owns feed analysis, article generation, and notification trigger.

**Catalog Ownership:**

- `src/modules/igdb/` owns external IGDB synchronization and import operations.
- `src/modules/game/` owns game-facing read/query/media endpoints.
- `src/modules/webhook/handlers/igdb.handler.ts` owns webhook-driven game/genre upserts.

**User and Economy Ownership:**

- `src/modules/profile/` owns profile lifecycle and profile consistency audits.
- `src/modules/zcoins/` owns balance updates and leaderboard aggregation.
- `src/modules/raffle/` owns raffle lifecycle, ticket purchase, and game key delivery.

**Infrastructure Ownership:**

- `src/common/appwrite/` owns Appwrite client construction and typed access.
- `src/modules/google/` owns YouTube integration client.
- `src/modules/notifications/` owns outbound WhatsApp/evolution transport.
- `src/common/guards/` owns HTTP and webhook access control.

## Special Directories

**functions/:**

- Purpose: Appwrite serverless function code.
- Generated: No.
- Committed: Yes.

**test/:**

- Purpose: End-to-end testing configuration and suites.
- Generated: No.
- Committed: Yes.

**dist/:**

- Purpose: TypeScript build output from `nest build`.
- Generated: Yes.
- Committed: Not detected in repository tree.

---

_Structure analysis: 2026-05-29_
