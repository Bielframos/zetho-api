import { Module } from '@nestjs/common';
import { GameModule } from 'src/modules/game/game.module';
import { GazethoModule } from 'src/modules/gazetho/gazetho.module';
import { SitemapController } from './sitemap.controller';
import { SitemapService } from './sitemap.service';

@Module({
  imports: [GazethoModule, GameModule],
  controllers: [SitemapController],
  providers: [SitemapService],
})
export class SitemapModule {}
