import { Inject, Injectable } from '@nestjs/common';
import type { Genkit } from 'genkit';
import { GENKIT } from 'src/common/ai/ai.module';

@Injectable()
export class RpgService {
  constructor(@Inject(GENKIT) private ai: Genkit) {}
}
