import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { SocialService } from './social.service';
import {
  EntryInput,
  EnsureEntryInput,
  CommentInput,
  CommentUpdateInput,
  VoteInput,
  ListInput,
  ListUpdateInput,
  ItemInput,
  ItemOrderInput,
  FollowInput,
} from './social.dto';
@Controller('social')
@UseGuards(AppwriteSessionGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SocialController {
  constructor(private readonly social: SocialService) {}
  @Post('entries/ensure') ensureEntry(
    @Req() req: any,
    @Body() data: EnsureEntryInput,
  ) {
    return this.social.ensureEntry(req.user.$id, data);
  }
  @Post('entries') entry(@Req() req: any, @Body() data: EntryInput) {
    return this.social.createEntry(req.user.$id, data);
  }
  @Post('comments') comment(@Req() req: any, @Body() data: CommentInput) {
    return this.social.createComment(req.user.$id, data);
  }
  @Patch('comments/:id') updateComment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() data: CommentUpdateInput,
  ) {
    return this.social.updateComment(
      req.user.$id,
      id,
      data,
      Boolean(req.user?.labels?.includes('admin')),
    );
  }
  @Delete('comments/:id') deleteComment(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.social.deleteComment(
      req.user.$id,
      id,
      Boolean(req.user?.labels?.includes('admin')),
    );
  }
  @Post('comments/:id/vote') vote(
    @Req() req: any,
    @Param('id') id: string,
    @Body() data: VoteInput,
  ) {
    return this.social.voteComment(req.user.$id, id, data.type);
  }
  @Post('lists') list(@Req() req: any, @Body() data: ListInput) {
    return this.social.createList(req.user.$id, data);
  }
  @Patch('lists/:id') updateList(
    @Req() req: any,
    @Param('id') id: string,
    @Body() data: ListUpdateInput,
  ) {
    return this.social.updateList(req.user.$id, id, data);
  }
  @Delete('lists/:id') deleteList(@Req() req: any, @Param('id') id: string) {
    return this.social.deleteList(req.user.$id, id);
  }
  @Post('lists/:id/items') item(
    @Req() req: any,
    @Param('id') id: string,
    @Body() data: ItemInput,
  ) {
    return this.social.createItem(req.user.$id, id, data);
  }
  @Patch('lists/:id/items/:itemId') updateItem(
    @Req() req: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() data: ItemOrderInput,
  ) {
    return this.social.updateItem(req.user.$id, id, itemId, data);
  }
  @Delete('lists/:id/items/:itemId') deleteItem(
    @Req() req: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.social.deleteItem(req.user.$id, id, itemId);
  }
  @Post('connections') follow(@Req() req: any, @Body() data: FollowInput) {
    return this.social.follow(req.user.$id, data.targetProfileId);
  }
  @Delete('connections/:id') unfollow(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.social.unfollow(req.user.$id, id);
  }
}
