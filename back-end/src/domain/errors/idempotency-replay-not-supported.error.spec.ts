import { IdempotencyReplayNotSupportedError } from './idempotency-replay-not-supported.error';

describe('IdempotencyReplayNotSupportedError', () => {
  it('is an explicit placeholder error for the duplicate result variant', () => {
    const error = new IdempotencyReplayNotSupportedError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('IdempotencyReplayNotSupportedError');
    expect(error.message).toBe(
      'Replaying an existing transaction for the same idempotency key is not supported yet',
    );
  });
});