import checkoutReducer, {
  cardDisplaySet,
  checkoutSlice,
  checkoutStepChanged,
  contractsAcceptanceChanged,
  idempotencyKeySet,
  installmentsChanged,
  paymentErrorCleared,
  paymentFailed,
  paymentStatusChanged,
  paymentStatusFromTransaction,
  purchaseCompleted,
  purchaseStarted,
  quantityChanged,
  restored,
  retryAfterFinal,
  startOver,
  transactionReadFailed,
  transactionReadStarted,
  transactionReceived,
  type CheckoutState,
} from '@/features/checkout/checkout.slice'
import {
  INSTALLMENTS_DEFAULT,
  MAX_QUANTITY_PER_PURCHASE,
} from '@/shared/constants'
import type { TransactionView } from '@/features/checkout/checkout.types'
import { createApiError } from '@/shared/api/api.errors'

const buildTransactionView = (
  overrides: Partial<TransactionView> = {},
): TransactionView => ({
  id: 'tx-1',
  reference: 'REF-1',
  status: 'PENDING',
  quantity: 2,
  amounts: {
    productAmountInCents: 7000000,
    baseFeeInCents: 500000,
    deliveryFeeInCents: 1200000,
    totalInCents: 8700000,
  },
  card: null,
  product: { id: 'p1', name: 'Mouse', quantity: 2 },
  delivery: null,
  failureReason: null,
  ...overrides,
})

const CARD_LIKE = /card|cvc|cvv|pan|number|expiry|expiration|security/i
const ALLOWED_CARD_LIKE = new Set(['cardBrand', 'cardLastFour'])

const collectKeys = (value: unknown): string[] => {
  const keys: string[] = []
  const walk = (v: unknown) => {
    if (typeof v !== 'object' || v === null) {
      return
    }
    for (const key of Object.keys(v)) {
      keys.push(key)
      walk((v as Record<string, unknown>)[key])
    }
  }
  walk(value)
  return keys
}

const expectNoCardLikeKeys = (value: unknown) => {
  const offending = collectKeys(value).filter(
    (key) => CARD_LIKE.test(key) && !ALLOWED_CARD_LIKE.has(key),
  )
  expect(offending).toEqual([])
}

const cleanState = {
  currentStep: 'product' as const,
  selectedProductId: null,
  quantity: 1,
  delivery: null,
  transactionId: null,
  idempotencyKey: null,
  cardBrand: null,
  cardLastFour: null,
  installments: INSTALLMENTS_DEFAULT,
  contractsAccepted: false,
  paymentStatus: 'idle' as const,
  paymentError: null,
  transaction: null,
  lastReadRequestId: null,
}

const validRestoredState: CheckoutState = {
  currentStep: 'summary',
  selectedProductId: '11111111-1111-4111-8111-111111111111',
  quantity: 3,
  delivery: {
    fullName: 'Ana Pérez',
    email: 'ana@example.com',
    phone: '+573000000000',
    address: 'Calle 1 #2-3',
    city: 'Bogotá',
    region: 'Cundinamarca',
  },
  transactionId: 'tx-123',
  idempotencyKey: 'Abcdefghijklmnop1234',
  cardBrand: null,
  cardLastFour: null,
  installments: INSTALLMENTS_DEFAULT,
  contractsAccepted: false,
  paymentStatus: 'idle',
  paymentError: null,
  transaction: null,
  lastReadRequestId: null,
}

