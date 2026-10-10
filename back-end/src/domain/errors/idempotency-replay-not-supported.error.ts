export class IdempotencyReplayNotSupportedError extends Error {
  constructor() {
    super(
      'Replaying an existing transaction for the same idempotency key is not supported yet',
    );
    this.name = 'IdempotencyReplayNotSupportedError';
  }
}