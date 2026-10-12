import { fireEvent, render, screen } from '@testing-library/react'
import { ErrorState } from '@/shared/ui/ErrorState'

describe('ErrorState', () => {
  it('renders the safe message with an alert role', () => {
    render(<ErrorState message="Ocurrió un error" onRetry={jest.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Ocurrió un error')
  })

  it('invokes the injected retry callback when the button is pressed', () => {
    const onRetry = jest.fn()
    render(<ErrorState message="Ocurrió un error" onRetry={onRetry} />)

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('allows customising the retry label', () => {
    render(
      <ErrorState
        message="Ocurrió un error"
        onRetry={jest.fn()}
        retryLabel="Volver a intentar"
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Volver a intentar' }),
    ).toBeInTheDocument()
  })
})
