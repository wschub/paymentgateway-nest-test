import {
  isValidCustomerEmail,
  isValidCustomerFullName,
  isValidCustomerPhone,
} from './customer.rules';
import {
  isValidDeliveryAddress,
  isValidDeliveryCity,
  isValidDeliveryNotes,
  isValidDeliveryRegion,
} from './delivery.rules';
import { isNonEmptyString } from './string.rules';
import {
  isValidIdempotencyKey,
  isValidInstallments,
  isValidQuantity,
  isValidReference,
} from './transaction.rules';

describe('domain rules', () => {
  describe('non-empty string', () => {
    it('accepts only non-empty strings', () => {
      expect(isNonEmptyString('x')).toBe(true);
      expect(isNonEmptyString('  trimmed  ')).toBe(true);
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString(42)).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
    });
  });

  describe('customer rules', () => {
    it('validates the email', () => {
      expect(isValidCustomerEmail('buyer@example.com')).toBe(true);
      expect(isValidCustomerEmail('a@b.co')).toBe(true);
      expect(isValidCustomerEmail('not-an-email')).toBe(false);
      expect(isValidCustomerEmail('a@')).toBe(false);
      expect(isValidCustomerEmail('@b.co')).toBe(false);
      expect(isValidCustomerEmail('a b@c.com')).toBe(false);
      expect(isValidCustomerEmail(42)).toBe(false);
    });

    it('validates the phone with 7 to 20 characters of digits, plus signs or spaces', () => {
      expect(isValidCustomerPhone('+57 300 123 4567')).toBe(true);
      expect(isValidCustomerPhone('3000000')).toBe(true);
      expect(isValidCustomerPhone('12345678901234567890')).toBe(true);
      expect(isValidCustomerPhone('123')).toBe(false);
      expect(isValidCustomerPhone('123456789012345678901')).toBe(false);
      expect(isValidCustomerPhone('3000000000a')).toBe(false);
      expect(isValidCustomerPhone('')).toBe(false);
    });

    it('validates the full name up to 120 characters', () => {
      expect(isValidCustomerFullName('Diana Alvarez')).toBe(true);
      expect(isValidCustomerFullName('a'.repeat(120))).toBe(true);
      expect(isValidCustomerFullName('')).toBe(false);
      expect(isValidCustomerFullName('a'.repeat(121))).toBe(false);
      expect(isValidCustomerFullName(42)).toBe(false);
    });
  });

  describe('delivery rules', () => {
    it('validates the address, city and region as non-empty', () => {
      expect(isValidDeliveryAddress('Calle 100')).toBe(true);
      expect(isValidDeliveryCity('Bogotá')).toBe(true);
      expect(isValidDeliveryRegion('Cundinamarca')).toBe(true);
      expect(isValidDeliveryAddress('')).toBe(false);
      expect(isValidDeliveryCity('   ')).toBe(false);
      expect(isValidDeliveryRegion(42)).toBe(false);
    });

    it('validates the notes as null, absent or up to 500 characters', () => {
      expect(isValidDeliveryNotes(null)).toBe(true);
      expect(isValidDeliveryNotes(undefined)).toBe(true);
      expect(isValidDeliveryNotes('x')).toBe(true);
      expect(isValidDeliveryNotes('x'.repeat(500))).toBe(true);
      expect(isValidDeliveryNotes('x'.repeat(501))).toBe(false);
      expect(isValidDeliveryNotes(42)).toBe(false);
    });
  });

  describe('transaction rules', () => {
    it('validates the reference format TXN- plus 16 uppercase letters or digits', () => {
      expect(isValidReference('TXN-7K3F9Q2M8XJA4B6C')).toBe(true);
      expect(isValidReference('TXN-A1B2C3D4E5F6G7H8')).toBe(true);
      expect(isValidReference('TXN-abcdefABCDEF1234')).toBe(false);
      expect(isValidReference('TXN-7K3F9Q2M8XJA4B6')).toBe(false);
      expect(isValidReference('txn-7K3F9Q2M8XJA4B6C')).toBe(false);
      expect(isValidReference('')).toBe(false);
      expect(isValidReference(42)).toBe(false);
    });

    it('validates the idempotency key with 16 to 64 letters, digits, dash or underscore', () => {
      expect(isValidIdempotencyKey('order_0001_abcdefgh')).toBe(true);
      expect(isValidIdempotencyKey('a'.repeat(16))).toBe(true);
      expect(isValidIdempotencyKey('a'.repeat(64))).toBe(true);
      expect(isValidIdempotencyKey('a'.repeat(15))).toBe(false);
      expect(isValidIdempotencyKey('a'.repeat(65))).toBe(false);
      expect(isValidIdempotencyKey('has space 12345678')).toBe(false);
      expect(isValidIdempotencyKey('with.dot.12345678')).toBe(false);
      expect(isValidIdempotencyKey(42)).toBe(false);
    });

    it('validates the quantity as an integer of at least 1', () => {
      expect(isValidQuantity(1)).toBe(true);
      expect(isValidQuantity(7)).toBe(true);
      expect(isValidQuantity(0)).toBe(false);
      expect(isValidQuantity(-2)).toBe(false);
      expect(isValidQuantity(1.5)).toBe(false);
      expect(isValidQuantity('2')).toBe(false);
      expect(isValidQuantity(Number.NaN)).toBe(false);
    });

    it('validates the installments as an integer of at least 1', () => {
      expect(isValidInstallments(1)).toBe(true);
      expect(isValidInstallments(12)).toBe(true);
      expect(isValidInstallments(0)).toBe(false);
      expect(isValidInstallments(-1)).toBe(false);
      expect(isValidInstallments(1.5)).toBe(false);
      expect(isValidInstallments('2')).toBe(false);
    });
  });
});