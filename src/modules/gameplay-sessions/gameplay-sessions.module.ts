import { Module } from '@nestjs/common';
import { AppwriteModule } from 'src/infra/appwrite/appwrite.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  GameplaySessionsController,
  NotificationsApiController,
} from './gameplay-sessions.controller';
import { GameplaySessionsService } from './gameplay-sessions.service';
import { GameplaySessionQueriesService } from './gameplay-session-queries.service';
import { GameplaySessionNotificationsService } from './gameplay-session-notifications.service';

@Module({
  imports: [AppwriteModule, NotificationsModule],
  controllers: [GameplaySessionsController, NotificationsApiController],
  providers: [
    GameplaySessionsService,
    GameplaySessionQueriesService,
    GameplaySessionNotificationsService,
  ],
  exports: [GameplaySessionsService],
})
export class GameplaySessionsModule {}
