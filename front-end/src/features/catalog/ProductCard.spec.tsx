import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProductCard } from '@/features/catalog/ProductCard'
import type { Product } from '@/shared/product'

const inStock: Product = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Wireless Mouse',
  description: 'Ergonomic wireless mouse',
  priceInCents: 3500000,
  stock: 15,
  imageUrl: '/images/products/mouse.webp',
}

const outOfStock: Product = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Mechanical Keyboard',
  description: 'Compact mechanical keyboard',
  priceInCents: 12000000,
  stock: 0,
  imageUrl: '/images/products/keyboard.webp',
}

function renderCard(product: Product, priority = false) {
  return render(
    <MemoryRouter>
      <ul>
        <li>
          <ProductCard product={product} priority={priority} />
        </li>
      </ul>
    </MemoryRouter>,
  )
}

describe('ProductCard', () => {
  it('renders an in-stock product as a real link to its product page', () => {
    renderCard(inStock)

    const link = screen.getByRole('link', { name: /Wireless Mouse/i })
    expect(link).toHaveAttribute('href', `/product/${inStock.id}`)

    const card = screen.getByRole('article')
    expect(within(card).getByRole('heading', { name: 'Wireless Mouse' })).toBeInTheDocument()
    expect(within(card).getByText(/35\.000/)).toBeInTheDocument()
    expect(within(card).getByText('15 unidades disponibles')).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'Wireless Mouse' })).toHaveAttribute(
      'loading',
      'lazy',
    )
  })

  it('marks an out-of-stock product as not selectable with a visible label', () => {
    renderCard(outOfStock)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    const card = screen.getByRole('article')
    expect(card).toHaveAttribute('aria-disabled', 'true')
    expect(within(card).getByText('Agotado')).toBeVisible()
    expect(within(card).getByText('0 unidades disponibles')).toBeInTheDocument()
  })

  it('loads its image eagerly and with high priority when asked', () => {
    renderCard(inStock, true)

    const img = screen.getByRole('img', { name: 'Wireless Mouse' })
    expect(img).toHaveAttribute('loading', 'eager')
    expect(img.getAttribute('fetchpriority')).toBe('high')
  })

  it('labels a single available unit in the singular', () => {
    renderCard({ ...inStock, stock: 1 })

    expect(screen.getByText('1 unidad disponible')).toBeInTheDocument()
  })
})
