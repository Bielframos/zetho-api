import {
  classifyFetchError,
  executeWithRetry,
  IntegrationExecutionError,
  RetryClassification,
} from './retry-policy';

describe('executeWithRetry', () => {
  it.each([
    [429, true, 'http_4xx'],
    [503, true, 'http_5xx_or_429'],
    [401, false, 'http_4xx'],
  ])(
    'classifies fetch status %i as retryable=%s',
    (status, retryable, reason) => {
      expect(classifyFetchError({ status })).toEqual({
        retryable,
        terminalStatusCode: status,
        reason,
      });
    },
  );

  it('classifies fetch aborts as retryable timeouts', () => {
    const error = new Error('request aborted');
    error.name = 'AbortError';

    expect(classifyFetchError(error)).toEqual({
      retryable: true,
      terminalStatusCode: 504,
      reason: 'timeout',
    });
  });

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
