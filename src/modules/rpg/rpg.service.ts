import { Inject, Injectable } from '@nestjs/common';
import type { Genkit } from 'genkit';
import { GENKIT } from 'src/common/ai/ai.module';
import type { CreateRPGStoryDto } from './rpg.schemas';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';

@Injectable()
export class RpgService {
  private games: Appwrite['databases']['games'];
  private rpgStories: Appwrite['databases']['rpgStories'];

  constructor(
    @Inject(GENKIT) private ai: Genkit,
    private appwrite: Appwrite,
  ) {
    this.games = appwrite.databases.games;
    this.rpgStories = appwrite.databases.rpgStories;
  }

  async startStory(createStoryDto: CreateRPGStoryDto) {
    const { gameSlug: slug } = createStoryDto;
  }
}
