import { Module } from '@nestjs/common';
import { RpgAiService } from './rpg.ai.service';
import { RpgController } from './rpg.controller';
import { RpgService } from './rpg.service';

@Module({
  imports: [],
  controllers: [RpgController],
  providers: [RpgService, RpgAiService],
})
export class RpgModule {}
