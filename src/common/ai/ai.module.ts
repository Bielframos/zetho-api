import { googleAI } from '@genkit-ai/google-genai';
import { Module } from '@nestjs/common';
import { genkit, Genkit } from 'genkit';
import { EditorService } from './editor.service';
import { GENKIT } from './ai.constants';
import openAI from '@genkit-ai/compat-oai/openai';

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
})
export class AiModule {}
