import { makeStore } from '@/app/store'
import {
  selectCheckoutStep,
  selectDeliveryDetails,
  selectDeliveryProvided,
  selectHasStartedPurchase,
  selectPurchaseQuantity,
  selectSelectedProductId,
  selectTransactionId,
} from '@/features/checkout/checkout.selectors'
import {
  purchaseStarted,
  restored,
} from '@/features/checkout/checkout.slice'

describe('checkout.selectors', () => {
  it('reads the untouched checkout slice', () => {
    const store = makeStore()
    const state = store.getState()

    expect(selectCheckoutStep(state)).toBe('product')
    expect(selectSelectedProductId(state)).toBeNull()
    expect(selectPurchaseQuantity(state)).toBe(1)
    expect(selectDeliveryDetails(state)).toBeNull()
    expect(selectTransactionId(state)).toBeNull()
    expect(selectHasStartedPurchase(state)).toBe(false)
    expect(selectDeliveryProvided(state)).toBe(false)
  })

  it('reads a purchase that has been started', () => {
    const store = makeStore()
    store.dispatch(purchaseStarted({ productId: 'p-1', quantity: 4 }))
    const state = store.getState()

    expect(selectCheckoutStep(state)).toBe('product')
    expect(selectSelectedProductId(state)).toBe('p-1')
    expect(selectPurchaseQuantity(state)).toBe(4)
    expect(selectHasStartedPurchase(state)).toBe(true)
    expect(selectDeliveryProvided(state)).toBe(false)
  })

  it('reads restored delivery, transaction and step state', () => {
    const store = makeStore()
    store.dispatch(
      restored({
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
        transactionId: 'tx-9',
      }),
    )
    const state = store.getState()

    expect(selectCheckoutStep(state)).toBe('summary')
    expect(selectDeliveryDetails(state)).toMatchObject({
      fullName: 'Ana Pérez',
      city: 'Bogotá',
    })
    expect(selectTransactionId(state)).toBe('tx-9')
    expect(selectDeliveryProvided(state)).toBe(true)
    expect(selectHasStartedPurchase(state)).toBe(true)
  })

  it('returns referentially stable values for the same state', () => {
    const store = makeStore()
    const state = store.getState()

    expect(selectCheckoutStep(state)).toBe(selectCheckoutStep(state))
    expect(selectPurchaseQuantity(state)).toBe(selectPurchaseQuantity(state))
    expect(selectHasStartedPurchase(state)).toBe(selectHasStartedPurchase(state))
  })
})