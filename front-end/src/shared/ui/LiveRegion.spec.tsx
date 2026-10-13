import { render, screen } from '@testing-library/react'
import { LiveRegion } from '@/shared/ui/LiveRegion'

describe('LiveRegion', () => {
  it('renders a polite status region by default', () => {
    render(<LiveRegion message="Cantidad actualizada" />)

    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveTextContent('Cantidad actualizada')
  })

  it('renders an assertive alert region when requested', () => {
    render(<LiveRegion politeness="assertive" message="No se pudo conectar" />)

    const region = screen.getByRole('alert')
    expect(region).toHaveAttribute('aria-live', 'assertive')
    expect(region).toHaveTextContent('No se pudo conectar')
  })

  it('renders an empty region when there is nothing to announce', () => {
    render(<LiveRegion />)

    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})
