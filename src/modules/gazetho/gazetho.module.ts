import { Module } from '@nestjs/common';
import { GazethoController } from './gazetho.controller';
import { GazethoService } from './gazetho.service';
import { AiModule } from 'src/common/ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [GazethoController],
  providers: [GazethoService],
  exports: [GazethoService],
})
export class GazethoModule {}
