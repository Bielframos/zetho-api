import { Module } from '@nestjs/common';
import { IGDBModule } from '../igdb/igdb.module';
import { ZethoHandler } from './handlers/zetho.handler';
import { WebhookController } from './webhook.controller';
import { IGDBHandler } from './handlers/igdb.handler';
import { WebhookReplayModule } from './replay/replay.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DashboardModule } from 'src/system/dashboard/dashboard.module';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [
    IGDBModule,
    WebhookReplayModule,
    NotificationsModule,
    DashboardModule,
    AchievementsModule,
  ],
  controllers: [WebhookController],
  providers: [ZethoHandler, IGDBHandler],
})
export class WebhookModule {}
