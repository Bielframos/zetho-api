import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppwriteModule } from './common/appwrite/appwrite.module';
import { GameModule } from './modules/game/game.module';
import { GazethoModule } from './modules/gazetho/gazetho.module';
import { IGDBModule } from './modules/igdb/igdb.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SandboxModule } from './modules/sandbox/sandbox.module';
import { SitemapModule } from './modules/sitemap/sitemap.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { AiModule } from './common/ai/ai.module';
import { ZCoinsModule } from './modules/zcoins/zcoins.module';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      ttl: Number(process.env.APP_CACHE_TTL ?? 60_000),
      max: Number(process.env.APP_CACHE_MAX ?? 1_000),
    }),
    ScheduleModule.forRoot(),
    AppwriteModule,
    AiModule,

    /** Feature modules */
    IGDBModule,
    ProfileModule,
    GameModule,
    GazethoModule,
    SitemapModule,
    ZCoinsModule,

    /** Modulos do sístema */
    WebhookModule,

    /** Sandbox module */
    SandboxModule.register(process.env.NODE_ENV ?? 'production'),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
