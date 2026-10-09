import { PaymentProviderRejectedError } from './payment-provider-rejected.error';

describe('PaymentProviderRejectedError', () => {
  it('is an Error with a stable name', () => {
    const error = new PaymentProviderRejectedError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PaymentProviderRejectedError');
  });

  it('exposes a generic message', () => {
    const error = new PaymentProviderRejectedError();

    expect(error.message).toContain('provider');
    expect(error.message).toContain('rejected');
  });
});