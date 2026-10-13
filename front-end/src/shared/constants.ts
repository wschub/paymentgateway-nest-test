export const MAX_QUANTITY_PER_PURCHASE = 10

export const STORE_NAME = 'Tech Store'

// Delivery rules copied exactly from the back-end so the front-end validators
// cannot drift from the server. Source of truth:
// back-end/src/infrastructure/http/create-transaction.dto.ts, which imports
// FULL_NAME_MAX_LENGTH, EMAIL_PATTERN and PHONE_PATTERN from
// back-end/src/domain/rules/customer.rules.ts and NOTES_MAX_LENGTH from
// back-end/src/domain/rules/delivery.rules.ts.
export const FULL_NAME_MAX_LENGTH = 120
export const NOTES_MAX_LENGTH = 500
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE_PATTERN = /^[0-9+ ]{7,20}$/

// Payment flow constants (see specs/004-card-delivery-payment/data-model.md).
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
export const STATUS_POLL_INTERVAL_MS = 2000
export const STATUS_POLL_CEILING_MS = 40000
export const INSTALLMENTS_DEFAULT = 1
export const TOKENIZATION_TIMEOUT_MS = 10000
