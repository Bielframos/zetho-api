import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { RpgController } from './rpg.controller';
import { RpgService } from './rpg.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RpgController],
  providers: [RpgService],
})
export class RpgModule {}
