import { Test } from '@nestjs/testing';
import { AiModule } from './ai.module';

describe('AiModule', () => {
  const originalOpenAiKey = process.env.OPENAI_KEY;
  const originalGoogleKey = process.env.GOOGLE_GENAI_KEY;

  afterEach(() => {
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_KEY;
    else process.env.OPENAI_KEY = originalOpenAiKey;
    if (originalGoogleKey === undefined) delete process.env.GOOGLE_GENAI_KEY;
    else process.env.GOOGLE_GENAI_KEY = originalGoogleKey;
  });

  it('boots both Genkit providers when no AI credentials are configured', async () => {
    delete process.env.OPENAI_KEY;
    delete process.env.GOOGLE_GENAI_KEY;

    const module = await Test.createTestingModule({
      imports: [AiModule],
    }).compile();
    await module.close();
  });
});
