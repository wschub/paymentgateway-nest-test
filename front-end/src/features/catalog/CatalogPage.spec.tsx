import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { CatalogPage } from '@/features/catalog/CatalogPage'
import { makeStore } from '@/app/store'
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
    id: 'p-1',
    name: 'Mouse',
    description: 'Wireless mouse',
    priceInCents: 3500000,
    stock: 15,
    imageUrl: '/images/products/mouse.webp',
  },
  {
    id: 'p-2',
    name: 'Keyboard',
    description: 'Mechanical keyboard',
    priceInCents: 12000000,
    stock: 3,
    imageUrl: '/images/products/keyboard.webp',
  },
  {
    id: 'p-3',
    name: 'Headphones',
    description: 'Over-ear headphones',
    priceInCents: 8000000,
    stock: 7,
    imageUrl: '/images/products/headphones.webp',
  },
  {
    id: 'p-4',
    name: 'Webcam',
    description: 'HD webcam',
    priceInCents: 5000000,
    stock: 0,
    imageUrl: '/images/products/webcam.webp',
  },
]

function renderPage() {
  const store = makeStore()
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/']}>
        <CatalogPage />
      </MemoryRouter>
    </Provider>,
  )
  return store
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

describe('CatalogPage', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
  })

  it('reads the catalog on mount and lists every product', async () => {
    mockedHttpRequest.mockResolvedValue(products)
    renderPage()

    expect(mockedHttpRequest).toHaveBeenCalledWith('/products')

    expect(await screen.findByText('Mouse')).toBeInTheDocument()
    expect(screen.getByText('Keyboard')).toBeInTheDocument()
    expect(screen.getByText('Headphones')).toBeInTheDocument()
    expect(screen.getByText('Webcam')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /Mouse/i })).toHaveAttribute(
      'href',
      '/product/p-1',
    )
  })

  it('shows a loading state while the catalog is being fetched', () => {
    mockedHttpRequest.mockImplementation(() => new Promise(() => {}))
    renderPage()

    expect(
      screen.getByRole('status', { name: 'Cargando…' }),
    ).toBeInTheDocument()
  })

  it('shows an empty state when the catalog is empty', async () => {
    mockedHttpRequest.mockResolvedValue([])
    renderPage()

    expect(
      await screen.findByText(/No hay productos disponibles/i),
    ).toBeInTheDocument()
  })

  it('shows an error state and retries the request', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockResolvedValue(createApiError('server'))
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/error inesperado/i)

    mockedHttpRequest.mockResolvedValue(products)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))

    expect(await screen.findByText('Mouse')).toBeInTheDocument()
    expect(mockedHttpRequest).toHaveBeenCalledTimes(2)
  })

  it('shows a friendly rate-limited message without internal details', async () => {
    mockedHttpRequest.mockResolvedValue(createApiError('rateLimited'))
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/demasiadas solicitudes/i)
    expect(alert.textContent).not.toContain('429')
  })

  it('loads the first row of images eagerly and the rest lazily', async () => {
    mockedHttpRequest.mockResolvedValue(products)
    renderPage()

    await screen.findByText('Mouse')

    expect(screen.getByRole('img', { name: 'Mouse' })).toHaveAttribute(
      'loading',
      'eager',
    )
    expect(
      screen.getByRole('img', { name: 'Headphones' }).getAttribute('fetchpriority'),
    ).toBe('high')
    expect(screen.getByRole('img', { name: 'Webcam' })).toHaveAttribute(
      'loading',
      'lazy',
    )
  })

  it('lays out a mobile-first grid inside a bounded container', async () => {
    mockedHttpRequest.mockResolvedValue(products)
    renderPage()

    await screen.findByText('Mouse')

    const list = screen.getByRole('list')
    expect(list.className).toContain('grid-cols-1')
    expect(list.className).toContain('sm:grid-cols-2')
    expect(list.className).toContain('lg:grid-cols-3')

    const container = screen.getByRole('heading', { name: 'Catálogo' })
      .parentElement as HTMLElement
    expect(container.className).toContain('max-w-5xl')
  })

  it('sets the document title for the gallery', async () => {
    mockedHttpRequest.mockResolvedValue(products)
    renderPage()

    await screen.findByText('Mouse')
    expect(document.title).toBe('Catálogo — Tech Store')
  })

  it('re-reads the catalog when the tab becomes visible and skips hidden changes', async () => {
    mockedHttpRequest.mockResolvedValue(products)
    renderPage()
    await screen.findByText('Mouse')
    expect(mockedHttpRequest).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    expect(mockedHttpRequest).toHaveBeenCalledTimes(1)

    mockedHttpRequest.mockResolvedValue([
      { ...products[0], stock: 2 },
      ...products.slice(1),
    ])
    setVisibility('visible')

    await waitFor(() => expect(mockedHttpRequest).toHaveBeenCalledTimes(2))
  })

  it('announces an availability change in a polite live region after a re-read', async () => {
    mockedHttpRequest.mockResolvedValueOnce(products)
    renderPage()
    await screen.findByText('Mouse')

    mockedHttpRequest.mockResolvedValueOnce([
      { ...products[0], stock: 2 },
      ...products.slice(1),
    ])
    setVisibility('visible')

    const announcement = await screen.findByText(
      /disponibilidad del catálogo actualizada/i,
    )
    expect(announcement.closest('[aria-live]')).toHaveAttribute(
      'aria-live',
      'polite',
    )
  })

  it('exposes a focusable heading and alt text on every product image', async () => {
    mockedHttpRequest.mockResolvedValue(products)
    renderPage()

    const heading = await screen.findByRole('heading', {
      name: 'Catálogo',
      level: 1,
    })
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('img', { name: 'Mouse' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Keyboard' })).toBeInTheDocument()
  })
})
