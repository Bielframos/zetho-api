import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { SpecialThemesService } from './special-themes.service';

type AuthenticatedRequest = Request & { user: { $id: string } };

@Controller('themes/special')
export class SpecialThemesController {
  constructor(private readonly themes: SpecialThemesService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(AppwriteSessionGuard)
  listOwned(@Req() req: AuthenticatedRequest) {
    return this.themes.listOwned(req.user.$id);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  getCampaign(@Param('id') id: string) {
    return this.themes.getCampaign(id);
  }

  @Post(':id/claim')
  @UseGuards(AppwriteSessionGuard)
  claim(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.themes.claim(req.user.$id, id);
  }
}
