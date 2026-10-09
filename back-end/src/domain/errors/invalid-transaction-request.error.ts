export type InvalidTransactionRequestField =
  | 'productId'
  | 'quantity'
  | 'idempotencyKey'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'address'
  | 'city'
  | 'region'
  | 'notes';

export class InvalidTransactionRequestError extends Error {
  readonly invalidFields: readonly InvalidTransactionRequestField[];

  constructor(invalidFields: readonly InvalidTransactionRequestField[]) {
    super(`Invalid transaction request: ${invalidFields.join(', ')}`);
    this.name = 'InvalidTransactionRequestError';
    this.invalidFields = [...invalidFields];
  }
}