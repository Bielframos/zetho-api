# Phase 1: Security and Integration Contract Hardening - Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 13
**Analogs found:** 12 / 13

## File Classification

| New/Modified File                                              | Role             | Data Flow                                | Closest Analog                                  | Match Quality |
| -------------------------------------------------------------- | ---------------- | ---------------------------------------- | ----------------------------------------------- | ------------- |
| `src/modules/zcoins/zcoins.controller.ts`                      | controller       | request-response (mutation)              | `src/modules/profile/profile.controller.ts`     | role-match    |
| `src/modules/zcoins/zcoins.service.ts`                         | service          | CRUD + transactional writes              | `src/modules/zcoins/zcoins.service.ts`          | exact         |
| `src/common/guards/webhook.guard.ts`                           | middleware/guard | request-response (ingress auth)          | `src/common/guards/webhook.guard.ts`            | exact         |
| `src/common/guards/igdb.guard.ts`                              | middleware/guard | request-response (ingress auth)          | `src/common/guards/system-api.guard.ts`         | role-match    |
| `src/modules/webhook/webhook.controller.ts`                    | controller       | event-driven ingress                     | `src/modules/webhook/webhook.controller.ts`     | exact         |
| `src/modules/webhook/handlers/igdb.handler.ts`                 | service/handler  | event-driven + idempotent upsert         | `src/modules/webhook/handlers/igdb.handler.ts`  | exact         |
| `src/modules/webhook/handlers/zetho.handler.ts`                | service/handler  | event-driven + transactional idempotency | `src/modules/webhook/handlers/zetho.handler.ts` | exact         |
| `src/modules/igdb/igdb.service.ts`                             | service          | outbound integration (request-response)  | `src/modules/igdb/igdb.service.ts`              | exact         |
| `src/modules/webhook/webhook.module.ts`                        | module/config    | DI composition                           | `src/modules/webhook/webhook.module.ts`         | exact         |
| `src/modules/webhook/replay/replay.service.ts` (new)           | service          | event-driven dedupe                      | `src/modules/webhook/handlers/zetho.handler.ts` | flow-match    |
| `src/common/integration/retry-policy.ts` (new)                 | utility          | request-response retry/timeout           | `src/modules/igdb/igdb.service.ts`              | flow-match    |
| `test/security-integration/webhook-contract.e2e-spec.ts` (new) | test             | request-response contract                | `test/app.e2e-spec.ts`                          | role-match    |
| `test/security-integration/zcoins-authz.e2e-spec.ts` (new)     | test             | request-response authz                   | `test/app.e2e-spec.ts`                          | role-match    |

## Pattern Assignments

### `src/modules/zcoins/zcoins.controller.ts` (controller, request-response)

**Primary analog:** `src/modules/profile/profile.controller.ts`

**Guard + actor source pattern** (`profile.controller.ts` lines 20-29, 31-37):

```typescript
@Post()
@UseGuards(AppwriteSessionGuard)
async create(@Req() req: any, ...) {
  const user = req.user as Models.User;
  return await this.profileService.create(user, ...);
}

@Get('me/bonus')
@UseGuards(AppwriteSessionGuard)
@Roles(['user'])
async getMyInviteBonus(@Req() req: any) {
  const user = req.user as Models.User;
  return await this.profileService.getMonthlyInviteBonus(user.$id);
}
```

**Role policy pattern** (`igdb.controller.ts` lines 25-33):

```typescript
@Post('games/:id')
@UseGuards(AppwriteSessionGuard)
@Roles(['admin'])
async addGameById(...) {
  return await this.igdbService.importGameById(...);
}
```

**Apply in phase:** protect user-reachable mutations with `@UseGuards(AppwriteSessionGuard)`, derive `userId` from `req.user`, and keep machine-only mutations on separate guarded routes.

---

### `src/common/guards/webhook.guard.ts` (guard, ingress authenticity)

**Primary analog:** `src/common/guards/webhook.guard.ts`

**Canonical signature pattern to preserve** (lines 21-43):

