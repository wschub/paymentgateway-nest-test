export class ContractsNotAcceptedError extends Error {
  constructor() {
    super('Business contracts must be accepted before processing a payment');
    this.name = 'ContractsNotAcceptedError';
  }
}