import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoggerContextService } from '../observability/logger-context.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MetricsInterceptor.name);

  constructor(private readonly loggerContext: LoggerContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const operation = `${request.method} ${this.loggerContext.resolveRequestPath(
      request,
    )}`;

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          this.loggerContext.buildLifecycleLog({
            component: MetricsInterceptor.name,
            operation,
            outcome: 'success',
            durationMs: Date.now() - startedAt,
            method: request.method,
            path: this.loggerContext.resolveRequestPath(request),
            statusCode: response.statusCode,
          }),
        );
      }),
      catchError((error: unknown) => {
        const statusCode = this.resolveStatusCode(error, response);

        this.logger.error(
          this.loggerContext.buildLifecycleLog({
            component: MetricsInterceptor.name,
            operation,
            outcome: 'error',
            durationMs: Date.now() - startedAt,
            method: request.method,
            path: this.loggerContext.resolveRequestPath(request),
            statusCode,
            error: this.loggerContext.serializeError(error),
          }),
        );

        return throwError(() => error);
      }),
    );
  }

  private resolveStatusCode(error: unknown, response: Response): number {
    if (typeof response.statusCode === 'number' && response.statusCode >= 400) {
      return response.statusCode;
    }

    if (typeof error === 'object' && error !== null) {
      const candidate = Reflect.get(error, 'status');
      if (typeof candidate === 'number') {
        return candidate;
      }

      const statusCode = Reflect.get(error, 'statusCode');
      if (typeof statusCode === 'number') {
        return statusCode;
      }
    }

    return 500;
  }
}
