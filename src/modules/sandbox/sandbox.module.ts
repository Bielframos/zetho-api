import { DynamicModule, Module } from '@nestjs/common';
import { AiModule } from 'src/common/ai/ai.module';
import { GoogleModule } from '../google/google.module';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';

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
      imports: [AiModule, GoogleModule],
      controllers: [SandboxController],
      providers: [SandboxService],
    };
  }
}
