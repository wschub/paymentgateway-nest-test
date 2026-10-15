import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentStatus } from '@/features/checkout/PaymentStatus'
import type {
  TransactionStatus,
  TransactionView,
} from '@/features/checkout/checkout.types'
import { createApiError, type ApiErrorKind } from '@/shared/api/api.errors'

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

/** Defensive literal body: an approved view with no enrichment keys. */
const APPROVED_WITHOUT_ENRICHMENT: TransactionView = {
  id: 'tx-1',
  reference: 'REF-0001',
  status: 'APPROVED',
  quantity: 2,
  amounts: {
    productAmountInCents: 7000000,
    baseFeeInCents: 500000,
    deliveryFeeInCents: 1200000,
    totalInCents: 8700000,
  },
}

const renderStatus = (
  props: Partial<React.ComponentProps<typeof PaymentStatus>> = {},
) => {
  const onRecheck = jest.fn()
  const onRetry = jest.fn()
  const onFinalize = jest.fn()
  render(
    <PaymentStatus
      transaction={null}
      status="pending"
      error={null}
      onRecheck={onRecheck}
      onRetry={onRetry}
      onFinalize={onFinalize}
      {...props}
    />,
  )
  return { onRecheck, onRetry, onFinalize }
}

describe('PaymentStatus', () => {
  it('shows a verifying state with a manual re-check while pending without a view', async () => {
    const user = userEvent.setup()
    const { onRecheck } = renderStatus()

    expect(screen.getByText('Verificando el pago…')).toBeInTheDocument()
    expect(screen.getByText(/Estamos consultando el estado real/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Volver a verificar' }))
    expect(onRecheck).toHaveBeenCalledTimes(1)
    // Finalizar only appears on terminal states, not while confirming.
    expect(
      screen.queryByRole('button', { name: 'Finalizar' }),
    ).not.toBeInTheDocument()
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

  it('uses the form delivery when the view has none, and never crashes on the literal body', () => {
    renderStatus({
      transaction: APPROVED_WITHOUT_ENRICHMENT,
      delivery: {
        address: 'Calle 10 #23',
        city: 'Bogotá',
        region: 'Cundinamarca',
      },
      status: 'approved',
    })

    expect(screen.getByRole('heading', { name: '¡Pago aprobado!' })).toBeInTheDocument()
    expect(screen.getByText(/Calle 10 #23/)).toBeInTheDocument()
    expect(screen.getByText(/87\.000/)).toBeInTheDocument()
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

  it('shows the status-unavailable timeout state with a manual re-check, never a success or a spinner (US2.5)', async () => {
    const user = userEvent.setup()
    const { onRecheck, onRetry } = renderStatus({
      status: 'error',
      error: createApiError('statusUnavailable'),
    })

    expect(
      screen.getByRole('heading', { name: 'El estado del pago no está disponible' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      /no pudimos confirmar el estado del pago/i,
    )
    // Never a success and never an endless spinner.
    expect(screen.queryByText('¡Pago aprobado!')).not.toBeInTheDocument()
    expect(screen.queryByText('Verificando el pago…')).not.toBeInTheDocument()
    expect(screen.queryByText('Estamos confirmando tu pago')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Volver a verificar' }))
    expect(onRecheck).toHaveBeenCalledTimes(1)
    // The timeout does not start a second purchase: no retry action.
    expect(onRetry).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: 'Intentar de nuevo' }),
    ).not.toBeInTheDocument()
  })

  it('rebuilds the error text from the kind and never shows the raw back-end text', () => {
    renderStatus({
      status: 'error',
      error: {
        kind: 'providerUnavailable',
        message: 'PAYMENT_PROVIDER_UNAVAILABLE at /transactions/1 (503)',
      },
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/no está disponible/i)
    expect(alert).not.toHaveTextContent(/PAYMENT_PROVIDER_UNAVAILABLE/)
    expect(alert).not.toHaveTextContent('/transactions')
  })

  it.each<[ApiErrorKind, RegExp]>([
    ['network', /conectar/i],
    ['providerUnavailable', /no está disponible/i],
    ['providerRejected', /no fue aprobado/i],
    ['rateLimited', /demasiadas solicitudes/i],
    ['server', /error inesperado/i],
    ['badRequest', /revisa los datos/i],
  ])(
    'shows its own safe Spanish copy and the retry action for the %s error',
    async (kind, pattern) => {
      const user = userEvent.setup()
      const { onRetry } = renderStatus({ status: 'error', error: createApiError(kind) })

      expect(
        screen.getByRole('heading', { name: 'No pudimos confirmar el pago' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent(pattern)

      await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
      expect(onRetry).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['approved', 'declined', 'voided', 'error'] as const)(
    'offers the terminal Finalizar action on the %s screen',
    async (status) => {
      const user = userEvent.setup()
      const { onFinalize } = renderStatus({
        transaction: status === 'error' ? null : buildTransaction(),
        status,
      })

      await user.click(screen.getByRole('button', { name: 'Finalizar' }))
      expect(onFinalize).toHaveBeenCalledTimes(1)
    },
  )

  it('warns and shows the server total when the charge amount changed', () => {
    renderStatus({
      transaction: buildTransaction({
        status: 'APPROVED',
        amounts: {
          productAmountInCents: 7000000,
          baseFeeInCents: 500000,
          deliveryFeeInCents: 1200000,
          totalInCents: 9000000,
        },
      }),
      status: 'approved',
      priceChanged: true,
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/precio cambió/i)
    expect(screen.getByText(/90\.000/)).toBeInTheDocument()
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
