import { HttpException } from '@nestjs/common';
import { DataAccessError } from '../../domain/errors/data-access.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';

export interface HttpError {
  statusCode: number;
  code: string;
  message: string;
}

const INTERNAL_MESSAGE = 'Internal server error';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

const isRequestBodySyntaxError = (error: unknown): error is SyntaxError =>
  error instanceof SyntaxError && 'body' in error;

const readMessage = (exception: HttpException): string => {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  const message = (response as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) {
    return message.join('; ');
  }
  if (typeof message === 'string') {
    return message;
  }
  return exception.message;
};

const mapHttpException = (exception: HttpException): HttpError => {
  const statusCode = exception.getStatus();
  if (statusCode >= 500) {
    return { statusCode, code: 'INTERNAL_ERROR', message: INTERNAL_MESSAGE };
  }
  const code = STATUS_CODES[statusCode] ?? `HTTP_${statusCode}`;
  return { statusCode, code, message: readMessage(exception) };
};

export const mapErrorToHttp = (error: unknown): HttpError => {
  if (error instanceof ProductNotFoundError) {
    return { statusCode: 404, code: 'PRODUCT_NOT_FOUND', message: error.message };
  }
  if (error instanceof DataAccessError) {
    return { statusCode: 500, code: 'INTERNAL_ERROR', message: INTERNAL_MESSAGE };
  }
  if (isRequestBodySyntaxError(error)) {
    return { statusCode: 400, code: 'INVALID_JSON', message: 'Invalid JSON body' };
  }
  if (error instanceof HttpException) {
    return mapHttpException(error);
  }
  return { statusCode: 500, code: 'INTERNAL_ERROR', message: INTERNAL_MESSAGE };
};
