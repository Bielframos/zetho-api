import { FoundersService } from './founders.service';
import { Module } from '@nestjs/common';
import { AchievementsController } from './achievements.controller';
import { AchievementsService } from './achievements.service';
@Module({
  controllers: [AchievementsController],
  providers: [AchievementsService, FoundersService],
  exports: [AchievementsService, FoundersService],
})
export class AchievementsModule {}
