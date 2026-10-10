export const REFERENCE_PREFIX = 'TXN-';
export const REFERENCE_SUFFIX_LENGTH = 16;
export const REFERENCE_PATTERN = /^TXN-[A-Z0-9]{16}$/;

export const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 64;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const MIN_QUANTITY = 1;
export const MIN_INSTALLMENTS = 1;

export const isValidReference = (value: unknown): boolean =>
  typeof value === 'string' && REFERENCE_PATTERN.test(value);

export const isValidIdempotencyKey = (value: unknown): boolean =>
  typeof value === 'string' && IDEMPOTENCY_KEY_PATTERN.test(value);

export const isValidQuantity = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_QUANTITY;

export const isValidInstallments = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_INSTALLMENTS;