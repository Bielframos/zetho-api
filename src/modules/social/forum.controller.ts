import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { OptionalAppwriteSessionGuard } from 'src/common/guards/optional-session.guard';
import { ForumService } from './forum.service';
import { ForumPostsQueryDto, ForumRepliesQueryDto } from './social.dto';

@Controller('forum')
@UseGuards(OptionalAppwriteSessionGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class ForumController {
  constructor(private readonly forum: ForumService) {}

  @Get('posts')
  @Header('Cache-Control', 'private, no-store')
  listPosts(@Req() req: any, @Query() query: ForumPostsQueryDto) {
    return this.forum.listPosts({
      page: query.page,
      pageSize: query.pageSize,
      gameId: query.gameId,
      gameSlug: query.gameSlug,
      sort: query.sort,
      viewerUserId: req.user?.$id,
    });
  }

  @Get('posts/:slugOrId')
  @Header('Cache-Control', 'private, no-store')
  getPost(
    @Req() req: any,
    @Param('slugOrId') slugOrId: string,
    @Query('commentId') commentId?: string,
    @Query('sort') sort?: 'recent' | 'top',
  ) {
    return this.forum.getPostBySlugOrId(slugOrId, {
      commentId,
      sort: sort === 'recent' ? 'recent' : 'top',
      viewerUserId: req.user?.$id,
    });
  }

  @Get('comments/:parentId/replies')
  @Header('Cache-Control', 'private, no-store')
  getReplies(
    @Req() req: any,
    @Param('parentId') parentId: string,
    @Query() query: ForumRepliesQueryDto,
  ) {
    return this.forum.getReplies(parentId, {
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      viewerUserId: req.user?.$id,
    });
  }
}
