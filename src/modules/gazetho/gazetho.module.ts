import { Module } from '@nestjs/common';
import { GazethoController } from './gazetho.controller';
import { GazethoService } from './gazetho.service';

@Module({
  controllers: [GazethoController],
  providers: [GazethoService],
  exports: [GazethoService],
})
export class GazethoModule {}
