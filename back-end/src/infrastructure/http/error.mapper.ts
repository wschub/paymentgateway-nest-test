import { HttpException } from '@nestjs/common';
import { ContractsNotAcceptedError } from '../../domain/errors/contracts-not-accepted.error';
import { DataAccessError } from '../../domain/errors/data-access.error';
import { IdempotencyKeyReusedError } from '../../domain/errors/idempotency-key-reused.error';
import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';
import { InvalidPaymentTokenError } from '../../domain/errors/invalid-payment-token.error';
import { InvalidTransactionRequestError } from '../../domain/errors/invalid-transaction-request.error';
import { PaymentProviderRejectedError } from '../../domain/errors/payment-provider-rejected.error';
import { PaymentProviderUnavailableError } from '../../domain/errors/payment-provider-unavailable.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { TransactionNotFoundError } from '../../domain/errors/transaction-not-found.error';
import { TransactionNotPayableError } from '../../domain/errors/transaction-not-payable.error';

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
  if (error instanceof TransactionNotFoundError) {
    return { statusCode: 404, code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' };
  }
  if (error instanceof InsufficientStockError) {
    return {
      statusCode: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Requested quantity exceeds available stock',
    };
  }
  if (error instanceof IdempotencyKeyReusedError) {
    return {
      statusCode: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'The idempotency key was already used for another purchase',
    };
  }
  if (error instanceof TransactionNotPayableError) {
    return {
      statusCode: 409,
      code: 'TRANSACTION_NOT_PAYABLE',
      message: 'The purchase is not payable in its current status',
    };
  }
  if (error instanceof InvalidTransactionRequestError) {
    return {
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: `Invalid transaction request: ${error.invalidFields.join(', ')}`,
    };
  }
  if (error instanceof ContractsNotAcceptedError) {
    return {
      statusCode: 422,
      code: 'CONTRACTS_NOT_ACCEPTED',
      message: 'The business contracts must be accepted before paying',
    };
  }
  if (error instanceof InvalidPaymentTokenError) {
    return {
      statusCode: 422,
      code: 'INVALID_PAYMENT_TOKEN',
      message: 'The payment token is invalid',
    };
  }
  if (error instanceof PaymentProviderRejectedError) {
    return {
      statusCode: 502,
      code: 'PAYMENT_PROVIDER_REJECTED',
      message: 'The payment provider rejected the transaction',
    };
  }
  if (error instanceof PaymentProviderUnavailableError) {
    return {
      statusCode: 503,
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      message: 'The payment provider is temporarily unavailable',
    };
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
