import { googleAI } from '@genkit-ai/google-genai';
import { Global, Module } from '@nestjs/common';
import { genkit, Genkit } from 'genkit';

export const GENKIT = 'GENKIT' 

@Global()
@Module({
    providers: [{
        provide: GENKIT,
        useFactory: (): Genkit => {
            return genkit({
                plugins: [googleAI({apiKey: process.env.GOOGLE_GENAI_KEY})]
            })
        }
    }],
    exports: [GENKIT]
})
export class AiModule {}

