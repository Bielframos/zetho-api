import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Models } from 'node-appwrite';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { Roles } from 'src/common/guards/roles.decorator';
import { CreateRatingDto, VoteRatingDto } from './ratings.dto';
import { RatingsService } from './ratings.service';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post('vote/:ratingId')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async voteRating(
    @Param('ratingId') ratingId: string,
    @Req() req: any,
    @Body() dto: VoteRatingDto,
  ) {
    const user = req.user as Models.User;
    return await this.ratingsService.voteRating(user.$id, ratingId, dto.operation);
  }


  @Get(':gameId')
  async getRatings(
    @Param('gameId') gameId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const ps = pageSize ? parseInt(pageSize, 10) : 10;
    return await this.ratingsService.getRatingsByGame(gameId, p, ps);
  }

  @Get(':gameId/me')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  async getMyRating(@Param('gameId') gameId: string, @Req() req: any) {
    const user = req.user as Models.User;
    return await this.ratingsService.getRatingByUserAndGame(user.$id, gameId);
  }

  @Post(':gameId')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async upsertRating(
    @Param('gameId') gameId: string,
    @Req() req: any,
    @Body() dto: CreateRatingDto,
  ) {
    const user = req.user as Models.User;
    return await this.ratingsService.upsertRating(user.$id, gameId, dto);
  }

  @Delete(':gameId')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  async deleteRating(@Param('gameId') gameId: string, @Req() req: any) {
    const user = req.user as Models.User;
    return await this.ratingsService.deleteRating(user.$id, gameId);
  }
}
