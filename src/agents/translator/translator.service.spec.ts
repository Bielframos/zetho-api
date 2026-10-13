import { ServiceUnavailableException } from '@nestjs/common';
import { TranslatorService } from './translator.service';

describe('TranslatorService', () => {
  const originalGoogleKey = process.env.GOOGLE_GENAI_KEY;

  afterEach(() => {
    if (originalGoogleKey === undefined) delete process.env.GOOGLE_GENAI_KEY;
    else process.env.GOOGLE_GENAI_KEY = originalGoogleKey;
  });

  it('returns unavailable without calling Genkit when Google AI is unconfigured', async () => {
    delete process.env.GOOGLE_GENAI_KEY;
    const ai = { prompt: jest.fn() };
    const service = new TranslatorService(ai as never);

    await expect(service.translate('hello')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(ai.prompt).not.toHaveBeenCalled();
  });

  it('translates when Google AI is configured', async () => {
    process.env.GOOGLE_GENAI_KEY = 'test-google-key';
    const prompt = jest.fn().mockResolvedValue({
      output: { translation: 'Olá' },
    });
    const ai = { prompt: jest.fn().mockReturnValue(prompt) };
    const service = new TranslatorService(ai as never);

    await expect(service.translate('hello')).resolves.toBe('Olá');
    expect(ai.prompt).toHaveBeenCalledWith('translate');
    expect(prompt).toHaveBeenCalledWith({
      text: 'hello',
      targetLanguage: 'pt-BR',
    });
  });
});
