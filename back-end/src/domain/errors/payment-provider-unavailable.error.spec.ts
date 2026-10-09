import { PaymentProviderUnavailableError } from './payment-provider-unavailable.error';

describe('PaymentProviderUnavailableError', () => {
  it('is an Error with a stable name', () => {
    const error = new PaymentProviderUnavailableError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PaymentProviderUnavailableError');
  });

  it('uses a generic message that hides the failure details', () => {
    const error = new PaymentProviderUnavailableError();

    expect(error.message).toContain('unavailable');
    expect(error.message).toMatch(/^[a-z].*[^.]$/i);
  });
});