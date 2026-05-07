import { Controller, Get, Post, Query } from '@nestjs/common';
import { SandboxService } from './sandbox.service';

@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Post('editor-z')
  async runEditor() {
    return this.sandboxService.runEditor();
  }

  @Post('games/backfill-companies')
  backfillDuplicatedCompanies() {
    return this.sandboxService.backfillDuplicatedCompanies();
  }

  @Get('images/unsplash')
  async getImageFromUnsplash(@Query('query') query: string) {
    return this.sandboxService.getImageFromUnsplash(query);
  }

  @Get('videos/youtube')
  async searchVideosFromYoutube(@Query('query') query: string) {
    return this.sandboxService.searchVideosFromYoutube(query);
  }
}
