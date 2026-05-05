import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { EditorService } from 'src/common/ai/editor.service';
import { SystemApiKeyGuard } from 'src/common/guards/system-api.guard';
import { CreatePostDto, PopularTagsDto, SearchPostsDto } from './gazetho.dto';
import { GazethoService } from './gazetho.service';

@Controller('gazetho')
@UseGuards(SystemApiKeyGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class GazethoController {
  constructor(
    private readonly editorService: EditorService,
    private readonly gazethoService: GazethoService,
  ) {}

  @Post('editor/generate-article')
  generateArticle() {
    return this.editorService.execute();
  }

  @Post('posts')
  createPost(@Body() dto: CreatePostDto) {
    return this.gazethoService.createPost(dto);
  }

  @Get('posts')
  searchPosts(@Query() dto: SearchPostsDto) {
    return this.gazethoService.searchPosts(dto);
  }

  @Get('posts/:slug')
  findPostBySlug(@Param('slug') slug: string) {
    return this.gazethoService.findPostBySlug(slug);
  }

  @Get('tags/popular')
  getPopularTags(@Query() dto: PopularTagsDto) {
    return this.gazethoService.getPopularTags(dto);
  }
}
