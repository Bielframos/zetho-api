import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { IGDBModule } from '../igdb/igdb.module';
import { TranslatorModule } from 'src/agents/translator/translator.module';
import { AiModule } from 'src/infra/ai/ai.module';
import { GameBriefingService } from './game-briefing.service';

@Module({
  imports: [TranslatorModule, IGDBModule, AiModule],
  controllers: [GameController],
  providers: [GameService, GameBriefingService],
  exports: [GameService],
})
export class GameModule {}
