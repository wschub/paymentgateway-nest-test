import { isNonEmptyString } from './string.rules';

export const NOTES_MAX_LENGTH = 500;

export const isValidDeliveryAddress = (value: unknown): boolean =>
  isNonEmptyString(value);

export const isValidDeliveryCity = (value: unknown): boolean =>
  isNonEmptyString(value);

export const isValidDeliveryRegion = (value: unknown): boolean =>
  isNonEmptyString(value);

export const isValidDeliveryNotes = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.length <= NOTES_MAX_LENGTH);