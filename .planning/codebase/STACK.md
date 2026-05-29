# Technology Stack

**Analysis Date:** 2026-05-29

## Languages

**Primary:**

- TypeScript (target ES2023) - NestJS API in `src/**/*.ts` (`tsconfig.json`, `src/main.ts`).

**Secondary:**

- JavaScript (ESM) - Appwrite Function code in `functions/Gamer Scout/src/main.js`.

## Runtime

**Environment:**

- Node.js >=20.0.0 for main API (`package.json` engines).
- Appwrite Function runtime Node 21.0 (`appwrite.config.json` function `gamer_scout`).

**Package Manager:**

- pnpm workspace (`pnpm-lock.yaml`, `pnpm-workspace.yaml`).
- Lockfile: present (`pnpm-lock.yaml`).

## Frameworks

**Core:**

- NestJS 11 (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`) - HTTP API and module system.
- Appwrite SDK (`node-appwrite`) - users/accounts/tables access (`src/common/appwrite/appwrite.provider.ts`).

**Testing:**

- Jest 30 + ts-jest - unit and e2e (`package.json`, `test/jest-e2e.json`).
- Supertest - e2e HTTP assertions (`package.json`).

**Build/Dev:**

- Nest CLI (`nest build`, `nest start`) - compile/run.
- TypeScript 5.7 - transpilation and declarations.
- ESLint 9 + typescript-eslint + Prettier 3 - lint/format (`eslint.config.mjs`).

## Key Dependencies

**Critical:**

- `node-appwrite` - primary data/auth backend client (`src/common/appwrite/appwrite.provider.ts`).
- `googleapis` - YouTube Data API client (`src/modules/google/youtube.service.ts`).
- `genkit`, `@genkit-ai/compat-oai`, `@genkit-ai/google-genai` - AI agent orchestration (`src/common/ai/ai.module.ts`).

**Infrastructure:**

- `@nestjs/cache-manager` + `cache-manager` - in-memory caching configured in `src/app.module.ts`.
- `@nestjs/schedule` - cron/scheduled work (`src/app.module.ts`).
- `cookie-parser` - cookie middleware (`src/main.ts`).

## Configuration

**Environment:**

- Runtime config is environment-variable driven via `process.env` across modules (`src/main.ts`, `src/common/appwrite/constants.ts`, `src/modules/igdb/igdb.service.ts`).
- `.env.example` exists and is empty; values expected from deployment environment.

**Build:**

- TypeScript config: `tsconfig.json`, `tsconfig.build.json`.
- Nest build config: `nest-cli.json`.
- Lint config: `eslint.config.mjs`.

## Platform Requirements

**Development:**

- Node.js 20+ and pnpm.
- Access to Appwrite project and API key for app data/auth integration.

**Production:**

- Long-running NestJS Node process (listens on `PORT` in `src/main.ts`).
- Appwrite project resources and function deployment (`appwrite.config.json`).

---

_Stack analysis: 2026-05-29_
