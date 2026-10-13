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

  it('offers a skip-to-content link that targets the main landmark', () => {
    render(
      <MemoryRouter>
        <AppLayout>
          <h1 tabIndex={-1}>Hola</h1>
        </AppLayout>
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('link', { name: /saltar al contenido principal/i }),
    ).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
  })
})
