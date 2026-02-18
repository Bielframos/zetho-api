import { Controller, Post } from '@nestjs/common';

@Controller('rpg')
export class RpgController {
  constructor() {}

  @Post(['rpg', 'system', 'start-story'])
  startStory() {
    return "Esse endpoint inicializa uma história."
  }
}
