import { IdempotencyKeyReusedError } from './idempotency-key-reused.error';

describe('IdempotencyKeyReusedError', () => {
  const idempotencyKey = 'order-0001-16ch';
  const transactionId = '22222222-2222-4222-8222-222222222222';

  it('is an Error with a stable name', () => {
    const error = new IdempotencyKeyReusedError(idempotencyKey, transactionId);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('IdempotencyKeyReusedError');
  });

  it('keeps the key and the previous transaction', () => {
    const error = new IdempotencyKeyReusedError(
      idempotencyKey,
      transactionId,
    );

    expect(error.idempotencyKey).toBe(idempotencyKey);
    expect(error.transactionId).toBe(transactionId);
  });

  it('mentions the key in the message', () => {
    expect(
      new IdempotencyKeyReusedError(idempotencyKey, transactionId).message,
    ).toContain(idempotencyKey);
  });
});