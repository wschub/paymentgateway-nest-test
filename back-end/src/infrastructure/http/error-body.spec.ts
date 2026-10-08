import { buildErrorBody } from './error-body';

describe('buildErrorBody', () => {
  it('produces exactly the five documented fields', () => {
    const body = buildErrorBody({
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
      message: 'Product with id "999" was not found',
      path: '/products/999',
      timestamp: '2026-10-07T11:00:00.000Z',
    });

    expect(Object.keys(body).sort()).toEqual([
      'code',
      'message',
      'path',
      'statusCode',
      'timestamp',
    ]);
    expect(body).toEqual({
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
      message: 'Product with id "999" was not found',
      path: '/products/999',
      timestamp: '2026-10-07T11:00:00.000Z',
    });
  });

  it('defaults the timestamp to the current time in ISO 8601', () => {
    const before = Date.now();

    const body = buildErrorBody({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      path: '/products',
    });

    const timestamp = Date.parse(body.timestamp);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(Date.now());
    expect(body.timestamp).toBe(new Date(timestamp).toISOString());
  });
});
