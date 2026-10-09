export class InvalidPaymentTokenError extends Error {
  constructor() {
    super('The payment token is invalid');
    this.name = 'InvalidPaymentTokenError';
  }
}