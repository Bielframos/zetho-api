export type RetryClassification = {
  retryable: boolean;
  terminalStatusCode: number | null;
  reason: string;
};

export type RetryPolicyOptions<T> = {
  provider: string;
  operation: string;
  run: (signal: AbortSignal) => Promise<T>;
  classifyError?: (error: unknown) => RetryClassification;
  maxRetries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  jitterMs?: number;
};

export class IntegrationExecutionError extends Error {
  provider: string;
  operation: string;
  retryable: boolean;
  terminalStatusCode: number | null;
  attempts: number;
  reason: string;

  constructor(args: {
    provider: string;
    operation: string;
    retryable: boolean;
    terminalStatusCode: number | null;
    attempts: number;
    reason: string;
    message: string;
  }) {
    super(args.message);
    this.name = 'IntegrationExecutionError';
    this.provider = args.provider;
    this.operation = args.operation;
    this.retryable = args.retryable;
    this.terminalStatusCode = args.terminalStatusCode;
    this.attempts = args.attempts;
    this.reason = args.reason;
  }
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_BASE_DELAY_MS = 150;
const DEFAULT_JITTER_MS = 120;

export function classifyHttpError(error: unknown): RetryClassification {
  if (error instanceof IntegrationExecutionError) {
    return {
      retryable: error.retryable,
      terminalStatusCode: error.terminalStatusCode,
      reason: error.reason,
    };
  }

  if (error instanceof Error && error.name === 'TimeoutError') {
    return { retryable: true, terminalStatusCode: 504, reason: 'timeout' };
  }

  const statusCode = extractStatusCode(error);

  if (statusCode === 429 || (statusCode !== null && statusCode >= 500)) {
    return {
      retryable: true,
      terminalStatusCode: statusCode,
      reason: 'http_5xx_or_429',
    };
  }

  if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
    return {
      retryable: false,
      terminalStatusCode: statusCode,
      reason: 'http_4xx',
    };
  }

  return {
    retryable: true,
    terminalStatusCode: null,
    reason: 'network_or_unknown',
  };
}

/** Classifies fetch aborts and HTTP errors wrapped with a numeric status. */
export function classifyFetchError(error: unknown): RetryClassification {
  if (error instanceof Error && error.name === 'AbortError') {
    return { retryable: true, terminalStatusCode: 504, reason: 'timeout' };
  }

  const status = extractFetchStatus(error);
  if (status !== null) {
    return {
      retryable: status === 429 || status >= 500,
      terminalStatusCode: status,
      reason: status >= 400 && status < 500 ? 'http_4xx' : 'http_5xx_or_429',
    };
  }

  return classifyHttpError(error);
}

export async function executeWithRetry<T>(
  options: RetryPolicyOptions<T>,
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const jitterMs = options.jitterMs ?? DEFAULT_JITTER_MS;

  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt += 1;

    try {
      const signal = AbortSignal.timeout(timeoutMs);
      return await options.run(signal);
    } catch (error) {
      const classification = (options.classifyError ?? classifyHttpError)(
        error,
      );
      const canRetry = classification.retryable && attempt <= maxRetries;

      if (!canRetry) {
        throw new IntegrationExecutionError({
          provider: options.provider,
          operation: options.operation,
          retryable: classification.retryable,
          terminalStatusCode: classification.terminalStatusCode,
          attempts: attempt,
          reason: classification.reason,
          message: `Integration call failed: ${options.provider}/${options.operation}`,
        });
      }

      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * Math.max(jitterMs, 1));
      await wait(backoff + jitter);
    }
  }

  throw new IntegrationExecutionError({
    provider: options.provider,
    operation: options.operation,
    retryable: true,
    terminalStatusCode: null,
    attempts: maxRetries + 1,
    reason: 'exhausted',
    message: `Integration call failed after retries: ${options.provider}/${options.operation}`,
  });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function extractStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const maybeStatusCode = (error as Record<string, unknown>).statusCode;
  const maybeStatus = (error as Record<string, unknown>).status;

  if (typeof maybeStatusCode === 'number') {
    return maybeStatusCode;
  }

  if (typeof maybeStatus === 'number') {
    return maybeStatus;
  }

  return null;
}

function extractFetchStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}
