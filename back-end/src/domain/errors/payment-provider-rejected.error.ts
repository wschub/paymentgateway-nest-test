export class PaymentProviderRejectedError extends Error {
  constructor() {
    super('The payment provider rejected the transaction');
    this.name = 'PaymentProviderRejectedError';
  }
}