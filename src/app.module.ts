import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RpgModule } from './modules/rpg/rpg.module';
import { AiModule } from './common/ai/ai.module';
import { RpgAiService } from './modules/rpg/rpg.ai.service';
import { DatabaseModule } from './common/database/database.module';

@Module({
  imports: [DatabaseModule, RpgModule, AiModule],
  controllers: [AppController],
  providers: [AppService, RpgAiService],
})
export class AppModule {}
