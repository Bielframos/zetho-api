const fs = require('fs');

function fixEditor() {
  const path = 'src/common/ai/agents/editor/editor.service.ts';
  let c = fs.readFileSync(path, 'utf-8');

  // 1. Imports
  c = c.replace(
    "import { Inject, Injectable, Logger } from '@nestjs/common';",
    "import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';\nimport { OutboxService } from 'src/common/events/outbox.service';"
  );

  // 2. Interface
  c = c.replace(
    "export class EditorService {",
    "export class EditorService implements OnModuleInit {"
  );

  // 3. Constructor
  c = c.replace(
    /private readonly contentExtractor: ContentExtractorService,\s*\) {/g,
    "private readonly contentExtractor: ContentExtractorService,\n    private readonly outboxService: OutboxService,\n  ) {"
  );

  // 4. OnModuleInit
  const onModuleInitCode = `
  onModuleInit() {
    this.outboxService.registerHandler('editorial.post.published', async (payload) => {
      await this.notificationsService.sharePost({
        title: payload.title,
        subtitle: payload.subtitle,
        postUrl: this.buildPostUrl(payload.slug),
        mediaUrl: payload.mediaUrl,
      });
      await this.invalidateFrontendCache();
    });
  }
`;
  c = c.replace(
    "  @Cron(CronExpression.EVERY_HOUR)",
    onModuleInitCode + "\n  @Cron(CronExpression.EVERY_HOUR)"
  );

  // 5. Effects
  const oldEffect = `        await this.notificationsService.sharePost({
          title: savedPost.title,
          subtitle: savedPost.subtitle ?? '',
          postUrl: this.buildPostUrl(savedPost.slug),
          mediaUrl: mainImage?.url,
        });

        this.invalidateFrontendCache();`;
  
  const newEffect = `        await this.outboxService.enqueueImmediate({
          type: 'editorial.post.published',
          payload: {
            title: savedPost.title,
            subtitle: savedPost.subtitle ?? '',
            slug: savedPost.slug,
            mediaUrl: mainImage?.url,
          }
        });`;

  // We have two of these in the file
  c = c.split(oldEffect).join(newEffect);

  fs.writeFileSync(path, c, 'utf-8');
}

function fixIgdb() {
  const path = 'src/modules/igdb/igdb.service.ts';
  let c = fs.readFileSync(path, 'utf-8');

  // 1. Imports
  c = c.replace(
    "import { LoggerContextService } from 'src/common/observability/logger-context.service';",
    "import { LoggerContextService } from 'src/common/observability/logger-context.service';\nimport { IGDBCoordinationService } from './igdb-coordination.service';\nimport { IGDBUpsertService } from './igdb-upsert.service';"
  );

  // 2. Constructor
  c = c.replace(
    /private readonly loggerContext: LoggerContextService,\s*\) {/g,
    "private readonly loggerContext: LoggerContextService,\n    private readonly coordinationService: IGDBCoordinationService,\n    private readonly upsertService: IGDBUpsertService,\n  ) {"
  );

  // 3. fetchIgdb rate limit & token
  const oldFetch = `  private async fetchIgdb(endpoint: string, body: string) {
    await this.applyRateLimit();

    const token = await this.getToken();`;
    
  const newFetch = `  private async fetchIgdb(endpoint: string, body: string) {
    await this.coordinationService.applyRateLimit();

    let token = await this.coordinationService.getCachedToken();
    if (!token) {
        token = await this.authenticate();
    }`;
  
  c = c.replace(oldFetch, newFetch);

  // 4. auth token caching
  const authOld = `    this.token = data.access_token;
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
    
  const authNew = `    await this.coordinationService.cacheToken(data.access_token, data.expires_in);
    return data.access_token;`;
    
  c = c.replace(authOld, authNew);

  // 5. upsert
  c = c.replace('await this.upsertGameRow(parsedGame);', 'await this.upsertService.upsertGameRow(parsedGame);');
  c = c.replace('await this.ensureGameZStats(gameId);', 'await this.upsertService.ensureGameZStats(gameId);');
  c = c.replace('await this.ensureGameZStats(existingGame.$id);', 'await this.upsertService.ensureGameZStats(existingGame.$id);');

  fs.writeFileSync(path, c, 'utf-8');
}

fixEditor();
fixIgdb();
console.log('Fixed editor and igdb properly');
