import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface CorrelationContextStore {
  correlationId: string;
  source?: 'http' | 'cron' | 'internal';
  startedAt?: number;
}

@Injectable()
export class CorrelationContextService {
  private readonly storage = new AsyncLocalStorage<CorrelationContextStore>();

  run<T>(store: CorrelationContextStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  runWithCorrelationId<T>(
    correlationId: string,
    callback: () => T,
    source: CorrelationContextStore['source'] = 'internal',
  ): T {
    return this.run(
      {
        correlationId,
        source,
        startedAt: Date.now(),
      },
      callback,
    );
  }

  runWithGeneratedCorrelationId<T>(
    callback: () => T,
    source: CorrelationContextStore['source'] = 'internal',
  ): T {
    return this.runWithCorrelationId(randomUUID(), callback, source);
  }

  getStore(): CorrelationContextStore | undefined {
    return this.storage.getStore();
  }

  getCorrelationId(): string | undefined {
    return this.getStore()?.correlationId;
  }

  createCorrelationId(): string {
    return randomUUID();
  }
}
