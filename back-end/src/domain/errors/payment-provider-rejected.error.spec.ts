import { PaymentProviderRejectedError } from './payment-provider-rejected.error';

describe('PaymentProviderRejectedError', () => {
  it('keeps a fixed message and name', () => {
    const error = new PaymentProviderRejectedError();

    expect(error.name).toBe('PaymentProviderRejectedError');
    expect(error.message).toBe('The payment provider rejected the transaction');
  });

  it('carries only an optional httpStatus', () => {
    const withoutStatus = new PaymentProviderRejectedError();
    expect(withoutStatus.httpStatus).toBeUndefined();

    const withStatus = new PaymentProviderRejectedError(422);
    expect(withStatus.httpStatus).toBe(422);
  });

  it('never carries bodies, headers, keys, tokens or signatures', () => {
    const error = new PaymentProviderRejectedError(422);
    const serialized = JSON.stringify(error);
    for (const secret of ['prv', 'integrity', 'tok', 'signature', 'body']) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).not.toContain('The payment provider rejected');
  });
});