import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProductPage } from '@/features/product/ProductPage'
import { makeStore, type AppStore, type RootState } from '@/app/store'
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

const productA: Product = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Mouse',
  description: 'Ergonomic wireless mouse',
  priceInCents: 3500000,
  stock: 15,
  imageUrl: '/images/products/mouse.webp',
}

const productB: Product = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Keyboard',
  description: 'Compact mechanical keyboard',
  priceInCents: 12000000,
  stock: 4,
  imageUrl: '/images/products/keyboard.webp',
}

function renderProductPage(options: {
  id: string
  preloadedState?: Partial<RootState>
}): AppStore {
  const store = makeStore(options.preloadedState)
  const element: ReactElement = (
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/product/${options.id}`]}>
        <Routes>
          <Route path="/product/:id" element={<ProductPage />} />
          <Route path="/" element={<h1>Galería</h1>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )
  render(element)
  return store
}

describe('ProductPage', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
  })

  it('renders the product details read from the API', async () => {
    mockedHttpRequest.mockResolvedValue(productA)
    renderProductPage({ id: productA.id })

    expect(
      await screen.findByRole('heading', { name: 'Mouse', level: 1 }),
    ).toBeInTheDocument()
    expect(mockedHttpRequest).toHaveBeenCalledWith(
      `/products/${productA.id}`,
      { map400ToNotFound: true },
    )
    expect(screen.getByText('Ergonomic wireless mouse')).toBeInTheDocument()
    expect(screen.getByText(/35\.000/)).toBeInTheDocument()
    expect(screen.getByText('15 unidades disponibles')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Mouse' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue(1)
    expect(
      screen.getByRole('button', { name: 'Iniciar compra' }),
    ).toBeInTheDocument()
  })

  it('records the chosen product and quantity and shows the next-step placeholder', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockResolvedValue(productA)
    const store = renderProductPage({ id: productA.id })

    await screen.findByRole('button', { name: 'Iniciar compra' })

    await user.click(screen.getByRole('button', { name: 'Aumentar cantidad' }))
    expect(screen.getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue(2)

    await user.click(screen.getByRole('button', { name: 'Iniciar compra' }))

    expect(store.getState().checkout.selectedProductId).toBe(productA.id)
    expect(store.getState().checkout.quantity).toBe(2)
    expect(
      screen.getByRole('heading', { name: 'Siguiente paso' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Cantidad seleccionada: 2/)).toBeInTheDocument()
  })

  it('blocks the purchase when the product is out of stock', async () => {
    mockedHttpRequest.mockResolvedValue({ ...productA, stock: 0 })
    renderProductPage({ id: productA.id })

    expect(await screen.findByText(/no es posible iniciar la compra/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Iniciar compra' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('shows a gone state and blocks the purchase when the product is missing', async () => {
    mockedHttpRequest.mockResolvedValue(createApiError('notFound'))
    renderProductPage({ id: 'missing' })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/ya no está disponible/i)
    expect(screen.queryByRole('button', { name: 'Iniciar compra' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Volver a la galería/i })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('shows an error state and retries the request', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockResolvedValue(createApiError('server'))
    renderProductPage({ id: productA.id })

    expect(await screen.findByRole('alert')).toHaveTextContent(/error inesperado/i)

    mockedHttpRequest.mockResolvedValue(productA)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))

    expect(
      await screen.findByRole('heading', { name: 'Mouse', level: 1 }),
    ).toBeInTheDocument()
    expect(mockedHttpRequest).toHaveBeenCalledTimes(2)
  })

  it('retries restoring the persisted purchase when the first attempt fails', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockResolvedValue(createApiError('network'))
    renderProductPage({
      id: productA.id,
      preloadedState: {
        checkout: {
          currentStep: 'product',
          selectedProductId: productA.id,
          quantity: 3,
          delivery: null,
          transactionId: null,
        },
      },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(/conectar/i)

    mockedHttpRequest.mockResolvedValue(productA)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))

    expect(await screen.findByRole('heading', { name: 'Siguiente paso' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue(3)
    expect(screen.getByText(/Cantidad seleccionada: 3/)).toBeInTheDocument()
  })

  it('restores the persisted selection on the selected product page', async () => {
    mockedHttpRequest.mockResolvedValue(productA)
    renderProductPage({
      id: productA.id,
      preloadedState: {
        checkout: {
          currentStep: 'product',
          selectedProductId: productA.id,
          quantity: 3,
          delivery: null,
          transactionId: null,
        },
      },
    })

    expect(await screen.findByRole('heading', { name: 'Siguiente paso' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue(3)
    expect(screen.getByText(/Cantidad seleccionada: 3/)).toBeInTheDocument()
  })

  it('does not prefill or notify on a different product address (URL precedence)', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockResolvedValue(productB)
    const store = renderProductPage({
      id: productB.id,
      preloadedState: {
        checkout: {
          currentStep: 'product',
          selectedProductId: productA.id,
          quantity: 3,
          delivery: null,
          transactionId: null,
        },
      },
    })

    expect(
      await screen.findByRole('heading', { name: 'Keyboard', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue(1)
    expect(screen.queryByRole('heading', { name: 'Siguiente paso' })).not.toBeInTheDocument()
    expect(store.getState().checkout.selectedProductId).toBe(productA.id)

    await user.click(screen.getByRole('button', { name: 'Iniciar compra' }))
    expect(store.getState().checkout.selectedProductId).toBe(productB.id)
  })

  it('starts over from the next-step placeholder and returns to the gallery', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockResolvedValue(productA)
    const store = renderProductPage({
      id: productA.id,
      preloadedState: {
        checkout: {
          currentStep: 'product',
          selectedProductId: productA.id,
          quantity: 3,
          delivery: null,
          transactionId: null,
        },
      },
    })

    await screen.findByRole('heading', { name: 'Siguiente paso' })
    await user.click(screen.getByRole('button', { name: /Comenzar de nuevo/i }))

    expect(store.getState().checkout.selectedProductId).toBeNull()
    expect(screen.getByRole('heading', { name: 'Galería', level: 1 })).toBeInTheDocument()
  })

  it('sets the document title to the product name', async () => {
    mockedHttpRequest.mockResolvedValue(productA)
    renderProductPage({ id: productA.id })

    await screen.findByRole('heading', { name: 'Mouse', level: 1 })
    expect(document.title).toBe('Mouse — Tech Store')
  })
})
