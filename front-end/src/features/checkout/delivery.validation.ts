import type { DeliveryData } from '@/features/checkout/checkout.slice'
import {
  EMAIL_PATTERN,
  FULL_NAME_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  PHONE_PATTERN,
} from '@/shared/constants'

export interface DeliveryFieldErrors {
  fullName?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  region?: string
  notes?: string
}

export const DELIVERY_MESSAGES = {
  fullName: `Ingresa el nombre completo (máximo ${FULL_NAME_MAX_LENGTH} caracteres).`,
  email: 'Ingresa un correo electrónico válido.',
  phone: 'Ingresa un teléfono válido.',
  address: 'Ingresa la dirección de entrega.',
  city: 'Ingresa la ciudad.',
  region: 'Ingresa el departamento o región.',
  notes: `Las notas no pueden superar ${NOTES_MAX_LENGTH} caracteres.`,
} as const

export interface TransactionCustomerPayload {
  fullName: string
  email: string
  phone: string
}

export interface TransactionDeliveryPayload {
  address: string
  city: string
  region: string
  notes?: string
}

export interface TransactionPayload {
  customer: TransactionCustomerPayload
  delivery: TransactionDeliveryPayload
}

function isBlank(value: string): boolean {
  return value.trim().length === 0
}

export function validateDelivery(fields: DeliveryData): DeliveryFieldErrors {
  const errors: DeliveryFieldErrors = {}

  if (isBlank(fields.fullName) || fields.fullName.trim().length > FULL_NAME_MAX_LENGTH) {
    errors.fullName = DELIVERY_MESSAGES.fullName
  }
  if (!EMAIL_PATTERN.test(fields.email.trim())) {
    errors.email = DELIVERY_MESSAGES.email
  }
  if (!PHONE_PATTERN.test(fields.phone.trim())) {
    errors.phone = DELIVERY_MESSAGES.phone
  }
  if (isBlank(fields.address)) {
    errors.address = DELIVERY_MESSAGES.address
  }
  if (isBlank(fields.city)) {
    errors.city = DELIVERY_MESSAGES.city
  }
  if (isBlank(fields.region)) {
    errors.region = DELIVERY_MESSAGES.region
  }
  if (fields.notes !== undefined && fields.notes.trim().length > NOTES_MAX_LENGTH) {
    errors.notes = DELIVERY_MESSAGES.notes
  }

  return errors
}

export function toTransactionPayload(fields: DeliveryData): TransactionPayload {
  const notes = fields.notes?.trim()

  return {
    customer: {
      fullName: fields.fullName.trim(),
      email: fields.email.trim(),
      phone: fields.phone.trim(),
    },
    delivery: {
      address: fields.address.trim(),
      city: fields.city.trim(),
      region: fields.region.trim(),
      ...(notes ? { notes } : {}),
    },
  }
}
