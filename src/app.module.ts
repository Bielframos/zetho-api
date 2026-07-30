import { CacheModule } from '@nestjs/cache-manager';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppwriteModule } from './common/appwrite/appwrite.module';
import { EventsModule } from './common/events/events.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { GameModule } from './modules/game/game.module';
import { GazethoModule } from './modules/gazetho/gazetho.module';
import { IGDBModule } from './modules/igdb/igdb.module';
import { HealthModule } from './modules/health/health.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SandboxModule } from './modules/sandbox/sandbox.module';
import { SitemapModule } from './modules/sitemap/sitemap.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { AiModule } from './common/ai/ai.module';
import { ZCoinsModule } from './modules/zcoins/zcoins.module';
import { RaffleModule } from './modules/raffle/raffle.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ThemesModule } from './modules/themes/themes.module';
import { GameplaySessionsModule } from './modules/gameplay-sessions/gameplay-sessions.module';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      ttl: Number(process.env.APP_CACHE_TTL ?? 60_000),
      max: Number(process.env.APP_CACHE_MAX ?? 1_000),
    }),
    ScheduleModule.forRoot(),
    AppwriteModule,
    EventsModule,
    AiModule,
    ObservabilityModule,
    HealthModule,

    /** Feature modules */
    IGDBModule,
    ProfileModule,
    GameModule,
    GazethoModule,
    SitemapModule,
    ZCoinsModule,
    RaffleModule,
    RatingsModule,
    DashboardModule,
    GameplaySessionsModule,

    /** Modulos do sístema */
    WebhookModule,

    /** Sandbox module */
    SandboxModule.register(process.env.NODE_ENV ?? 'production'),

    ThemesModule,
  ],

  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
