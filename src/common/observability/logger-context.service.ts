import { Injectable, Logger } from '@nestjs/common';
import { CorrelationContextService } from './correlation-context.service';

export type LifecycleOutcome = 'start' | 'success' | 'error' | 'skipped';

export interface LifecycleLogDetails {
  component: string;
  operation: string;
  outcome: LifecycleOutcome;
  durationMs?: number;
  statusCode?: number;
  message?: string;
  [key: string]: unknown;
}

export interface StructuredLogDetails {
  component: string;
  operation: string;
  message?: string;
  [key: string]: unknown;
}

export interface TrackLifecycleOptions {
  skipError?: (error: unknown) => boolean;
}

@Injectable()
export class LoggerContextService {
  constructor(private readonly correlationContext: CorrelationContextService) {}

  buildLifecycleLog(details: any): Record<string, unknown> {
    return this.buildStructuredLog(details);
  }

  buildStructuredLog(details: any): Record<string, unknown> {
    const correlationId = this.correlationContext.getCorrelationId();
    const {
      component,
      operation,
      outcome,
      durationMs,
      statusCode,
      message,
      ...rest
    } = details ?? {};

    return {
      correlationId,
      component,
      operation,
      ...(outcome !== undefined ? { outcome } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(statusCode !== undefined ? { statusCode } : {}),
      ...(message !== undefined ? { message } : {}),
      ...this.getSafeDetails(rest),
    };
  }

  async trackLifecycle<T>(
    logger: Pick<Logger, 'log' | 'error' | 'warn'>,
    details: Omit<LifecycleLogDetails, 'outcome' | 'durationMs'> & {
      metadata?: Record<string, unknown>;
    },
    work: () => Promise<T>,
    options: TrackLifecycleOptions = {},
  ): Promise<T> {
    const startedAt = Date.now();
    logger.log(
      this.buildLifecycleLog({
        ...details,
        outcome: 'start',
        ...(details.metadata ?? {}),
      }),
    );

    try {
      const result = await work();
      logger.log(
        this.buildLifecycleLog({
          ...details,
          outcome: 'success',
          durationMs: Date.now() - startedAt,
          ...(details.metadata ?? {}),
        }),
      );
      return result;
    } catch (error) {
      const outcome = options.skipError?.(error) ? 'skipped' : 'error';
      logger.error(
        this.buildLifecycleLog({
          ...details,
          outcome,
          durationMs: Date.now() - startedAt,
          ...(details.metadata ?? {}),
          error: this.serializeError(error),
        }),
      );
      throw error;
    }
  }

  serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      const serialized: Record<string, unknown> = {
        name: error.name,
        message: error.message,
      };

      for (const key of [
        'code',
        'status',
        'statusCode',
        'type',
        'reason',
        'provider',
        'operation',
        'retryable',
        'terminalStatusCode',
        'attempts',
      ]) {
        const value = this.readPrimitive(error, key);
        if (value !== undefined) {
          serialized[key] = value;
        }
      }

      return serialized;
    }

    if (typeof error === 'object' && error !== null) {
      const serialized: Record<string, unknown> = {};

      for (const key of [
        'name',
        'message',
        'code',
        'status',
        'statusCode',
        'type',
        'reason',
      ]) {
        const value = this.readPrimitive(error, key);
        if (value !== undefined) {
          serialized[key] = value;
        }
      }

      if (Object.keys(serialized).length > 0) {
        return serialized;
      }
    }

    return { message: String(error) };
  }

  resolveRequestPath(request: {
    route?: { path?: string };
    originalUrl?: string;
    url?: string;
  }): string {
    return (
      request.route?.path ?? request.originalUrl ?? request.url ?? 'unknown'
    );
  }

  private readPrimitive(
    source: object,
    key: string,
  ): string | number | boolean | undefined {
    const value = Reflect.get(source, key);
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    return undefined;
  }

  private getSafeDetails(details: any): Record<string, unknown> {
    const safeDetails: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(details)) {
      if (
        [
          'component',
          'operation',
          'outcome',
          'durationMs',
          'statusCode',
          'message',
        ].includes(key)
      ) {
        continue;
      }

      if (key === 'error' && value !== undefined) {
        safeDetails.error = value;
        continue;
      }

      if (key !== 'metadata' && value !== undefined) {
        safeDetails[key] = value;
      }
    }

    return safeDetails;
  }
}
