import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { DataAccessError } from '../../domain/errors/data-access.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { AllExceptionsFilter } from './all-exceptions.filter';
import type { ErrorBody } from './error-body';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  const catchException = (exception: unknown, url: string): ErrorBody => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({ url, method: 'GET' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledTimes(1);
    expect(json).toHaveBeenCalledTimes(1);
    const body = json.mock.calls[0][0] as ErrorBody;
    expect(Object.keys(body).sort()).toEqual([
      'code',
      'message',
      'path',
      'statusCode',
      'timestamp',
    ]);
    return body;
  };

  it('answers an unknown route with the shared body', () => {
    const body = catchException(new NotFoundException(), '/nope');

    expect(body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Not Found',
      path: '/nope',
      timestamp: expect.any(String),
    });
  });

  it('answers a validation failure with the message list joined', () => {
    const body = catchException(
      new BadRequestException({
        statusCode: 400,
        message: ['name must be a string', 'stock must be an integer'],
        error: 'Bad Request',
      }),
      '/products?sort=name',
    );

    expect(body).toEqual({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'name must be a string; stock must be an integer',
      path: '/products?sort=name',
      timestamp: expect.any(String),
    });
  });

  it('answers a missing product with 404 PRODUCT_NOT_FOUND', () => {
    const id = '00000000-0000-4000-8000-000000000000';

    const body = catchException(new ProductNotFoundError(id), `/products/${id}`);

    expect(body).toEqual({
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
      message: `Product with id "${id}" was not found`,
      path: `/products/${id}`,
      timestamp: expect.any(String),
    });
  });

  it('answers a repository failure with a generic 500 and no internals', () => {
    const body = catchException(
      new DataAccessError(
        'connect ECONNREFUSED 127.0.0.1:5432 with password = hunter2',
      ),
      '/products',
    );

    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      path: '/products',
      timestamp: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('answers the rate limiter with 429 TOO_MANY_REQUESTS', () => {
    const body = catchException(
      new ThrottlerException('Too Many Requests'),
      '/products',
    );

    expect(body.statusCode).toBe(429);
    expect(body.code).toBe('TOO_MANY_REQUESTS');
  });

  it('answers an unexpected error with a generic body without a stack', () => {
    const body = catchException(new Error('secret key sk_live_123'), '/products');

    expect(Object.keys(body).sort()).toEqual([
      'code',
      'message',
      'path',
      'statusCode',
      'timestamp',
    ]);
    expect(body.statusCode).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('sk_live_123');
  });

  it('answers a raw database failure without any Prisma text', () => {
    const body = catchException(
      new Error(
        "Can't reach database server at `localhost:5432`: connect ECONNREFUSED",
      ),
      '/products',
    );

    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      path: '/products',
      timestamp: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toContain('database server');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('answers a thrown non-error value with a generic 500', () => {
    const body = catchException('boom', '/products');

    expect(body.statusCode).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Internal server error');
  });

  it('produces an ISO 8601 timestamp', () => {
    const body = catchException(new NotFoundException(), '/nope');

    expect(body.timestamp).toBe(new Date(body.timestamp).toISOString());
  });
});
