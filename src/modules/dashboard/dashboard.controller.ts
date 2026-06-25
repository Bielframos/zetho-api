import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Models } from 'node-appwrite';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { OptionalAppwriteSessionGuard } from 'src/common/guards/optional-session.guard';
import { DashboardService } from './dashboard.service';

@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard/feed')
  @UseGuards(AppwriteSessionGuard)
  getFeed(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const user = req.user as Models.User;
    return this.dashboardService.getPersonalFeed(
      user.$id,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 12,
    );
  }

  @Get('lists/trending')
  @UseGuards(OptionalAppwriteSessionGuard)
  getTrendingLists(@Req() req: any, @Query('limit') limit?: string) {
    const user = req.user as Models.User | null;
    return this.dashboardService.getTrendingLists(
      user?.$id,
      limit ? parseInt(limit, 10) : 12,
    );
  }

  @Get('lists/saved')
  @UseGuards(AppwriteSessionGuard)
  getSavedLists(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const user = req.user as Models.User;
    return this.dashboardService.getSavedLists(
      user.$id,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 12,
    );
  }

  @Get('lists/:listId/social')
  @UseGuards(OptionalAppwriteSessionGuard)
  getListSocialState(@Req() req: any, @Param('listId') listId: string) {
    const user = req.user as Models.User | null;
    return this.dashboardService.getListSocialState(listId, user?.$id);
  }

  @Post('lists/:listId/like')
  @UseGuards(AppwriteSessionGuard)
  toggleListLike(@Req() req: any, @Param('listId') listId: string) {
    const user = req.user as Models.User;
    return this.dashboardService.toggleListLike(user.$id, listId);
  }

  @Post('lists/:listId/save')
  @UseGuards(AppwriteSessionGuard)
  toggleListSave(@Req() req: any, @Param('listId') listId: string) {
    const user = req.user as Models.User;
    return this.dashboardService.toggleListSave(user.$id, listId);
  }
}
