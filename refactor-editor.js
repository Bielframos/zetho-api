const fs = require('fs');

const filePath = 'src/common/ai/agents/editor/editor.service.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Imports
content = content.replace(
  "import { Inject, Injectable, Logger } from '@nestjs/common';",
  "import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';\nimport { OutboxService } from 'src/common/events/outbox.service';"
);

// 2. Class signature
content = content.replace(
  "export class EditorService {",
  "export class EditorService implements OnModuleInit {"
);

// 3. Constructor
content = content.replace(
  `  constructor(
    @Inject(GENKIT) private readonly ai: Genkit,
    private readonly gameService: GameService,
    private readonly appwrite: Appwrite,
    private readonly youtubeService: YoutubeService,
    private readonly notificationsService: NotificationsService,
    private readonly correlationContext: CorrelationContextService,
    private readonly loggerContext: LoggerContextService,
    private readonly contentExtractor: ContentExtractorService,
  ) {`,
  `  constructor(
    @Inject(GENKIT) private readonly ai: Genkit,
    private readonly gameService: GameService,
    private readonly appwrite: Appwrite,
    private readonly youtubeService: YoutubeService,
    private readonly notificationsService: NotificationsService,
    private readonly correlationContext: CorrelationContextService,
    private readonly loggerContext: LoggerContextService,
    private readonly contentExtractor: ContentExtractorService,
    private readonly outboxService: OutboxService,
  ) {`
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

content = content.replace(
  "  @Cron(CronExpression.EVERY_HOUR)",
  onModuleInitCode + "\n  @Cron(CronExpression.EVERY_HOUR)"
);

// 5. Replace inside execute
const oldExecuteEffects = `        await this.notificationsService.sharePost({
          title: savedPost.title,
          subtitle: savedPost.subtitle ?? '',
          postUrl: this.buildPostUrl(savedPost.slug),
          mediaUrl: mainImage?.url,
        });

        this.invalidateFrontendCache();`;

const newExecuteEffects = `        await this.outboxService.enqueueImmediate({
          type: 'editorial.post.published',
          payload: {
            title: savedPost.title,
            subtitle: savedPost.subtitle ?? '',
            slug: savedPost.slug,
            mediaUrl: mainImage?.url,
          }
        });`;

content = content.replace(oldExecuteEffects, newExecuteEffects);

// 6. Replace inside generateGuidedArticle
content = content.replace(oldExecuteEffects, newExecuteEffects); // There is a second occurrence of exactly the same code

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Refactored editor.service.ts');
