export class IdempotencyKeyReusedError extends Error {
  readonly idempotencyKey: string;
  readonly transactionId: string;

  constructor(idempotencyKey: string, transactionId: string) {
    super(
      `Idempotency key "${idempotencyKey}" was already used by transaction "${transactionId}"`,
    );
    this.name = 'IdempotencyKeyReusedError';
    this.idempotencyKey = idempotencyKey;
    this.transactionId = transactionId;
  }
}