```typescript
const signatureHeader = req.headers['x-appwrite-webhook-signature'];
const payload = req.rawBody;

const baseUrl = process.env.APP_URL?.replace(/\/$/, '');
const webhookUrl = `${baseUrl}/webhook/${this.endpoint}`;
const signatureKey = process.env.APPWRITE_WEBHOOK_SIGNATURE as string;
const message = webhookUrl + payload.toString();

const generatedSignature = crypto
  .createHmac('sha1', signatureKey)
  .update(message)
  .digest('base64');
```

**Guard denial semantics pattern** (`system-api.guard.ts` lines 16-24):

```typescript
if (!expected) throw new InternalServerErrorException(...);
if (typeof headerValue !== 'string' || headerValue !== expected) {
  throw new UnauthorizedException(...);
}
```

**Apply in phase:** keep raw-body canonical message flow, replace direct string compare with timing-safe compare, and preserve explicit unauthorized failures.

---

### `src/modules/webhook/webhook.controller.ts` (controller, event-driven)

**Primary analog:** `src/modules/webhook/webhook.controller.ts`

**Ingress dispatch pattern** (lines 25-37, 40-55):

```typescript
@Post('entry-sync')
@UseGuards(new AppwriteWebhookGuard('entry-sync'))
syncZEntry(@Headers('x-appwrite-webhook-events') events: string, @Body() entry: ZEntries) {
  const eventArray = events.split(',');
  if (!eventArray.some((event) => event.endsWith('.create'))) {
    throw new HttpException('Evento não suportado.', HttpStatus.OK);
  }
  return this.zethoHandler.syncEntry(entry);
}

@Post('igdb/games/upsert')
@UseGuards(IGDBGuard)
IGDBUpsertGame(@Body() game: IGDBGame) {
  return this.IGDBHandler.upsertGame(game);
}
```

**Apply in phase:** keep route-to-handler split, but enforce non-2xx on retryable/internal failures and 2xx only for intentional no-op (unsupported/duplicate).

---

### `src/modules/webhook/handlers/igdb.handler.ts` (handler, event-driven upsert)

**Primary analog:** `src/modules/webhook/handlers/igdb.handler.ts`

**Structured stage logging pattern** (lines 20-53):

```typescript
const startedAt = process.hrtime.bigint();
let stage = 'received';
...
try {
  stage = 'persist_game';
  ...
  stage = 'persist_zstats';
  ...
} catch (e) {
  this.logger.error({ stage, receivedGameId: game.id, durationMs: ..., error: this.serializeError(e) });
  throw new HttpException('Erro ao processar o jogo', HttpStatus.OK);
}
```

**Idempotent checksum short-circuit pattern** (lines 141-149):

```typescript
const existing = await this.findExistingGame(...);
if (existing.checksum === (game.checksum ?? null)) {
  return existing.$id;
}
```

**Transactional replace pattern** (lines 161-190):

```typescript
const tx = await this.tableDB.createTransaction();
try {
  await this.tableDB.updateRow({ ..., data: { involvedCompanies: [] }, transactionId: tx.$id });
  await this.tableDB.updateRow({ ..., data: { involvedCompanies: nextCompanies }, transactionId: tx.$id });
  await this.tableDB.updateTransaction({ transactionId: tx.$id, commit: true });
} catch (err) {
  await this.tableDB.updateTransaction({ transactionId: tx.$id, rollback: true });
  throw err;
}
```

**Apply in phase:** keep stage-based logging and checksum idempotency, but change failure status contract from `HttpStatus.OK` on internal errors.

---

### `src/modules/webhook/handlers/zetho.handler.ts` and `src/modules/webhook/replay/replay.service.ts` (event-driven dedupe)

**Primary analog:** `src/modules/webhook/handlers/zetho.handler.ts`

**Deterministic dedupe key pattern** (lines 86, 448-453):

```typescript
const readId = this.createId(entry.ownerFingerprint, entry.gameId);

private createId(ownerFingerprint: string, gameId: string) {
  return crypto
    .createHash('sha256')
    .update(`${ownerFingerprint}_${gameId}`)
    .digest('hex')
    .substring(0, 32);
}
```

**Persist-before-side-effects pattern** (lines 351-361 before bulk ops):

```typescript
await this.tablesDB.upsertRow({
  transactionId,
  databaseId: 'app',
  tableId: 'z_entries_read',
  rowId: readId,
  data: {
    ...cleanEntry,
    likedEver: newLikedEver,
    maxStatusReached: newMaxStatusReached,
  },
});
```

