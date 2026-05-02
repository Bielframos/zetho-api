import { googleAI } from '@genkit-ai/google-genai';
import { Global, Module } from '@nestjs/common';
import { genkit, Genkit } from 'genkit';

export const GENKIT = 'GENKIT';

@Global()
@Module({
  providers: [
    {
      provide: GENKIT,
      useFactory: (): Genkit => {
        return genkit({
          plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_KEY })],
          model: googleAI.model('gemini-2.5-flash', {
            temperature: 0.8,
            topP: 0.9,
            frequencyPenalty: 0.5,
            presencePenalty: 0.5,
          }),
        });
      },
    },
  ],
  exports: [GENKIT],
})
export class AiModule {}
