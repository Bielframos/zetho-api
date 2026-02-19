import { Inject, Injectable } from '@nestjs/common';
import type { Genkit } from 'genkit';
import { GENKIT } from 'src/common/ai/ai.module';
import type { CreateRPGStoryDto } from './rpg.schemas';
import { Database } from 'src/common/database/database';

@Injectable()
export class RpgService {
  private games: Database['games'];
  private rpgStories: Database['rpgStories'];

  constructor(
    @Inject(GENKIT) private ai: Genkit,
    private db: Database,
  ) {
    this.games = db.games;
    this.rpgStories = db.rpgStories;
  }

  async startStory(createStoryDto: CreateRPGStoryDto) {
    const { gameSlug: slug } = createStoryDto;
  }
}
