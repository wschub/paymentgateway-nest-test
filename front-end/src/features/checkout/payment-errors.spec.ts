import {
  describePaymentError,
  type PaymentErrorAction,
} from '@/features/checkout/payment-errors'
import { createApiError, type ApiErrorKind } from '@/shared/api/api.errors'

const ALL_KINDS: readonly ApiErrorKind[] = [
  'soldOut',
  'notPayable',
  'invalidToken',
  'providerUnavailable',
  'network',
  'rateLimited',
  'providerRejected',
  'idempotencyConflict',
  'contractsNotAccepted',
  'server',
  'notFound',
  'badRequest',
]

describe('describePaymentError', () => {
  it('returns null when there is no error', () => {
    expect(describePaymentError(null)).toBeNull()
    expect(describePaymentError(undefined)).toBeNull()
  })

  it.each(ALL_KINDS)(
    'maps %s to a non-empty safe message and a next action',
    (kind) => {
      const guidance = describePaymentError(createApiError(kind))

      expect(guidance).not.toBeNull()
      expect(guidance!.message.length).toBeGreaterThan(0)
      expect(guidance!.actionLabel.length).toBeGreaterThan(0)
    },
  )

  it('uses the kind to derive the text and never the raw back-end message', () => {
    const raw = {
      kind: 'invalidToken' as const,
      // A back-end style body with the code, the path and provider text.
      message:
        'INVALID_PAYMENT_TOKEN at /transactions/123/payment: provider rejected token tok_abc (502)',
    }

    const guidance = describePaymentError(raw)

    expect(guidance!.message).toBe(createApiError('invalidToken').message)
    expect(guidance!.message).not.toContain('INVALID_PAYMENT_TOKEN')
    expect(guidance!.message).not.toContain('/transactions')
    expect(guidance!.message).not.toContain('tok_abc')
    expect(guidance!.message).not.toContain('provider')
  })

  it('falls back to a generic retry for an unknown kind without leaking it', () => {
    const guidance = describePaymentError({
      kind: 'totallyUnexpected' as ApiErrorKind,
      message: 'INTERNAL at /secret',
    })

    expect(guidance!.action).toBe('retry')
    expect(guidance!.message).not.toContain('INTERNAL')
  })

  it.each<[ApiErrorKind, PaymentErrorAction]>([
    ['soldOut', 'adjustQuantity'],
    ['notPayable', 'showStatus'],
    ['invalidToken', 'reenterCard'],
    ['providerUnavailable', 'retry'],
    ['providerRejected', 'retry'],
    ['network', 'retry'],
    ['rateLimited', 'retry'],
    ['server', 'retry'],
    ['badRequest', 'retry'],
    ['idempotencyConflict', 'startFresh'],
    ['notFound', 'startFresh'],
    ['contractsNotAccepted', 'acceptContracts'],
  ])('maps %s to the %s next action', (kind, action) => {
    expect(describePaymentError(createApiError(kind))!.action).toBe(action)
  })

  it.each(ALL_KINDS)(
    'keeps the guidance for %s a plain serializable object (never an Error)',
    (kind) => {
      const guidance = describePaymentError(createApiError(kind))!

      expect(guidance).not.toBeInstanceOf(Error)
      expect(Object.keys(guidance).sort()).toEqual([
        'action',
        'actionLabel',
        'kind',
        'message',
      ])
      expect(JSON.parse(JSON.stringify(guidance))).toEqual(guidance)
    },
  )

  it('maps rate limiting to its own copy with a manual retry only (no auto-retry hint)', () => {
    const guidance = describePaymentError(createApiError('rateLimited'))!

    expect(guidance.kind).toBe('rateLimited')
    expect(guidance.message).toMatch(/demasiadas solicitudes/i)
    expect(guidance.action).toBe('retry')
    expect(guidance.actionLabel).toBe('Reintentar')
  })

  it('maps a service-unavailable failure to its own copy with a manual retry', () => {
    const guidance = describePaymentError(createApiError('providerUnavailable'))!

    expect(guidance.message).toMatch(/no está disponible/i)
    expect(guidance.action).toBe('retry')
    expect(guidance.actionLabel).toBe('Reintentar')
  })
})
