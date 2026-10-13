import { configureStore } from '@reduxjs/toolkit'
import productReducer, {
  fetchProduct,
  quantityChanged,
} from '@/features/product/product.slice'
import { httpRequest } from '@/shared/api/http'
import { createApiError } from '@/shared/api/api.errors'
import { isPurchasable, type Product } from '@/shared/product'

jest.mock('@/shared/api/http', () => ({
  httpRequest: jest.fn(),
  isApiError: (value: unknown) =>
    typeof value === 'object' &&
    value !== null &&
    'kind' in (value as Record<string, unknown>),
}))

const mockedHttpRequest = httpRequest as jest.MockedFunction<typeof httpRequest>

const buildProduct = (stock: number, id = '11111111-1111-4111-8111-111111111111'): Product => ({
  id,
  name: 'Wireless Mouse',
  description: 'Ergonomic wireless mouse',
  priceInCents: 3500000,
  stock,
  imageUrl: '/images/products/mouse.webp',
})

const makeStore = () =>
  configureStore({ reducer: { product: productReducer } })

describe('product slice', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
  })

  it('starts idle with no product, no error and quantity bounded', () => {
    const state = productReducer(undefined, { type: '@@init' })
    expect(state.status).toBe('idle')
    expect(state.product).toBeNull()
    expect(state.error).toBeNull()
    expect(state.requestId).toBeNull()
    expect(state.quantity).toBe(1)
  })

  it('requesting a product calls the wrapper with the 400→notFound product option', async () => {
    mockedHttpRequest.mockResolvedValue(buildProduct(10))
    const store = makeStore()

    await store.dispatch(fetchProduct('xyz'))

    expect(mockedHttpRequest).toHaveBeenCalledWith('/products/xyz', {
      map400ToNotFound: true,
    })
  })

  it('transitions to loading while the request is in flight', () => {
    mockedHttpRequest.mockImplementation(() => new Promise(() => {}))
    const store = makeStore()

    store.dispatch(fetchProduct('11111111-1111-4111-8111-111111111111'))

    expect(store.getState().product.status).toBe('loading')
  })

  it('stores the product and reconciles quantity within 1..min(stock, 10)', async () => {
    mockedHttpRequest.mockResolvedValue(buildProduct(10))
    const store = makeStore()

    await store.dispatch(fetchProduct('11111111-1111-4111-8111-111111111111'))

    const { product, status, error, quantity } = store.getState().product
    expect(product?.stock).toBe(10)
    expect(status).toBe('success')
    expect(error).toBeNull()
    expect(quantity).toBe(1)
    expect(quantity).toBeLessThanOrEqual(10)
  })

  it('clamps quantity via the quantity reducer to 1..min(stock, 10)', async () => {
    mockedHttpRequest.mockResolvedValue(buildProduct(3))
    const store = makeStore()
    await store.dispatch(fetchProduct('11111111-1111-4111-8111-111111111111'))

    store.dispatch(quantityChanged(50))
    expect(store.getState().product.quantity).toBe(3)

    store.dispatch(quantityChanged(0))
    expect(store.getState().product.quantity).toBe(1)

    store.dispatch(quantityChanged(2.7))
    expect(store.getState().product.quantity).toBe(2)

    store.dispatch(quantityChanged(NaN))
    expect(store.getState().product.quantity).toBe(1)

    store.dispatch(quantityChanged(15))
    expect(store.getState().product.quantity).toBe(3)
  })

  it('leaves the quantity untouched when no product has loaded', () => {
    const store = makeStore()
    store.dispatch(quantityChanged(50))
    expect(store.getState().product.quantity).toBe(1)
    expect(store.getState().product.product).toBeNull()
  })

  it('clamps quantity down on a re-read when fresh stock shrinks', async () => {
    mockedHttpRequest.mockResolvedValueOnce(buildProduct(10))
    const store = makeStore()

    await store.dispatch(fetchProduct('11111111-1111-4111-8111-111111111111'))
    store.dispatch(quantityChanged(8))
    expect(store.getState().product.quantity).toBe(8)

    mockedHttpRequest.mockResolvedValueOnce(buildProduct(3))
    await store.dispatch(fetchProduct('11111111-1111-4111-8111-111111111111'))

    expect(store.getState().product.quantity).toBe(3)
  })

  it('marks a zero-stock product unavailable and functionally blocked', async () => {
    mockedHttpRequest.mockResolvedValue(buildProduct(0))
    const store = makeStore()

    await store.dispatch(fetchProduct('11111111-1111-4111-8111-111111111111'))

    const state = store.getState().product
    expect(state.quantity).toBe(0)
    expect(state.product?.stock).toBe(0)
    expect(isPurchasable(state.product!.stock)).toBe(false)
  })

  it('surfaces a notFound error for a missing product', async () => {
    mockedHttpRequest.mockResolvedValue(createApiError('notFound'))
    const store = makeStore()

    await store.dispatch(fetchProduct('missing'))

    expect(store.getState().product.status).toBe('error')
    expect(store.getState().product.error?.kind).toBe('notFound')
  })

  it('keeps the previously loaded product across a transient error', async () => {
    mockedHttpRequest.mockResolvedValueOnce(buildProduct(10))
    const store = makeStore()
    await store.dispatch(fetchProduct('11111111-1111-4111-8111-111111111111'))
    expect(store.getState().product.product).not.toBeNull()

    mockedHttpRequest.mockResolvedValueOnce(createApiError('network'))
    await store.dispatch(fetchProduct('11111111-1111-4111-8111-111111111111'))

    expect(store.getState().product.status).toBe('error')
    expect(store.getState().product.product?.stock).toBe(10)
  })

  it('falls back to a server error when the request rejects without a payload', async () => {
    mockedHttpRequest.mockRejectedValue(new Error('boom'))
    const store = makeStore()

    await store.dispatch(fetchProduct('id')).catch(() => undefined)

    const state = store.getState().product
    expect(state.status).toBe('error')
    expect(state.error?.kind).toBe('server')
  })

  it('ignores a stale response that resolves after a newer request', async () => {
    const resolvers: Array<(value: unknown) => void> = []
    mockedHttpRequest.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    )
    const store = makeStore()

    const first = store.dispatch(fetchProduct('a'))
    const second = store.dispatch(fetchProduct('b'))

    await Promise.resolve()
    resolvers[0]?.(buildProduct(1, 'old'))
    await first

    const stateAfterStale = store.getState().product
    expect(stateAfterStale.product).toBeNull()
    expect(stateAfterStale.status).toBe('loading')

    resolvers[1]?.(buildProduct(5, 'new-id'))
    await second

    const state = store.getState().product
    expect(state.status).toBe('success')
    expect(state.product?.id).toBe('new-id')
  })

  it('ignores a stale rejected response that resolves after a newer request', async () => {
    const resolvers: Array<(value: unknown) => void> = []
    mockedHttpRequest.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    )
    const store = makeStore()

    const first = store.dispatch(fetchProduct('a'))
    const second = store.dispatch(fetchProduct('b'))

    await Promise.resolve()
    resolvers[0]?.(createApiError('network'))
    await first.catch(() => undefined)

    const stateAfterStaleReject = store.getState().product
    expect(stateAfterStaleReject.status).toBe('loading')
    expect(stateAfterStaleReject.error).toBeNull()
    expect(stateAfterStaleReject.product).toBeNull()

    resolvers[1]?.(buildProduct(5, 'new-id'))
    await second

    expect(store.getState().product.status).toBe('success')
    expect(store.getState().product.product?.id).toBe('new-id')
  })
})