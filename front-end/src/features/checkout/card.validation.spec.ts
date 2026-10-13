import {
  CARDHOLDER_MIN_LENGTH,
  detectBrand,
  isValidCardNumber,
  isValidCardholder,
  isValidCvc,
  isValidExpiry,
  normalizeCardNumber,
  parseExpiry,
  passesLuhn,
  validateCard,
} from '@/features/checkout/card.validation'

const VISA = '4242424242424242'
const VISA_ALT = '4111111111111111'
const MASTERCARD = '5555555555554444'
const MASTERCARD_2_SERIES = '2223003122003222'

describe('card.validation', () => {
  describe('passesLuhn', () => {
    it('accepts valid numbers across brands', () => {
      expect(passesLuhn(VISA)).toBe(true)
      expect(passesLuhn(VISA_ALT)).toBe(true)
      expect(passesLuhn(MASTERCARD)).toBe(true)
      expect(passesLuhn(MASTERCARD_2_SERIES)).toBe(true)
    })

    it('rejects a number with a wrong check digit', () => {
      expect(passesLuhn('4242424242424241')).toBe(false)
    })

    it('rejects non-digit input', () => {
      expect(passesLuhn('4242 4242 4242 424a')).toBe(false)
    })

    it('ignores spaces and dashes when normalizing', () => {
      expect(normalizeCardNumber('4242 4242-4242 4242')).toBe(VISA)
      expect(passesLuhn('4242 4242 4242 4242')).toBe(true)
    })
  })

  describe('isValidCardNumber', () => {
    it('accepts a Luhn-valid number of 13 to 19 digits', () => {
      expect(isValidCardNumber(VISA)).toBe(true)
      expect(isValidCardNumber('4222222222222')).toBe(true)
    })

    it('rejects numbers shorter than 13 or longer than 19 digits', () => {
      expect(isValidCardNumber('424242424242')).toBe(false)
      expect(isValidCardNumber('42424242424242424242')).toBe(false)
    })

    it('rejects a Luhn-invalid number', () => {
      expect(isValidCardNumber('4242424242424241')).toBe(false)
    })
  })

  describe('detectBrand', () => {
    it('detects VISA by the leading 4', () => {
      expect(detectBrand(VISA)).toBe('VISA')
      expect(detectBrand(VISA_ALT)).toBe('VISA')
    })

    it('detects MasterCard by the 51-55 IIN range', () => {
      expect(detectBrand(MASTERCARD)).toBe('MASTERCARD')
      expect(detectBrand('5105105105105100')).toBe('MASTERCARD')
    })

    it('detects MasterCard by the 2221-2720 IIN range', () => {
      expect(detectBrand(MASTERCARD_2_SERIES)).toBe('MASTERCARD')
      expect(detectBrand('2720999999999996')).toBe('MASTERCARD')
    })

    it('returns UNKNOWN for an unrecognized IIN', () => {
      expect(detectBrand('6011111111111117')).toBe('UNKNOWN')
    })
  })

  describe('expiry', () => {
    const now = new Date(2026, 9, 13, 12, 0, 0) // 13 Oct 2026, local time

    it('parses MM/YY into two-digit month and year strings', () => {
      expect(parseExpiry('12/29')).toEqual({ month: '12', year: '29' })
      expect(parseExpiry(' 01/30 ')).toEqual({ month: '01', year: '30' })
    })

    it('rejects a malformed or out-of-range month', () => {
      expect(parseExpiry('13/29')).toBeNull()
      expect(parseExpiry('00/29')).toBeNull()
      expect(parseExpiry('1/29')).toBeNull()
      expect(parseExpiry('aa/bb')).toBeNull()
    })

    it('rejects an expiry in the past', () => {
      expect(isValidExpiry('09/26', now)).toBe(false)
      expect(isValidExpiry('10/25', now)).toBe(false)
    })

    it('accepts a card that expires at the end of the current month', () => {
      expect(isValidExpiry('10/26', now)).toBe(true)
    })

    it('accepts a future expiry', () => {
      expect(isValidExpiry('12/29', now)).toBe(true)
    })
  })

  describe('isValidCvc', () => {
    it('accepts 3 or 4 digits', () => {
      expect(isValidCvc('123')).toBe(true)
      expect(isValidCvc('1234')).toBe(true)
    })

    it('rejects the wrong length or non-digit input', () => {
      expect(isValidCvc('12')).toBe(false)
      expect(isValidCvc('12345')).toBe(false)
      expect(isValidCvc('12a')).toBe(false)
    })
  })

  describe('isValidCardholder', () => {
    it('accepts a name of at least five characters', () => {
      expect(isValidCardholder('Test Buyer')).toBe(true)
      expect(isValidCardholder('abcde')).toBe(true)
    })

    it('rejects a shorter name or blank input', () => {
      expect(isValidCardholder('Ana')).toBe(false)
      expect(CARDHOLDER_MIN_LENGTH).toBe(5)
    })
  })

  describe('validateCard', () => {
    const valid = {
      number: VISA,
      expiry: '12/29',
      cvc: '123',
      cardholder: 'Test Buyer',
      installments: 1,
    }

    it('returns no errors for a complete valid card', () => {
      expect(validateCard(valid, 12)).toEqual({})
    })

    it('reports every invalid field', () => {
      const errors = validateCard(
        {
          number: '4242424242424241',
          expiry: '10/20',
          cvc: '1',
          cardholder: 'Ana',
          installments: 0,
        },
        12,
      )
      expect(errors.number).toBeDefined()
      expect(errors.expiry).toBeDefined()
      expect(errors.cvc).toBeDefined()
      expect(errors.cardholder).toBeDefined()
      expect(errors.installments).toBeDefined()
    })

    it('rejects installments below one or above the maximum', () => {
      expect(validateCard({ ...valid, installments: 0 }, 12).installments).toBeDefined()
      expect(validateCard({ ...valid, installments: 13 }, 12).installments).toBeDefined()
      expect(validateCard({ ...valid, installments: 12 }, 12).installments).toBeUndefined()
    })
  })
})
