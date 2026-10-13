import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type Genkit } from 'genkit';
import { GENKIT_GOOGLE_AI } from 'src/infra/ai/ai.constants';

@Injectable()
export class TranslatorService {
  constructor(@Inject(GENKIT_GOOGLE_AI) private readonly ai: Genkit) {}

  async translate(
    text: string,
    targetLanguage: string = 'pt-BR',
  ): Promise<string> {
    if (!process.env.GOOGLE_GENAI_KEY?.trim()) {
      throw new ServiceUnavailableException(
        'Translation is unavailable because the Google AI integration is not configured.',
      );
    }

    const prompt = this.ai.prompt('translate');

    const { output } = await prompt({
      text,
      targetLanguage,
    });

    return output.translation as string;
  }
}
