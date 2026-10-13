import { configureStore } from '@reduxjs/toolkit'
import checkoutReducer, {
  type CheckoutState,
} from '@/features/checkout/checkout.slice'
import productReducer from '@/features/product/product.slice'
import { restoreProgress } from '@/features/checkout/checkout.thunks'
import {
  PERSISTENCE_STORAGE_KEY,
  subscribeCheckoutProgress,
  type StorageLike,
} from '@/features/checkout/persistence'
import { httpRequest } from '@/shared/api/http'
import { createApiError } from '@/shared/api/api.errors'
import type { Product } from '@/shared/product'

jest.mock('@/shared/api/http', () => ({
  httpRequest: jest.fn(),
  isApiError: (value: unknown) =>
    typeof value === 'object' &&
    value !== null &&
    'kind' in (value as Record<string, unknown>),
}))

const mockedHttpRequest = httpRequest as jest.MockedFunction<typeof httpRequest>

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111'

const buildProduct = (stock: number, id = PRODUCT_ID): Product => ({
  id,
  name: 'Wireless Mouse',
  description: 'Ergonomic wireless mouse',
  priceInCents: 3500000,
  stock,
  imageUrl: '/images/products/mouse.webp',
})

const startedCheckout = (): CheckoutState => ({
  currentStep: 'product',
  selectedProductId: PRODUCT_ID,
  quantity: 3,
  delivery: null,
  transactionId: null,
})

const makeStore = (checkout: CheckoutState) =>
  configureStore({
    reducer: { checkout: checkoutReducer, product: productReducer },
    preloadedState: { checkout },
  })

describe('restoreProgress thunk', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
  })

  it('is a no-op when no purchase has started', async () => {
    const store = makeStore({
      currentStep: 'product',
      selectedProductId: null,
      quantity: 1,
      delivery: null,
      transactionId: null,
    })

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('noop')
    expect(mockedHttpRequest).not.toHaveBeenCalled()
  })

  it('keeps the restored progress when the product still exists', async () => {
    mockedHttpRequest.mockResolvedValue(buildProduct(10))
    const store = makeStore(startedCheckout())

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('kept')
    expect(store.getState().checkout.selectedProductId).toBe(PRODUCT_ID)
    expect(store.getState().checkout.quantity).toBe(3)
    expect(store.getState().product.product?.id).toBe(PRODUCT_ID)
    expect(store.getState().product.quantity).toBe(3)
    expect(mockedHttpRequest).toHaveBeenCalledWith(`/products/${PRODUCT_ID}`, {
      map400ToNotFound: true,
    })
  })

  it('discards all progress when the product was not found', async () => {
    mockedHttpRequest.mockResolvedValue(createApiError('notFound'))
    const store = makeStore(startedCheckout())

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('discarded')
    expect(store.getState().checkout.selectedProductId).toBeNull()
    expect(store.getState().checkout.quantity).toBe(1)
  })

  it.each(['rateLimited', 'network', 'server'] as const)(
    'keeps progress on a transient %s error so it can retry later',
    async (kind) => {
      mockedHttpRequest.mockResolvedValue(createApiError(kind))
      const store = makeStore(startedCheckout())

      const outcome = await store.dispatch(restoreProgress()).unwrap()

      expect(outcome).toBe('transient')
      expect(store.getState().checkout.selectedProductId).toBe(PRODUCT_ID)
      expect(store.getState().checkout.quantity).toBe(3)
    },
  )

  it('keeps progress when the request rejects without a payload', async () => {
    mockedHttpRequest.mockRejectedValue(new Error('boom'))
    const store = makeStore(startedCheckout())

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('transient')
    expect(store.getState().checkout.selectedProductId).toBe(PRODUCT_ID)
  })

  it('does not write while validating and clears storage only when discarding', async () => {
    const map = new Map<string, string>()
    const storage: StorageLike = {
      getItem: (key) => (map.has(key) ? map.get(key)! : null),
      setItem: jest.fn((key, value) => void map.set(key, value)),
      removeItem: jest.fn((key) => void map.delete(key)),
    }

    mockedHttpRequest.mockResolvedValue(createApiError('network'))
    const store = makeStore(startedCheckout())
    map.set(
      PERSISTENCE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        ...startedCheckout(),
      }),
    )
    subscribeCheckoutProgress(store, storage)

    await store.dispatch(restoreProgress()).unwrap()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(true)

    mockedHttpRequest.mockResolvedValue(createApiError('notFound'))
    await store.dispatch(restoreProgress()).unwrap()
    expect(storage.removeItem).toHaveBeenCalledWith(PERSISTENCE_STORAGE_KEY)
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(false)
  })
})