import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { Models } from 'node-appwrite';
import { Roles } from 'src/common/guards/roles.decorator';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post()
  @UseGuards(AppwriteSessionGuard)
  async create(
    @Req() req: any,
    @Body('gamertag') gamertag: string,
    @Body('inviteCode') inviteCode?: string,
  ) {
    const user = req.user as Models.User;
    return await this.profileService.create(user, gamertag, inviteCode);
  }

  @Get('me/bonus')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  async getMyInviteBonus(@Req() req: any) {
    const user = req.user as Models.User;
    return await this.profileService.getMonthlyInviteBonus(user.$id);
  }

  @Get()
  @UseGuards(AppwriteSessionGuard)
  @Roles(['admin'])
  async listProfiles(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const safePage = this.parsePositiveInt(page, 1);
    const safeLimit = this.parsePositiveInt(limit, 20);
    return await this.profileService.listProfiles(safePage, safeLimit);
  }

  @Get('audit')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['admin'])
  async auditAllProfiles(@Query('fix') fix?: string) {
    return await this.profileService.auditAllProfiles(this.parseBoolean(fix));
  }

  @Get(':profileId/audit')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['admin'])
  async auditProfileById(
    @Param('profileId') profileId: string,
    @Query('fix') fix?: string,
  ) {
    return await this.profileService.auditProfileById(
      profileId,
      this.parseBoolean(fix),
    );
  }

  @Post(':profileId/invite-code')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  async updateInviteCode(@Param('profileId') profileId: string) {
    return await this.profileService.updateInviteCode(profileId);
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private parseBoolean(value?: string) {
    return value === 'true' || value === '1';
  }
}
