import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { AiModule } from './common/ai/ai.module';
import { AppwriteModule } from './common/appwrite/appwrite.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { ProfileModule } from './modules/profile/profile.module';
import { IGDBModule } from './modules/igdb/igdb.module';

@Module({
  imports: [
    CacheModule.register(),
    AppwriteModule,
    AiModule,

    /** Feature modules */
    IGDBModule,
    ProfileModule,

    /** Modulos do sístema */
    WebhookModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
