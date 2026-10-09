import { TransactionNotFoundError } from './transaction-not-found.error';

describe('TransactionNotFoundError', () => {
  const transactionId = '22222222-2222-4222-8222-222222222222';

  it('is an Error with a stable name', () => {
    const error = new TransactionNotFoundError(transactionId);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TransactionNotFoundError');
  });

  it('keeps the id that was requested', () => {
    expect(new TransactionNotFoundError(transactionId).transactionId).toBe(
      transactionId,
    );
  });

  it('mentions the id in the message', () => {
    expect(new TransactionNotFoundError(transactionId).message).toContain(
      transactionId,
    );
  });
});