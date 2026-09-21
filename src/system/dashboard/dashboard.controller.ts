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
import { OptionalAppwriteSessionGuard } from 'src/common/guards/optional-session.guard';
import { DashboardService } from './dashboard.service';
import {
  CreateEntryCommentDto,
  PublicListsQueryDto,
  VoteCommentDto,
} from './dashboard.dto';

@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard/feed')
  @UseGuards(AppwriteSessionGuard)
  getFeed(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('scope') scope?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = req.user as Models.User;
    return this.dashboardService.getPersonalFeed(
      user.$id,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 12,
      scope === 'mine' ? 'mine' : 'connections',
      cursor,
    );
  }

  @Get('dashboard/suggested-connections')
  @UseGuards(AppwriteSessionGuard)
  getSuggestedConnections(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('gameIds') gameIds?: string,
  ) {
    const user = req.user as Models.User;
    const seedGameIds = gameIds
      ? gameIds
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : [];
    return this.dashboardService.getSuggestedConnections(
      user.$id,
      limit ? parseInt(limit, 10) : 6,
      seedGameIds,
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

  @Get('lists/public')
  @UseGuards(OptionalAppwriteSessionGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  getPublicLists(@Req() req: any, @Query() query: PublicListsQueryDto) {
    const user = req.user as Models.User | null;
    return this.dashboardService.getPublicLists(
      user?.$id,
      query.page ?? 1,
      query.pageSize ?? 12,
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

  @Post('dashboard/comments/:commentId/vote')
  @UseGuards(AppwriteSessionGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  voteComment(
    @Req() req: any,
    @Param('commentId') commentId: string,
    @Body() dto: VoteCommentDto,
  ) {
    const user = req.user as Models.User;
    return this.dashboardService.voteComment(
      user.$id,
      commentId,
      dto.operation,
    );
  }

  @Post('dashboard/entries/:entryId/like')
  @UseGuards(AppwriteSessionGuard)
  toggleEntryLike(@Req() req: any, @Param('entryId') entryId: string) {
    const user = req.user as Models.User;
    return this.dashboardService.toggleEntryLike(user.$id, entryId);
  }

  @Get('dashboard/entries/:entryId/comments')
  @UseGuards(AppwriteSessionGuard)
  getEntryComments(
    @Param('entryId') entryId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.dashboardService.getEntryComments(
      entryId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
      parentId,
    );
  }

  @Post('dashboard/entries/:entryId/comments')
  @UseGuards(AppwriteSessionGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  createEntryComment(
    @Req() req: any,
    @Param('entryId') entryId: string,
    @Body() dto: CreateEntryCommentDto,
  ) {
    const user = req.user as Models.User;
    return this.dashboardService.createEntryComment(
      user.$id,
      entryId,
      dto.content,
      dto.parentId,
    );
  }

  @Delete('dashboard/entries/:entryId/comments/:commentId')
  @UseGuards(AppwriteSessionGuard)
  deleteEntryComment(
    @Req() req: any,
    @Param('entryId') entryId: string,
    @Param('commentId') commentId: string,
  ) {
    const user = req.user as Models.User;
    return this.dashboardService.deleteEntryComment(
      user.$id,
      entryId,
      commentId,
      user.labels?.includes('admin') ?? false,
    );
  }
}
