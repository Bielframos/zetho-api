import { Module } from '@nestjs/common';
import { AiModule } from '../../ai.module';
import { TranslatorService } from './translator.service';

@Module({
  imports: [AiModule],
  providers: [TranslatorService],
  exports: [TranslatorService],
})
export class TranslatorModule {}
