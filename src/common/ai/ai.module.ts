import openAI from '@genkit-ai/compat-oai/openai';
import { googleAI, vertexAI } from '@genkit-ai/google-genai';
import { Module } from '@nestjs/common';
import { genkit, Genkit } from 'genkit';
import { GameModule } from 'src/modules/game/game.module';
import { GoogleModule } from 'src/modules/google/google.module';
import { GENKIT, GENKIT_GOOGLE_AI } from './ai.constants';
import { EditorService } from './editor.service';
import { TranslatorService } from './translator.service';

@Module({
  providers: [
    {
      provide: GENKIT,
      useFactory: (): Genkit => {
        return genkit({
          plugins: [openAI({ apiKey: process.env.OPENAI_KEY })],
          promptDir: 'src/common/ai/prompts',
        });
      },
    },
    {
      provide: GENKIT_GOOGLE_AI,
      useFactory: (): Genkit => {
        return genkit({
          plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_KEY })],
          promptDir: 'src/common/ai/prompts',
        });
      },
    },
    EditorService,
    TranslatorService,
  ],
  exports: [GENKIT, GENKIT_GOOGLE_AI, EditorService, TranslatorService],
  imports: [GameModule, GoogleModule],
})
export class AiModule {}
