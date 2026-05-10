import { Module } from '@nestjs/common';
import { AiModule } from '../../ai.module';
import { EditorService } from './editor.service';

@Module({
  imports: [AiModule],
  providers: [EditorService],
  exports: [EditorService],
})
export class EditorModule {}
