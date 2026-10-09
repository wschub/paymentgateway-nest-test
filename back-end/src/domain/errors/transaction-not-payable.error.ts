export class TransactionNotPayableError extends Error {
  readonly transactionId: string;
  readonly status: string;

  constructor(transactionId: string, status: string) {
    super(
      `Transaction with id "${transactionId}" is not payable in status ${status}`,
    );
    this.name = 'TransactionNotPayableError';
    this.transactionId = transactionId;
    this.status = status;
  }
}