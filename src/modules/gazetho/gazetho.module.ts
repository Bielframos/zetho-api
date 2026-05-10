import { Module } from '@nestjs/common';
import { GazethoController } from './gazetho.controller';
import { GazethoService } from './gazetho.service';
import { EditorModule } from 'src/common/ai/agents/editor/editor.module';

@Module({
  imports: [EditorModule],
  controllers: [GazethoController],
  providers: [GazethoService],
  exports: [GazethoService],
})
export class GazethoModule {}
