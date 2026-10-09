import { TransactionNotPayableError } from './transaction-not-payable.error';

describe('TransactionNotPayableError', () => {
  const transactionId = '22222222-2222-4222-8222-222222222222';

  it('is an Error with a stable name', () => {
    const error = new TransactionNotPayableError(transactionId, 'APPROVED');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TransactionNotPayableError');
  });

  it('keeps the transaction id and the current status', () => {
    const error = new TransactionNotPayableError(transactionId, 'APPROVED');

    expect(error.transactionId).toBe(transactionId);
    expect(error.status).toBe('APPROVED');
  });

  it('mentions the id and status in the message', () => {
    const message = new TransactionNotPayableError(
      transactionId,
      'DECLINED',
    ).message;

    expect(message).toContain(transactionId);
    expect(message).toContain('DECLINED');
  });
});