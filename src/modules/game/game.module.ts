import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { IGDBModule } from '../igdb/igdb.module';
import { TranslatorModule } from 'src/common/ai/agents/translator/translator.module';

@Module({
  imports: [TranslatorModule, IGDBModule],
  controllers: [GameController],
  providers: [GameService],
  exports: [GameService],
})
export class GameModule {}
