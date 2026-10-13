import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentStatus } from '@/features/checkout/PaymentStatus'
import type {
  TransactionStatus,
  TransactionView,
} from '@/features/checkout/checkout.types'
import { createApiError } from '@/shared/api/api.errors'

function buildTransaction(
  overrides: Partial<TransactionView> = {},
): TransactionView {
  return {
    id: 'tx-1',
    reference: 'REF-0001',
    status: 'PENDING',
    quantity: 2,
    amounts: {
      productAmountInCents: 7000000,
      baseFeeInCents: 500000,
      deliveryFeeInCents: 1200000,
      totalInCents: 8700000,
    },
    card: { brand: 'VISA', lastFour: '2222', installments: 2 },
    product: { id: 'p1', name: 'Mouse', quantity: 2 },
    delivery: { status: 'ASSIGNED', address: 'Calle 10 #23', city: 'Bogotá', region: 'Cundinamarca' },
    failureReason: null,
    ...overrides,
  }
}

const renderStatus = (
  props: Partial<React.ComponentProps<typeof PaymentStatus>> = {},
) => {
  const onRecheck = jest.fn()
  const onRetry = jest.fn()
  render(
    <PaymentStatus
      transaction={null}
      status="pending"
      error={null}
      onRecheck={onRecheck}
      onRetry={onRetry}
      {...props}
    />,
  )
  return { onRecheck, onRetry }
}

describe('PaymentStatus', () => {
  it('shows a verifying state with a manual re-check while pending without a view', async () => {
    const user = userEvent.setup()
    const { onRecheck } = renderStatus()

    expect(screen.getByText('Verificando el pago…')).toBeInTheDocument()
    expect(screen.getByText(/Estamos consultando el estado real/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Volver a verificar' }))
    expect(onRecheck).toHaveBeenCalledTimes(1)
  })

  it('shows the pending confirmation with the reference once the view exists', () => {
    renderStatus({
      transaction: buildTransaction({ status: 'PENDING' }),
      status: 'pending',
    })

    expect(screen.getByText('Estamos confirmando tu pago')).toBeInTheDocument()
    expect(screen.getByText(/REF-0001/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver a verificar' })).toBeInTheDocument()
  })

  it('renders the approved result with amounts and delivery', () => {
    renderStatus({
      transaction: buildTransaction({ status: 'APPROVED' }),
      status: 'approved',
    })

    expect(screen.getByRole('heading', { name: '¡Pago aprobado!' })).toBeInTheDocument()
    expect(screen.getByText(/87\.000/)).toBeInTheDocument()
    expect(screen.getByText(/Calle 10 #23/)).toBeInTheDocument()
  })

  it('renders the declined result and lets the shopper retry', async () => {
    const user = userEvent.setup()
    const { onRetry } = renderStatus({
      transaction: buildTransaction({ status: 'DECLINED' }),
      status: 'declined',
    })

    expect(screen.getByRole('heading', { name: 'Pago rechazado' })).toBeInTheDocument()
    expect(screen.getByText(/otra tarjeta/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders a voided transaction with the expiration reason and a retry', async () => {
    const user = userEvent.setup()
    const { onRetry } = renderStatus({
      transaction: buildTransaction({
        status: 'VOIDED',
        failureReason: 'RESERVATION_EXPIRED',
      }),
      status: 'voided',
    })

    expect(screen.getByRole('heading', { name: 'Compra anulada' })).toBeInTheDocument()
    expect(screen.getByText(/reserva expiró/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders the error result with the safe message and a retry', async () => {
    const user = userEvent.setup()
    const { onRetry } = renderStatus({
      status: 'error',
      error: createApiError('network'),
    })

    expect(
      screen.getByRole('heading', { name: 'No pudimos confirmar el pago' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/conectar/i)

    await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it.each<TransactionStatus>(['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'])(
    'never shows a stale success for a restored %s final transaction',
    (status) => {
      const mapped =
        status === 'APPROVED'
          ? 'approved'
          : status === 'DECLINED'
            ? 'declined'
            : status === 'VOIDED'
              ? 'voided'
              : 'error'
      renderStatus({
        transaction: buildTransaction({ status }),
        status: mapped,
      })

      expect(screen.queryByText('Verificando el pago…')).not.toBeInTheDocument()
    },
  )
})
