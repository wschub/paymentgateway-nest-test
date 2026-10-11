import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
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
import { mapErrorToHttp } from './error.mapper';

describe('mapErrorToHttp', () => {
  it('maps ProductNotFoundError to 404 PRODUCT_NOT_FOUND', () => {
    const error = new ProductNotFoundError(
      '00000000-0000-4000-8000-000000000000',
    );

    expect(mapErrorToHttp(error)).toEqual({
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
      message: error.message,
    });
  });

  it('maps the domain transaction errors to their fixed safe contract codes', () => {
    expect(mapErrorToHttp(new TransactionNotFoundError('t-1'))).toEqual({
      statusCode: 404,
      code: 'TRANSACTION_NOT_FOUND',
      message: 'Transaction not found',
    });
    expect(
      mapErrorToHttp(new InsufficientStockError('p-1', 3, 1)),
    ).toEqual({
      statusCode: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Requested quantity exceeds available stock',
    });
    expect(
      mapErrorToHttp(new IdempotencyKeyReusedError('key-1', 't-1')),
    ).toEqual({
      statusCode: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'The idempotency key was already used for another purchase',
    });
    expect(
      mapErrorToHttp(new TransactionNotPayableError('t-1', 'APPROVED')),
    ).toEqual({
      statusCode: 409,
      code: 'TRANSACTION_NOT_PAYABLE',
      message: 'The purchase is not payable in its current status',
    });
    expect(mapErrorToHttp(new ContractsNotAcceptedError())).toEqual({
      statusCode: 422,
      code: 'CONTRACTS_NOT_ACCEPTED',
      message: 'The business contracts must be accepted before paying',
    });
    expect(mapErrorToHttp(new InvalidPaymentTokenError())).toEqual({
      statusCode: 422,
      code: 'INVALID_PAYMENT_TOKEN',
      message: 'The payment token is invalid',
    });
    expect(mapErrorToHttp(new PaymentProviderRejectedError(400))).toEqual({
      statusCode: 502,
      code: 'PAYMENT_PROVIDER_REJECTED',
      message: 'The payment provider rejected the transaction',
    });
    expect(
      mapErrorToHttp(new PaymentProviderUnavailableError('timeout')),
    ).toEqual({
      statusCode: 503,
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      message: 'The payment provider is temporarily unavailable',
    });
  });

  it('lists only the invalid field names for an invalid request', () => {
    const error = new InvalidTransactionRequestError(['quantity', 'email']);

    expect(mapErrorToHttp(error)).toEqual({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'Invalid transaction request: quantity, email',
    });
  });

  it('never leaks the identifiers of the domain errors', () => {
    const reused = mapErrorToHttp(
      new IdempotencyKeyReusedError('idem-secret', 'txn-secret'),
    );
    const stock = mapErrorToHttp(
      new InsufficientStockError('product-secret', 3, 1),
    );
    const missing = mapErrorToHttp(new TransactionNotFoundError('txn-secret'));

    expect(JSON.stringify(reused)).not.toContain('idem-secret');
    expect(JSON.stringify(reused)).not.toContain('txn-secret');
    expect(JSON.stringify(stock)).not.toContain('product-secret');
    expect(JSON.stringify(missing)).not.toContain('txn-secret');
  });

  it('maps DataAccessError to a generic 500 that leaks nothing', () => {
    const error = new DataAccessError(
      'connect ECONNREFUSED 127.0.0.1:5432 with password = hunter2',
    );

    expect(mapErrorToHttp(error)).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  it('maps NotFoundException to 404 NOT_FOUND', () => {
    expect(mapErrorToHttp(new NotFoundException())).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Not Found',
    });
  });

  it('maps BadRequestException to 400 BAD_REQUEST with its message', () => {
    expect(mapErrorToHttp(new BadRequestException('name must be a string'))).toEqual(
      {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'name must be a string',
      },
    );
  });

  it('joins the message list produced by the validation pipe', () => {
    const error = new BadRequestException({
      statusCode: 400,
      message: ['name must be a string', 'stock must be an integer'],
      error: 'Bad Request',
    });

    expect(mapErrorToHttp(error)).toEqual({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'name must be a string; stock must be an integer',
    });
  });

  it('maps the rate limiter to 429 TOO_MANY_REQUESTS', () => {
    expect(mapErrorToHttp(new ThrottlerException('Too Many Requests'))).toEqual({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'Too Many Requests',
    });
  });

  it('never exposes the message of a server error', () => {
    const error = new HttpException(
      'cannot connect to postgres://user:hunter2@db:5432',
      500,
    );

    expect(mapErrorToHttp(error)).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  it('falls back to HTTP_<status> for an unmapped status', () => {
    expect(mapErrorToHttp(new HttpException('teapot', 418))).toEqual({
      statusCode: 418,
      code: 'HTTP_418',
      message: 'teapot',
    });
  });

  it('falls back to the exception message when the response has none', () => {
    expect(mapErrorToHttp(new HttpException({ statusCode: 400 }, 400))).toEqual({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'Http Exception',
    });
    expect(
      mapErrorToHttp(new HttpException(null as unknown as object, 400)),
    ).toEqual({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'Http Exception',
    });
  });

  it('maps a body parser syntax error to 400 INVALID_JSON', () => {
    const error = Object.assign(
      new SyntaxError('Unexpected token } in JSON at position 5'),
      { body: {} },
    );

    expect(mapErrorToHttp(error)).toEqual({
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'Invalid JSON body',
    });
  });

  it('maps a syntax error outside the request body to a generic 500', () => {
    expect(mapErrorToHttp(new SyntaxError('Unexpected token'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  it('maps an unexpected error to a generic 500', () => {
    expect(mapErrorToHttp(new Error('sk_live_4242424242424242'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  it('maps a thrown non-error value to a generic 500', () => {
    expect(mapErrorToHttp('boom')).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });
});
