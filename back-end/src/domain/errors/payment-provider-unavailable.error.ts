export type PaymentProviderUnavailableKind =
  | 'timeout'
  | 'network'
  | 'http_5xx'
  | 'http_429'
  | 'http_408'
  | 'malformed_response';

export class PaymentProviderUnavailableError extends Error {
  readonly kind: PaymentProviderUnavailableKind;
  readonly httpStatus?: number;

  constructor(kind: PaymentProviderUnavailableKind, httpStatus?: number) {
    super('The payment provider is temporarily unavailable');
    this.name = 'PaymentProviderUnavailableError';
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}