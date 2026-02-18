import { Module } from '@nestjs/common';
import { RpgController } from './rpg.controller';
import { RpgService } from './rpg.service';
import { RpgAiService } from './rpg.ai.service';
import { DatabaseModule } from 'src/common/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [RpgController],
  providers: [RpgService, RpgAiService],
})
export class RpgModule {}
