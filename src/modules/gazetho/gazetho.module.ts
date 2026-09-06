import { Module } from '@nestjs/common';
import {
  GazethoController,
  GazethoPublicController,
  NewsPublicController,
} from './gazetho.controller';
import { GazethoService } from './gazetho.service';
import { EditorModule } from 'src/agents/editor/editor.module';

@Module({
  imports: [EditorModule],
  controllers: [
    GazethoController,
    GazethoPublicController,
    NewsPublicController,
  ],
  providers: [GazethoService],
  exports: [GazethoService],
})
export class GazethoModule {}
