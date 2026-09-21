import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { TimelineService } from './timeline.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, TimelineService],
  exports: [TimelineService],
})
export class DashboardModule {}
