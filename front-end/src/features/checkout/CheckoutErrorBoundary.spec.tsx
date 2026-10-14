import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckoutErrorBoundary } from '@/features/checkout/CheckoutErrorBoundary'

const SENSITIVE_VALUE = 'tok_sensitive_test_value'

function FailingStep(): ReactElement {
  throw new Error('boom')
}

describe('CheckoutErrorBoundary', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    // React also reports caught errors through console.error; silence the
    // noise and capture every call so the tests can assert on what is logged.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('renders its children while nothing fails', () => {
    render(
      <CheckoutErrorBoundary onBackToProduct={() => {}}>
        <p>paso del checkout</p>
      </CheckoutErrorBoundary>,
    )

    expect(screen.getByText('paso del checkout')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a friendly fallback with a back-to-product action instead of a blank page', async () => {
    const user = userEvent.setup()
    const onBackToProduct = jest.fn()

    render(
      <CheckoutErrorBoundary onBackToProduct={onBackToProduct}>
        <FailingStep />
      </CheckoutErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/algo salió mal/i)
    expect(
      screen.getByText(/vuelve al producto y empieza de nuevo/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Volver al producto' }))
    expect(onBackToProduct).toHaveBeenCalledTimes(1)
  })

  it('logs a fixed, non-sensitive message and nothing from the failed tree', () => {
    function SensitiveStep({ token }: { token: string }): ReactElement {
      void token
      throw new Error('boom')
    }

    render(
      <CheckoutErrorBoundary onBackToProduct={() => {}}>
        <SensitiveStep token={SENSITIVE_VALUE} />
      </CheckoutErrorBoundary>,
    )

    const logged = consoleError.mock.calls.flat().join(' ')
    expect(logged).not.toContain(SENSITIVE_VALUE)
    expect(consoleError).toHaveBeenCalledWith(
      'No se pudo mostrar el paso del pago.',
    )
  })

  it('recovers and renders the children again when the reset key changes', () => {
    const { rerender } = render(
      <CheckoutErrorBoundary onBackToProduct={() => {}} resetKey={false}>
        <FailingStep />
      </CheckoutErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(
      <CheckoutErrorBoundary onBackToProduct={() => {}} resetKey={true}>
        <p>paso del checkout</p>
      </CheckoutErrorBoundary>,
    )

    expect(screen.getByText('paso del checkout')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
