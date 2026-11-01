import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { FoundersService } from './founders.service';
import {
  UseInterceptors,
  Header,
  StreamableFile,
  Body,
  Controller,
  Get,
  Param,
  GoneException,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsArray, IsIn } from 'class-validator';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { AchievementsService } from './achievements.service';
class ShowcaseDto {
  @IsArray()
  @IsIn(['soulslike_3', 'reviews_5', 'sessions_3', 'founder'], { each: true })
  badges!: string[];
}
@Controller('achievements')
export class AchievementsController {
  constructor(
    private readonly service: AchievementsService,
    private readonly founders: FoundersService,
  ) {}
  @Get('me/founder')
  @UseGuards(AppwriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  founderReceipt(@Req() req: any) {
    return this.founders.receipt(req.user.$id);
  }

  @Get('founder-badge/image')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'public, max-age=86400')
  async founderImage() {
    return new StreamableFile(await this.founders.image());
  }

  @Get('founders')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30_000)
  @Header('Cache-Control', 'public, max-age=30')
  foundersList() {
    return this.founders.publicIdentities();
  }
  // Compatibility tombstones for cached clients; never read or mutate legacy rows.
  @Get(':profileId/goals/:year')
  retiredGoal() {
    throw new GoneException(
      'Meta do ano foi descontinuada. Atualize o aplicativo.',
    );
  }
  @Put(':profileId/goals/:year')
  @UseGuards(AppwriteSessionGuard)
  retiredGoalUpdate() {
    throw new GoneException(
      'Meta do ano foi descontinuada. Atualize o aplicativo.',
    );
  }
  @Get(':profileId/badges') badges(@Param('profileId') profileId: string) {
    return this.service.listBadges(profileId);
  }
  @Get(':profileId/badges/catalog') catalog(
    @Param('profileId') profileId: string,
  ) {
    return this.service.getBadgeCatalog(profileId);
  }
  @Get(':profileId/showcase') showcase(@Param('profileId') profileId: string) {
    return this.service.getShowcase(profileId);
  }
  @Put(':profileId/showcase')
  @UseGuards(AppwriteSessionGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  setShowcase(
    @Req() req: any,
    @Param('profileId') profileId: string,
    @Body() dto: ShowcaseDto,
  ) {
    return this.service.setShowcase(req.user.$id, profileId, dto.badges);
  }
}
