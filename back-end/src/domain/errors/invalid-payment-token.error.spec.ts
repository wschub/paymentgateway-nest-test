import { InvalidPaymentTokenError } from './invalid-payment-token.error';

describe('InvalidPaymentTokenError', () => {
  it('is an Error with a stable name', () => {
    const error = new InvalidPaymentTokenError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidPaymentTokenError');
  });

  it('never stores or mentions the card token', () => {
    const error = new InvalidPaymentTokenError();

    expect(error.message).toContain('token');
    expect(error.message).not.toMatch(/tok_/);
  });
});