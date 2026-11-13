import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SystemApiKeyGuard } from 'src/common/guards/system-api.guard';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { OptionalAppwriteSessionGuard } from 'src/common/guards/optional-session.guard';
import { ListsService } from './lists.service';
type Request = { user: { $id: string; labels?: string[] } };
@Controller('lists')
export class ListsController {
  constructor(private readonly service: ListsService) {}
  @Get('system')
  @UseGuards(AppwriteSessionGuard)
  @Header('Cache-Control', 'private, no-store')
  managed(@Req() req: Request) {
    return this.service.managed(req.user);
  }
  @Get('detail/:slug')
  @UseGuards(OptionalAppwriteSessionGuard)
  @Header('Cache-Control', 'private, no-store')
  detail(@Param('slug') slug: string, @Req() req: Request) {
    return this.service.detail(slug, req.user);
  }
  @Get('by-id/:id')
  @UseGuards(OptionalAppwriteSessionGuard)
  @Header('Cache-Control', 'private, no-store')
  byId(@Param('id') id: string, @Req() req: Request) {
    return this.service.byId(id, req.user);
  }
  @Get(':id/items')
  @UseGuards(OptionalAppwriteSessionGuard)
  @Header('Cache-Control', 'private, no-store')
  items(
    @Param('id') id: string,
    @Req() req: Request,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listItems(id, req.user, Number(offset), Number(limit));
  }
  @Post('drafts')
  @UseGuards(SystemApiKeyGuard)
  submit(@Body() body: unknown) {
    return this.service.submit(body);
  }
  @Patch(':id/editorial')
  @UseGuards(AppwriteSessionGuard)
  revise(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { revision: string; content: unknown },
  ) {
    return this.service.revise(req.user, id, body.revision, body.content);
  }
  @Post(':id/status')
  @UseGuards(AppwriteSessionGuard)
  status(
    @Req() req: Request,
    @Param('id') id: string,
    @Body()
    body: { status: string; revision: string; sourcesVerified?: boolean },
  ) {
    return this.service.setStatus(req.user, id, body);
  }
  @Post(':id/post')
  @UseGuards(AppwriteSessionGuard)
  convert(@Req() req: Request, @Param('id') id: string) {
    return this.service.convert(req.user, id);
  }
  @Post(':id/publish-post')
  @UseGuards(AppwriteSessionGuard)
  publish(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('revision') revision: string,
  ) {
    return this.service.publishPost(req.user, id, revision);
  }
}
