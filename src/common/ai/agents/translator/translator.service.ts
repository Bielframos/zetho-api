import { Inject, Injectable } from '@nestjs/common';
import { type Genkit } from 'genkit';
import { GENKIT_GOOGLE_AI } from '../../ai.constants';

@Injectable()
export class TranslatorService {
  constructor(@Inject(GENKIT_GOOGLE_AI) private readonly ai: Genkit) {}

  async translate(
    text: string,
    targetLanguage: string = 'pt-BR',
  ): Promise<string> {
    const prompt = this.ai.prompt('translate');

    const { output } = await prompt({
      text,
      targetLanguage,
    });

    return output.translation as string;
  }
}
