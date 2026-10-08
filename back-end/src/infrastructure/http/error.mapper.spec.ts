import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { DataAccessError } from '../../domain/errors/data-access.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
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
