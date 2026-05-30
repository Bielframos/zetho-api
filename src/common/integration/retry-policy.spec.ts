import {
  executeWithRetry,
  IntegrationExecutionError,
  RetryClassification,
} from './retry-policy';

describe('executeWithRetry', () => {
  it('retries retryable failures with cap and exposes metadata', async () => {
    let attempts = 0;

    await expect(
      executeWithRetry({
        provider: 'igdb',
        operation: 'games.fetch',
        maxRetries: 2,
        timeoutMs: 50,
        baseDelayMs: 1,
        jitterMs: 1,
        classifyError: () => ({
          retryable: true,
          terminalStatusCode: 503,
          reason: 'provider_unavailable',
        }),
        run: () => {
          attempts += 1;
          return Promise.reject(new Error('temporary'));
        },
      }),
    ).rejects.toMatchObject<Partial<IntegrationExecutionError>>({
      name: 'IntegrationExecutionError',
      provider: 'igdb',
      operation: 'games.fetch',
      retryable: true,
      terminalStatusCode: 503,
      attempts: 3,
    });

    expect(attempts).toBe(3);
  });

  it('fails fast for non-retryable 4xx without retrying', async () => {
    let attempts = 0;

    await expect(
      executeWithRetry({
        provider: 'twitch',
        operation: 'oauth.token',
        maxRetries: 3,
        baseDelayMs: 1,
        jitterMs: 1,
        classifyError: () => ({
          retryable: false,
          terminalStatusCode: 401,
          reason: 'unauthorized',
        }),
        run: () => {
          attempts += 1;
          return Promise.reject(new Error('bad credentials'));
        },
      }),
    ).rejects.toMatchObject<Partial<IntegrationExecutionError>>({
      retryable: false,
      terminalStatusCode: 401,
      attempts: 1,
    });

    expect(attempts).toBe(1);
  });

  it('preserves classification fields for observability', async () => {
    const classification: RetryClassification = {
      retryable: false,
      terminalStatusCode: 400,
      reason: 'invalid_request',
    };

    await expect(
      executeWithRetry({
        provider: 'igdb',
        operation: 'genres.fetch',
        classifyError: () => classification,
        run: () => {
          const error = new Error('invalid');
          (error as Error & { statusCode?: number }).statusCode = 400;
          return Promise.reject(error);
        },
      }),
    ).rejects.toMatchObject<Partial<IntegrationExecutionError>>({
      provider: 'igdb',
      operation: 'genres.fetch',
      retryable: false,
      terminalStatusCode: 400,
      reason: 'invalid_request',
    });
  });
});
