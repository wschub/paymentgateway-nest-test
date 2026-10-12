import { render, screen } from '@testing-library/react'
import { EmptyState } from '@/shared/ui/EmptyState'

describe('EmptyState', () => {
  it('shows a friendly empty-catalog message', () => {
    render(<EmptyState />)
    expect(screen.getByText(/no hay productos/i)).toBeInTheDocument()
  })

  it('allows overriding the message', () => {
    render(<EmptyState message="Todavía no hay productos en la tienda" />)
    expect(
      screen.getByText('Todavía no hay productos en la tienda'),
    ).toBeInTheDocument()
  })
})
