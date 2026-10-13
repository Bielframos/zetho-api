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
        const apiKey = process.env.OPENAI_KEY?.trim();
        return genkit({
          plugins: apiKey ? [openAI({ apiKey })] : [],
          promptDir: 'src/infra/ai/prompts',
        });
      },
    },
    {
      provide: GENKIT_GOOGLE_AI,
      useFactory: (): Genkit => {
        const apiKey = process.env.GOOGLE_GENAI_KEY?.trim();
        return genkit({
          plugins: apiKey ? [googleAI({ apiKey })] : [],
          promptDir: 'src/infra/ai/prompts',
        });
      },
    },
  ],
  exports: [GENKIT, GENKIT_GOOGLE_AI],
})
export class AiModule {}
