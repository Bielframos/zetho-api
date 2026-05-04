import openAI from '@genkit-ai/compat-oai/openai';
import { Module } from '@nestjs/common';
import { genkit, Genkit } from 'genkit';
import { GENKIT } from './ai.constants';
import { EditorService } from './editor.service';
import { GameModule } from 'src/modules/game/game.module';

@Module({
  providers: [
    {
      provide: GENKIT,
      useFactory: (): Genkit => {
        return genkit({
          // plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_KEY })],
          plugins: [openAI({ apiKey: process.env.OPENAI_KEY })],
          promptDir: 'src/common/ai/prompts',
        });
      },
    },
    EditorService,
  ],
  exports: [GENKIT, EditorService],
  imports: [GameModule],
})
export class AiModule {}
