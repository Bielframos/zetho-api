import { EditorialListsModule } from 'src/modules/editorial-lists/editorial-lists.module';
import { Module } from '@nestjs/common';
import { GameModule } from 'src/modules/game/game.module';
import { GazethoModule } from 'src/modules/gazetho/gazetho.module';
import { SocialModule } from 'src/modules/social/social.module';
import { SitemapController } from './sitemap.controller';
import { SitemapService } from './sitemap.service';

@Module({
  imports: [GazethoModule, GameModule, SocialModule, EditorialListsModule],
  controllers: [SitemapController],
  providers: [SitemapService],
})
export class SitemapModule {}
