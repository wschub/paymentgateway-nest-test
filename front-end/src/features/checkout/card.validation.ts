export type CardBrand = 'VISA' | 'MASTERCARD' | 'UNKNOWN'

export interface CardFields {
  number: string
  expiry: string
  cvc: string
  cardholder: string
  installments: number
}

export interface CardFieldErrors {
  number?: string
  expiry?: string
  cvc?: string
  cardholder?: string
  installments?: string
}

export const CARD_NUMBER_MIN_LENGTH = 13
export const CARD_NUMBER_MAX_LENGTH = 19
export const CARDHOLDER_MIN_LENGTH = 5

export const CARD_MESSAGES = {
  number: 'Ingresa un número de tarjeta válido.',
  expiry: 'Ingresa una fecha de vencimiento válida (MM/AA).',
  cvc: 'Ingresa el código de seguridad de tu tarjeta.',
  cardholder: 'Ingresa el nombre del titular (mínimo 5 caracteres).',
  installments: 'Selecciona un número de cuotas válido.',
} as const

export function normalizeCardNumber(value: string): string {
  return value.replace(/[\s-]/g, '')
}

export function passesLuhn(value: string): boolean {
  const digits = normalizeCardNumber(value)
  if (!/^\d+$/.test(digits)) return false

  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}

export function detectBrand(value: string): CardBrand {
  const digits = normalizeCardNumber(value)
  if (/^4/.test(digits)) return 'VISA'
  if (/^5[1-5]/.test(digits)) return 'MASTERCARD'
  if (/^2/.test(digits)) {
    const iin = Number(digits.slice(0, 4))
    if (iin >= 2221 && iin <= 2720) return 'MASTERCARD'
  }
  return 'UNKNOWN'
}

export function isValidCardNumber(value: string): boolean {
  const digits = normalizeCardNumber(value)
  if (!/^\d+$/.test(digits)) return false
  if (digits.length < CARD_NUMBER_MIN_LENGTH || digits.length > CARD_NUMBER_MAX_LENGTH) {
    return false
  }
  return passesLuhn(digits)
}

export interface ParsedExpiry {
  month: string
  year: string
}

export function parseExpiry(value: string): ParsedExpiry | null {
  const match = /^(\d{2})\/(\d{2})$/.exec(value.trim())
  if (!match) return null
  const month = Number(match[1])
  if (month < 1 || month > 12) return null
  return { month: match[1], year: match[2] }
}

export function isValidExpiry(value: string, now: Date = new Date()): boolean {
  const parsed = parseExpiry(value)
  if (!parsed) return false
  const year = 2000 + Number(parsed.year)
  const month = Number(parsed.month)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999)
  return endOfMonth >= now
}

export function isValidCvc(value: string): boolean {
  return /^\d{3,4}$/.test(value.trim())
}

export function isValidCardholder(value: string): boolean {
  return value.trim().length >= CARDHOLDER_MIN_LENGTH
}

export function validateCard(fields: CardFields, maxInstallments: number): CardFieldErrors {
  const errors: CardFieldErrors = {}
  if (!isValidCardNumber(fields.number)) errors.number = CARD_MESSAGES.number
  if (!isValidExpiry(fields.expiry)) errors.expiry = CARD_MESSAGES.expiry
  if (!isValidCvc(fields.cvc)) errors.cvc = CARD_MESSAGES.cvc
  if (!isValidCardholder(fields.cardholder)) errors.cardholder = CARD_MESSAGES.cardholder
  if (
    !Number.isInteger(fields.installments) ||
    fields.installments < 1 ||
    fields.installments > maxInstallments
  ) {
    errors.installments = CARD_MESSAGES.installments
  }
  return errors
}
