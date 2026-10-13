import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { ScrollAndFocusManager } from '@/app/ScrollAndFocusManager'

function renderWithRoutes() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ScrollAndFocusManager />
      <Routes>
        <Route
          path="/"
          element={
            <>
              <h1 tabIndex={-1}>Inicio</h1>
              <Link to="/second">Ir a la segunda página</Link>
            </>
          }
        />
        <Route path="/second" element={<h1 tabIndex={-1}>Segunda</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ScrollAndFocusManager', () => {
  it('focuses the page heading after a route change', async () => {
    const user = userEvent.setup()
    renderWithRoutes()

    expect(screen.getByRole('heading', { name: 'Inicio' })).toHaveFocus()

    await user.click(
      screen.getByRole('link', { name: 'Ir a la segunda página' }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Segunda' }),
    ).toHaveFocus()
  })

  it('falls back to focusing the main landmark when there is no heading', () => {
    render(
      <MemoryRouter>
        <ScrollAndFocusManager />
        <main tabIndex={-1}>Contenido sin título</main>
      </MemoryRouter>,
    )

    expect(screen.getByRole('main')).toHaveFocus()
  })
})
