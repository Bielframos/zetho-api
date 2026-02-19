import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { Models } from 'node-appwrite';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post()
  @UseGuards(AppwriteSessionGuard)
  async create(@Req() req: any, @Body('gamertag') gamertag: string) {
    const user = req.user as Models.User;
    return await this.profileService.create(user, gamertag);
  }
}
