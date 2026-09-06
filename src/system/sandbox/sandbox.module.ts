import { DynamicModule, Module } from '@nestjs/common';
import { EditorModule } from 'src/agents/editor/editor.module';
import { GoogleModule } from '../../modules/google/google.module';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';
import { TranslatorModule } from 'src/agents/translator/translator.module';

@Module({})
export class SandboxModule {
  static register(env: string): DynamicModule {
    if (env !== 'development')
      return {
        module: SandboxModule,
        controllers: [],
        providers: [],
      };
    return {
      module: SandboxModule,
      imports: [EditorModule, TranslatorModule, GoogleModule],
      controllers: [SandboxController],
      providers: [SandboxService],
    };
  }
}
