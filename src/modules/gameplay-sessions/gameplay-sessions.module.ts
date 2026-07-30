import { Module } from '@nestjs/common';
import { AppwriteModule } from 'src/common/appwrite/appwrite.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  GameplaySessionsController,
  NotificationsApiController,
} from './gameplay-sessions.controller';
import { GameplaySessionsService } from './gameplay-sessions.service';

@Module({
  imports: [AppwriteModule, NotificationsModule],
  controllers: [GameplaySessionsController, NotificationsApiController],
  providers: [GameplaySessionsService],
  exports: [GameplaySessionsService],
})
export class GameplaySessionsModule {}
