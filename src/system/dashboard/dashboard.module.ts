import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { TimelineService } from './timeline.service';
import { DashboardListsService } from './dashboard-lists.service';
import { DashboardEntrySocialService } from './dashboard-entry-social.service';
import { DashboardProfilesService } from './dashboard-profiles.service';

@Module({
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardListsService,
    DashboardEntrySocialService,
    DashboardProfilesService,
    TimelineService,
  ],
  exports: [TimelineService],
})
export class DashboardModule {}
