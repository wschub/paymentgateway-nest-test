import { toTransactionPayload, validateDelivery } from '@/features/checkout/delivery.validation'
import {
  EMAIL_PATTERN,
  FULL_NAME_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  PHONE_PATTERN,
} from '@/shared/constants'

const valid = {
  fullName: 'Test Buyer',
  email: 'buyer@example.com',
  phone: '+57 300 000 0000',
  address: 'Calle 1 #2-3',
  city: 'Bogotá',
  region: 'Cundinamarca',
}

describe('delivery.validation', () => {
  it('reuses the exact back-end constants', () => {
    expect(FULL_NAME_MAX_LENGTH).toBe(120)
    expect(NOTES_MAX_LENGTH).toBe(500)
    expect(EMAIL_PATTERN.source).toBe('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$')
    expect(PHONE_PATTERN.source).toBe('^[0-9+ ]{7,20}$')
  })

  describe('validateDelivery', () => {
    it('returns no errors for a complete valid delivery', () => {
      expect(validateDelivery(valid)).toEqual({})
    })

    it('requires a full name and caps it at 120 characters', () => {
      expect(validateDelivery({ ...valid, fullName: '' }).fullName).toBeDefined()
      expect(validateDelivery({ ...valid, fullName: '   ' }).fullName).toBeDefined()
      expect(
        validateDelivery({ ...valid, fullName: 'a'.repeat(FULL_NAME_MAX_LENGTH) }).fullName,
      ).toBeUndefined()
      expect(
        validateDelivery({ ...valid, fullName: 'a'.repeat(FULL_NAME_MAX_LENGTH + 1) }).fullName,
      ).toBeDefined()
    })

    it('requires an email matching the shared pattern', () => {
      expect(validateDelivery({ ...valid, email: '' }).email).toBeDefined()
      expect(validateDelivery({ ...valid, email: 'not-an-email' }).email).toBeDefined()
      expect(validateDelivery({ ...valid, email: 'a@b' }).email).toBeDefined()
      expect(validateDelivery({ ...valid, email: 'buyer@example.com' }).email).toBeUndefined()
    })

    it('applies the back-end phone pattern, not a plain length check', () => {
      expect(PHONE_PATTERN.test('abc1234')).toBe(false)
      expect(validateDelivery({ ...valid, phone: 'abc1234' }).phone).toBeDefined()
      expect(validateDelivery({ ...valid, phone: '+57 300 000 0000' }).phone).toBeUndefined()
      expect(validateDelivery({ ...valid, phone: '123456' }).phone).toBeDefined()
      expect(validateDelivery({ ...valid, phone: '1234567' }).phone).toBeUndefined()
      expect(
        validateDelivery({ ...valid, phone: '1234567890123456789012' }).phone,
      ).toBeDefined()
    })

    it('requires address, city and region', () => {
      const errors = validateDelivery({ ...valid, address: '', city: ' ', region: '' })
      expect(errors.address).toBeDefined()
      expect(errors.city).toBeDefined()
      expect(errors.region).toBeDefined()
    })

    it('treats notes as optional and caps them at 500 characters', () => {
      expect(validateDelivery({ ...valid }).notes).toBeUndefined()
      expect(
        validateDelivery({ ...valid, notes: 'a'.repeat(NOTES_MAX_LENGTH) }).notes,
      ).toBeUndefined()
      expect(
        validateDelivery({ ...valid, notes: 'a'.repeat(NOTES_MAX_LENGTH + 1) }).notes,
      ).toBeDefined()
    })
  })

  describe('toTransactionPayload', () => {
    it('maps the flat form to the nested back-end shape', () => {
      expect(toTransactionPayload(valid)).toEqual({
        customer: {
          fullName: 'Test Buyer',
          email: 'buyer@example.com',
          phone: '+57 300 000 0000',
        },
        delivery: {
          address: 'Calle 1 #2-3',
          city: 'Bogotá',
          region: 'Cundinamarca',
        },
      })
    })

    it('includes notes only when provided', () => {
      expect(toTransactionPayload({ ...valid, notes: '  Dejar en portería  ' }).delivery.notes).toBe(
        'Dejar en portería',
      )
      expect(toTransactionPayload({ ...valid, notes: '   ' }).delivery).not.toHaveProperty('notes')
      expect(toTransactionPayload(valid).delivery).not.toHaveProperty('notes')
    })

    it('trims the customer and delivery values', () => {
      const payload = toTransactionPayload({
        ...valid,
        fullName: '  Test Buyer  ',
        email: '  buyer@example.com ',
        city: '  Bogotá ',
      })
      expect(payload.customer.fullName).toBe('Test Buyer')
      expect(payload.customer.email).toBe('buyer@example.com')
      expect(payload.delivery.city).toBe('Bogotá')
    })
  })
})
