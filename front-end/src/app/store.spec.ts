import React from 'react'
import { render, screen } from '@testing-library/react'
import {
  createAppStore,
  makeStore,
  store,
  type AppDispatch,
  type RootState,
} from '@/app/store'
import { AppProviders } from '@/app/providers'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { fetchCatalog } from '@/features/catalog/catalog.slice'
import { quantityChanged, purchaseCompleted } from '@/features/checkout/checkout.slice'
import {
  PERSISTENCE_STORAGE_KEY,
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

const buildProduct = (stock: number): Product => ({
  id: PRODUCT_ID,
  name: 'Wireless Mouse',
  description: 'Ergonomic wireless mouse',
  priceInCents: 3500000,
  stock,
  imageUrl: '/images/products/mouse.webp',
})

const createFakeStorage = () => {
  const map = new Map<string, string>()
  const storage: StorageLike = {
    getItem: jest.fn((key: string) => (map.has(key) ? map.get(key)! : null)),
    setItem: jest.fn((key: string, value: string) => void map.set(key, value)),
    removeItem: jest.fn((key: string) => void map.delete(key)),
  }
  const seed = (value: string) => map.set(PERSISTENCE_STORAGE_KEY, value)
  return { storage, map, seed }
}

const freshValidDoc = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 2,
    savedAt: new Date().toISOString(),
    currentStep: 'product',
    selectedProductId: PRODUCT_ID,
    quantity: 3,
    delivery: null,
    transactionId: null,
    idempotencyKey: null,
    ...overrides,
  })

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('store', () => {
  it('combines the catalog, product and checkout reducers', () => {
    const state: RootState = store.getState()
    expect(Object.keys(state).sort()).toEqual([
      'catalog',
      'checkout',
      'checkoutConfig',
      'product',
    ])
  })

  it('creates an isolated store per call via makeStore', () => {
    const first = makeStore()
    const second = makeStore()
    expect(first).not.toBe(second)
    expect(first.getState().catalog.status).toBe('idle')
    expect(second.getState().catalog.status).toBe('idle')
  })

  it('honours a preloaded checkout state', () => {
    const instance = makeStore({
      catalog: undefined,
      product: undefined,
      checkout: {
        currentStep: 'summary',
        selectedProductId: '11111111-1111-4111-8111-111111111111',
        quantity: 3,
        delivery: null,
        transactionId: 'tx-1',
        idempotencyKey: null,
        cardBrand: null,
        cardLastFour: null,
        installments: 1,
        contractsAccepted: false,
        paymentStatus: 'idle',
        paymentError: null,
      },
    })
    expect(instance.getState().checkout).toMatchObject({
      currentStep: 'summary',
      quantity: 3,
      transactionId: 'tx-1',
    })
  })

  it('keeps the state JSON-serializable with plain error objects', () => {
    const instance = makeStore()
    instance.dispatch({
      type: fetchCatalog.pending.type,
      meta: { requestId: 'r1', requestStatus: 'pending', arg: undefined },
    })
    instance.dispatch({
      type: fetchCatalog.rejected.type,
      payload: createApiError('server'),
      error: { message: 'Rejected' },
      meta: {
        requestId: 'r1',
        requestStatus: 'rejected',
        arg: undefined,
        rejectedWithValue: true,
      },
    })

    const roundTrip = JSON.parse(JSON.stringify(instance.getState())) as RootState
    expect(roundTrip.catalog.error?.kind).toBe('server')
    expect(roundTrip.catalog.error?.message).toBe(
      createApiError('server').message,
    )
  })

  it('keeps the serializability middleware enabled', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const instance = makeStore()

    instance.dispatch({
      type: 'test/non-serializable',
      payload: new Date(), // not a plain serializable value
    })

    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('exports an AppDispatch type compatible with the default store', () => {
    const dispatch: AppDispatch = store.dispatch
    expect(typeof dispatch).toBe('function')
  })
})

describe('store persistence wiring', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
  })

  it('writes nothing on startup when there is no stored progress', () => {
    const { storage } = createFakeStorage()

    createAppStore({ storage })

    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('creates a store with default options', () => {
    const instance = createAppStore()
    expect(instance.getState().checkout.currentStep).toBe('product')
  })

  it('loads valid stored progress as the preloaded checkout state', () => {
    const { storage, seed } = createFakeStorage()
    seed(freshValidDoc())

    const instance = createAppStore({ storage })

    expect(instance.getState().checkout).toMatchObject({
      selectedProductId: PRODUCT_ID,
      quantity: 3,
    })
  })

  it('prefers an explicit preloaded checkout over stored progress', () => {
    const { storage, seed } = createFakeStorage()
    seed(freshValidDoc())

    const instance = createAppStore({
      storage,
      preloadedState: {
        checkout: {
          currentStep: 'summary',
          selectedProductId: 'p2',
          quantity: 1,
          delivery: null,
          transactionId: null,
          idempotencyKey: null,
          cardBrand: null,
          cardLastFour: null,
          installments: 1,
          contractsAccepted: false,
          paymentStatus: 'idle',
          paymentError: null,
        },
      },
    })

    expect(instance.getState().checkout).toMatchObject({
      currentStep: 'summary',
      selectedProductId: 'p2',
    })
  })

  it('does not overwrite stored progress while startup validation is pending', () => {
    const { storage, map, seed } = createFakeStorage()
    seed(freshValidDoc())
    mockedHttpRequest.mockImplementation(() => new Promise(() => {}))

    createAppStore({ storage, enableStartupValidation: true })

    expect(storage.setItem).not.toHaveBeenCalled()
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(true)
  })

  it('does not write when the whitelisted part is unchanged', () => {
    const { storage, seed } = createFakeStorage()
    seed(freshValidDoc())
    const instance = createAppStore({ storage })

    instance.dispatch(quantityChanged(3))

    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('discards corrupt data on load', () => {
    const { storage, map, seed } = createFakeStorage()
    seed('{ not json')

    const instance = createAppStore({ storage })

    expect(instance.getState().checkout.selectedProductId).toBeNull()
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(false)
  })

  it('discards expired data on load', () => {
    const { storage, map, seed } = createFakeStorage()
    const expired = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    seed(freshValidDoc({ savedAt: expired }))

    const instance = createAppStore({ storage })

    expect(instance.getState().checkout.selectedProductId).toBeNull()
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(false)
  })

  it('discards progress when startup validation finds the product missing', async () => {
    const { storage, map, seed } = createFakeStorage()
    seed(freshValidDoc())
    mockedHttpRequest.mockResolvedValue(createApiError('notFound'))

    const instance = createAppStore({ storage, enableStartupValidation: true })
    await flush()

    expect(instance.getState().checkout.selectedProductId).toBeNull()
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(false)
  })

  it('keeps progress when startup validation hits a transient error', async () => {
    const { storage, map, seed } = createFakeStorage()
    seed(freshValidDoc())
    mockedHttpRequest.mockResolvedValue(createApiError('network'))

    const instance = createAppStore({ storage, enableStartupValidation: true })
    await flush()

    expect(instance.getState().checkout.selectedProductId).toBe(PRODUCT_ID)
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(true)
  })

  it('clears state and storage on purchaseCompleted', () => {
    const { storage, map, seed } = createFakeStorage()
    seed(freshValidDoc())
    const instance = createAppStore({ storage })

    instance.dispatch(purchaseCompleted())

    expect(instance.getState().checkout.selectedProductId).toBeNull()
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(false)
  })

  it('reconciles a restored quantity against fresh stock', async () => {
    const { storage, seed } = createFakeStorage()
    seed(freshValidDoc({ quantity: 3 }))
    mockedHttpRequest.mockResolvedValue(buildProduct(2))

    const instance = createAppStore({ storage, enableStartupValidation: true })
    await flush()

    expect(instance.getState().checkout.selectedProductId).toBe(PRODUCT_ID)
    expect(instance.getState().product.product?.stock).toBe(2)
    expect(instance.getState().product.quantity).toBe(2)
  })
})

describe('typed hooks and provider', () => {
  function Probe() {
    const dispatch = useAppDispatch()
    const step = useAppSelector((state) => state.checkout.currentStep)
    return React.createElement(
      'div',
      null,
      String(typeof dispatch === 'function' && step === 'product'),
    )
  }

  it('provides the store and the typed hooks to components', () => {
    render(
      React.createElement(
        AppProviders,
        null,
        React.createElement(Probe),
      ),
    )
    expect(screen.getByText('true')).toBeInTheDocument()
  })
})