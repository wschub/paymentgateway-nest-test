import { makeStore } from '@/app/store'
import {
  selectCatalogError,
  selectCatalogItems,
  selectCatalogStatus,
} from '@/features/catalog/catalog.selectors'
import { createApiError } from '@/shared/api/api.errors'

describe('catalog.selectors', () => {
  it('reads the untouched catalog slice', () => {
    const state = makeStore().getState()

    expect(selectCatalogItems(state)).toEqual([])
    expect(selectCatalogStatus(state)).toBe('idle')
    expect(selectCatalogError(state)).toBeNull()
  })

  it('reads catalog items, status and error from state', () => {
    const product = {
      id: 'p-1',
      name: 'Mouse',
      description: '',
      priceInCents: 100,
      stock: 1,
      imageUrl: '/x.webp',
    }
    const error = createApiError('server')
    const state = makeStore({
      catalog: {
        items: [product],
        status: 'error',
        error,
        requestId: 'r-1',
        lastReadAt: null,
      },
    }).getState()

    expect(selectCatalogItems(state)).toEqual([product])
    expect(selectCatalogStatus(state)).toBe('error')
    expect(selectCatalogError(state)).toBe(error)
  })
})
