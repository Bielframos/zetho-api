import { Module } from '@nestjs/common';
import { AiModule } from 'src/infra/ai/ai.module';
import { TranslatorService } from './translator.service';

@Module({
  imports: [AiModule],
  providers: [TranslatorService],
  exports: [TranslatorService],
})
export class TranslatorModule {}
