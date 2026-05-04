import { Controller, Post, UseGuards } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { SystemApiKeyGuard } from 'src/common/guards/system-api.guard';

@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Post('games/backfill-companies')
  backfillDuplicatedCompanies() {
    return this.sandboxService.backfillDuplicatedCompanies();
  }
}
