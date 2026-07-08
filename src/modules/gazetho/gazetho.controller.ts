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
import { EditorService } from 'src/common/ai/agents/editor/editor.service';
import { SystemApiKeyGuard } from 'src/common/guards/system-api.guard';
import {
  CreatePostDto,
  GenerateGuidedPostDto,
  GeneratePostDto,
  GetEditorNewsDto,
  PopularTagsDto,
  SearchPostsDto,
  SitemapPostsDto,
} from './gazetho.dto';
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
  generateArticle(@Body() dto: GeneratePostDto) {
    return this.editorService.execute({
      suggestion: dto.suggestion,
      captureWindowHours: dto.captureWindowHours,
    });
  }

  @Post('editor/generate-guided-article')
  generateGuidedArticle(@Body() dto: GenerateGuidedPostDto) {
    return this.editorService.generateGuidedArticle({
      url: dto.url,
      instructions: dto.instructions,
    });
  }

  @Get('editor/news')
  getNews(@Query() dto: GetEditorNewsDto) {
    return this.editorService.getNews({
      captureWindowHours: dto.captureWindowHours,
    });
  }

  @Post('posts')
  createPost(@Body() dto: CreatePostDto) {
    return this.gazethoService.createPost(dto);
  }

  @Get('posts')
  searchPosts(@Query() dto: SearchPostsDto) {
    return this.gazethoService.searchPosts(dto);
  }

  @Get('posts/sitemap')
  getPostsForSitemap(@Query() dto: SitemapPostsDto) {
    return this.gazethoService.getPostsForSitemap(dto);
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

@Controller('gazetho-public')
export class GazethoPublicController {
  constructor(private readonly gazethoService: GazethoService) {}

  @Get('community-highlights')
  getCommunityHighlights(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.gazethoService.getCommunityHighlights(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 12,
    );
  }
}
