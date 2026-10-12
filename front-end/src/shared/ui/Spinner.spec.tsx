import { render, screen } from '@testing-library/react'
import { Spinner } from '@/shared/ui/Spinner'

describe('Spinner', () => {
  it('exposes a status role with an accessible label', () => {
    render(<Spinner />)
    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
    expect(status).toHaveAccessibleName()
  })

  it('accepts a custom label', () => {
    render(<Spinner label="Cargando productos" />)
    expect(screen.getByRole('status')).toHaveAccessibleName('Cargando productos')
  })
})
