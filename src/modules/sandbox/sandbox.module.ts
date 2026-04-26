import { DynamicModule, Module } from '@nestjs/common';
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
      controllers: [SandboxController],
      providers: [SandboxService],
    };
  }
}
