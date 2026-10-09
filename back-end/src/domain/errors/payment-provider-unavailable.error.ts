export class PaymentProviderUnavailableError extends Error {
  constructor() {
    super('The payment provider is temporarily unavailable');
    this.name = 'PaymentProviderUnavailableError';
  }
}