import {
  PaymentProviderUnavailableError,
  type PaymentProviderUnavailableKind,
} from './payment-provider-unavailable.error';

describe('PaymentProviderUnavailableError', () => {
  it('keeps a fixed message and name', () => {
    const error = new PaymentProviderUnavailableError('timeout');

    expect(error.name).toBe('PaymentProviderUnavailableError');
    expect(error.message).toBe('The payment provider is temporarily unavailable');
  });

  it.each<PaymentProviderUnavailableKind>([
    'timeout',
    'network',
    'http_5xx',
    'http_429',
    'http_408',
    'malformed_response',
  ])('carries the safe kind %s', (kind) => {
    const error = new PaymentProviderUnavailableError(kind, 503);

    expect(error.kind).toBe(kind);
    expect(error.httpStatus).toBe(503);
  });

  it('works without an httpStatus', () => {
    const error = new PaymentProviderUnavailableError('network');

    expect(error.kind).toBe('network');
    expect(error.httpStatus).toBeUndefined();
  });

  it('never carries bodies, headers, keys, tokens or signatures', () => {
    const forbidden = [
      'private.secret',
      'integrity_secret',
      'tok_card',
      'acceptance_token',
      'b1badadddeadbeef',
      'authorization',
      'response body',
    ];
    for (const secret of forbidden) {
      expect(JSON.stringify(new PaymentProviderUnavailableError('http_5xx', 502))).not.toContain(
        secret,
      );
    }
  });
});