**Apply in phase:** new replay service should compute deterministic event key and persist/check duplicate before invoking expensive handlers.

---

### `src/modules/igdb/igdb.service.ts` and `src/common/integration/retry-policy.ts` (outbound resilience)

**Primary analog:** `src/modules/igdb/igdb.service.ts`

**Current outbound call seam** (lines 152-170):

```typescript
private async fetchIgdb(endpoint: string, body: string) {
  await this.applyRateLimit();
  const token = await this.getToken();
  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, { ... });
  if (!response.ok) {
    const text = await response.text();
    throw new InternalServerErrorException(`IGDB Error: ${text}`);
  }
  return await response.json();
}
```

**Existing throttling pattern to preserve** (lines 35-55):

```typescript
private async applyRateLimit(): Promise<void> {
  ...
  this.logger.debug(`Rate limit atingido. Aguardando ${timeToWait}ms.`);
  await new Promise((resolve) => setTimeout(resolve, timeToWait));
}
```

**Apply in phase:** keep `fetchIgdb` as the single seam, add timeout + capped retries + retryability classification there (or in shared helper consumed there).

---

### `test/security-integration/*.e2e-spec.ts` (tests)

**Primary analog:** `test/app.e2e-spec.ts` (lines 10-24)

```typescript
const moduleFixture: TestingModule = await Test.createTestingModule({
  imports: [AppModule],
}).compile();

app = moduleFixture.createNestApplication();
await app.init();

return request(app.getHttpServer()).get('/').expect(200);
```

**Apply in phase:** follow same Nest test bootstrap shape; add scenarios for guard denial semantics, duplicate ingress no-op, and non-2xx retryable failure semantics.

## Shared Patterns

### Authentication and Authorization

**Sources:** `src/common/guards/session.guard.ts` lines 38-43, 63-79, 82-96; `src/modules/profile/profile.controller.ts` lines 20-37.

```typescript
const token = authHeader && authHeader.split(' ')[1];
if (!token) throw new UnauthorizedException(...);
...
const requiredRoles = this.reflector.getAllAndOverride<string[]>(Roles, [...]);
if (!hasRequiredRoles) throw new ForbiddenException(...);
request.user = user;
```

### Ingress Authenticity

**Sources:** `src/common/guards/webhook.guard.ts` lines 21-46; `src/common/guards/igdb.guard.ts` lines 17-21.

```typescript
const signatureHeader = req.headers['x-appwrite-webhook-signature'];
const payload = req.rawBody;
...
if (signatureHeader !== generatedSignature) {
  throw new UnauthorizedException(...);
}
```

### Idempotency and Replay-First Thinking

**Sources:** `src/modules/webhook/handlers/zetho.handler.ts` lines 86-106, 351-361; `src/modules/webhook/handlers/igdb.handler.ts` lines 141-149.

```typescript
const readId = this.createId(...);
const existingReadEntry = await this.tablesDB.getRow(...).catch(() => null);
...
if (existing.checksum === (game.checksum ?? null)) return existing.$id;
```

### Transactional Write Safety

**Sources:** `src/modules/webhook/handlers/zetho.handler.ts` lines 345-429; `src/modules/zcoins/zcoins.service.ts` lines 153-193.

```typescript
const tx = await this.tablesDB.createTransaction();
try {
  ...
  await this.tablesDB.updateTransaction({ transactionId: tx.$id, commit: true });
} catch (error) {
  await this.tablesDB.updateTransaction({ transactionId: tx.$id, rollback: true });
  throw error;
}
```

## No Analog Found

| File                                         | Role       | Data Flow    | Reason                                                         |
| -------------------------------------------- | ---------- | ------------ | -------------------------------------------------------------- |
| `src/modules/webhook/replay/replay.types.ts` | model/type | event-driven | No standalone replay-key model exists yet in current codebase. |

## Metadata

**Analog search scope:** `src/common/guards`, `src/modules/webhook`, `src/modules/zcoins`, `src/modules/igdb`, `test`
**Primary analogs used:** 5 (`session.guard.ts`, `webhook.controller.ts`, `igdb.handler.ts`, `zetho.handler.ts`, `igdb.service.ts`)
**Pattern extraction date:** 2026-05-29
