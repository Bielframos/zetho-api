import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { IGDBModule } from '../igdb/igdb.module';
import { AiModule } from 'src/common/ai/ai.module';

@Module({
  imports: [AiModule, IGDBModule],
  controllers: [GameController],
  providers: [GameService],
  exports: [GameService],
})
export class GameModule {}
