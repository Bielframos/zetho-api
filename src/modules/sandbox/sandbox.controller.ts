import { Body, Controller, Post } from '@nestjs/common';
import { SandboxService } from './sandbox.service';

@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Post('generate-text')
  async generateText(@Body('prompt') prompt: string): Promise<string> {
    return this.sandboxService.generateText(prompt);
  }
}
