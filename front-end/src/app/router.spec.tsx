import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes, BrowserRouterApp } from '@/app/router'
import { makeStore, type RootState } from '@/app/store'
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

const products: Product[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Mouse',
    description: 'Ergonomic wireless mouse',
    priceInCents: 3500000,
    stock: 15,
    imageUrl: '/images/products/mouse.webp',
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Keyboard',
    description: 'Compact mechanical keyboard',
    priceInCents: 12000000,
    stock: 4,
    imageUrl: '/images/products/keyboard.webp',
  },
]

function renderApp(initialEntries: string[], preloadedState?: Partial<RootState>) {
  const store = makeStore(preloadedState)
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </Provider>,
  )
  return store
}

describe('AppRoutes', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
    mockedHttpRequest.mockImplementation((path: string) => {
      if (path === '/products') {
        return Promise.resolve(products)
      }
      const match = products.find((product) => path === `/products/${product.id}`)
      if (match) {
        return Promise.resolve(match)
      }
      return Promise.resolve(createApiError('notFound'))
    })
  })

  it('renders the gallery at the root address', async () => {
    renderApp(['/'])

    expect(
      await screen.findByRole('heading', { name: 'Catálogo', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Mouse/i })).toHaveAttribute(
      'href',
      `/product/${products[0].id}`,
    )
  })

  it('renders the product page directly from its address', async () => {
    renderApp([`/product/${products[1].id}`])

    expect(
      await screen.findByRole('heading', { name: 'Keyboard', level: 1 }),
    ).toBeInTheDocument()
  })

  it('renders the not-found page for an unknown address', async () => {
    renderApp(['/does-not-exist'])

    expect(
      await screen.findByRole('heading', {
        name: 'Página no encontrada',
        level: 1,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Volver a la galería/i })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('navigates from the gallery to a product page through a real link', async () => {
    const user = userEvent.setup()
    renderApp(['/'])

    await user.click(await screen.findByRole('link', { name: /Keyboard/i }))

    expect(
      await screen.findByRole('heading', { name: 'Keyboard', level: 1 }),
    ).toBeInTheDocument()
  })

  it('moves focus to the page heading after a route change', async () => {
    const user = userEvent.setup()
    renderApp(['/'])

    const galleryHeading = await screen.findByRole('heading', {
      name: 'Catálogo',
      level: 1,
    })
    expect(galleryHeading).toHaveFocus()

    await user.click(screen.getByRole('link', { name: /Mouse/i }))

    const productHeading = await screen.findByRole('heading', {
      name: 'Mouse',
      level: 1,
    })
    expect(productHeading).toHaveFocus()
  })

  it('shows the address product and leaves a different stored selection untouched', async () => {
    const user = userEvent.setup()
    const store = renderApp([`/product/${products[1].id}`], {
      checkout: {
        currentStep: 'product',
        selectedProductId: products[0].id,
        quantity: 3,
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
    })

    expect(
      await screen.findByRole('heading', { name: 'Keyboard', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue(1)
    expect(
      screen.queryByRole('heading', { name: 'Siguiente paso' }),
    ).not.toBeInTheDocument()
    expect(store.getState().checkout.selectedProductId).toBe(products[0].id)

    await user.click(screen.getByRole('button', { name: 'Iniciar compra' }))
    await screen.findByRole('heading', { name: 'Siguiente paso' })
    expect(store.getState().checkout.selectedProductId).toBe(products[1].id)
  })

  it('exposes the app shell with header, main and footer landmarks', async () => {
    renderApp(['/'])

    await screen.findByRole('heading', { name: 'Catálogo', level: 1 })

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tech Store' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('renders the gallery through the browser router used by the app entry', async () => {
    const store = makeStore()
    render(
      <Provider store={store}>
        <BrowserRouterApp />
      </Provider>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Catálogo', level: 1 }),
    ).toBeInTheDocument()
  })
})
