export class TransactionNotFoundError extends Error {
  readonly transactionId: string;

  constructor(transactionId: string) {
    super(`Transaction with id "${transactionId}" was not found`);
    this.name = 'TransactionNotFoundError';
    this.transactionId = transactionId;
  }
}