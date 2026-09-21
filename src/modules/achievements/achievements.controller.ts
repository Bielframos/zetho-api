import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsArray, IsIn, IsInt, Max, Min } from 'class-validator';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { AchievementsService } from './achievements.service';
class GoalDto {
  @IsInt() @Min(1) @Max(1000) target!: number;
}
class ShowcaseDto {
  @IsArray()
  @IsIn(['soulslike_3', 'reviews_5', 'sessions_3'], { each: true })
  badges!: string[];
}
@Controller('achievements')
export class AchievementsController {
  constructor(private readonly service: AchievementsService) {}
  @Get(':profileId/goals/:year') goal(
    @Param('profileId') profileId: string,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.service.getAnnualGoal(profileId, year);
  }
  @Put(':profileId/goals/:year')
  @UseGuards(AppwriteSessionGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  setGoal(
    @Req() req: any,
    @Param('profileId') profileId: string,
    @Param('year', ParseIntPipe) year: number,
    @Body() dto: GoalDto,
  ) {
    return this.service.setAnnualGoal(
      req.user.$id,
      profileId,
      year,
      dto.target,
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
