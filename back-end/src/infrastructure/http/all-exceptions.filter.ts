import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { buildErrorBody } from './error-body';
import { mapErrorToHttp } from './error.mapper';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const { statusCode, code, message } = mapErrorToHttp(exception);

    if (statusCode >= 500) {
      this.logFailure(exception);
    }

    response
      .status(statusCode)
      .json(buildErrorBody({ statusCode, code, message, path: request.url }));
  }

  private logFailure(exception: unknown): void {
    if (exception instanceof Error) {
      this.logger.error(exception, AllExceptionsFilter.describeFailure(exception));
    } else {
      this.logger.error(exception);
    }
  }

  private static describeFailure(error: Error): string {
    const parts: string[] = [];
    let cursor: unknown = error;
    let depth = 0;

    while (cursor instanceof Error && depth < 10) {
      parts.push(cursor.stack ?? `${cursor.name}: ${cursor.message}`);
      if (cursor.cause === undefined) {
        break;
      }
      parts.push('Caused by:');
      cursor = cursor.cause;
      depth += 1;
    }

    return parts.join('\n');
  }
}
