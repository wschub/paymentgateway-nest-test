import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { buildErrorBody } from './error-body';
import { mapErrorToHttp } from './error.mapper';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const { statusCode, code, message } = mapErrorToHttp(exception);

    response
      .status(statusCode)
      .json(buildErrorBody({ statusCode, code, message, path: request.url }));
  }
}
