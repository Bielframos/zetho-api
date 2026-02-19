import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RpgModule } from './modules/rpg/rpg.module';
import { AiModule } from './common/ai/ai.module';
import { RpgAiService } from './modules/rpg/rpg.ai.service';
import { AppwriteModule } from './common/appwrite/appwrite.module';
import { ProfileController } from './modules/profile/profile.controller';
import { ProfileService } from './modules/profile/profile.service';

@Module({
  imports: [AppwriteModule, RpgModule, AiModule],
  controllers: [AppController, ProfileController],
  providers: [AppService, RpgAiService, ProfileService],
})
export class AppModule {}
