import { EditorialImageService } from './editorial-image.service';
import { Module } from '@nestjs/common';
import { AiModule } from 'src/infra/ai/ai.module';
import { EditorService } from './editor.service';
import { ContentExtractorService } from './content-extractor.service';
import { GameModule } from 'src/modules/game/game.module';
import { GoogleModule } from 'src/modules/google/google.module';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';
import { EditorialFeedService } from './editorial-feed.service';
import { EditorialPostService } from './editorial-post.service';

@Module({
  imports: [AiModule, GameModule, GoogleModule, NotificationsModule],
  providers: [
    EditorService,
    ContentExtractorService,
    EditorialImageService,
    EditorialFeedService,
    EditorialPostService,
  ],
  exports: [EditorService],
})
export class EditorModule {}
