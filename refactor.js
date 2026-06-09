const fs = require('fs');

const filePath = 'src/modules/igdb/igdb.service.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add imports
content = content.replace(
    "import { LoggerContextService } from 'src/common/observability/logger-context.service';",
    "import { LoggerContextService } from 'src/common/observability/logger-context.service';\nimport { IGDBCoordinationService } from './igdb-coordination.service';\nimport { IGDBUpsertService } from './igdb-upsert.service';"
);

// 2. Replace state variables and constructor
const oldConstructor = `  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  private authPromise: Promise<string> | null = null;

  // Rate limiting: máximo 4 requisições por segundo
  private readonly MAX_REQUESTS_PER_SECOND = 4;
  private readonly WINDOW_SIZE_MS = 1000;
  private readonly SAFETY_BUFFER_MS = 10;

  private requestTimestamps: number[] = [];

  constructor(
    private appwrite: Appwrite,
    private readonly correlationContext: CorrelationContextService,
    private readonly loggerContext: LoggerContextService,
  ) {`;

const newConstructor = `  constructor(
    private appwrite: Appwrite,
    private readonly correlationContext: CorrelationContextService,
    private readonly loggerContext: LoggerContextService,
    private readonly coordinationService: IGDBCoordinationService,
    private readonly upsertService: IGDBUpsertService,
  ) {`;

content = content.replace(oldConstructor, newConstructor);

// 3. Modify fetchIgdb
const oldFetch = `  private async fetchIgdb(endpoint: string, body: string) {
    await this.applyRateLimit();

    const token = await this.getToken();`;

const newFetch = `  private async fetchIgdb(endpoint: string, body: string) {
    await this.coordinationService.applyRateLimit();

    let token = await this.coordinationService.getCachedToken();
    if (!token) {
        token = await this.authenticate();
    }`;

content = content.replace(oldFetch, newFetch);

// 4. Modify syncPopularGames and importGameById
content = content.replace('await this.upsertGameRow(parsedGame)', 'await this.upsertService.upsertGameRow(parsedGame)');
content = content.replace('await this.ensureGameZStats(gameId)', 'await this.upsertService.ensureGameZStats(gameId)');
content = content.replace('await this.ensureGameZStats(existingGame.$id)', 'await this.upsertService.ensureGameZStats(existingGame.$id)');

// 5. Fix authenticate to use cacheToken
const authTarget = `    this.token = data.access_token;
    this.tokenExpiry = expiresAt;

    try {
      await this.tableDB.createRow({
        databaseId: IGDBService.DB_ID,
        tableId: 'igdb_tokens',
        rowId: ID.unique(),
        data: {
          secret: data.access_token,
          expiresAt: expiresAt.toISOString(),
        },
      });
    } catch (e) {
      this.logger.error(
        this.loggerContext.buildStructuredLog({
          component: IGDBService.name,
          operation: 'igdb.persist-token',
          message: 'Erro ao salvar token no Appwrite',
          error: this.loggerContext.serializeError(e),
        }),
      );
    }

    return this.token as string;`;

const authReplacement = `    await this.coordinationService.cacheToken(data.access_token, data.expires_in);
    return data.access_token;`;

content = content.replace(authTarget, authReplacement);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Refactored igdb.service.ts partially');
