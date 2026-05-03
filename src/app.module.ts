import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { AppwriteModule } from './common/appwrite/appwrite.module';
import { GameModule } from './modules/game/game.module';
import { IGDBModule } from './modules/igdb/igdb.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SandboxModule } from './modules/sandbox/sandbox.module';
import { WebhookModule } from './modules/webhook/webhook.module';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      ttl: Number(process.env.APP_CACHE_TTL ?? 60_000),
      max: Number(process.env.APP_CACHE_MAX ?? 1_000),
    }),
    AppwriteModule,

    /** Feature modules */
    IGDBModule,
    ProfileModule,
    GameModule,

    /** Modulos do sístema */
    WebhookModule,

    /** Sandbox module */
    SandboxModule.register(process.env.NODE_ENV ?? 'production'),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
