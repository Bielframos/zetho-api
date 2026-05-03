import { Body, Controller, Post } from '@nestjs/common';
import { SandboxService } from './sandbox.service';

@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Post('editor-z')
  async runEditor() {
    return this.sandboxService.runEditor();
  }
}
