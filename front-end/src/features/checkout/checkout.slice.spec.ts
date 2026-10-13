import checkoutReducer, {
  checkoutSlice,
  purchaseCompleted,
  purchaseStarted,
  quantityChanged,
  restored,
  startOver,
  type CheckoutState,
} from '@/features/checkout/checkout.slice'
import { MAX_QUANTITY_PER_PURCHASE } from '@/shared/constants'

const CARD_LIKE = /card|cvc|cvv|pan|number|expiry|expiration|security/i

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
  const offending = collectKeys(value).filter((key) => CARD_LIKE.test(key))
  expect(offending).toEqual([])
}

const validRestoredState = {
  currentStep: 'summary' as const,
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
}

describe('checkout slice', () => {
  it('has an initial state with no card-like keys', () => {
    const state = checkoutSlice.reducer(undefined, { type: '@@init' })
    expect(state).toEqual({
      currentStep: 'product',
      selectedProductId: null,
      quantity: 1,
      delivery: null,
      transactionId: null,
    })
    expect(Object.keys(state).sort()).toEqual([
      'currentStep',
      'delivery',
      'quantity',
      'selectedProductId',
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

  it('clears everything on startOver', () => {
    const started = checkoutSlice.reducer(
      undefined,
      purchaseStarted({ productId: 'p-1', quantity: 4 }),
    )
    const cleared = checkoutSlice.reducer(started, startOver())
    expect(cleared).toEqual({
      currentStep: 'product',
      selectedProductId: null,
      quantity: 1,
      delivery: null,
      transactionId: null,
    })
  })

  it('clears all progress on purchaseCompleted', () => {
    const completed = checkoutSlice.reducer(
      validRestoredState,
      purchaseCompleted(),
    )
    expect(completed).toEqual({
      currentStep: 'product',
      selectedProductId: null,
      quantity: 1,
      delivery: null,
      transactionId: null,
    })
  })

  it('restores a persisted selection via restored', () => {
    const state = checkoutSlice.reducer(
      undefined,
      restored(validRestoredState),
    )
    expect(state).toEqual(validRestoredState)
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
  })

  it('has a default export reducer named checkout for the store', () => {
    const state = checkoutReducer(undefined, { type: '@@init' })
    expect(state.currentStep).toBe('product')
  })
})