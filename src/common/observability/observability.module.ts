import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CorrelationContextService } from './correlation-context.service';
import { LoggerContextService } from './logger-context.service';
import { CorrelationIdMiddleware } from '../middleware/correlation-id.middleware';
import { MetricsInterceptor } from '../interceptors/metrics.interceptor';

@Global()
@Module({
  providers: [
    CorrelationContextService,
    LoggerContextService,
    CorrelationIdMiddleware,
    MetricsInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: MetricsInterceptor,
    },
  ],
  exports: [
    CorrelationContextService,
    LoggerContextService,
    CorrelationIdMiddleware,
    MetricsInterceptor,
  ],
})
export class ObservabilityModule {}
