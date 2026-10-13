import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppLayout } from '@/app/AppLayout'

describe('AppLayout', () => {
  it('renders the header, main and footer landmarks with a home link', () => {
    render(
      <MemoryRouter>
        <AppLayout>
          <h1 tabIndex={-1}>Hola</h1>
        </AppLayout>
      </MemoryRouter>,
    )

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tech Store' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('moves focus to the page heading after rendering', () => {
    render(
      <MemoryRouter>
        <AppLayout>
          <h1 tabIndex={-1}>Hola</h1>
        </AppLayout>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Hola' })).toHaveFocus()
  })

  it('falls back to focusing the main landmark when there is no heading', () => {
    render(
      <MemoryRouter>
        <AppLayout>
          <p>Contenido sin título</p>
        </AppLayout>
      </MemoryRouter>,
    )

    expect(screen.getByRole('main')).toHaveFocus()
  })
})
