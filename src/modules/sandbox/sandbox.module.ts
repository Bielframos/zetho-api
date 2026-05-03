import { DynamicModule, Module } from '@nestjs/common';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';
import { AiModule } from 'src/common/ai/ai.module';

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
      imports: [AiModule],
      controllers: [SandboxController],
      providers: [SandboxService],
    };
  }
}
