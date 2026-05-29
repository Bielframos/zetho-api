# Testing Patterns

**Analysis Date:** 2026-05-29

## Test Framework

**Runner:**

- Jest 30 (`package.json` devDependencies).
- Unit config is embedded in `package.json` (`jest` key).
- E2E config is separate in `test/jest-e2e.json`.

**Assertion Library:**

- Jest built-in `expect` assertions.
- `supertest` for HTTP assertions in e2e tests.

**Run Commands:**

```bash
pnpm test            # Run unit tests
pnpm test:watch      # Watch mode
pnpm test:cov        # Coverage report
pnpm test:e2e        # End-to-end tests via test/jest-e2e.json
```

## Test File Organization

**Location:**

- Unit tests are co-located in `src/` (`src/app.controller.spec.ts`).
- E2E tests are in dedicated `test/` folder (`test/app.e2e-spec.ts`).

**Naming:**

- Unit: `*.spec.ts`.
- E2E: `*.e2e-spec.ts`.

**Structure:**

```text
src/
  *.spec.ts
test/
  *.e2e-spec.ts
  jest-e2e.json
  jest.setup.ts
```

## Test Structure

**Suite Organization:**

```typescript
describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should return "Hello World!"', () => {
    expect(appController.getHello()).toBe('Hello World!');
  });
});
```

**Patterns:**

- Setup pattern: `beforeEach(async () => Test.createTestingModule(...).compile())`.
- E2E app bootstrap per test suite with `createNestApplication()` and `app.init()`.
- Assertion pattern: direct value equality (`toBe`) and HTTP status/body checks via `supertest`.

## Mocking

**Framework:**

- Nest testing module DI (`@nestjs/testing`) is used.
- Explicit Jest mocks/spies are not detected in current test files.

**Patterns:**

```typescript
const moduleFixture: TestingModule = await Test.createTestingModule({
  imports: [AppModule],
}).compile();
```

**What to Mock:**

- Current repository tests do not yet define a stable project-level mock convention for external integrations (Appwrite, Twitch/IGDB, Google, AI providers).

**What NOT to Mock:**

- E2E example avoids mocking the HTTP layer and validates real Nest route handling.

## Fixtures and Factories

**Test Data:**

```typescript
expect(appController.getHello()).toBe('Hello World!');
```

**Location:**

- Dedicated fixtures/factories directories are not detected.

## Coverage

**Requirements:**

- Coverage collection is configured (`collectCoverageFrom: ["**/*.(t|j)s"]`, `coverageDirectory: "../coverage"` in `package.json`).
- Minimum coverage thresholds are not enforced (no `coverageThreshold` found).

**View Coverage:**

```bash
pnpm test:cov
```

## Test Types

**Unit Tests:**

- Present but minimal.
- Confirmed test file count: 1 (`src/app.controller.spec.ts`).

**Integration Tests:**

- Not detected as a separate test layer.

**E2E Tests:**

- Present with `supertest` against Nest app bootstrap.
- Confirmed e2e file count: 1 (`test/app.e2e-spec.ts`).

## Common Patterns

**Async Testing:**

```typescript
beforeEach(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  await app.init();
});
```

**Error Testing:**

```typescript
Not detected in current test files.
```

## Reliability Risks From Current Testing Posture

- Test surface is very narrow compared to service complexity and external integrations in `src/modules/*` and `src/common/ai/*`.
- No tests detected for guards, validation pipes, webhook handlers, or Appwrite/IGDB orchestration flows.
- No explicit coverage thresholds means regressions can increase while CI still passes.
- E2E setup loads environment variables via `test/jest.setup.ts`; missing or unstable env configuration can cause nondeterministic failures.
- No visible pattern for deterministic mocking of outbound network calls (`fetch`, external SDKs), increasing flake risk as coverage expands.

---

_Testing analysis: 2026-05-29_
