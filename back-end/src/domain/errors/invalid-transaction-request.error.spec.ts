import {
  InvalidTransactionRequestError,
  type InvalidTransactionRequestField,
} from './invalid-transaction-request.error';

describe('InvalidTransactionRequestError', () => {
  it('exposes only the invalid field names', () => {
    const error = new InvalidTransactionRequestError(['quantity', 'email']);

    expect(error.invalidFields).toEqual(['quantity', 'email']);
    expect([...error.invalidFields]).toEqual(['quantity', 'email']);
  });

  it('never puts a submitted value in the message', () => {
    const error = new InvalidTransactionRequestError([
      'quantity',
      'email',
      'fullName',
    ]);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InvalidTransactionRequestError);
    expect(error.name).toBe('InvalidTransactionRequestError');
    expect(error.message).toBe(
      'Invalid transaction request: quantity, email, fullName',
    );
    expect(error.message).not.toContain('-5');
    expect(error.message).not.toContain('buyer@example.com');
    expect(error.message).not.toContain('Hacker Name');
  });

  it('is not modified when the caller mutates its field list', () => {
    const fields: InvalidTransactionRequestField[] = ['quantity'];
    const error = new InvalidTransactionRequestError(fields);

    fields.push('phone');

    expect(error.invalidFields).toEqual(['quantity']);
  });
});