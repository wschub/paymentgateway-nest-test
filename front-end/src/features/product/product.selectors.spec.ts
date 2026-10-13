import { makeStore } from '@/app/store'
import {
  selectProductDetail,
  selectProductError,
  selectProductQuantity,
  selectProductStatus,
} from '@/features/product/product.selectors'
import { createApiError } from '@/shared/api/api.errors'
import type { Product } from '@/shared/product'

const product: Product = {
  id: 'p-1',
  name: 'Mouse',
  description: 'Wireless mouse',
  priceInCents: 3500000,
  stock: 4,
  imageUrl: '/images/products/mouse.webp',
}

describe('product.selectors', () => {
  it('reads the untouched product slice', () => {
    const state = makeStore().getState()

    expect(selectProductDetail(state)).toBeNull()
    expect(selectProductStatus(state)).toBe('idle')
    expect(selectProductError(state)).toBeNull()
    expect(selectProductQuantity(state)).toBe(1)
  })

  it('reads product, status, error and quantity from state', () => {
    const error = createApiError('notFound')
    const state = makeStore({
      product: {
        product,
        status: 'error',
        error,
        quantity: 2,
        requestId: 'r-1',
        lastReadAt: null,
      },
    }).getState()

    expect(selectProductDetail(state)).toBe(product)
    expect(selectProductStatus(state)).toBe('error')
    expect(selectProductError(state)).toBe(error)
    expect(selectProductQuantity(state)).toBe(2)
  })
})