describe('checkout slice', () => {
  it('has an initial state with no card-like keys except the display fields', () => {
    const state = checkoutSlice.reducer(undefined, { type: '@@init' })
    expect(state).toEqual(cleanState)
    expect(Object.keys(state).sort()).toEqual([
      'cardBrand',
      'cardLastFour',
      'contractsAccepted',
      'currentStep',
      'delivery',
      'idempotencyKey',
      'installments',
      'lastReadRequestId',
      'paymentError',
      'paymentStatus',
      'quantity',
      'selectedProductId',
      'transaction',
      'transactionId',
    ])
    expectNoCardLikeKeys(state)
  })

  it('records the purchase choice via purchaseStarted', () => {
    const state = checkoutSlice.reducer(
      undefined,
      purchaseStarted({ productId: 'p-1', quantity: 4 }),
    )
    expect(state.currentStep).toBe('product')
    expect(state.selectedProductId).toBe('p-1')
    expect(state.quantity).toBe(4)
    expect(state.delivery).toBeNull()
    expect(state.transactionId).toBeNull()
  })

  it('clamps purchaseStarted quantity to 1..MAX_QUANTITY_PER_PURCHASE', () => {
    const high = checkoutSlice.reducer(
      undefined,
      purchaseStarted({ productId: 'p-1', quantity: 50 }),
    )
    expect(high.quantity).toBe(MAX_QUANTITY_PER_PURCHASE)

    const low = checkoutSlice.reducer(
      undefined,
      purchaseStarted({ productId: 'p-1', quantity: 0 }),
    )
    expect(low.quantity).toBe(1)
  })

  it('clamps quantityChanged to an integer within 1..MAX_QUANTITY_PER_PURCHASE', () => {
    expect(
      checkoutSlice.reducer(undefined, quantityChanged(15)).quantity,
    ).toBe(10)
    expect(
      checkoutSlice.reducer(undefined, quantityChanged(7)).quantity,
    ).toBe(7)
    expect(
      checkoutSlice.reducer(undefined, quantityChanged(2.7)).quantity,
    ).toBe(2)
    expect(
      checkoutSlice.reducer(undefined, quantityChanged(-3)).quantity,
    ).toBe(1)
    expect(
      checkoutSlice.reducer(undefined, quantityChanged(NaN)).quantity,
    ).toBe(1)
  })

  it('sets and clears the idempotency key', () => {
    const withKey = checkoutSlice.reducer(
      undefined,
      idempotencyKeySet('Abcdefghijklmnop1234'),
    )
    expect(withKey.idempotencyKey).toBe('Abcdefghijklmnop1234')

    const cleared = checkoutSlice.reducer(withKey, idempotencyKeySet(null))
    expect(cleared.idempotencyKey).toBeNull()
  })

  it('records only the card display fields via cardDisplaySet', () => {
    const state = checkoutSlice.reducer(
      undefined,
      cardDisplaySet({ brand: 'VISA', lastFour: '4242' }),
    )
    expect(state.cardBrand).toBe('VISA')
    expect(state.cardLastFour).toBe('4242')
    expectNoCardLikeKeys(state)
  })

  it('clamps installments to an integer of at least one', () => {
    expect(
      checkoutSlice.reducer(undefined, installmentsChanged(3)).installments,
    ).toBe(3)
    expect(
      checkoutSlice.reducer(undefined, installmentsChanged(0)).installments,
    ).toBe(1)
    expect(
      checkoutSlice.reducer(undefined, installmentsChanged(-2)).installments,
    ).toBe(1)
    expect(
      checkoutSlice.reducer(undefined, installmentsChanged(2.7)).installments,
    ).toBe(2)
    expect(
      checkoutSlice.reducer(undefined, installmentsChanged(NaN)).installments,
    ).toBe(INSTALLMENTS_DEFAULT)
  })

  it('records the contracts acceptance flag', () => {
    expect(
      checkoutSlice.reducer(undefined, contractsAcceptanceChanged(true))
        .contractsAccepted,
    ).toBe(true)
    expect(
      checkoutSlice.reducer(undefined, contractsAcceptanceChanged(false))
        .contractsAccepted,
    ).toBe(false)
  })

  it('tracks payment status and clears the error on a non-error status', () => {
    const failed = checkoutSlice.reducer(
      undefined,
      paymentFailed(createApiError('providerRejected')),
    )
    expect(failed.paymentStatus).toBe('error')
    expect(failed.paymentError?.kind).toBe('providerRejected')

    const paying = checkoutSlice.reducer(failed, paymentStatusChanged('paying'))
    expect(paying.paymentStatus).toBe('paying')
    expect(paying.paymentError).toBeNull()
  })

  it('clears the payment error explicitly', () => {
    const failed = checkoutSlice.reducer(
      undefined,
      paymentFailed(createApiError('network')),
    )
    const cleared = checkoutSlice.reducer(failed, paymentErrorCleared())
    expect(cleared.paymentError).toBeNull()
    expect(cleared.paymentStatus).toBe('idle')
  })

  it('maps every backend transaction status to a payment status', () => {
    expect(paymentStatusFromTransaction('PENDING')).toBe('pending')
    expect(paymentStatusFromTransaction('APPROVED')).toBe('approved')
    expect(paymentStatusFromTransaction('DECLINED')).toBe('declined')
    expect(paymentStatusFromTransaction('VOIDED')).toBe('voided')
    expect(paymentStatusFromTransaction('ERROR')).toBe('error')
  })

  it('stores the latest request id when a read starts', () => {
    const state = checkoutSlice.reducer(undefined, transactionReadStarted('req-1'))
    expect(state.lastReadRequestId).toBe('req-1')
  })

  it('stores the transaction view and derives the payment status', () => {
    const view = buildTransactionView({ status: 'APPROVED' })
    const state = checkoutSlice.reducer(
      checkoutSlice.reducer(
        undefined,
        paymentFailed(createApiError('network')),
      ),
      transactionReceived(view),
    )

    expect(state.transaction).toEqual(view)
    expect(state.transactionId).toBe(view.id)
    expect(state.paymentStatus).toBe('approved')
    expect(state.paymentError).toBeNull()
  })

  it('keeps the pending status on a transient read failure', () => {
    const state = checkoutSlice.reducer(
      checkoutSlice.reducer(undefined, paymentStatusChanged('pending')),
      transactionReadFailed(createApiError('server')),
    )

    expect(state.paymentStatus).toBe('pending')
    expect(state.paymentError?.kind).toBe('server')
  })

  it('flags a final error for a non-transient read failure', () => {
    const state = checkoutSlice.reducer(
      checkoutSlice.reducer(undefined, paymentStatusChanged('pending')),
      transactionReadFailed(createApiError('notFound')),
    )

    expect(state.paymentStatus).toBe('error')
    expect(state.paymentError?.kind).toBe('notFound')
  })

  it('clears everything on startOver', () => {
    let started = checkoutSlice.reducer(
      undefined,
      purchaseStarted({ productId: 'p-1', quantity: 4 }),
    )
    started = checkoutSlice.reducer(
      started,
      idempotencyKeySet('Abcdefghijklmnop1234'),
    )
    started = checkoutSlice.reducer(
      started,
      cardDisplaySet({ brand: 'VISA', lastFour: '4242' }),
    )
    started = checkoutSlice.reducer(
      started,
      contractsAcceptanceChanged(true),
    )
    started = checkoutSlice.reducer(started, installmentsChanged(3))
    started = checkoutSlice.reducer(
      started,
      paymentFailed(createApiError('server')),
    )

    const cleared = checkoutSlice.reducer(started, startOver())
    expect(cleared).toEqual(cleanState)
  })

  it('clears all progress on purchaseCompleted', () => {
    const completed = checkoutSlice.reducer(
      validRestoredState,
      purchaseCompleted(),
    )
    expect(completed).toEqual(cleanState)
  })

  it('clears the final transaction but keeps the purchase on retryAfterFinal', () => {
    let state = checkoutSlice.reducer(
      undefined,
      purchaseStarted({ productId: 'p-1', quantity: 4 }),
    )
    state = checkoutSlice.reducer(state, idempotencyKeySet('Abcdefghijklmnop1234'))
    state = checkoutSlice.reducer(
      state,
      cardDisplaySet({ brand: 'VISA', lastFour: '4242' }),
    )
    state = checkoutSlice.reducer(state, installmentsChanged(3))
    state = checkoutSlice.reducer(
      state,
      checkoutStepChanged('finalStatus'),
    )
    state = checkoutSlice.reducer(
      state,
      transactionReadStarted('req-1'),
    )
    state = checkoutSlice.reducer(
      state,
      transactionReceived(buildTransactionView({ status: 'DECLINED' })),
    )

    const retried = checkoutSlice.reducer(state, retryAfterFinal())

    expect(retried.currentStep).toBe('cardAndDelivery')
    expect(retried.transactionId).toBeNull()
    expect(retried.transaction).toBeNull()
    expect(retried.lastReadRequestId).toBeNull()
    expect(retried.paymentStatus).toBe('idle')
    expect(retried.paymentError).toBeNull()
    expect(retried.cardBrand).toBeNull()
    expect(retried.cardLastFour).toBeNull()
    expect(retried.installments).toBe(INSTALLMENTS_DEFAULT)
    expect(retried.selectedProductId).toBe('p-1')
    expect(retried.quantity).toBe(4)
  })

  it('restores a persisted selection via restored', () => {
    const state = checkoutSlice.reducer(
      undefined,
      restored(validRestoredState),
    )
    expect(state).toEqual(validRestoredState)
  })

  it('resets the in-memory and payment fields on restore', () => {
    let state = checkoutSlice.reducer(
      undefined,
      cardDisplaySet({ brand: 'VISA', lastFour: '4242' }),
    )
    state = checkoutSlice.reducer(state, paymentFailed(createApiError('server')))
    state = checkoutSlice.reducer(
      state,
      restored({ ...validRestoredState, idempotencyKey: null }),
    )

    expect(state.cardBrand).toBeNull()
    expect(state.cardLastFour).toBeNull()
    expect(state.paymentStatus).toBe('idle')
    expect(state.paymentError).toBeNull()
    expect(state.idempotencyKey).toBeNull()
  })

  it('never holds card-like keys in state or in the accepted payloads', () => {
    const payloads: unknown[] = [
      checkoutSlice.reducer(undefined, purchaseStarted({ productId: 'p', quantity: 2 })),
      checkoutSlice.reducer(undefined, quantityChanged(2)),
      checkoutSlice.reducer(undefined, startOver()),
      checkoutSlice.reducer(undefined, restored(validRestoredState)),
    ]

    const stateKeys = collectKeys(checkoutSlice.getInitialState())
    expectNoCardLikeKeys(stateKeys)

    for (const payload of payloads) {
      expectNoCardLikeKeys(payload)
    }

    expectNoCardLikeKeys(validRestoredState)
  })

  it('exports a state type with exactly the documented fields', () => {
    const state: CheckoutState = checkoutSlice.reducer(undefined, { type: '@@init' })
    expect(typeof state.currentStep).toBe('string')
    expect(typeof state.selectedProductId).toBe('object')
    expect(typeof state.quantity).toBe('number')
    expect(state.delivery).toBeNull()
    expect(state.transactionId).toBeNull()
    expect(state.idempotencyKey).toBeNull()
    expect(state.cardBrand).toBeNull()
    expect(state.cardLastFour).toBeNull()
    expect(state.installments).toBe(INSTALLMENTS_DEFAULT)
    expect(state.contractsAccepted).toBe(false)
    expect(state.paymentStatus).toBe('idle')
    expect(state.paymentError).toBeNull()
  })

  it('has a default export reducer named checkout for the store', () => {
    const state = checkoutReducer(undefined, { type: '@@init' })
    expect(state.currentStep).toBe('product')
  })
})
