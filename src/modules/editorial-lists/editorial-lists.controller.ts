import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SystemApiKeyGuard } from 'src/common/guards/system-api.guard';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { EditorialListsService } from './editorial-lists.service';

@Controller('editorial-lists')
export class EditorialListsController {
  constructor(private readonly service: EditorialListsService) {}
  @Get() index() {
    return this.service.publicIndex();
  }
  @Get('public/:slug') publicList(@Param('slug') slug: string) {
    return this.service.publicList(slug);
  }
  @Post('drafts')
  @UseGuards(SystemApiKeyGuard)
  submit(@Body() body: unknown) {
    return this.service.submit(body);
  }
  @Get('review')
  @UseGuards(AppwriteSessionGuard)
  queue(@Req() req: { user: { $id: string; labels?: string[] } }) {
    return this.service.reviewQueue(req.user);
  }
  @Get('review/:id')
  @UseGuards(AppwriteSessionGuard)
  inspect(
    @Req() req: { user: { $id: string; labels?: string[] } },
    @Param('id') id: string,
  ) {
    return this.service.inspect(req.user, id);
  }
  @Patch('review/:id')
  @UseGuards(AppwriteSessionGuard)
  revise(
    @Req() req: { user: { $id: string; labels?: string[] } },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.revise(req.user, id, body);
  }
  @Post('review/:id/approve')
  @UseGuards(AppwriteSessionGuard)
  approve(
    @Req() req: { user: { $id: string; labels?: string[] } },
    @Param('id') id: string,
    @Body() body: { revision?: string; sourcesVerified?: boolean },
  ) {
    return this.service.approve(req.user, id, body);
  }
  @Post('review/:id/post')
  @UseGuards(AppwriteSessionGuard)
  convert(
    @Req() req: { user: { $id: string; labels?: string[] } },
    @Param('id') id: string,
  ) {
    return this.service.convert(req.user, id);
  }
  @Post('review/:id/publish-post')
  @UseGuards(AppwriteSessionGuard)
  publish(
    @Req() req: { user: { $id: string; labels?: string[] } },
    @Param('id') id: string,
    @Body('revision') revision: string,
  ) {
    return this.service.publishPost(req.user, id, revision);
  }
  @Post('review/:id/withdraw')
  @UseGuards(AppwriteSessionGuard)
  withdraw(
    @Req() req: { user: { $id: string; labels?: string[] } },
    @Param('id') id: string,
  ) {
    return this.service.withdraw(req.user, id);
  }
}
