import { isNonEmptyString } from './string.rules';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PHONE_MIN_LENGTH = 7;
export const PHONE_MAX_LENGTH = 20;
export const PHONE_PATTERN = /^[0-9+ ]{7,20}$/;

export const FULL_NAME_MAX_LENGTH = 120;

export const isValidCustomerEmail = (value: unknown): boolean =>
  typeof value === 'string' && EMAIL_PATTERN.test(value);

export const isValidCustomerPhone = (value: unknown): boolean =>
  typeof value === 'string' && PHONE_PATTERN.test(value);

export const isValidCustomerFullName = (value: unknown): boolean =>
  isNonEmptyString(value) && value.length <= FULL_NAME_MAX_LENGTH;