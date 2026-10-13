import { configureStore } from '@reduxjs/toolkit'
import catalogReducer, { fetchCatalog } from '@/features/catalog/catalog.slice'
import { httpRequest } from '@/shared/api/http'
import { createApiError, type ApiError } from '@/shared/api/api.errors'
import type { Product } from '@/shared/product'

jest.mock('@/shared/api/http', () => ({
  httpRequest: jest.fn(),
  isApiError: (value: unknown) =>
    typeof value === 'object' &&
    value !== null &&
    'kind' in (value as Record<string, unknown>),
}))

const mockedHttpRequest = httpRequest as jest.MockedFunction<typeof httpRequest>

const products: Product[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Wireless Mouse',
    description: 'Ergonomic wireless mouse',
    priceInCents: 3500000,
    stock: 15,
    imageUrl: '/images/products/mouse.webp',
  },
]

const makeStore = () =>
  configureStore({ reducer: { catalog: catalogReducer } })

describe('catalog slice', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  it('starts idle with an empty list, no error and no request id', () => {
    const state = catalogReducer(undefined, { type: '@@init' })
    expect(state.status).toBe('idle')
    expect(state.items).toEqual([])
    expect(state.error).toBeNull()
    expect(state.requestId).toBeNull()
    expect(state.lastReadAt).toBeNull()
  })

  it('requests the catalog through the wrapper, never calling fetch directly', async () => {
    mockedHttpRequest.mockResolvedValue(products)
    const store = makeStore()

    await store.dispatch(fetchCatalog())

    expect(mockedHttpRequest).toHaveBeenCalledWith('/products')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('transitions to loading while the request is in flight', () => {
    mockedHttpRequest.mockImplementation(() => new Promise(() => {}))
    const store = makeStore()

    store.dispatch(fetchCatalog())

    expect(store.getState().catalog.status).toBe('loading')
    expect(store.getState().catalog.requestId).not.toBeNull()
  })

  it('stores the products on success', async () => {
    mockedHttpRequest.mockResolvedValue(products)
    const store = makeStore()

    await store.dispatch(fetchCatalog())

    const state = store.getState().catalog
    expect(state.status).toBe('success')
    expect(state.items).toEqual(products)
    expect(state.error).toBeNull()
    expect(state.lastReadAt).not.toBeNull()
  })

  it('falls back to a server error when the request rejects without a payload', async () => {
    mockedHttpRequest.mockRejectedValue(new Error('boom'))
    const store = makeStore()

    await store.dispatch(fetchCatalog()).catch(() => undefined)

    const state = store.getState().catalog
    expect(state.status).toBe('error')
    expect(state.error?.kind).toBe('server')
  })

  it('keeps an empty list as success with no items', async () => {
    mockedHttpRequest.mockResolvedValue([])
    const store = makeStore()

    await store.dispatch(fetchCatalog())

    const state = store.getState().catalog
    expect(state.status).toBe('success')
    expect(state.items).toEqual([])
  })

  it.each<ApiError['kind']>(['network', 'rateLimited', 'server', 'notFound'])(
    'surfaces a plain error object for kind "%s"',
    async (kind) => {
      mockedHttpRequest.mockResolvedValue(createApiError(kind))
      const store = makeStore()

      await store.dispatch(fetchCatalog())

      const state = store.getState().catalog
      expect(state.status).toBe('error')
      expect(state.error).toEqual(createApiError(kind))
      expect(state.error).toBeInstanceOf(Object)
    },
  )

  it('recovers with a retry after an error', async () => {
    mockedHttpRequest.mockResolvedValueOnce(createApiError('server'))
    const store = makeStore()
    await store.dispatch(fetchCatalog())
    expect(store.getState().catalog.status).toBe('error')

    mockedHttpRequest.mockResolvedValueOnce(products)
    await store.dispatch(fetchCatalog())

    const state = store.getState().catalog
    expect(state.status).toBe('success')
    expect(state.items).toEqual(products)
    expect(state.error).toBeNull()
  })

  it('re-reads and replaces the previous list with the freshest response', async () => {
    mockedHttpRequest.mockResolvedValueOnce(products)
    const store = makeStore()
    await store.dispatch(fetchCatalog())
    expect(store.getState().catalog.items).toEqual(products)

    const fresher = [{ ...products[0], stock: 2 }]
    mockedHttpRequest.mockResolvedValueOnce(fresher)
    await store.dispatch(fetchCatalog())

    expect(store.getState().catalog.status).toBe('success')
    expect(store.getState().catalog.items).toEqual(fresher)
  })

  it('ignores a stale response whose request id is no longer the latest', async () => {
    const resolvers: Array<(value: unknown) => void> = []
    mockedHttpRequest.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    )
    const store = makeStore()

    const first = store.dispatch(fetchCatalog())
    const second = store.dispatch(fetchCatalog())

    await Promise.resolve()
    resolvers[0]?.(products)
    await first

    expect(store.getState().catalog.items).toEqual([])

    const newer = [{ ...products[0], id: 'new-id', name: 'Newer' }]
    resolvers[1]?.(newer)
    await second

    expect(store.getState().catalog.status).toBe('success')
    expect(store.getState().catalog.items).toEqual(newer)
  })

  it('ignores a stale rejected response that resolves after a newer request', async () => {
    const resolvers: Array<(value: unknown) => void> = []
    mockedHttpRequest.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    )
    const store = makeStore()

    const first = store.dispatch(fetchCatalog())
    const second = store.dispatch(fetchCatalog())

    await Promise.resolve()
    resolvers[0]?.(createApiError('server'))
    await first.catch(() => undefined)

    const stateAfterStaleReject = store.getState().catalog
    expect(stateAfterStaleReject.status).toBe('loading')
    expect(stateAfterStaleReject.error).toBeNull()
    expect(stateAfterStaleReject.items).toEqual([])

    resolvers[1]?.(products)
    await second

    expect(store.getState().catalog.status).toBe('success')
    expect(store.getState().catalog.items).toEqual(products)
  })
})