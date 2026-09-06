import openAI from '@genkit-ai/compat-oai/openai';
import { googleAI } from '@genkit-ai/google-genai';
import { Module } from '@nestjs/common';
import { genkit, Genkit } from 'genkit';
import { GENKIT, GENKIT_GOOGLE_AI } from './ai.constants';

@Module({
  providers: [
    {
      provide: GENKIT,
      useFactory: (): Genkit => {
        return genkit({
          plugins: [openAI({ apiKey: process.env.OPENAI_KEY })],
          promptDir: 'src/infra/ai/prompts',
        });
      },
    },
    {
      provide: GENKIT_GOOGLE_AI,
      useFactory: (): Genkit => {
        return genkit({
          plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_KEY })],
          promptDir: 'src/infra/ai/prompts',
        });
      },
    },
  ],
  exports: [GENKIT, GENKIT_GOOGLE_AI],
})
export class AiModule {}
