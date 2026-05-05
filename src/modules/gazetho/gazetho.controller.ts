import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { GazethoService } from './gazetho.service';
import { CreatePostDto, PopularTagsDto, SearchPostsDto } from './gazetho.dto';

@Controller('gazetho')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class GazethoController {
  constructor(private readonly gazethoService: GazethoService) {}

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
