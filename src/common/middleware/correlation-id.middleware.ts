import {
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CorrelationContextService } from '../observability/correlation-context.service';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly correlationContext: CorrelationContextService) {}

  use(request: Request, response: Response, next: NextFunction) {
    const inboundCorrelationId = this.extractCorrelationId(
      request.headers['x-correlation-id'],
    );
    const correlationId =
      inboundCorrelationId ?? this.correlationContext.createCorrelationId();

    response.setHeader('x-correlation-id', correlationId);

    return this.correlationContext.runWithCorrelationId(
      correlationId,
      () => next(),
      'http',
    );
  }

  private extractCorrelationId(value: string | string[] | undefined): string | null {
    const candidate = Array.isArray(value) ? value[0] : value;

    if (!candidate) {
      return null;
    }

    return UUID_V4_REGEX.test(candidate) ? candidate : null;
  }
}
