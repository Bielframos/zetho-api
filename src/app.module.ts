import { CacheModule } from '@nestjs/cache-manager';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppwriteModule } from './infra/appwrite/appwrite.module';
import { EventsModule } from './infra/events/events.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { GameModule } from './modules/game/game.module';
import { GazethoModule } from './modules/gazetho/gazetho.module';
import { IGDBModule } from './modules/igdb/igdb.module';
import { HealthModule } from './system/health/health.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SandboxModule } from './system/sandbox/sandbox.module';
import { SitemapModule } from './system/sitemap/sitemap.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { AiModule } from './infra/ai/ai.module';
import { ZCoinsModule } from './modules/zcoins/zcoins.module';
import { RankingModule } from './modules/ranking/ranking.module';
import { RaffleModule } from './modules/raffle/raffle.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { DashboardModule } from './system/dashboard/dashboard.module';
import { ThemesModule } from './modules/themes/themes.module';
import { GameplaySessionsModule } from './modules/gameplay-sessions/gameplay-sessions.module';
import { GameRecommenderModule } from './agents/game-recommender/game-recommender.module';
import { McpModule } from './modules/mcp/mcp.module';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { SocialModule } from './modules/social/social.module';

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
    RankingModule,
    RaffleModule,
    RatingsModule,
    DashboardModule,
    GameplaySessionsModule,
    AchievementsModule,
    SocialModule,
    GameRecommenderModule,

    /** Modulos do sístema */
    WebhookModule,
    McpModule,

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
