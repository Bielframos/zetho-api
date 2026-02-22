import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { AiModule } from './common/ai/ai.module';
import { AppwriteModule } from './common/appwrite/appwrite.module';
import { RpgModule } from './modules/rpg/rpg.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { ProfileModule } from './modules/profile/profile.module';

@Module({
  imports: [
    CacheModule.register(),
    AppwriteModule,
    AiModule,

    /** Feature modules */
    ProfileModule,
    WebhookModule,
    RpgModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
