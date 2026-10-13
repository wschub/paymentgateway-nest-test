import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { makeStore, type AppStore } from '@/app/store'
import { useProductReRead } from '@/features/product/useProductReRead'
import { quantityChanged } from '@/features/product/product.slice'
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

function buildProduct(stock: number): Product {
  return {
    id: PRODUCT_ID,
    name: 'Mouse',
    description: 'Ergonomic wireless mouse',
    priceInCents: 3500000,
    stock,
    imageUrl: '/images/products/mouse.webp',
  }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

function Host({ id }: { id: string }) {
  const { notice, requestPurchase, retry } = useProductReRead(id)
  return (
    <>
      <p data-testid="notice">{notice ?? ''}</p>
      <button type="button" onClick={() => requestPurchase()}>
        Comprar
      </button>
      <button type="button" onClick={retry}>
        Reintentar
      </button>
    </>
  )
}

function renderHook(id = PRODUCT_ID): AppStore {
  const store = makeStore()
  render(
    <Provider store={store}>
      <Host id={id} />
    </Provider>,
  )
  return store
}

describe('useProductReRead', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
    setVisibility('visible')
  })

  it('reads the product on mount', async () => {
    mockedHttpRequest.mockResolvedValue(buildProduct(10))
    renderHook()

    expect(mockedHttpRequest).toHaveBeenCalledWith(`/products/${PRODUCT_ID}`, {
      map400ToNotFound: true,
    })
    await waitFor(() =>
      expect(mockedHttpRequest).toHaveBeenCalledTimes(1),
    )
  })

  it('re-reads the product when the tab becomes visible again', async () => {
    mockedHttpRequest.mockResolvedValue(buildProduct(10))
    renderHook()
    await waitFor(() => expect(mockedHttpRequest).toHaveBeenCalledTimes(1))

    mockedHttpRequest.mockResolvedValue(buildProduct(8))
    setVisibility('visible')

    await waitFor(() => expect(mockedHttpRequest).toHaveBeenCalledTimes(2))
  })

  it('does not re-read while the tab stays hidden', async () => {
    mockedHttpRequest.mockResolvedValue(buildProduct(10))
    renderHook()
    await waitFor(() => expect(mockedHttpRequest).toHaveBeenCalledTimes(1))

    setVisibility('hidden')

    expect(mockedHttpRequest).toHaveBeenCalledTimes(1)
  })

  it('removes the visibility listener on unmount', async () => {
    mockedHttpRequest.mockResolvedValue(buildProduct(10))
    const store = makeStore()
    const view = render(
      <Provider store={store}>
        <Host id={PRODUCT_ID} />
      </Provider>,
    )
    await waitFor(() => expect(mockedHttpRequest).toHaveBeenCalledTimes(1))

    view.unmount()
    setVisibility('visible')

    expect(mockedHttpRequest).toHaveBeenCalledTimes(1)
  })

  it('informs the shopper and clamps the quantity when a re-read shrinks stock', async () => {
    mockedHttpRequest.mockResolvedValue(buildProduct(10))
    const store = renderHook()
    await waitFor(() => expect(store.getState().product.status).toBe('success'))

    act(() => {
      store.dispatch(quantityChanged(5))
    })
    expect(store.getState().product.quantity).toBe(5)

    mockedHttpRequest.mockResolvedValue(buildProduct(2))
    setVisibility('visible')

    await waitFor(() =>
      expect(screen.getByTestId('notice')).toHaveTextContent(
        /cantidad se ajustó a 2/i,
      ),
    )
    expect(store.getState().product.quantity).toBe(2)
  })

  it('re-reads before recording the purchase and clamps the quantity', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockResolvedValue(buildProduct(10))
    const store = renderHook()
    await waitFor(() => expect(store.getState().product.status).toBe('success'))

    act(() => {
      store.dispatch(quantityChanged(4))
    })

    mockedHttpRequest.mockResolvedValue(buildProduct(3))
    await user.click(screen.getByRole('button', { name: 'Comprar' }))

    await waitFor(() =>
      expect(store.getState().checkout.selectedProductId).toBe(PRODUCT_ID),
    )
    expect(store.getState().checkout.quantity).toBe(3)
    expect(screen.getByTestId('notice')).toHaveTextContent(
      /cantidad se ajustó a 3/i,
    )
  })

  it('blocks the purchase when the re-read shows the product is sold out', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockResolvedValue(buildProduct(10))
    const store = renderHook()
    await waitFor(() => expect(store.getState().product.status).toBe('success'))

    mockedHttpRequest.mockResolvedValue(buildProduct(0))
    await user.click(screen.getByRole('button', { name: 'Comprar' }))

    await waitFor(() =>
      expect(screen.getByTestId('notice')).toHaveTextContent(
        /no es posible iniciar la compra/i,
      ),
    )
    expect(store.getState().checkout.selectedProductId).toBeNull()
  })

  it('keeps the choice unrecorded when the pre-purchase re-read fails', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockResolvedValue(buildProduct(10))
    const store = renderHook()
    await waitFor(() => expect(store.getState().product.status).toBe('success'))

    mockedHttpRequest.mockResolvedValue(createApiError('server'))
    await user.click(screen.getByRole('button', { name: 'Comprar' }))

    await waitFor(() =>
      expect(store.getState().product.status).toBe('error'),
    )
    expect(store.getState().checkout.selectedProductId).toBeNull()
  })

  it('re-reads the product when retried', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockResolvedValue(createApiError('network'))
    const store = renderHook()
    await waitFor(() => expect(store.getState().product.status).toBe('error'))

    mockedHttpRequest.mockResolvedValue(buildProduct(6))
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(store.getState().product.status).toBe('success'))
    expect(mockedHttpRequest).toHaveBeenCalledTimes(2)
  })
})
