import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { type CreateRPGStoryDto, CreateRPGStory } from './rpg.schemas';
import { ValidationPipe } from 'src/common/pipes/validation/validation.pipe';
import { RpgService } from './rpg.service';

@Controller('rpg')
export class RpgController {
  constructor(private rpgService: RpgService) {}

  @Post('system/start-story')
  @UsePipes(new ValidationPipe(CreateRPGStory))
  startStory(@Body() CreateRPGStoryDto: CreateRPGStoryDto) {
    return this.rpgService.startStory(CreateRPGStoryDto);
  }
}
