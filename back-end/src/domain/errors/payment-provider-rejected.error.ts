export class PaymentProviderRejectedError extends Error {
  readonly httpStatus?: number;

  constructor(httpStatus?: number) {
    super('The payment provider rejected the transaction');
    this.name = 'PaymentProviderRejectedError';
    this.httpStatus = httpStatus;
  }
}