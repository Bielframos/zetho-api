import { Module } from '@nestjs/common';
import { GazethoModule } from 'src/modules/gazetho/gazetho.module';
import { SitemapController } from './sitemap.controller';
import { SitemapService } from './sitemap.service';

@Module({
  imports: [GazethoModule],
  controllers: [SitemapController],
  providers: [SitemapService],
})
export class SitemapModule {}
